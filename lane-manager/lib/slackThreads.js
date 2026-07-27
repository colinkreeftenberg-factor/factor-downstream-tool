import { readSheetAsObjects, appendRow } from './googleSheets';
import { KEY_HEADER } from './columns';

// A dedicated tab, separate from both the Factor Extra Source rows and
// the read-only DACH "Current Week" sheet. This is what makes "Request
// Slack update" work for DACH lanes too — we never need write access to
// their source sheet, since the thread address lives here instead.
const FACTOR_SHEET_ID = process.env.FACTOR_EXTRA_SOURCE_SHEET_ID;
const SLACK_THREADS_TAB = process.env.SLACK_THREADS_TAB || 'Slack Threads';

// Exact header names to add to that tab (see README).
export const SLACK_THREADS_HEADERS = ['Load Reference', 'Source', 'Slack Channel', 'Slack TS', 'Requested At'];

/**
 * All thread instances ever opened for a lane, oldest first. A lane can
 * have more than one if "Request Slack update" was clicked multiple
 * times over its life — each click starts a fresh thread rather than
 * overwriting the last one, so nothing gets lost.
 */
export async function getThreadsForLane(loadReference) {
  try {
    const { rows } = await readSheetAsObjects(FACTOR_SHEET_ID, SLACK_THREADS_TAB, { requireNonEmpty: KEY_HEADER });
    return rows
      .filter((r) => r[KEY_HEADER] === loadReference)
      .map((r) => ({
        loadReference: r[KEY_HEADER],
        source: r['Source'],
        channel: r['Slack Channel'],
        ts: r['Slack TS'],
        requestedAt: r['Requested At'],
      }))
      .sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt));
  } catch (err) {
    console.error(`Slack Threads tab ("${SLACK_THREADS_TAB}") not readable yet:`, err.message);
    return [];
  }
}

/** Every thread instance across every lane — used to build the Slack Updates ticket feed. */
export async function getAllThreads() {
  try {
    const { rows } = await readSheetAsObjects(FACTOR_SHEET_ID, SLACK_THREADS_TAB, { requireNonEmpty: KEY_HEADER });
    return rows.map((r) => ({
      loadReference: r[KEY_HEADER],
      source: r['Source'],
      channel: r['Slack Channel'],
      ts: r['Slack TS'],
      requestedAt: r['Requested At'],
    }));
  } catch (err) {
    console.error(`Slack Threads tab ("${SLACK_THREADS_TAB}") not readable yet:`, err.message);
    return [];
  }
}

/**
 * Saves a new thread instance. Returns {ok:true} normally, or
 * {ok:false, reason} if the tab doesn't exist/isn't set up yet — this
 * never throws, because the Slack message has *already* been posted by
 * the time this runs, and a missing tracking tab shouldn't make that
 * look like a failed request.
 */
export async function recordThread({ loadReference, source, channel, ts }) {
  try {
    const { headers } = await readSheetAsObjects(FACTOR_SHEET_ID, SLACK_THREADS_TAB);
    await appendRow(
      FACTOR_SHEET_ID,
      SLACK_THREADS_TAB,
      headers,
      {
        [KEY_HEADER]: loadReference,
        Source: source,
        'Slack Channel': channel,
        'Slack TS': ts,
        'Requested At': new Date().toISOString(),
      },
      // RAW so the ts (looks numeric) never gets silently reformatted by
      // the sheet's locale — same lesson as the earlier per-row approach.
      { valueInputOption: 'RAW' }
    );
    return { ok: true };
  } catch (err) {
    console.error(`Failed to save Slack thread to "${SLACK_THREADS_TAB}" tab:`, err.message);
    return { ok: false, reason: err.message };
  }
}
