import { readRawValues } from '../../lib/googleSheets';
import { parseReferenzTab } from '../../lib/loadingReference';

const FACTOR_SHEET_ID = process.env.FACTOR_EXTRA_SOURCE_SHEET_ID;
const REFERENZ_TAB = process.env.REFERENZ_TAB || 'Referenz';

// Cached in memory: the planned lanes per load reference change at most a few
// times a week, and every delivery note asks for them.
const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, groups: null };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (cache.groups && Date.now() - cache.at < CACHE_MS) {
    return res.status(200).json({ groups: cache.groups, cached: true });
  }

  try {
    const values = await readRawValues(FACTOR_SHEET_ID, REFERENZ_TAB);
    const groups = parseReferenzTab(values);
    cache = { at: Date.now(), groups };
    return res.status(200).json({ groups });
  } catch (err) {
    console.error('Failed to read the Referenz tab', err.message);
    // A missing or renamed tab shouldn't stop anyone printing a note — they
    // just get the ten blank rows instead of a prefilled plan.
    return res.status(200).json({ groups: [], error: 'Referenz tab unavailable', detail: err.message });
  }
}
