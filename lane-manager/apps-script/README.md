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

## "I ran it and nothing happened"

Run **DACH sync → Diagnose** (or the `diagnose` function). It is read-only and
reports, in a modal: the script timezone and whether today is a run day, how
many triggers are installed, every tab name in the spreadsheet, whether
`Sheet1` has the expected headers, and per DACH tab — row count, whether the
layout guard passes, how many rows carry a Load Reference, and how many of
those are **not yet in Sheet1**.

The usual causes, in order:

1. **The wrong function was run.** The Apps Script editor's dropdown defaults to
   the *first* function in the file, `onOpen`, which only builds the menu. Pick
   `syncNow` explicitly, or reload the spreadsheet and use the menu.
2. **`scheduledSync` was run on a Wednesday** — that's the one excluded day, so
   it returns immediately. `syncNow` ignores the day gate.
3. **A tab name doesn't match `SOURCE_TABS`** exactly (trailing space, different
   spelling). `diagnose` lists the real names.
4. **The layout guard skipped a tab** — see `_dach_sync_log` for which columns
   disagreed.
5. **Nothing to do.** If every Load Reference is already in `Sheet1` and no DACH
   value has changed, zero writes is the correct outcome.

## Recovering from the keyless-append bug

An early version of `FIELD_MAP` had no entry for `Load Reference`, so appended
rows got every mapped value *except* the one that identifies them. Those rows
are invisible to the lane-manager (it filters on a non-empty `Load Reference`)
but they sit in `Sheet1` and, because the next run can't find them by key, it
would append duplicates rather than update them.

To recover, after pasting the current script:

1. **DACH sync → Delete orphan rows.** Finds rows with a blank `Load Reference`
   but a populated `Updated at` — the exact signature of that bug — then lists
   them and asks before deleting anything.
2. **DACH sync → Sync now.** The rows get appended again, this time with the key.

Resetting the sync state is *not* required here: appends don't consult the
snapshot at all, and any row that was merged rather than appended went through
rule 3, which only fills blanks.

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
date.

**The span is settled.** An HF week runs Thursday → Wednesday, starting on the
Thursday *before* the Sunday the week would usually start on — so that Sunday
is day 4 of the HF week. Verified against `Sheet1` (13–19.08.2026 → 34,
20–26.08.2026 → 35) and the archive tab (04–10.06.2026 → 24).

**The numbering base is not.** `WEEK_NUMBERING` picks it:

| | rule | week of Thu 31.12.2026 |
|---|---|---|
| `'iso'` *(default)* | HF week N = ISO week N shifted 4 days earlier, i.e. `ISO week of (date + 4 days)` | **1** |
| `'weeknum'` | Sunday-start `WEEKNUM(date, 1)` of the Sunday inside the HF week — week 1 is the week containing 1 January | **2** |

The two agree on **every dated row currently in the spreadsheet**, so the data
cannot pick between them — but they differ by one for the *whole* of 2027 and
2028, and `'weeknum'` reaches week 54 in 2029. `'iso'` is the default because
HelloFresh DE is a German operation and KW numbering is ISO there. If the DE
team's tooling calls the week of Thu 31.12.2026 "week 2", flip the constant.

The test suite passes under either setting; year-boundary assertions are
scheme-aware.

## Tests

```bash
node apps-script/dach-sync.test.js
```

Stubs the handful of Apps Script globals the file touches and exercises the
week derivation, the date/time/number parsing, `buildIncoming_` against a real
`DACH Freitag` row, and all five merge rules above.
