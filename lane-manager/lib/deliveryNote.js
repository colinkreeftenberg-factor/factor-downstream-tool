// Everything about the Übergabeschein (handover / delivery note) that isn't
// layout lives here: which sheet column feeds which box on the paper, the
// German/English label pairs, and the defaults for the boxes the sheet has
// no column for. Same idea as columns.js — one file to edit when the sheet
// or the paper form changes.

import { parseFlexibleDate, toTimeInputValue } from './dateUtils';

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
