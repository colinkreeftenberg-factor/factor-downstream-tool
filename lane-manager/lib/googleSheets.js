import { google } from 'googleapis';

// Single shared auth client for the service account.
// Same account already used by the error-monitoring dashboard can be reused
// here — just grant it Editor on Factor Extra Source, Viewer on Current Week.
function getAuthClient() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuthClient() });
}

/**
 * Reads a tab and returns rows as objects keyed by the header row (row 1).
 * Each row carries a `_rowNumber` (1-indexed, matching the actual sheet
 * row) so updates can target the exact row without re-scanning.
 *
 * @param {object} [opts]
 * @param {number[]} [opts.skipSheetRows] - literal sheet row numbers to
 *   ignore (e.g. [2] to skip a status/stamp row like Current Week's A2).
 * @param {string} [opts.requireNonEmpty] - header name that must be
 *   non-blank for a row to be included. Filters out the empty rows left
 *   behind by a clear-and-rewrite sync (e.g. rows 3-500 that aren't all
 *   used yet).
 */
export async function readSheetAsObjects(spreadsheetId, tabName, opts = {}) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabName,
  });

  const data = res.data.values || [];
  if (data.length === 0) return { headers: [], rows: [] };

  const headers = data[0].map((h) => String(h || '').trim());
  const skipSet = new Set(opts.skipSheetRows || []);

  const rows = [];
  data.slice(1).forEach((rawRow, i) => {
    const sheetRowNumber = i + 2; // +2: skip header row, 1-indexed
    if (skipSet.has(sheetRowNumber)) return;

    const obj = { _rowNumber: sheetRowNumber };
    headers.forEach((h, idx) => {
      if (h) obj[h] = rawRow[idx] !== undefined ? rawRow[idx] : '';
    });
    // Also stash every column by letter (_colA, _colB, ...) so a field can
    // be pulled by position when its header text doesn't match what we
    // expect — useful when the same logical column has different header
    // spelling across sheets.
    rawRow.forEach((val, idx) => {
      obj[`_col${columnIndexToLetter(idx)}`] = val !== undefined ? val : '';
    });

    if (opts.requireNonEmpty && !String(obj[opts.requireNonEmpty] || '').trim()) return;

    rows.push(obj);
  });

  return { headers, rows };
}

/**
 * Reads a single column (e.g. a lookup list on a "links" tab) and returns
 * the non-empty values below the header row.
 */
export async function readColumnValues(spreadsheetId, tabName, columnLetter) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!${columnLetter}2:${columnLetter}1000`,
  });
  const data = res.data.values || [];
  return data.map((r) => String(r[0] || '').trim()).filter(Boolean);
}

/**
 * Appends a new row. `values` is an object keyed by header name — any
 * header not present in `values` is written as an empty cell, same as the
 * buildMasterRow behaviour in the existing sync script.
 */
export async function appendRow(spreadsheetId, tabName, headers, values) {
  const sheets = getSheetsClient();
  const row = headers.map((h) => (values[h] !== undefined ? values[h] : ''));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: tabName,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

/**
 * Updates specific columns on a specific row without touching the rest —
 * same "only overwrite what changed" behaviour as syncDashboardToSource's
 * mergedRow logic. `updates` is a partial object keyed by header name.
 */
export async function updateRowCells(spreadsheetId, tabName, headers, rowNumber, updates, opts = {}) {
  const sheets = getSheetsClient();

  const data = [];
  for (const [header, value] of Object.entries(updates)) {
    const colIdx = headers.indexOf(header);
    if (colIdx === -1) continue; // silently skip unknown headers
    const colLetter = columnIndexToLetter(colIdx);
    data.push({
      range: `${tabName}!${colLetter}${rowNumber}`,
      values: [[value]],
    });
  }

  if (data.length === 0) return;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: opts.valueInputOption || 'USER_ENTERED', data },
  });
}

function columnIndexToLetter(idx) {
  let letter = '';
  let n = idx;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}
