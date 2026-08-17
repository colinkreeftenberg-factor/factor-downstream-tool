/**
 * DACH → Sheet1 merge
 * ===================
 *
 * Lives in the container-bound Apps Script project of the Factor Extra Source
 * spreadsheet (1z3DWJRYIMTubEsa0hBtNt4djSO04mX2iDRfmAsO58h0).
 *
 * The DE team's internal tooling pushes one tab per collection day
 * ("DACH Freitag", "DACH Sonntag", …). This script merges those rows into
 * Sheet1, which is what the lane-manager reads and writes.
 *
 * The whole point of this file is the three-way merge in mergeRow_():
 * lane-manager edits must survive, but genuinely newer DACH data must win.
 * DACH gives us no per-cell timestamp, so "newer" is defined as *the DACH
 * value changed since the last time we synced it*. That's why we keep a
 * snapshot of the last-synced DACH value per (Load Reference, column) on a
 * hidden state tab — without it we could not tell "DACH still says 12:52,
 * the operator corrected Sheet1 to 13:10" (keep 13:10) apart from "DACH now
 * says 13:30" (write 13:30).
 *
 * Setup, once:
 *   1. Extensions → Apps Script, paste this file, save.
 *   2. Project Settings → Time zone → Europe/Berlin (see TZ note in run_()).
 *   3. Run setupTriggers() once and grant the permission prompt.
 *   4. Optional: run syncNow() manually and check the _dach_sync_log tab.
 */

// ---------------------------------------------------------------------------
// Configuration — everything you might realistically need to change is here.
// ---------------------------------------------------------------------------

var TARGET_TAB = 'Sheet1';
var TARGET_HEADER_ROW = 1;

/** DE tooling output tabs, merged in this order (a later tab wins on a
 *  duplicate Load Reference — logged when it happens). */
var SOURCE_TABS = [
  'DACH Freitag',
  'DACH Sonntag',
  'DACH Montag',
  'DACH Dienstag',
];
var SOURCE_HEADER_ROW = 3; // rows 1-2 are the department / KPI-group bands

var KEY_HEADER = 'Load Reference';

var STATE_TAB = '_dach_sync_state';
var LOG_TAB = '_dach_sync_log';
var LOG_MAX_ROWS = 500;

/** Days the sync is allowed to run on. 0 = Sunday … 6 = Saturday.
 *  Thu, Fri, Sat, Sun, Mon, Tue — i.e. everything except Wednesday. */
var RUN_DAYS = [4, 5, 6, 0, 1, 2];

/** Hours a trigger is created for. setupTriggers() reads this. */
var RUN_HOURS = [9, 12, 15, 17];

/** Stamp Sheet1's "Updated at" on rows this script actually changed, in the
 *  same ISO format the lane-manager uses. Set false to leave it alone. */
var STAMP_UPDATED_AT = true;
var UPDATED_AT_HEADER = 'Updated at';

/** If Sheet1 ever gains a column with this header, rows created by this
 *  script get marked with SOURCE_VALUE. Does nothing while the column is
 *  absent, so it is safe to leave switched on. */
var SOURCE_COLUMN_HEADER = 'Source';
var SOURCE_VALUE = 'DACH';

/**
 * DACH → Sheet1 field map.
 *
 * `from` is a *column letter*, not a header name, and deliberately so: row 3
 * of the DACH tabs repeats "Date", "Time" and "Check" a dozen times each, so
 * the header text alone cannot identify a column. LAYOUT_SIGNATURE below
 * guards against the DE tooling silently reordering columns on us.
 *
 * `to` must match the Sheet1 header text literally, including the double
 * space in "Time  Loaded (Finish time) ".
 */
