// Everything about the Übergabeschein (handover / delivery note) that isn't
// layout lives here: which sheet column feeds which box on the paper, the
// German/English label pairs, and the defaults for the boxes the sheet has
// no column for. Same idea as columns.js — one file to edit when the sheet
// or the paper form changes.

import { parseFlexibleDate, toDateInputValue, toTimeInputValue } from './dateUtils';
import { ALL_FIELDS_BY_HEADER, isDachLane } from './columns';

/** Fixed pick-up address — every note leaves from Verden. */
export const PICKUP_ADDRESS = [
  'Factor 75 Produktions B.V. & Co. KG',
  'Max-Planck-Straße 104 · 27283 Verden (Aller)',
];

// The two plate boxes, as specified: the note's "Truck plate" is filled from
// the sheet's Trailer number, and "Trailer plate" from Vehicle Registration.
// If that ever turns out to be the other way round on the sheet, swap these
// two lines and nothing else needs to change.
const TRUCK_PLATE_HEADER = 'Trailer number';
const TRAILER_PLATE_HEADER = 'Vehicle Registration';

/** Standard cargo wording, used whenever it's a refrigerated trailer. */
export const REFRIGERATED_GOODS = {
  de: 'Verderbliche / frische Lebensmittel',
  en: 'Perishable / fresh food',
};

/** Target loading-space temperature per trailer type. */
export const TEMP_TARGET = {
  ja: { de: '2 – 4 °C', en: '' },
  nein: { de: 'Umgebungstemperatur', en: 'Ambient' },
};

/**
 * The six checklist lines, in the order they appear on the current form.
 * Items 4 and 5 are phrased as "was there damage" — so "nein" is the good
 * answer there, which is why every line just gets a plain ja/nein pair
 * rather than a single tick box.
 */
export const CHECKLIST = [
  {
    key: 'askedDestination',
    de: 'Fahrer wurde nach Entladestelle gefragt',
    en: 'Driver was asked for final destination',
  },
  {
    key: 'counted',
    de: 'Paletten und Boxen wurden gezählt',
    en: 'Pallets and boxes were counted',
  },
  {
    key: 'boxLabel',
    de: 'Boxlabel passt zu der Destination',
    en: 'Box label fits with destination',
  },
  {
    key: 'damage',
    de: 'Beschädigung Boxen, Paletten o. sonstige Mängel',
    en: 'Damage of boxes, pallets or other issues',
  },
  {
    key: 'trailerCheck',
    de: 'Trailer Check: Nässe, Fremdkörper, Schädlinge, Verschmutzungen, Fremdgerüche oder Beschädigungen',
    en: 'Trailer check: wetness, foreign objects, pests, pollution, smells or damage',
  },
  {
    key: 'organic',
    de: 'Alle Bio-Artikel werden unter Kontrolle der DE-ÖKO-006 vermarktet',
    en: 'All organic items are marketed under control of DE-ÖKO-006',
  },
];

/**
 * The merged Ladung / Yard Check Out table. Lane identity on the left, then
 * planned-vs-actual pairs, then the two yard sign-off columns. Grouped so the
 * SOLL/IST pairs share one heading instead of repeating it six times, which is
 * the only way eleven columns stay readable across an A4 page.
 *
 * `source: 'referenz'` marks the columns prefilled from the Referenz tab.
 */
export const FREIGHT_GROUPS = [
  {
    de: 'Ladung & Reihenfolge',
    en: 'Load & loading order',
    columns: [
      { key: 'order', de: '#', en: '', width: '5mm', source: 'referenz', align: 'center' },
      { key: 'city', de: 'Stadt', en: 'City', width: '26mm', source: 'referenz' },
      { key: 'load', de: 'Ladung', en: 'Load', width: '40mm', source: 'referenz' },
    ],
  },
  {
    de: 'Stück',
    en: 'Units',
    columns: [
      { key: 'unitsTarget', de: 'SOLL', en: '', num: true, source: 'referenz' },
      { key: 'unitsActual', de: 'IST', en: '', num: true, wb: true },
    ],
  },
  {
    de: 'Paletten Outbound',
    en: 'Outbound pallets',
    columns: [
      { key: 'palletsTarget', de: 'SOLL', en: '', num: true, source: 'referenz' },
      { key: 'palletsActual', de: 'IST', en: '', num: true, wb: true },
    ],
  },
  {
    de: 'Paletten Yard',
    en: 'Yard pallets',
    columns: [
      { key: 'yardPalletsTarget', de: 'SOLL', en: '', num: true },
      { key: 'yardPalletsActual', de: 'IST', en: '', num: true },
    ],
  },
  {
    de: 'Yard Check Out',
    en: '',
    columns: [
      { key: 'yardCheckout', de: 'Checkout', en: '', width: '15mm' },
      { key: 'trailerTemp', de: 'Trailer Temp.', en: '', width: '15mm', num: true },
    ],
  },
];

