// Harness: stubs the few Apps Script globals dach-sync.gs touches, then
// exercises the pure helpers, buildIncoming_ and the mergeRow_ rules.
const fs = require('fs');
const vm = require('vm');

const TZ = 'Europe/Berlin';
const logs = [];

function fmt(date, tz, pattern) {
  // enough of Utilities.formatDate for the patterns this script uses
  const p2 = (n) => String(n).padStart(2, '0');
  const map = {
    'HH:mm': `${p2(date.getHours())}:${p2(date.getMinutes())}`,
    'dd.MM.yyyy HH:mm:ss': `${p2(date.getDate())}.${p2(date.getMonth() + 1)}.${date.getFullYear()} ${p2(date.getHours())}:${p2(date.getMinutes())}:${p2(date.getSeconds())}`,
    'EEEE': ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()],
  };
  if (!(pattern in map)) throw new Error('unhandled pattern ' + pattern);
  return map[pattern];
}

const sandbox = {
  Session: { getScriptTimeZone: () => TZ },
  Utilities: { formatDate: fmt },
  Logger: { log: (m) => logs.push(String(m)) },
  console,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/dach-sync.gs', 'utf8'), sandbox);

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`  FAIL ${label}\n    got      ${a}\n    expected ${e}`); }
}

// --- week derivation, checked against the real Sheet1 values -----------------
console.log('\nHelloFresh DE week (Thu-start = ISO week of date+4):');
const weekCases = [
  ['2026-08-13', 34], ['2026-08-15', 34], ['2026-08-19', 34],   // Thu..Wed = wk34
  ['2026-08-20', 35], ['2026-08-21', 35], ['2026-08-22', 35], ['2026-08-26', 35],
  ['2026-08-27', 36], ['2026-08-07', 33], ['2026-08-16', 34], ['2026-08-17', 34], ['2026-08-18', 34],
  ['2026-01-01', 2], ['2026-12-30', 53],
];
for (const [iso, want] of weekCases) {
  const [y, m, d] = iso.split('-').map(Number);
  eq(sandbox.hfWeek_({ y, m, d }), want, `hfWeek_(${iso})`);
}

// The Thursday→Wednesday span is the part the rule pins down: the Sunday a week
// would usually start on must be day 4 of the HF week, and every day of that
// span must carry the same number. This holds under either numbering.
console.log('HF week span (Thu start, Sunday = day 4, constant across the span):');
for (const thuIso of ['2026-08-13', '2026-08-20', '2026-06-04', '2026-12-31', '2027-01-07']) {
  const [y, m, d] = thuIso.split('-').map(Number);
  const thu = new Date(Date.UTC(y, m - 1, d));
  eq(thu.getUTCDay(), 4, `${thuIso} is a Thursday`);
  const want = sandbox.hfWeek_({ y, m, d });
  const seen = [];
  for (let k = 0; k < 7; k++) {
    const c = new Date(thu.getTime() + k * 86400000);
    seen.push(sandbox.hfWeek_({ y: c.getUTCFullYear(), m: c.getUTCMonth() + 1, d: c.getUTCDate() }));
  }
  eq(seen, new Array(7).fill(want), `${thuIso}: all 7 days are week ${want}`);
  const sunday = new Date(thu.getTime() + 3 * 86400000);
  eq(sunday.getUTCDay(), 0, `${thuIso}: day 4 of the span is the Sunday`);
}

// Both numberings must agree on every dated row in the spreadsheet — that is
// why the sheet data cannot pick between them, and why it is a config switch.
console.log('Both numberings on known-good rows:');
for (const [iso, want] of [['2026-08-15', 34], ['2026-08-20', 35], ['2026-08-21', 35],
                           ['2026-08-22', 35], ['2026-06-06', 24]]) {
  const [y, m, d] = iso.split('-').map(Number);
  eq(sandbox.isoWeek_(y, m - 1, d + 4), want, `iso numbering ${iso}`);
  eq(sandbox.hfWeekWeeknum_({ y, m, d }), want, `weeknum numbering ${iso}`);
}
// …and must diverge exactly where predicted, so a wrong default is detectable.
eq(sandbox.isoWeek_(2026, 11, 31 + 4), 1, 'iso: week of Thu 31.12.2026 is 1');
eq(sandbox.hfWeekWeeknum_({ y: 2026, m: 12, d: 31 }), 2, 'weeknum: week of Thu 31.12.2026 is 2');

