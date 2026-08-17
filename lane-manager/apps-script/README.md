# DACH → Sheet1 sync (Apps Script)

`dach-sync.gs` lives in the container-bound Apps Script project of the **Factor
Extra Source** spreadsheet (`1z3DWJRYIMTubEsa0hBtNt4djSO04mX2iDRfmAsO58h0`).
It merges the DE team's per-day output tabs into `Sheet1`, which is what the
lane-manager reads and writes.

## Install

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Paste the contents of `dach-sync.gs` into a file and save.
3. **Project Settings → Time zone → `(GMT+01:00) Berlin`.** The script's clock
   drives the run-day gate and the derived weekday; a wrong timezone puts both
   a day out around midnight.
4. Run `setupTriggers()` once and accept the authorisation prompt.
5. Reload the spreadsheet — a **DACH sync** menu appears. Use *Sync now* for a
   first manual run, then check the hidden `_dach_sync_log` tab.

## Schedule

Four daily triggers (09:00, 12:00, 15:00, 17:00 Berlin), with Wednesday
filtered out inside `scheduledSync()` via `RUN_DAYS` — so it runs Thu, Fri,
Sat, Sun, Mon, Tue. One trigger per day-and-hour combination would need 24
triggers and Apps Script caps a project at 20. `atHour()` has a ~15 minute
firing window, so a 09:00 slot may actually run at 09:12; only the calendar
day matters here.

## How lane-manager edits are protected

DACH gives us no per-cell timestamp, so "DACH has newer information" is
defined as **the DACH value changed since the last time we synced it**. The
hidden `_dach_sync_state` tab holds a snapshot of the last-synced DACH value
per (Load Reference, column). Per cell, in order:

| # | Situation | Action |
|---|---|---|
| 1 | Incoming DACH value is blank | never written |
| 2 | Incoming equals what's in Sheet1 | no-op (no needless rewrite) |
| 3 | No snapshot yet (first sync for that cell) | fill only if Sheet1 is blank |
| 4 | Incoming ≠ snapshot | DACH is newer → **write**, overwriting an edit |
| 5 | Incoming = snapshot but Sheet1 differs | the difference is a lane-manager edit → **keep it** |

Rule 3 is why the first run is safe on the DE rows already sitting in `Sheet1`:
a populated cell is assumed to be an operator edit and is left alone.

`resetSyncState()` (menu: *Reset sync state*) wipes the snapshot, putting every
cell back into rule 3 — use it if the snapshot ever gets out of step.

Columns absent from `FIELD_MAP` are never touched at all: `Haulier`,
`Notes, Issues Detected:`, `Email Sent`, `Driver Name`, `Trailer Utilization`,
`Slack Thread Channel`, `Slack Thread TS`.

## Layout guard

Row 3 of the DACH tabs repeats "Date", "Time" and "Check" a dozen times each,
so header text alone cannot identify a column — the map addresses columns by
**letter**. `LAYOUT_SIGNATURE` therefore pins a set of uniquely-named row-3
labels plus the row-2 KPI group bands. If the DE tooling reorders columns, the
affected tab is **skipped** and the mismatch logged, rather than data landing
in the wrong Sheet1 columns.

## Week number

The DACH tabs carry no week number, so it's derived from the planned-arrival
date. HelloFresh DE weeks start on the Thursday before the Sunday a week
usually starts, i.e. HF week N is ISO week N shifted four days earlier — so
`week = ISO week of (date + 4 days)`. Verified against Sheet1
(13–19.08.2026 → 34, 20–26.08.2026 → 35).

## Tests

```bash
node apps-script/dach-sync.test.js
```

Stubs the handful of Apps Script globals the file touches and exercises the
week derivation, the date/time/number parsing, `buildIncoming_` against a real
`DACH Freitag` row, and all five merge rules above.