var FIELD_MAP = [
  { to: 'Destination',                    from: 'C',            type: 'text'   }, // Batch Wave
  { to: 'Courier',                        from: 'G',            type: 'text'   }, // Carrier
  { to: 'Collection Day',                 derive: 'weekday',    type: 'text'   }, // from Date
  { to: 'Week',                           derive: 'week',       type: 'number' }, // from Date
  { to: 'Date',                           from: 'K',            type: 'date'   }, // ARRIVAL TRAILER (PLAN) › Date
  { to: 'Planned Arrival Time',           from: 'L',            type: 'time'   }, // Ankunft SOLL
  { to: 'Actual Arrival time',            from: 'O',            type: 'time'   }, // ARRIVAL TRAILER (IST) › Time
  { to: 'Planned Dispatch Time',          from: 'BK',           type: 'time'   }, // Abfahrt SOLL
  { to: 'Actual Dispatch time',           from: 'BN',           type: 'time'   }, // DEPARTURE DC (IST) › Time
  { to: 'Trailer number',                 fromAny: ['P', 'J'],  type: 'text'   }, // IST plate, else carrier avise
  { to: 'Vehicle Registration',           from: 'AF',           type: 'text'   }, // License Plate Truck
  { to: 'Load Status (Fill this in as you go)', from: 'E',      type: 'text'   }, // Loading Status
  { to: 'Trailer Type Actual',            from: 'F',            type: 'text'   }, // Loading Type
  { to: 'Bay door allocation',            from: 'D',            type: 'text'   }, // Gate
  { to: 'Loader(s)',                      from: 'AX',           type: 'text'   }, // Loading Team
  { to: 'Time entering Yard',             from: 'AD',           type: 'time'   }, // ARRIVAL DRIVER (IST) › Time
  { to: 'Time at dock',                   from: 'W',            type: 'time'   }, // POSITIONING (IST) › Time
  { to: 'Trailer Condition',              from: 'BB',           type: 'text'   }, // Trailer Check
  { to: 'Time  Loaded (Finish time) ',    from: 'AW',           type: 'time'   }, // FINISH LOADING (IST) › Time
  { to: 'Pallets loaded',                 from: 'AZ',           type: 'number' }, // Pallet Count
  { to: 'Total Boxes Loaded',             from: 'AY',           type: 'number' }, // Box Count

  // Deliberately NOT mapped, per decision:
  //   Haulier                 – no DACH equivalent, stays lane-manager owned
  //   Notes, Issues Detected: – stays lane-manager owned (DACH has Comment A /
  //                             Delay Reason BQ / Comment BR if you change your mind)
  //   Email Sent, Slack Thread Channel, Slack Thread TS, Trailer Utilization,
  //   Driver Name             – never touched by this script
  //
  // Lower-confidence candidates — uncomment to enable. The two "Check" columns
  // are blank in every current DACH row, so their value format is unverified.
  // { to: 'Arrival Status',   from: 'M',  type: 'text' }, // ARRIVAL TRAILER (IST) › Check
  // { to: 'Dispatch Status',  from: 'BL', type: 'text' }, // DEPARTURE (IST) › Check
  // { to: 'Production Day',   from: 'AI', type: 'weekdayFromDate' }, // BATCH START (PLAN) › Date
];

/**
 * Sanity check on the DACH layout before we trust any column letter.
 * Row 3 entries use labels that appear exactly once; row 2 entries pin the
 * KPI group bands (only the top-left cell of a merge carries text, which is
 * why we check the group's *first* column, not the one we read from).
 */
var LAYOUT_SIGNATURE = {
  3: {
    B: 'Load Reference',
    C: 'Batch Wave',
    D: 'Gate',
    E: 'Loading Status',
    F: 'Loading Type',
    G: 'Carrier',
    L: 'Ankunft SOLL',
    AF: 'License Plate Truck',
    AX: 'Loading Team',
    AY: 'Box Count',
    AZ: 'Pallet Count',
    BB: 'Trailer Check',
    BK: 'Abfahrt SOLL',
  },
  2: {
    K: 'ON TIME ARRIVAL TRAILER (PLAN)',
    M: 'ON TIME ARRIVAL TRAILER (IST)',
    U: 'ON TIME POSITIONING (IST)',
    AB: 'ON TIME ARRIVAL DRIVER (IST)',
    AU: 'FINISH LOADING (IST)',
    BM: 'ON TIME DEPARTURE DC (IST)',
  },
};

/** Last DACH column we ever read, so a short sheet still gets a full-width read. */
var SOURCE_LAST_COL = 'BR';

/** Marker for a Load Reference queued as an append but not in Sheet1 yet. */
var PENDING_APPEND = -1;

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DACH sync')
    .addItem('Sync now', 'syncNow')
    .addItem('Install / refresh triggers', 'setupTriggers')
    .addSeparator()
    .addItem('Reset sync state (re-adopt current values)', 'resetSyncState')
    .addToUi();
}