// Year-boundary answers are numbering-specific, so only assert the ones that
// belong to the scheme actually configured.
if (sandbox.WEEK_NUMBERING === 'iso') {
  eq(sandbox.hfWeek_({ y: 2025, m: 12, d: 25 }), 1, 'iso: HF wk1/2026 starts Thu 25.12.2025');
  eq(sandbox.hfWeek_({ y: 2025, m: 12, d: 31 }), 1, 'iso: 31.12.2025 still HF wk1/2026');
} else {
  eq(sandbox.hfWeek_({ y: 2025, m: 12, d: 25 }), 53, 'weeknum: 25.12.2025 is wk53');
}

// --- parsing / canonicalisation ---------------------------------------------
console.log('Value parsing:');
eq(sandbox.parseDate_('07.08.2026', TZ), { y: 2026, m: 8, d: 7 }, 'DACH d.m.y');
eq(sandbox.parseDate_('8/15/2026', TZ), { y: 2026, m: 8, d: 15 }, 'Sheet1 display m/d/y');
eq(sandbox.parseDate_('2026-08-07', TZ), { y: 2026, m: 8, d: 7 }, 'iso');
eq(sandbox.parseDate_('07.08.2026 14:22', TZ), { y: 2026, m: 8, d: 7 }, 'd.m.y with time');
eq(sandbox.parseDate_('', TZ), null, 'blank date');
eq(sandbox.parseDate_('n/a', TZ), null, 'junk date');
eq(sandbox.parseTime_('12:52', TZ), '12:52', 'HH:mm');
eq(sandbox.parseTime_('9:05', TZ), '09:05', 'H:mm padded');
eq(sandbox.parseTime_('15:00:00', TZ), '15:00', 'HH:mm:ss');
eq(sandbox.parseTime_('07.08.2026 14:22:00', TZ), '14:22', 'time out of datetime');
eq(sandbox.parseTime_('99:99', TZ), null, 'out of range');
eq(sandbox.toNumber_('731'), 731, 'int');
eq(sandbox.toNumber_('1.255'), 1255, 'de thousands sep');
eq(sandbox.toNumber_('30,5'), 30.5, 'de decimal comma');
eq(sandbox.toNumber_('abc'), null, 'non numeric');

// A DACH date and the Sheet1 display of that same date must canonicalise equal —
// this is what stops every sync rewriting every date cell.
eq(sandbox.canon_('07.08.2026', 'date', TZ), sandbox.canon_('8/7/2026', 'date', TZ), 'DACH vs Sheet1 date canon');
eq(sandbox.canon_('15:00', 'time', TZ), sandbox.canon_('15:00:00', 'time', TZ), 'time canon across formats');
eq(sandbox.canon_('30', 'number', TZ), sandbox.canon_('30', 'number', TZ), 'number canon');

// --- buildIncoming_ on a real DACH Freitag row -------------------------------
console.log('buildIncoming_ (real "DACH Freitag" row):');
const src = new Array(70).fill('');
const put = (letter, v) => { src[sandbox.colIdx_(letter)] = v; };
put('B', 'DPD_LEH_NAT_01_VE_WES_070826_L1');
put('C', 'DPD_LEH_NAT_01_VE');
put('F', 'Live Loading');
put('G', 'Wesemann');
put('K', '07.08.2026');   // ARRIVAL TRAILER (PLAN) Date
put('L', '12:52');        // Ankunft SOLL
put('S', '07.08.2026');
put('T', '13:07');
put('AS', '07.08.2026');
put('AT', '14:22');
put('BJ', '07.08.2026');
put('BK', '14:52');       // Abfahrt SOLL

