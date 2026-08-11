// Sheets REST API returns cell values as their *displayed* strings by
// default (unlike Apps Script, which hands back real Date objects) — so
// everything here works off strings.

/** Parses a variety of date string formats into a Date, or null. */
export function parseFlexibleDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/^[A-Za-z]{2,3}\s+/, ''); // strip leading weekday like "Mo "

  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2]);

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/** Formats a Date as YYYY-MM-DD for an <input type="date">. */
export function toDateInputValue(value) {
  const d = parseFlexibleDate(value);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Normalizes a time-ish string to HH:MM for an <input type="time">. */
export function toTimeInputValue(value) {
  if (!value) return '';
  const s = String(value).trim();

  // AM/PM first: a 12-hour string like "4:23:00 PM" also matches the plain
  // HH:MM pattern below, and would silently come back as 04:23.
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP])\.?M\.?$/i);
  if (ampm) {
    let h = +ampm[1];
    const isPM = /^p$/i.test(ampm[3]);
    if (isPM && h < 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${ampm[2]}`;
  }

  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`;

  return '';
}

/** ISO-8601 week number for a given date. */
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Week dropdown options: last 2 weeks, current week, next 3 weeks.
 * Values are plain week numbers (e.g. 31) — adjust `format` if your sheet
 * stores weeks differently (e.g. "W31" or "2026-W31").
 */
export function generateWeekOptions(today = new Date()) {
  const options = [];
  for (let offset = -2; offset <= 3; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() + offset * 7);
    const week = getISOWeek(d);
    options.push({ value: String(week), label: String(week) });
  }
  return options;
}

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** True if the lane's Date field falls on today's calendar date. */
export function isToday(value) {
  const d = parseFlexibleDate(value);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/**
 * True if `dateValue` is today AND `timeValue` (HH:MM-ish) falls within
 * the next `hours` hours from now. Used to flag lanes about to dispatch.
 */
export function isDispatchingSoon(dateValue, timeValue, hours = 3) {
  if (!isToday(dateValue)) return false;
  const hhmm = toTimeInputValue(timeValue);
  if (!hhmm) return false;

  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const dispatch = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  const diffMs = dispatch - now;
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= 0 && diffHours <= hours;
}

/**
 * True if a planned time has been missed: either the actual time is later
 * than planned by more than `thresholdMinutes`, or there's no actual time
 * yet and the planned time has already passed by that much.
 */
export function isOverdueOrDelayed(dateValue, plannedTimeValue, actualTimeValue, thresholdMinutes = 15) {
  const dateD = parseFlexibleDate(dateValue);
  if (!dateD) return false;
  const plannedHHMM = toTimeInputValue(plannedTimeValue);
  if (!plannedHHMM) return false;
  const [ph, pm] = plannedHHMM.split(':').map(Number);
  const planned = new Date(dateD.getFullYear(), dateD.getMonth(), dateD.getDate(), ph, pm);

  if (actualTimeValue) {
    const actualHHMM = toTimeInputValue(actualTimeValue);
    if (!actualHHMM) return false;
    const [ah, am] = actualHHMM.split(':').map(Number);
    const actual = new Date(dateD.getFullYear(), dateD.getMonth(), dateD.getDate(), ah, am);
    return (actual - planned) / 60000 > thresholdMinutes;
  }

  const now = new Date();
  return (now - planned) / 60000 > thresholdMinutes;
}

/**
 * "Delayed" badge trigger, redefined around arrival rather than dispatch:
 * fires when the lane is today, the planned arrival time has already
 * passed, and there's still no actual arrival time recorded. Doesn't fire
 * once an actual arrival is logged, however late it was.
 */
export function isArrivalDelayed(dateValue, plannedArrivalValue, actualArrivalValue) {
  if (!isToday(dateValue)) return false;
  if (String(actualArrivalValue || '').trim()) return false; // already arrived, not delayed anymore

  const hhmm = toTimeInputValue(plannedArrivalValue);
  if (!hhmm) return false;
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const planned = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  return now > planned;
}

/**
 * "Shipped" badge trigger: true whenever an actual dispatch time has been
 * recorded at all, regardless of whether it was later than planned —
 * lateness is what the (separate) delayed/arrival flag is for.
 */
export function isShipped(actualDispatchValue) {
  return Boolean(String(actualDispatchValue || '').trim());
}

/**
 * "Delayed" badge trigger: only fires on an actual discrepancy between
 * planned and actual dispatch time — not on arrival, and not just because
 * the planned time has passed with nothing recorded yet.
 */
export function isDispatchDelayed(dateValue, plannedDispatch, actualDispatch, thresholdMinutes = 15) {
  if (!actualDispatch) return false;
  return isOverdueOrDelayed(dateValue, plannedDispatch, actualDispatch, thresholdMinutes);
}

/**
 * True if dispatch is within `hours` from now (today) and a key field is
 * still blank — the "someone needs to fill this in soon" flag.
 */
export function isMissingInfoSoon(dateValue, dispatchTimeValue, fieldValue, hours = 4) {
  if (String(fieldValue || '').trim()) return false;
  return isDispatchingSoon(dateValue, dispatchTimeValue, hours);
}

/**
 * True if a Factor lane was created more than `hours` ago and still has no
 * Load Status — created, then apparently forgotten.
 */
export function isStale(createdAtValue, loadStatusValue, hours = 2) {
  if (String(loadStatusValue || '').trim()) return false;
  if (!createdAtValue) return false;
  const created = new Date(createdAtValue);
  if (isNaN(created.getTime())) return false;
  return (new Date() - created) / (1000 * 60 * 60) > hours;
}

export const CARRIER_TINT_COUNT = 6;

/** Deterministic pastel tint index (0-5) for a carrier name, so the same
 * carrier always gets the same soft row color. */
export function carrierTintIndex(carrierName) {
  const s = String(carrierName || '').trim();
  if (!s) return -1;
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % CARRIER_TINT_COUNT;
}