/** Manual run from the menu — ignores the day-of-week gate. */
function syncNow() {
  var summary = run_({ ignoreDayGate: true });
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(summary, 'DACH sync', 8);
  } catch (e) { /* no UI when run headless */ }
}

/** Trigger target. Gated so the 4 daily triggers only act on RUN_DAYS. */
function scheduledSync() {
  run_({ ignoreDayGate: false });
}

/**
 * Creates one daily trigger per entry in RUN_HOURS (4 triggers) and lets
 * scheduledSync() filter out Wednesday. The alternative — one trigger per
 * day-and-hour combination — would need 24 triggers and Apps Script caps a
 * project at 20 per user.
 *
 * Note atHour() has a ~15 minute firing window, so a 09:00 slot may run at
 * 09:12. That is fine for this job; only the calendar day matters.
 */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scheduledSync') ScriptApp.deleteTrigger(t);
  });
  RUN_HOURS.forEach(function (h) {
    ScriptApp.newTrigger('scheduledSync').timeBased().atHour(h).everyDays(1).create();
  });
  log_('Installed ' + RUN_HOURS.length + ' daily triggers at ' + RUN_HOURS.join(', ') +
       ' (' + Session.getScriptTimeZone() + '), active on days ' + RUN_DAYS.join(','));
}

/**
 * Wipes the snapshot tab. The next run then treats every DACH value as
 * "first seen", which means it fills blank Sheet1 cells but never overwrites
 * a populated one. Use it if the snapshot ever gets out of step with reality.
 */
function resetSyncState() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(STATE_TAB);
  if (sh) ss.deleteSheet(sh);
  log_('Sync state reset — next run re-adopts current Sheet1 values.');
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

