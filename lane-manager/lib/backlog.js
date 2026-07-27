import { readSheetAsObjects, appendRow } from './googleSheets';

const FACTOR_SHEET_ID = process.env.FACTOR_EXTRA_SOURCE_SHEET_ID;
const BACKLOG_TAB = process.env.BACKLOG_TAB || 'backlog';

// Exact header names to add to the "backlog" tab (see README).
export const BACKLOG_HEADERS = ['Timestamp', 'Load Reference', 'Source', 'Type', 'Field', 'Old Value', 'New Value'];

/**
 * Appends one row to the backlog tab. Failures here are logged but never
 * thrown — a broken backlog write shouldn't block the actual save/request
 * the person is waiting on.
 */
export async function logBacklogEntry({ loadReference, source, type, field = '', oldValue = '', newValue = '' }) {
  try {
    const { headers } = await readSheetAsObjects(FACTOR_SHEET_ID, BACKLOG_TAB);
    await appendRow(
      FACTOR_SHEET_ID,
      BACKLOG_TAB,
      headers,
      {
        Timestamp: new Date().toISOString(),
        'Load Reference': loadReference,
        Source: source,
        Type: type,
        Field: field,
        'Old Value': oldValue,
        'New Value': newValue,
      },
      { valueInputOption: 'RAW' }
    );
  } catch (err) {
    console.error('Failed to write backlog entry', err.message);
  }
}

export async function getBacklog() {
  const { rows } = await readSheetAsObjects(FACTOR_SHEET_ID, BACKLOG_TAB);
  return rows
    .map((r) => ({
      timestamp: r['Timestamp'],
      loadReference: r['Load Reference'],
      source: r['Source'],
      type: r['Type'],
      field: r['Field'],
      oldValue: r['Old Value'],
      newValue: r['New Value'],
    }))
    .filter((r) => r.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // newest first
}
