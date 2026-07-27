import { readColumnPairs } from './googleSheets';

// Same "links" tab already used for the carrier dropdown in the create-lane
// form (see pages/api/carriers.js) — column G is the carrier name, column H
// is the email address to send carrier update requests to.
const LINKS_SHEET_ID = process.env.LINKS_SHEET_ID || process.env.MASTER_SHEET_ID;
const LINKS_TAB = process.env.LINKS_TAB || 'links';

export async function getCarrierEmail(carrierName) {
  if (!carrierName) return null;
  const pairs = await readColumnPairs(LINKS_SHEET_ID, LINKS_TAB, 'G', 'H');
  const target = String(carrierName).trim().toLowerCase();
  const match = pairs.find(([name]) => name.toLowerCase() === target);
  return match ? match[1] || null : null;
}