function run_(opts) {
  opts = opts || {};

  // Script timezone drives every date/time read and the trigger clock. If
  // this is not Europe/Berlin the day gate and the derived weekday can be a
  // day out around midnight.
  var tz = Session.getScriptTimeZone();
  var now = new Date();

  if (!opts.ignoreDayGate && RUN_DAYS.indexOf(now.getDay()) === -1) {
    return 'Skipped: ' + Utilities.formatDate(now, tz, 'EEEE') + ' is not a run day.';
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) {
    log_('Skipped: another sync is already running.');
    return 'Skipped: another sync is already running.';
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var target = ss.getSheetByName(TARGET_TAB);
    if (!target) throw new Error('Target tab "' + TARGET_TAB + '" not found.');

    var targetHeaders = readTargetHeaders_(target);
    var keyCol = targetHeaders.indexOf(KEY_HEADER);
    if (keyCol === -1) throw new Error('"' + KEY_HEADER + '" not found in ' + TARGET_TAB + ' row ' + TARGET_HEADER_ROW);

    warnUnknownTargets_(targetHeaders);

    var td = readTargetData_(target, targetHeaders.length);
    var rowByKey = indexTargetRows_(td.display, keyCol);

    var state = readState_(ss);

    var stats = { newRows: 0, cellsWritten: 0, rowsTouched: 0, preserved: 0, skippedTabs: [] };
    var appends = [];

    SOURCE_TABS.forEach(function (tabName) {
      var sh = ss.getSheetByName(tabName);
      if (!sh) { stats.skippedTabs.push(tabName + ' (missing)'); return; }

      var problem = verifyLayout_(sh, tabName);
      if (problem) { stats.skippedTabs.push(tabName + ' (' + problem + ')'); return; }

      var rows = readSourceRows_(sh);
      rows.forEach(function (srcRow) {
        var key = String(srcRow[colIdx_('B')] || '').trim();
        if (!key) return;

        var incoming = buildIncoming_(srcRow, tz);
        if (!incoming) return;

        var prev = state[key] ? state[key].values : null;

        if (rowByKey[key] === PENDING_APPEND) {
          // Same Load Reference in two DACH tabs. The row is already queued as
          // an append and is not in Sheet1 yet, so there is nothing to merge
          // against — the first tab's values stand.
          log_('WARN "' + key + '" appears in more than one DACH tab; kept the earlier tab\'s values');
          return;
        }

        if (rowByKey.hasOwnProperty(key)) {
          var res = mergeRow_(target, targetHeaders, td, rowByKey[key], incoming, prev, tz);
          stats.cellsWritten += res.written;
          stats.preserved += res.preserved;
          if (res.written) stats.rowsTouched++;
        } else {
          appends.push(buildNewRow_(targetHeaders, incoming, tz));
          rowByKey[key] = PENDING_APPEND;
          stats.newRows++;
        }

        state[key] = { values: canonMap_(incoming), tab: tabName, seen: now.toISOString() };
      });
    });

    if (appends.length) {
      target.getRange(target.getLastRow() + 1, 1, appends.length, targetHeaders.length).setValues(appends);
    }

    writeState_(ss, state);

    var summary = 'new rows: ' + stats.newRows +
      ', cells updated: ' + stats.cellsWritten + ' across ' + stats.rowsTouched + ' rows' +
      ', lane-manager edits preserved: ' + stats.preserved +
      (stats.skippedTabs.length ? ', SKIPPED: ' + stats.skippedTabs.join(' | ') : '');
    log_(summary);
    return summary;
  } catch (err) {
    log_('ERROR: ' + (err && err.stack ? err.stack : err));
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/**
 * The three-way merge, per cell.
 *
 *   incoming — what DACH says now
 *   prev     — what DACH said at the last sync (undefined = never synced)
 *   current  — what is in Sheet1 right now (possibly a lane-manager edit)
 *
 * Rules, in order:
 *   1. Blank incoming            → never written (explicit requirement).
 *   2. incoming == current       → nothing to do.
 *   3. prev unknown              → fill only if Sheet1 is blank. On a first
 *                                  run we cannot know whether a populated
 *                                  cell is an operator edit, so we assume it
 *                                  is and keep it.
 *   4. incoming != prev          → DACH has newer information → write.
 *   5. incoming == prev          → DACH unchanged but Sheet1 differs, so the
 *                                  difference came from the lane-manager →
 *                                  keep the lane-manager value.
 */
function mergeRow_(target, targetHeaders, td, rowNumber, incoming, prev, tz) {
  var changes = [];
  var preserved = 0;
  var arrIdx = rowNumber - (TARGET_HEADER_ROW + 1);

  Object.keys(incoming).forEach(function (header) {
    var raw = incoming[header];
    if (raw.canon === '') return;                                  // rule 1

    var colIdx = targetHeaders.indexOf(header);
    if (colIdx === -1) return;

    var current = canon_(td.display[arrIdx][colIdx], raw.type, tz);
    if (current === raw.canon) return;                             // rule 2

    var before = prev ? prev[header] : undefined;

    if (before === undefined || before === null) {                  // rule 3
      if (current !== '') { preserved++; return; }
    } else if (before === raw.canon) {                              // rule 5
      preserved++;
      return;
    }
                                                                    // rule 4
    changes.push({ col: colIdx + 1, value: raw.write });
    td.display[arrIdx][colIdx] = raw.display;                       // keep our copy honest
  });

  if (!changes.length) return { written: 0, preserved: preserved };

  if (STAMP_UPDATED_AT) {
    var uCol = targetHeaders.indexOf(UPDATED_AT_HEADER);
    if (uCol !== -1) changes.push({ col: uCol + 1, value: new Date().toISOString() });
  }

  writeCells_(target, rowNumber, changes);
  return { written: changes.length, preserved: preserved };
}

/** Writes only the changed cells, grouping adjacent columns into one call so
 *  we neither clobber untouched cells nor make one API call per cell. */
function writeCells_(sheet, rowNumber, changes) {
  changes.sort(function (a, b) { return a.col - b.col; });
  var i = 0;
  while (i < changes.length) {
    var j = i;
    while (j + 1 < changes.length && changes[j + 1].col === changes[j].col + 1) j++;
    var vals = [];
    for (var k = i; k <= j; k++) vals.push(changes[k].value);
    sheet.getRange(rowNumber, changes[i].col, 1, vals.length).setValues([vals]);
    i = j + 1;
  }
}

function buildNewRow_(targetHeaders, incoming, tz) {
  var row = [];
  for (var i = 0; i < targetHeaders.length; i++) row.push('');

  Object.keys(incoming).forEach(function (header) {
    var raw = incoming[header];
    if (raw.canon === '') return;
    var idx = targetHeaders.indexOf(header);
    if (idx !== -1) row[idx] = raw.write;
  });

  var sIdx = targetHeaders.indexOf(SOURCE_COLUMN_HEADER);
  if (sIdx !== -1) row[sIdx] = SOURCE_VALUE;

  if (STAMP_UPDATED_AT) {
    var uIdx = targetHeaders.indexOf(UPDATED_AT_HEADER);
    if (uIdx !== -1) row[uIdx] = new Date().toISOString();
  }
  return row;
}

/**
 * Turns one DACH row into { Sheet1 header: {canon, write, display, type} }.
 * `canon` is the comparison form, `write` is what goes into the cell.
 */
function buildIncoming_(srcRow, tz) {
  var out = {};
  var dateParts = null; // parsed once, shared by the Week / Collection Day derivations

  FIELD_MAP.forEach(function (f) {
    var rawVal = '';
    if (f.from) {
      rawVal = srcRow[colIdx_(f.from)];
    } else if (f.fromAny) {
      for (var i = 0; i < f.fromAny.length; i++) {
        var v = String(srcRow[colIdx_(f.fromAny[i])] || '').trim();
        if (v) { rawVal = v; break; }
      }
    }

    if (f.derive) return; // handled after the Date field is known

    if (f.type === 'weekdayFromDate') {
      var p = parseDate_(rawVal, tz);
      out[f.to] = cell_(p ? weekdayName_(p) : '', 'text', tz);
      return;
    }

    out[f.to] = cell_(rawVal, f.type, tz);
  });

  // Derived fields. The DACH tabs carry no week number, so Week comes from the
  // planned-arrival date using the HelloFresh DE calendar: a week runs
  // Thursday → Wednesday, so the week number is the ISO week of (date + 4
  // days). Verified against Sheet1: 15.08.2026 → 34, 20–22.08.2026 → 35.
  var dateField = firstMapEntry_('Date');
  if (dateField) dateParts = parseDate_(srcRow[colIdx_(dateField.from)], tz);

  FIELD_MAP.forEach(function (f) {
    if (!f.derive) return;
    if (f.derive === 'week') {
      out[f.to] = cell_(dateParts ? String(hfWeek_(dateParts)) : '', 'number', tz);
    } else if (f.derive === 'weekday') {
      out[f.to] = cell_(dateParts ? weekdayName_(dateParts) : '', 'text', tz);
    }
  });

  return out;
}

/** The snapshot only ever needs the comparison form, so we store just that —
 *  it keeps the state JSON small and free of serialised Date objects. */
function canonMap_(incoming) {
  var out = {};
  Object.keys(incoming).forEach(function (h) { out[h] = incoming[h].canon; });
  return out;
}

function firstMapEntry_(targetHeader) {
  for (var i = 0; i < FIELD_MAP.length; i++) {
    if (FIELD_MAP[i].to === targetHeader && FIELD_MAP[i].from) return FIELD_MAP[i];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Value handling
// ---------------------------------------------------------------------------

/**
 * Builds the {canon, write, display, type} bundle for one value.
 *
 * Dates are written as real Date objects so Sheets stores a date value and
 * renders it in whatever format the Sheet1 column already uses, rather than
 * a locale-dependent string. Times are written as "HH:mm" strings, which
 * setValues() coerces to a real time value the same way typing would.
 */
function cell_(rawVal, type, tz) {
  var s = (rawVal === null || rawVal === undefined) ? '' : String(rawVal).trim();
  if (rawVal instanceof Date) s = Utilities.formatDate(rawVal, tz, 'dd.MM.yyyy HH:mm:ss');

  if (s === '') return { canon: '', write: '', display: '', type: type };

  if (type === 'date') {
    var p = parseDate_(rawVal, tz);
    if (!p) return { canon: '', write: '', display: '', type: type };
    var d = new Date(p.y, p.m - 1, p.d);
    return { canon: pad_(p.y, 4) + '-' + pad_(p.m, 2) + '-' + pad_(p.d, 2), write: d, display: d, type: type };
  }

  if (type === 'time') {
    var t = parseTime_(rawVal, tz);
    if (!t) return { canon: '', write: '', display: '', type: type };
    return { canon: t, write: t, display: t, type: type };
  }

  if (type === 'number') {
    var n = toNumber_(s);
    if (n === null) return { canon: s, write: s, display: s, type: 'text' };
    return { canon: String(n), write: n, display: String(n), type: type };
  }

  return { canon: s, write: s, display: s, type: 'text' };
}

/** Canonical form of a value already sitting in Sheet1 (read as a display string). */
function canon_(displayVal, type, tz) {
  return cell_(displayVal, type, tz).canon;
}

/**
 * Accepts the formats seen in practice: Date objects, "07.08.2026" (DACH,
 * day-first), "8/15/2026" (Sheet1 display, month-first), "2026-08-07", and
 * any of those with a trailing time.
 */
function parseDate_(val, tz) {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return { y: val.getFullYear(), m: val.getMonth() + 1, d: val.getDate() };
  }
  var s = String(val === null || val === undefined ? '' : val).trim();
  if (!s) return null;
  s = s.split(/[ T]/)[0];

  var m;
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)))  return norm_(+m[3], +m[2], +m[1]); // d.m.y
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)))    return norm_(+m[1], +m[2], +m[3]); // y-m-d
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)))  return norm_(+m[3], +m[1], +m[2]); // m/d/y
  return null;

  function norm_(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y: y, m: mo, d: d };
  }
}