/** Flat column list, in render order. */
export const FREIGHT_COLUMNS = FREIGHT_GROUPS.flatMap((g) => g.columns);

/** Columns the totals row sums up. */
const TOTAL_COLUMNS = [
  'unitsTarget',
  'unitsActual',
  'palletsTarget',
  'palletsActual',
  'yardPalletsTarget',
  'yardPalletsActual',
];

/**
 * Always this many rows on the paper. A load reference with eight planned lanes
 * still leaves room to add one by hand, and an unmatched reference gets ten
 * blank rows rather than a collapsed table — the printed form is the same
 * shape either way, which is what the yard team reads.
 */
export const FREIGHT_ROW_COUNT = 10;

export function emptyFreightRow() {
  return Object.fromEntries(FREIGHT_COLUMNS.map((c) => [c.key, '']));
}

/** Pads (or trims) to exactly FREIGHT_ROW_COUNT rows. */
export function padFreightRows(rows) {
  const out = (rows || []).slice(0, FREIGHT_ROW_COUNT).map((r) => ({ ...emptyFreightRow(), ...r }));
  while (out.length < FREIGHT_ROW_COUNT) out.push(emptyFreightRow());
  return out;
}

/** German decimals ("1.050,33") as well as plain numbers. */
function toNumber(value) {
  const s = str(value);
  if (!s) return null;
  const normalized = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Column sums for the totals row — blank where nothing was entered. */
export function freightTotals(rows) {
  const totals = {};
  for (const key of TOTAL_COLUMNS) {
    let sum = 0;
    let any = false;
    for (const row of rows || []) {
      const n = toNumber(row[key]);
      if (n === null) continue;
      sum += n;
      any = true;
    }
    totals[key] = any ? String(Math.round(sum * 100) / 100) : '';
  }
  return totals;
}

/** dd.MM.yyyy — how a German transporter expects to read a date. */
export function formatGermanDate(value) {
  const d = parseFlexibleDate(value);
  if (!d) return String(value || '');
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const str = (v) => String(v ?? '').trim();

/**
 * Builds the editable note object for a lane. Everything the sheet knows is
 * prefilled; everything else starts blank for the pop-up to fill in. Nothing
 * here writes back to the sheet — the note is a print artefact only.
 */
/**
 * The rows for the Ladung & Yard Check Out table.
 *
 * Factor lanes get one row per planned lane from the Referenz tab. DE lanes
 * never appear on that tab, so their freight table used to print completely
 * blank — but their Destination *is* the DACH "Batch Wave" pushed across by the
 * sync, which is exactly what the yard needs to read in the Ladung column. So
 * seed a single row with it.
 *
 * A Referenz match always wins: it is the more specific, per-city breakdown.
 */
function freightRowsForLane(lane, referenzGroup) {
  if (referenzGroup?.rows?.length) {
    return referenzGroup.rows.map((r) => ({
      order: r.order === null ? '' : String(r.order),
      city: r.city,
      load: r.load,
      unitsTarget: r.unitsTarget,
      palletsTarget: r.palletsTarget,
    }));
  }

  const load = str(lane['Destination']);
  if (load && isDachLane(lane)) return [{ load }];
  return [];
}

export function buildNoteFromLane(lane, referenzGroup = null) {
  const load = str(lane['Destination']);

  return {
    // — header / addresses & information —
    reference: str(lane['Load Reference']),
    destination1: load,
    destination2: '',
    forwarder: str(lane['Carrier']),
    loadingDate: formatGermanDate(lane['Date']),
    arrivalTime: toTimeInputValue(lane['Actual Arrival time']),
    departureTime: toTimeInputValue(lane['Actual Dispatch time']),

    // — temperature & cooling —
    // Refrigerated is the normal case, so it starts ticked. Switching it to
    // "nein" swaps the target temperature to ambient and unlocks the cargo
    // field, since a non-refrigerated trailer isn't carrying fresh food.
    refrigerated: 'ja',
    tempTarget: TEMP_TARGET.ja.de,
    tempActual: '',
    goodsDe: REFRIGERATED_GOODS.de,
    goodsEn: REFRIGERATED_GOODS.en,

    // — marks & numbers —
    truckPlate: str(lane[TRUCK_PLATE_HEADER]),
    trailerPlate: str(lane[TRAILER_PLATE_HEADER]),
    ramp: str(lane['Bay door allocation']),
    seal: '',

    // — freight & yard check out, one row per planned lane —
    // Prefilled from the Referenz tab when the load reference matches a block
    // there, or from the Destination for a DE lane; padded to ten rows either
    // way, so the paper is always the same shape.
    freight: padFreightRows(freightRowsForLane(lane, referenzGroup)),
    freightMatched: Boolean(referenzGroup),
    freightMatchedKey: referenzGroup?.key || '',
    totalWeight: '',

    // — pallet exchange —
    palletsReceived: '',
    palletsIssued: '',
    palletsTotalEuro: '',
    palletsDamaged: '',

    // — checklist — left blank so it gets ticked by hand during loading —
    checklist: Object.fromEntries(CHECKLIST.map((c) => [c.key, ''])),

    // — signatures —
    loadedBy: str(lane['Loader(s)']),
    preparedBy: '',
    handedOverBy: '',
    driverName: str(lane['Driver Name']),
  };
}

/**
 * The note fields that have a real home on the sheet, so anything typed or
 * corrected in the pop-up can go back to the lane instead of only existing on
 * paper. Everything not listed here (seal number, temperatures, yard counts,
 * pallet exchange, the checklist, the two paperwork names) has no column to
 * live in and stays print-only.
 *
 * Load Reference is deliberately absent: it's the key the sheet row is found
 * by, so editing it on the note changes what prints, never which lane this is.
 */
export const WRITE_BACK_FIELDS = [
  { header: 'Carrier', get: (n) => n.forwarder },
  { header: 'Destination', get: (n) => n.destination1 },
  { header: 'Date', type: 'date', get: (n) => n.loadingDate },
  { header: 'Actual Arrival time', type: 'time', get: (n) => n.arrivalTime },
  { header: 'Actual Dispatch time', type: 'time', get: (n) => n.departureTime },
  { header: TRUCK_PLATE_HEADER, get: (n) => n.truckPlate },
  { header: TRAILER_PLATE_HEADER, get: (n) => n.trailerPlate },
  { header: 'Bay door allocation', get: (n) => n.ramp },
  // Both totals come from the IST columns only: "loaded" means what actually
  // went on the trailer, and it also means opening a note and printing it
  // unchanged never proposes overwriting the lane with the plan.
  { header: 'Total Boxes Loaded', get: (n) => freightTotals(n.freight).unitsActual },
  { header: 'Pallets loaded', get: (n) => freightTotals(n.freight).palletsActual },
  { header: 'Loader(s)', get: (n) => n.loadedBy },
  { header: 'Driver Name', get: (n) => n.driverName },
];

/** Which note keys feed the sheet — used to badge those inputs in the pop-up. */
export const WRITE_BACK_NOTE_KEYS = new Set([
  'forwarder',
  'destination1',
  'loadingDate',
  'arrivalTime',
  'departureTime',
  'truckPlate',
  'trailerPlate',
  'ramp',
  'loadedBy',
  'driverName',
]);

/** Stores dates as YYYY-MM-DD and times as HH:MM, matching the detail popup. */
function forSheet(type, value) {
  const s = str(value);
  if (!s) return '';
  if (type === 'date') return toDateInputValue(s) || s;
  if (type === 'time') return toTimeInputValue(s) || s;
  return s;
}

/**
 * Works out what the pop-up would change on the lane: every write-back field
 * whose value differs from what the sheet currently holds.
 *
 * Blanks are skipped rather than written. Clearing a field on the note is
 * usually "don't print this", not "delete it from the sheet", and the sheet is
 * shared — so an empty box never wipes a value someone else filled in.
 */
export function diffForWriteBack(note, lane) {
  const changes = [];
  for (const field of WRITE_BACK_FIELDS) {
    const next = forSheet(field.type, field.get(note));
    if (!next) continue;
    const current = forSheet(field.type, lane[field.header]);
    if (current === next) continue;
    changes.push({
      header: field.header,
      label: ALL_FIELDS_BY_HEADER[field.header]?.label || field.header,
      from: current,
      to: next,
    });
  }
  return changes;
}

/** Turns that diff into the PATCH body /api/lanes/[id] expects. */
export function writeBackPayload(changes) {
  return Object.fromEntries(changes.map((c) => [c.header, c.to]));
}

/**
 * Applies the knock-on effects of the Kühlfahrzeug toggle. Kept next to the
 * defaults it depends on so the two can't drift apart.
 */
export function applyRefrigeratedChange(note, value) {
  const refrigerated = value === 'nein' ? 'nein' : 'ja';
  return {
    ...note,
    refrigerated,
    tempTarget: TEMP_TARGET[refrigerated].de,
    // Fresh-food wording only makes sense on a reefer; on an ambient trailer
    // the cargo is whatever the loader types in.
    goodsDe: refrigerated === 'ja' ? REFRIGERATED_GOODS.de : '',
    goodsEn: refrigerated === 'ja' ? REFRIGERATED_GOODS.en : '',
  };
}
