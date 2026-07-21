// ---------------------------------------------------------------------------
// Business-day calendar helpers.
//
// All dates are handled as ISO "YYYY-MM-DD" strings in UTC-noon internally to
// dodge timezone/DST drift. We only ever care about calendar days, never times.
// ---------------------------------------------------------------------------

import type { ISODate } from "./types";

/** Parse "YYYY-MM-DD" to a Date anchored at UTC noon (DST-safe). */
export function parseISO(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
}

export function toISO(date: Date): ISODate {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO(): ISODate {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12)));
}

export function addDays(d: ISODate, n: number): ISODate {
  const date = parseISO(d);
  date.setUTCDate(date.getUTCDate() + n);
  return toISO(date);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(d: ISODate): number {
  return parseISO(d).getUTCDay();
}

export function isWeekend(d: ISODate): boolean {
  const w = weekday(d);
  return w === 0 || w === 6;
}

/** Next business day on or after `d`. */
export function nextBusinessDay(d: ISODate): ISODate {
  let cur = d;
  while (isWeekend(cur)) cur = addDays(cur, 1);
  return cur;
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function isWithinRange(d: ISODate, start: ISODate, end: ISODate): boolean {
  return d >= start && d <= end;
}

// --- Week-of-month convention (per spec open-question recommendation) --------
// Wk 1 = days 1-7, Wk 2 = 8-14, Wk 3 = 15-21, Wk 4 = 22-end.
export function weekOfMonth(d: ISODate): number {
  const day = parseISO(d).getUTCDate();
  return Math.min(4, Math.floor((day - 1) / 7) + 1);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthShort(d: ISODate): string {
  return MONTHS[parseISO(d).getUTCMonth()];
}

export function monthKey(d: ISODate): string {
  const date = parseISO(d);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyOf(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

/** Human deliverable label, e.g. "Wk 3 · Oct". */
export function deliverableLabel(d: ISODate): string {
  return `Wk ${weekOfMonth(d)} · ${monthShort(d)}`;
}

/** Long, exact label, e.g. "Fri, Oct 16 2026". */
export function longLabel(d: ISODate): string {
  const date = parseISO(d);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
  return `${wd}, ${monthShort(d)} ${date.getUTCDate()} ${date.getUTCFullYear()}`;
}

/** Inclusive list of month keys spanning [start, end]. */
export function monthsBetween(start: ISODate, end: ISODate): { key: string; year: number; month0: number }[] {
  const s = parseISO(start);
  const e = parseISO(end);
  const out: { key: string; year: number; month0: number }[] = [];
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  const endY = e.getUTCFullYear();
  const endM = e.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ key: monthKeyOf(y, m), year: y, month0: m });
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

export function monthLabel(year: number, month0: number): string {
  return `${MONTHS[month0]} ${year}`;
}

/**
 * Fractional horizontal position of a date within its month, in [0, 1),
 * snapped to early / mid / late thirds so the roadmap is never day-precise.
 */
export function monthSnapFraction(d: ISODate): number {
  const wk = weekOfMonth(d); // 1..4
  // early (wk1) -> 0.12, mid (wk2) -> 0.38, late (wk3) -> 0.62, end (wk4) -> 0.87
  return [0.12, 0.38, 0.62, 0.87][wk - 1];
}
