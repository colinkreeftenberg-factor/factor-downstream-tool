// Parses the "Referenz" tab, which holds the planned lanes per load reference
// in the order they get loaded.
//
// The tab isn't a clean table:
//
//   | Ladereferenz | Ladereihenfolge | Ladung           | Stück SOLL | PLT SOLL |
//   | Factor_DK    | 3 (Kobenhaven)  | Gordon-Kobenhavn | 1255       | 17       |
//   |              | 2 (Vejle)       | Gordon-Vejle     | 501        | 7        |
//   |              | 1 (Arhus)       | Gordon-Arhus     | 462        | 7        |
//   |              |                 |                  |            |          |   <- blank = end of block
//   | Factor_SE_FR | 1 (Bjuv)        | MBB-Mma-MBB      | 103        | 2        |
//
// Column A is only filled on the first row of a block, holds a *part* of the
// load reference ("Factor_DK" for lane "Factor_DK_SA_2507"), and the rows
// within a block are not in loading order — Ladereihenfolge is.

const COL = { ref: 0, order: 1, load: 2, units: 3, pallets: 4 };

const clean = (v) => String(v ?? '').trim();

/**
 * Splits "3 (Kobenhaven)" into a sort order and a city. Copes with a bare
 * number, a bare city, or "2 Malmö" without brackets.
 */
export function parseLoadingOrder(value) {
  const s = clean(value);
  if (!s) return { order: null, city: '' };

  const numMatch = s.match(/^(\d+)/);
  const order = numMatch ? parseInt(numMatch[1], 10) : null;

  const bracketed = s.match(/\(([^)]*)\)/);
  if (bracketed) return { order, city: clean(bracketed[1]) };

  const rest = clean(s.replace(/^\d+[\s.:-]*/, ''));
  return { order, city: rest };
}

/**
 * Turns the raw tab into blocks keyed by whatever sits in column A, each with
 * its lanes already sorted by Ladereihenfolge. Ties keep their sheet order,
 * which matters for the blocks where every lane is order 1.
 */
export function parseReferenzTab(values) {
  const rows = Array.isArray(values) ? values : [];

  // The header row isn't guaranteed to be row 1, so find it by its own text
  // and fall back to treating everything as data if it isn't there.
  let start = 0;
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    if (/ladereferenz/i.test(clean(rows[i]?.[COL.ref]))) {
      start = i + 1;
      break;
    }
  }

  const groups = [];
  let current = null;

  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || [];
    const key = clean(row[COL.ref]);
    const orderCell = clean(row[COL.order]);
    const load = clean(row[COL.load]);

    // A row with nothing useful ends the current block rather than being kept
    // as an empty lane.
    if (!key && !orderCell && !load) {
      current = null;
      continue;
    }

    if (key) {
      current = { key, rows: [] };
      groups.push(current);
    }
    if (!current) continue; // lane rows before any key — nothing to attach to

    const { order, city } = parseLoadingOrder(orderCell);
    current.rows.push({
      order,
      city,
      load,
      unitsTarget: clean(row[COL.units]),
      palletsTarget: clean(row[COL.pallets]),
      _sheetRow: i + 1,
    });
  }

  groups.forEach((g) => {
    g.rows.sort((a, b) => {
      const ao = a.order === null ? Infinity : a.order;
      const bo = b.order === null ? Infinity : b.order;
      if (ao !== bo) return ao - bo;
      return a._sheetRow - b._sheetRow;
    });
  });

  return groups.filter((g) => g.rows.length > 0);
}

/**
 * Finds the block for a load reference. Column A holds a fragment of the
 * reference, and one fragment can be a prefix of another ("Factor_SE" would
 * match both the FR and SA blocks), so the longest match wins.
 */
export function matchGroup(groups, loadReference) {
  const ref = clean(loadReference).toLowerCase();
  if (!ref) return null;

  let best = null;
  for (const group of groups || []) {
    const key = clean(group.key).toLowerCase();
    if (!key || !ref.includes(key)) continue;
    if (!best || key.length > clean(best.key).length) best = group;
  }
  return best;
}
