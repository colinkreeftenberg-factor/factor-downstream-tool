import { readColumnValues } from '../../lib/googleSheets';

// ASSUMPTION: the "links" tab lives in the master "Current Week" workbook.
// If it's actually in the Factor Extra Source workbook instead, just set
// LINKS_SHEET_ID in .env.local to that sheet's ID.
const LINKS_SHEET_ID = process.env.LINKS_SHEET_ID || process.env.MASTER_SHEET_ID;
const LINKS_TAB = process.env.LINKS_TAB || 'links';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const carriers = await readColumnValues(LINKS_SHEET_ID, LINKS_TAB, 'G');
    // De-dupe while preserving order.
    const unique = [...new Set(carriers)];
    return res.status(200).json({ carriers: unique });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to read carriers', detail: err.message });
  }
}