/** Returns "HH:mm", or null. Handles Date objects (including Sheets'
 *  1899-12-30 time-only values) and "HH:mm[:ss]" with or without a date. */
function parseTime_(val, tz) {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, tz, 'HH:mm');
  }
  var s = String(val === null || val === undefined ? '' : val).trim();
  if (!s) return null;
  var m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  var h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return pad_(h, 2) + ':' + pad_(mi, 2);
}

function toNumber_(s) {
  var cleaned = String(s).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  var n = Number(cleaned);
  return isFinite(n) ? n : null;
}

var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayName_(p) {
  return WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}

/**
 * HelloFresh DE week number: weeks start on the Thursday before the Sunday a
 * week usually starts, so HF week N is simply ISO week N shifted four days
 * earlier (Thursday → Wednesday). Hence: ISO week of (date + 4 days).
 *
 * Checked against Sheet1: 13–19.08.2026 → 34, 20–26.08.2026 → 35.
 *
 * Consequence at the year boundary — HF wk 1 of 2026 is Thu 25 → Wed 31 Dec
 * 2025, and Thu 01 Jan 2026 already belongs to HF wk 2. That follows from the
 * rule but is not confirmed against real data; worth a spot-check in December.
 */
function hfWeek_(p) {
  return isoWeek_(p.y, p.m - 1, p.d + 4);
}

