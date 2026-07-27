import { readSheetAsObjects, updateRowCells } from '../../../lib/googleSheets';

const FACTOR_SHEET_ID = process.env.FACTOR_EXTRA_SOURCE_SHEET_ID;
const FACTOR_TAB = process.env.FACTOR_EXTRA_SOURCE_TAB || 'Sheet1';

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
    const { headers } = await readSheetAsObjects(FACTOR_SHEET_ID, FACTOR_TAB);
    const updates = req.body || {};
    updates['Updated at'] = new Date().toISOString();

    await updateRowCells(FACTOR_SHEET_ID, FACTOR_TAB, headers, rowNumber, updates);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update lane', detail: err.message });
  }
}
