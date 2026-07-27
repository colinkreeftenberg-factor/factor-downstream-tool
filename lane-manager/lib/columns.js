// This is the one file to edit if any of these header names don't match
// your real sheet exactly (Sheets matches on literal header text, so
// spacing/casing matters — e.g. the finish-time header below has the
// double space + trailing space exactly as it appears in your Apps Script).

export const KEY_HEADER = 'Load Reference';

// Short brand badge text — kept to 2 letters each so FA and DE line up
// evenly regardless of source, instead of 'FACTOR_' vs 'DACH' being
// visibly different widths next to each other in a table.
export function brandLabel(source) {
  return source === 'factor' ? 'FA' : 'DE';
}

export const SUMMARY_FIELDS = [
  { header: 'Load Reference', label: 'Load reference', type: 'text' },
  { header: 'Carrier', label: 'Courier', type: 'text' },
  { header: 'Destination', label: 'Destination', type: 'text' },
  { header: 'Collection Day', label: 'Collection Day', type: 'text' },
  { header: 'Date', label: 'Date', type: 'date' },
  { header: 'Planned Arrival Time', label: 'Planned arrival', type: 'time' },
  { header: 'Actual Arrival time', label: 'Actual arrival', type: 'time' },
  { header: 'Planned Dispatch Time', label: 'Planned dispatch time', type: 'time' },
  { header: 'Actual Dispatch time', label: 'Actual dispatch time', type: 'time' },
  { header: 'Trailer Number', label: 'Trailer number', type: 'text' },
  { header: 'Vehicle Registration Number', label: 'Vehicle registration number', type: 'text' },
];

// Fields only shown in the detail popup. Trailer Utilization and Dispatch
// Status were dropped per your last steer.
export const DETAIL_FIELDS = [
  { header: 'Load Status', label: 'Load status', type: 'text' },
  { header: 'Trailer Type Actual', label: 'Trailer type actual', type: 'text' },
  { header: 'Bay door allocation', label: 'Bay door allocation', type: 'text' },
  { header: 'Loader(s)', label: 'Loader(s)', type: 'text' },
  { header: 'Driver Name', label: 'Driver name', type: 'text' },
  { header: 'Time entering Yard', label: 'Time entering yard', type: 'time' },
  { header: 'Time at dock', label: 'Time at dock', type: 'time' },
  { header: 'Arrival Status', label: 'Arrival status', type: 'text' },
  { header: 'Trailer Condition', label: 'Trailer condition', type: 'text' },
  { header: 'Time  Loaded (Finish time) ', label: 'Time loaded (finish time)', type: 'time' },
  { header: 'Pallets loaded', label: 'Pallets loaded', type: 'text' },
  { header: 'Total Boxes Loaded', label: 'Total boxes loaded', type: 'text' },
  { header: 'Notes, Issues Detected:', label: 'Notes, issues detected', type: 'text' },
];

// Every field, keyed by header, for quick lookup of label/type regardless
// of which list (summary or detail) it came from.
export const ALL_FIELDS_BY_HEADER = Object.fromEntries(
  [...SUMMARY_FIELDS, ...DETAIL_FIELDS].map((f) => [f.header, f])
);

// Groupings for the detail popup — planned/actual and related fields
// clustered together with a colored panel per group, per your request.
// "Load Status" and "Notes" render standalone, outside these sections.
export const DETAIL_SECTIONS = [
  {
    title: 'Arrival',
    color: 'blue',
    headers: ['Planned Arrival Time', 'Actual Arrival time', 'Time entering Yard', 'Time at dock'],
  },
  {
    title: 'Dispatch',
    color: 'gold',
    headers: ['Planned Dispatch Time', 'Actual Dispatch time'],
  },
  {
    title: 'Trailer & driver',
    color: 'green',
    headers: ['Trailer Number', 'Vehicle Registration Number', 'Driver Name', 'Trailer Type Actual'],
  },
  {
    title: 'Bay & loaders',
    color: 'gray',
    headers: ['Bay door allocation', 'Loader(s)'],
  },
  {
    title: 'Condition',
    color: 'red',
    headers: ['Arrival Status', 'Trailer Condition'],
  },
  {
    title: 'Loading',
    color: 'teal',
    headers: ['Pallets loaded', 'Total Boxes Loaded', 'Time  Loaded (Finish time) '],
  },
];

// Groupings for the *summary table* header (dashboard, not the popup) —
// a colored band above these column pairs so they visually cluster while
// keeping the table itself exactly as scrollable/functional as before.
export const SUMMARY_GROUPS = [
  { headers: ['Planned Arrival Time', 'Actual Arrival time'], label: 'Arrival', color: '#C79C00', textColor: '#ffffff' },
  { headers: ['Planned Dispatch Time', 'Actual Dispatch time'], label: 'Dispatch', color: '#61DFFF', textColor: '#141414' },
  { headers: ['Trailer Number', 'Vehicle Registration Number'], label: 'Trailer', color: '#75C26D', textColor: '#141414' },
];

// Fields the create-lane form fills in directly (the rest get filled in
// later via the detail popup, once the lane is actually happening).
export const CREATE_FIELDS = [
  'Load Reference',
  'Carrier',
  'Destination',
  'Collection Day',
  'Date',
  'Planned Arrival Time',
  'Planned Dispatch Time',
  'Trailer Number',
  'Vehicle Registration Number',
];
