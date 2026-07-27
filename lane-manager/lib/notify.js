import { readSheetAsObjects, updateRowCells } from './googleSheets';
import { KEY_HEADER } from './columns';
import { isDispatchingSoon, isOverdueOrDelayed, isMissingInfoSoon } from './dateUtils';
import { postThreadRoot } from './slack';

// Header names for the thread address written back to the sheet after a
// "Request Slack update" post. Add these two as empty columns on the
// Factor Extra Source sheet (exact spelling) — same pattern as the
// dedup MARK columns below.
export const THREAD_MARK = {
  channel: 'Slack Thread Channel',
  ts: 'Slack Thread TS',
};

const FACTOR_SHEET_ID = process.env.FACTOR_EXTRA_SOURCE_SHEET_ID;
const FACTOR_TAB = process.env.FACTOR_EXTRA_SOURCE_TAB || 'Sheet1';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const NOTIFY_DISPATCH_HOURS = Number(process.env.NOTIFY_DISPATCH_HOURS || 1);

// Dedup marker columns — must exist as real headers in the Factor sheet,
// or this can't remember what it already sent and would re-notify every run.
const MARK = {
  missingReg: 'Notified Missing Reg',
  truckStatus: 'Notified Truck Status',
  dispatchSoon: 'Notified Dispatch Soon',
};

/**
 * Checks every Factor lane against the three notification conditions and
 * posts to Slack for any newly-triggered ones.
 *
 * @param {boolean} force - if true, ignores the dedup markers (used by the
 *   manual "check now" button, so a person hitting the button always gets
 *   a real check rather than silently no-oping on already-marked lanes).
 */
export async function runNotifyCheck({ force = false } = {}) {
  if (!SLACK_WEBHOOK_URL) {
    return { skipped: true, reason: 'SLACK_WEBHOOK_URL not configured yet' };
  }

  const { headers, rows } = await readSheetAsObjects(FACTOR_SHEET_ID, FACTOR_TAB, {
    requireNonEmpty: KEY_HEADER,
  });

  const hasMarkColumns = Object.values(MARK).every((h) => headers.includes(h));
  let sent = 0;
  const details = [];

  for (const lane of rows) {
    const ref = lane[KEY_HEADER];
    const messages = [];

    if ((force || !lane[MARK.missingReg]) && isMissingInfoSoon(lane['Date'], lane['Planned Dispatch Time'], lane['Vehicle Registration Number'], 4)) {
      messages.push({ mark: MARK.missingReg, text: `:warning: *${ref}* dispatches within 4h and still has no vehicle registration number.` });
    }

    if ((force || !lane[MARK.truckStatus]) && isOverdueOrDelayed(lane['Date'], lane['Planned Arrival Time'], lane['Actual Arrival time'])) {
      if (!String(lane['Arrival Status'] || '').trim()) {
        messages.push({ mark: MARK.truckStatus, text: `:truck: *${ref}* is past its planned arrival time with no arrival status set — is the carrier there?` });
      }
    }

    if ((force || !lane[MARK.dispatchSoon]) && isDispatchingSoon(lane['Date'], lane['Actual Dispatch time'] || lane['Planned Dispatch Time'], NOTIFY_DISPATCH_HOURS)) {
      messages.push({ mark: MARK.dispatchSoon, text: `:clock3: *${ref}* is dispatching within ${NOTIFY_DISPATCH_HOURS}h.` });
    }

    for (const msg of messages) {
      await postToSlack(msg.text);
      sent++;
      details.push(msg.text);
      if (hasMarkColumns && !force) {
        await updateRowCells(FACTOR_SHEET_ID, FACTOR_TAB, headers, lane._rowNumber, { [msg.mark]: 'yes' });
      }
    }
  }

  return { ok: true, sent, dedupActive: hasMarkColumns, details };
}

async function postToSlack(text) {
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

/**
 * Ad-hoc "please update me" request for a single lane, triggered from the
 * detail popup — not tied to any automated condition.
 *
 * Unlike the automated checks above (which fire-and-forget through the
 * webhook), this one needs to know *which* Slack message it just posted so
 * a reply thread can be read back later. That means going through the bot
 * token (chat.postMessage) instead of the webhook, and writing the
 * resulting {channel, ts} onto the lane's row so the popup can find the
 * thread again on a future load.
 */
export async function requestLaneUpdate(loadReference, rowNumber) {
  const result = await postThreadRoot(`:bell: Update requested for *${loadReference}* — please reply in this thread with the latest status.`);
  if (result.skipped) return result;

  if (rowNumber) {
    const { headers } = await readSheetAsObjects(FACTOR_SHEET_ID, FACTOR_TAB, { requireNonEmpty: KEY_HEADER });
    const hasThreadColumns = Object.values(THREAD_MARK).every((h) => headers.includes(h));
    if (hasThreadColumns) {
      await updateRowCells(
        FACTOR_SHEET_ID,
        FACTOR_TAB,
        headers,
        rowNumber,
        {
          [THREAD_MARK.channel]: result.channel,
          [THREAD_MARK.ts]: result.ts,
        },
        // RAW, not USER_ENTERED: the ts (e.g. "1785174429.987750") looks
        // numeric, and USER_ENTERED lets Sheets auto-parse it as a number
        // — which then gets displayed (and read back via the API) using
        // the sheet's locale number formatting, e.g. periods as thousands
        // separators. That silently corrupts the value we need to send
        // back to Slack byte-for-byte. RAW stores it as literal text.
        { valueInputOption: 'RAW' }
      );
    }
  }

  return { ok: true, channel: result.channel, ts: result.ts };
}