/** All-UTC so DST transitions cannot shift the day count. */
function isoWeek_(y, monthIdx, day) {
  var t = new Date(Date.UTC(y, monthIdx, day));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); // Thursday of that ISO week
  var yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
}

function pad_(n, len) {
  var s = String(n);
  while (s.length < len) s = '0' + s;
  return s;
}

/** 'A' → 0, 'BK' → 62. */
function colIdx_(letters) {
  var n = 0;
  var up = String(letters).toUpperCase();
  for (var i = 0; i < up.length; i++) n = n * 26 + (up.charCodeAt(i) - 64);
  return n - 1;
}

// ---------------------------------------------------------------------------
// Sheet I/O
// ---------------------------------------------------------------------------

function readTargetHeaders_(target) {
  return target.getRange(TARGET_HEADER_ROW, 1, 1, target.getLastColumn())
    .getDisplayValues()[0]
    .map(function (h) { return String(h == null ? '' : h); });
}

/**
 * Display values, not raw values: they are exactly what the operator sees,
 * so comparisons stay stable regardless of whether a cell holds text, a date
 * value or a time value.
 */
function readTargetData_(target, width) {
  var lastRow = target.getLastRow();
  var first = TARGET_HEADER_ROW + 1;
  if (lastRow < first) return { display: [], firstRow: first };
  return {
    display: target.getRange(first, 1, lastRow - first + 1, width).getDisplayValues(),
    firstRow: first,
  };
}

function indexTargetRows_(display, keyCol) {
  var map = {};
  for (var i = 0; i < display.length; i++) {
    var key = String(display[i][keyCol] || '').trim();
    if (!key) continue;
    if (map.hasOwnProperty(key)) {
      log_('WARN duplicate Load Reference "' + key + '" in ' + TARGET_TAB +
           ' (using row ' + map[key] + ', ignoring row ' + (i + TARGET_HEADER_ROW + 1) + ')');
      continue;
    }
    map[key] = i + TARGET_HEADER_ROW + 1;
  }
  return map;
}

