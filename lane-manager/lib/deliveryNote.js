// Everything about the Übergabeschein (handover / delivery note) that isn't
// layout lives here: which sheet column feeds which box on the paper, the
// German/English label pairs, and the defaults for the boxes the sheet has
// no column for. Same idea as columns.js — one file to edit when the sheet
// or the paper form changes.

import { parseFlexibleDate, toDateInputValue, toTimeInputValue } from './dateUtils';
import { ALL_FIELDS_BY_HEADER } from './columns';

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

/** Yard Check Out columns — header text only, all filled in by hand on site. */
export const YARD_COLUMNS = [
  { key: 'outboundPalletsTarget', de: 'Outbound Pal. SOLL', en: 'Outb. pallets target' },
  { key: 'unitsTarget', de: 'Stück SOLL', en: 'Units target' },
  { key: 'outboundPalletsActual', de: 'Outbound Pal. IST', en: 'Outb. pallets actual' },
  { key: 'yardPalletsTarget', de: 'Yard Pal. SOLL', en: 'Yard pallets target' },
  { key: 'yardPalletsActual', de: 'Yard Pal. IST', en: 'Yard pallets actual' },
  { key: 'yardCheckout', de: 'Yard Checkout', en: '' },
  { key: 'trailerTemp', de: 'Trailer Temperatur', en: 'Trailer temp.' },
];

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
export function buildNoteFromLane(lane) {
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

    // — freight —
    freight: [
      {
        load,
        boxes: str(lane['Total Boxes Loaded']),
        pallets: str(lane['Pallets loaded']),
        weight: '',
        contents: '',
      },
    ],

    // — yard check out — filled in on site, one row per load —
    yard: [{ load }],

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
  { header: 'Total Boxes Loaded', get: (n) => n.freight[0].boxes },
  { header: 'Pallets loaded', get: (n) => n.freight[0].pallets },
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
