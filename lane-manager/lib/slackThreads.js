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
}

/** Every thread instance across every lane — used to build the Slack Updates ticket feed. */
export async function getAllThreads() {
  const { rows } = await readSheetAsObjects(FACTOR_SHEET_ID, SLACK_THREADS_TAB, { requireNonEmpty: KEY_HEADER });
  return rows.map((r) => ({
    loadReference: r[KEY_HEADER],
    source: r['Source'],
    channel: r['Slack Channel'],
    ts: r['Slack TS'],
    requestedAt: r['Requested At'],
  }));
}

export async function recordThread({ loadReference, source, channel, ts }) {
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
}