function readSourceRows_(sh) {
  var lastRow = sh.getLastRow();
  var first = SOURCE_HEADER_ROW + 1;
  if (lastRow < first) return [];
  return sh.getRange(first, 1, lastRow - first + 1, sourceWidth_(sh)).getDisplayValues();
}

/** Wide enough to reach SOURCE_LAST_COL, but never past the sheet's real grid
 *  (getRange throws if you ask for columns that do not exist). */
function sourceWidth_(sh) {
  return Math.min(Math.max(sh.getLastColumn(), colIdx_(SOURCE_LAST_COL) + 1), sh.getMaxColumns());
}

/**
 * Returns null when the layout is as expected, otherwise a short reason.
 * Column letters are only trustworthy while the DE tooling keeps its column
 * order, so a mismatch skips the tab rather than writing data into the wrong
 * Sheet1 columns.
 */
function verifyLayout_(sh, tabName) {
  var maxRow = Math.max.apply(null, Object.keys(LAYOUT_SIGNATURE).map(Number));
  if (sh.getLastRow() < maxRow) return 'fewer than ' + maxRow + ' rows';

  var width = sourceWidth_(sh);
  var band = sh.getRange(1, 1, maxRow, width).getDisplayValues();
  var bad = [];

  Object.keys(LAYOUT_SIGNATURE).forEach(function (rowStr) {
    var row = band[Number(rowStr) - 1];
    var expect = LAYOUT_SIGNATURE[rowStr];
    Object.keys(expect).forEach(function (letter) {
      var actual = String(row[colIdx_(letter)] || '').trim();
      if (actual.toLowerCase() !== expect[letter].toLowerCase()) {
        bad.push(letter + rowStr + '="' + actual + '" expected "' + expect[letter] + '"');
      }
    });
  });

  if (bad.length) {
    log_('LAYOUT MISMATCH in "' + tabName + '": ' + bad.join('; '));
    return 'layout mismatch on ' + bad.length + ' column(s) — see ' + LOG_TAB;
  }
  return null;
}

/** Warns once per run about map targets that do not exist in Sheet1, so a
 *  renamed header shows up in the log instead of silently doing nothing. */
function warnUnknownTargets_(targetHeaders) {
  var missing = [];
  FIELD_MAP.forEach(function (f) {
    if (targetHeaders.indexOf(f.to) === -1) missing.push(f.to);
  });
  if (missing.length) log_('WARN mapped columns not found in ' + TARGET_TAB + ': ' + missing.join(' | '));
}

// ---------------------------------------------------------------------------
// Snapshot state
// ---------------------------------------------------------------------------

function stateSheet_(ss) {
  var sh = ss.getSheetByName(STATE_TAB);
  if (!sh) {
    sh = ss.insertSheet(STATE_TAB);
    sh.getRange(1, 1, 1, 4).setValues([['Load Reference', 'Last synced DACH values (JSON)', 'Source tab', 'Last seen']]);
    sh.setFrozenRows(1);
    sh.hideSheet();
  }
  return sh;
}

function readState_(ss) {
  var sh = stateSheet_(ss);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return {};
  var vals = sh.getRange(2, 1, lastRow - 1, 4).getValues();
  var state = {};
  vals.forEach(function (r) {
    var key = String(r[0] || '').trim();
    if (!key) return;
    try {
      state[key] = { values: JSON.parse(r[1] || '{}'), tab: r[2], seen: r[3] };
    } catch (e) {
      log_('WARN unreadable snapshot for "' + key + '" — treating as never synced');
    }
  });
  return state;
}

function writeState_(ss, state) {
  var sh = stateSheet_(ss);
  var keys = Object.keys(state).sort();
  var rows = keys.map(function (k) {
    return [k, JSON.stringify(state[k].values), state[k].tab || '', state[k].seen || ''];
  });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log_(message) {
  Logger.log(message);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(LOG_TAB);
    if (!sh) {
      sh = ss.insertSheet(LOG_TAB);
      sh.getRange(1, 1, 1, 2).setValues([['Timestamp', 'Message']]);
      sh.setFrozenRows(1);
      sh.hideSheet();
    }
    sh.appendRow([new Date().toISOString(), String(message)]);
    var extra = sh.getLastRow() - 1 - LOG_MAX_ROWS;
    if (extra > 0) sh.deleteRows(2, extra);
  } catch (e) { /* never let logging break a sync */ }
}