const inc = sandbox.buildIncoming_(src, TZ);
eq(inc['Destination'].canon, 'DPD_LEH_NAT_01_VE', 'Destination <- Batch Wave');
eq(inc['Courier'].canon, 'Wesemann', 'Courier <- Carrier');
eq(inc['Date'].canon, '2026-08-07', 'Date <- K');
eq(inc['Planned Arrival Time'].canon, '12:52', 'Planned Arrival <- Ankunft SOLL');
eq(inc['Planned Dispatch Time'].canon, '14:52', 'Planned Dispatch <- Abfahrt SOLL');
eq(inc['Week'].canon, '33', 'Week derived (07.08.2026 -> 33)');
eq(inc['Collection Day'].canon, 'Friday', 'Collection Day derived');
eq(inc['Trailer Type Actual'].canon, 'Live Loading', 'Trailer Type <- Loading Type');
eq(inc['Actual Arrival time'].canon, '', 'blank stays blank');
// constructor name, not instanceof: the vm sandbox has its own Date realm
eq(inc['Date'].write.constructor.name, 'Date', 'dates written as Date objects');
eq(inc['Planned Arrival Time'].write, '12:52', 'times written as HH:mm strings');
// fromAny: IST plate wins, avise is the fallback
put('J', 'AVISE-1');
eq(sandbox.buildIncoming_(src, TZ)['Trailer number'].canon, 'AVISE-1', 'Trailer number falls back to avise plate');
put('P', 'IST-9');
eq(sandbox.buildIncoming_(src, TZ)['Trailer number'].canon, 'IST-9', 'Trailer number prefers IST plate');

// --- buildNewRow_ ------------------------------------------------------------
// Regression: FIELD_MAP originally had no entry for the key column, so appended
// rows carried every mapped value except the Load Reference that identifies
// them — and the next run could not find them, appending duplicates instead.
console.log('buildNewRow_ (appended rows):');
eq(sandbox.FIELD_MAP.some((f) => f.to === sandbox.KEY_HEADER), true,
   'FIELD_MAP maps the key column');
eq(inc[sandbox.KEY_HEADER].canon, 'DPD_LEH_NAT_01_VE_WES_070826_L1', 'buildIncoming_ carries the key');

const NEW_HEADERS = ['Week', 'Email Sent', 'Load Reference', 'Destination', 'Courier',
                     'Haulier', 'Notes, Issues Detected:', 'Updated at', 'Source'];
const newRow = sandbox.buildNewRow_(NEW_HEADERS, inc, TZ);
const at = (h) => newRow[NEW_HEADERS.indexOf(h)];
eq(at('Load Reference'), 'DPD_LEH_NAT_01_VE_WES_070826_L1', 'appended row has the key');
eq(at('Destination'), 'DPD_LEH_NAT_01_VE', 'appended row has Destination');
eq(at('Courier'), 'Wesemann', 'appended row has Courier');
eq(at('Week'), 33, 'appended row has derived Week');
eq(at('Haulier'), '', 'unmapped Haulier left blank');
eq(at('Notes, Issues Detected:'), '', 'unmapped Notes left blank');
eq(at('Email Sent'), '', 'unmapped Email Sent left blank');
eq(at('Source'), 'DACH', 'Source column stamped when present');
eq(at('Updated at') !== '', true, 'Updated at stamped on new rows');
eq(newRow.length, NEW_HEADERS.length, 'row width matches header count');
// every mapped, non-blank incoming value must land somewhere in the row
Object.keys(inc).forEach((h) => {
  if (inc[h].canon === '' || NEW_HEADERS.indexOf(h) === -1) return;
  eq(String(at(h)) !== '', true, `mapped value present for "${h}"`);
});

// --- mergeRow_: the five rules ----------------------------------------------
console.log('mergeRow_ rules:');
const HEADERS = ['Week', 'Load Reference', 'Courier', 'Planned Arrival Time', 'Actual Arrival time', 'Notes, Issues Detected:', 'Updated at'];

function runMerge({ sheetRow, prevCanon, incomingRaw }) {
  const writes = [];
  const fakeSheet = {
    getRange: (r, c, nr, nc) => ({ setValues: (v) => { v[0].forEach((val, i) => writes.push({ col: c + i, value: val })); } }),
  };
  const td = { display: [sheetRow.slice()], firstRow: 2 };
  const incoming = {};
  for (const [h, [v, t]] of Object.entries(incomingRaw)) incoming[h] = sandbox.cell_(v, t, TZ);
  const res = sandbox.mergeRow_(fakeSheet, HEADERS, td, 2, incoming, prevCanon, TZ);
  const byHeader = {};
  writes.forEach((w) => { if (HEADERS[w.col - 1] !== 'Updated at') byHeader[HEADERS[w.col - 1]] = w.value; });
  return { written: byHeader, preserved: res.preserved };
}

