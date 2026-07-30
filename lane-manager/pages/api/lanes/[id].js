import { readSheetAsObjects, updateRowCells } from '../../../lib/googleSheets';
import { KEY_HEADER, HEADER_ALIASES, applyHeaderAliases } from '../../../lib/columns';
import { logBacklogEntry } from '../../../lib/backlog';

const FACTOR_SHEET_ID = process.env.FACTOR_EXTRA_SOURCE_SHEET_ID;
const FACTOR_TAB = process.env.FACTOR_EXTRA_SOURCE_TAB || 'Sheet1';

function existingValue(row, header) {
  if (row[header] !== undefined) return row[header];
  const alias = HEADER_ALIASES[header];
  return alias && row[alias] !== undefined ? row[alias] : '';
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // `id` is the sheet row number. DACH Logs lanes (from the master sheet)
  // are never editable here — the WA Liste sync would just overwrite any
  // change on its next 5-minute run.
  const rowNumber = parseInt(req.query.id, 10);
  if (!rowNumber || rowNumber < 2) {
    return res.status(400).json({ error: 'Invalid row id' });
  }

  try {
    const { headers, rows } = await readSheetAsObjects(FACTOR_SHEET_ID, FACTOR_TAB);
    const updates = req.body || {};
    updates['Updated at'] = new Date().toISOString();

    // Diff against the row's current values so every real change lands in
    // the backlog with its old and new value — skip the internal
    // 'Updated at' timestamp itself, that's not a person-made change.
    const existingRow = rows.find((r) => r._rowNumber === rowNumber);
    const loadReference = existingRow ? existingRow[KEY_HEADER] : '(unknown)';
    const changedFields = Object.keys(updates).filter((h) => h !== 'Updated at');

    const aliasedUpdates = applyHeaderAliases(updates, headers);
    await updateRowCells(FACTOR_SHEET_ID, FACTOR_TAB, headers, rowNumber, aliasedUpdates);

    for (const field of changedFields) {
      const oldValue = existingRow ? existingValue(existingRow, field) : '';
      const newValue = updates[field] || '';
      if (String(oldValue) === String(newValue)) continue; // no real change, skip the noise
      await logBacklogEntry({
        loadReference,
        source: 'factor',
        type: 'Field update',
        field,
        oldValue,
        newValue,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update lane', detail: err.message });
  }
}
