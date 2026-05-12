import { isWeekend as dfIsWeekend, addDays } from 'date-fns';

/**
 * Compute Easter Sunday date for a given year (Meeus/Jones/Butcher algorithm).
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Move a date forward to the next Monday (inclusive if already Monday). */
function nextMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  const offset = dow === 1 ? 0 : (8 - dow) % 7;
  return addDays(d, offset);
}

const cache: Record<number, Set<string>> = {};

function key(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Returns set of date keys that are Colombian public holidays for given year. */
function colombianHolidays(year: number): Set<string> {
  if (cache[year]) return cache[year];
  const set = new Set<string>();
  const add = (d: Date) => set.add(key(d));

  // Fixed-date holidays
  add(new Date(year, 0, 1));   // Año Nuevo
  add(new Date(year, 4, 1));   // Día del Trabajo
  add(new Date(year, 6, 20));  // Independencia
  add(new Date(year, 7, 7));   // Batalla de Boyacá
  add(new Date(year, 11, 8));  // Inmaculada Concepción
  add(new Date(year, 11, 25)); // Navidad

  // Emiliani (next Monday)
  add(nextMonday(new Date(year, 0, 6)));   // Reyes Magos
  add(nextMonday(new Date(year, 2, 19)));  // San José
  add(nextMonday(new Date(year, 5, 29)));  // San Pedro y San Pablo
  add(nextMonday(new Date(year, 7, 15)));  // Asunción
  add(nextMonday(new Date(year, 9, 12)));  // Día de la Raza
  add(nextMonday(new Date(year, 10, 1)));  // Todos los Santos
  add(nextMonday(new Date(year, 10, 11))); // Independencia de Cartagena

  // Easter-based
  const easter = easterSunday(year);
  add(addDays(easter, -3)); // Jueves Santo
  add(addDays(easter, -2)); // Viernes Santo
  add(nextMonday(addDays(easter, 39))); // Ascensión del Señor
  add(nextMonday(addDays(easter, 60))); // Corpus Christi
  add(nextMonday(addDays(easter, 68))); // Sagrado Corazón

  cache[year] = set;
  return set;
}

/** True if date falls in the Dec 24 – Jan 5 holiday recess (inclusive). */
function isYearEndRecess(date: Date): boolean {
  const m = date.getMonth();
  const d = date.getDate();
  if (m === 11 && d >= 24) return true; // Dec 24-31
  if (m === 0 && d <= 5) return true;   // Jan 1-5
  return false;
}

/** True if date is a Colombian public holiday. */
export function isColombianHoliday(date: Date): boolean {
  return colombianHolidays(date.getFullYear()).has(key(date));
}

/**
 * True if date is a non-working day: weekend, Colombian holiday,
 * or year-end recess (Dec 24 – Jan 5).
 */
export function isNonWorkday(date: Date): boolean {
  return dfIsWeekend(date) || isYearEndRecess(date) || isColombianHoliday(date);
}