// rule 1 — blank incoming is never written, even over a blank cell
eq(runMerge({
  sheetRow: ['', 'REF1', 'Wesemann', '', '', '', ''],
  prevCanon: { 'Actual Arrival time': '10:00' },
  incomingRaw: { 'Actual Arrival time': ['', 'time'] },
}).written, {}, 'rule 1: blank DACH value never written');

// rule 2 — identical value across formats is a no-op (no needless rewrite)
eq(runMerge({
  sheetRow: ['', 'REF1', 'Wesemann', '15:00:00', '', '', ''],
  prevCanon: { 'Planned Arrival Time': '15:00' },
  incomingRaw: { 'Planned Arrival Time': ['15:00', 'time'] },
}).written, {}, 'rule 2: unchanged value is a no-op');

// rule 3 — first sync ever: fill the blank, keep the populated one
eq(runMerge({
  sheetRow: ['', 'REF1', 'Kuehne', '', '', '', ''],
  prevCanon: null,
  incomingRaw: { 'Courier': ['Wesemann', 'text'], 'Planned Arrival Time': ['12:52', 'time'] },
}), { written: { 'Planned Arrival Time': '12:52' }, preserved: 1 },
   'rule 3: first sync fills blanks, never overwrites existing');

// rule 4 — DACH changed since last sync, so DACH wins even over an edit
eq(runMerge({
  sheetRow: ['', 'REF1', 'Wesemann', '13:10', '', '', ''],
  prevCanon: { 'Planned Arrival Time': '12:52' },
  incomingRaw: { 'Planned Arrival Time': ['13:30', 'time'] },
}), { written: { 'Planned Arrival Time': '13:30' }, preserved: 0 },
   'rule 4: newer DACH value overwrites a lane-manager edit');

// rule 5 — THE requirement: DACH unchanged, Sheet1 differs => keep the edit
eq(runMerge({
  sheetRow: ['', 'REF1', 'Wesemann', '13:10', '', '', ''],
  prevCanon: { 'Planned Arrival Time': '12:52' },
  incomingRaw: { 'Planned Arrival Time': ['12:52', 'time'] },
}), { written: {}, preserved: 1 },
   'rule 5: lane-manager edit survives when DACH has not changed');

// rule 5 across a whole row: one DACH field moved, the edited one did not
eq(runMerge({
  sheetRow: ['33', 'REF1', 'Wesemann', '13:10', '', 'operator note', ''],
  prevCanon: { 'Planned Arrival Time': '12:52', 'Courier': 'Wesemann', 'Week': '33' },
  incomingRaw: { 'Planned Arrival Time': ['12:52', 'time'], 'Courier': ['Wegner', 'text'], 'Week': ['33', 'number'] },
}), { written: { 'Courier': 'Wegner' }, preserved: 1 },
   'mixed row: only the genuinely-changed DACH field is written');

// Updated at is stamped only when something actually changed
(() => {
  const writes = [];
  const fakeSheet = { getRange: (r, c, nr, nc) => ({ setValues: (v) => v[0].forEach((val, i) => writes.push({ col: c + i, value: val })) }) };
  const incoming = { 'Courier': sandbox.cell_('Wegner', 'text', TZ) };
  sandbox.mergeRow_(fakeSheet, HEADERS, { display: [['', 'REF1', 'Wesemann', '', '', '', '']], firstRow: 2 }, 2,
                    incoming, { 'Courier': 'Wesemann' }, TZ);
  eq(writes.some((w) => w.col === HEADERS.indexOf('Updated at') + 1), true, 'Updated at stamped on change');
})();

// A field the map never touches is invisible to the merge
eq(runMerge({
  sheetRow: ['', 'REF1', 'Wesemann', '', '', 'operator note', ''],
  prevCanon: { 'Courier': 'Wesemann' },
  incomingRaw: { 'Courier': ['Wesemann', 'text'] },
}).written, {}, 'unmapped Notes column untouched');

console.log(`\n${pass} passed, ${fail} failed`);
if (logs.length) console.log('logs:', logs);
process.exit(fail ? 1 : 0);
