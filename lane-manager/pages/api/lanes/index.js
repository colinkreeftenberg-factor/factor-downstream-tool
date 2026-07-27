import { readSheetAsObjects, appendRow } from '../../../lib/googleSheets';
import { KEY_HEADER } from '../../../lib/columns';
import { getAllThreads } from '../../../lib/slackThreads';
import { logBacklogEntry } from '../../../lib/backlog';

const FACTOR_SHEET_ID = process.env.FACTOR_EXTRA_SOURCE_SHEET_ID;
const FACTOR_TAB = process.env.FACTOR_EXTRA_SOURCE_TAB || 'Sheet1';
const MASTER_SHEET_ID = process.env.MASTER_SHEET_ID;
const MASTER_TAB = process.env.MASTER_SHEET_TAB || 'Current Week';

// Column letter fallbacks if the header text doesn't match on either sheet.
// Override via env if these guesses are wrong — see README.
const FACTOR_COURIER_COL = process.env.FACTOR_COURIER_COL || 'F';
const MASTER_COURIER_COL = process.env.MASTER_COURIER_COL || 'C';

// Common header spellings we've seen used for this field — checked in
// order before falling back to the column-letter guess above.
const COURIER_HEADER_CANDIDATES = ['Carrier', 'Courier', 'Carrier Name', 'Transporter'];

function resolveCourier(row, fallbackColLetter) {
  for (const header of COURIER_HEADER_CANDIDATES) {
    if (row[header]) return row[header];
  }
  return row[`_col${fallbackColLetter}`] || '';
}

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
  try {
    const [factor, master] = await Promise.all([
      readSheetAsObjects(FACTOR_SHEET_ID, FACTOR_TAB, { requireNonEmpty: KEY_HEADER }),
      readSheetAsObjects(MASTER_SHEET_ID, MASTER_TAB, {
        skipSheetRows: [2],
        requireNonEmpty: KEY_HEADER,
      }),
    ]);

    const factorLanes = factor.rows.map((r) => ({
      ...r,
      Carrier: resolveCourier(r, FACTOR_COURIER_COL),
      source: 'factor',
      editable: true,
    }));

    const factorRefs = new Set(factorLanes.map((r) => r[KEY_HEADER]));
    const dachLanes = master.rows
      .filter((r) => !factorRefs.has(r[KEY_HEADER]))
      .map((r) => ({
        ...r,
        Carrier: resolveCourier(r, MASTER_COURIER_COL),
        source: 'german',
        editable: false,
      }));

    const allLanes = [...factorLanes, ...dachLanes];

    // Attach each lane's known Slack threads (if any), newest first, so
    // the detail popup can show/poll the latest one without a separate
    // round trip, and works the same for DACH lanes even though we can
    // never write onto their (read-only) source row.
    let threadsByRef = new Map();
    try {
      const allThreads = await getAllThreads();
      threadsByRef = allThreads.reduce((map, t) => {
        if (!map.has(t.loadReference)) map.set(t.loadReference, []);
        map.get(t.loadReference).push(t);
        return map;
      }, new Map());
    } catch (err) {
      console.error('Failed to load Slack threads (tab may not exist yet)', err.message);
    }

    allLanes.forEach((l) => {
      const threads = (threadsByRef.get(l[KEY_HEADER]) || []).slice().sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
      l._slackThreads = threads;
    });

    return res.status(200).json({
      lanes: allLanes,
      factorHeaders: factor.headers,
      masterHeaders: master.headers,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to read sheets', detail: err.message });
  }
}

async function handleCreate(req, res) {
  try {
    const { headers } = await readSheetAsObjects(FACTOR_SHEET_ID, FACTOR_TAB);
    const values = req.body || {};
    values['Created at'] = values['Created at'] || new Date().toISOString();

    await appendRow(FACTOR_SHEET_ID, FACTOR_TAB, headers, values);
    await logBacklogEntry({
      loadReference: values[KEY_HEADER] || '(unknown)',
      source: 'factor',
      type: 'Lane created',
      newValue: values[KEY_HEADER] || '',
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create lane', detail: err.message });
  }
}
