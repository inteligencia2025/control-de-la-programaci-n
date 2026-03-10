import { addDays, isWeekend, format, differenceInCalendarDays, startOfWeek, parse } from 'date-fns';
import { es } from 'date-fns/locale';

export function getWorkdays(start: Date, count: number): Date[] {
  const days: Date[] = [];
  let current = new Date(start);
  while (days.length < count) {
    if (!isWeekend(current)) {
      days.push(new Date(current));
    }
    current = addDays(current, 1);
  }
  return days;
}

export function addWorkdays(start: Date, workdays: number): Date {
  let current = new Date(start);
  let added = 0;
  while (added < workdays) {
    current = addDays(current, 1);
    if (!isWeekend(current)) added++;
  }
  return current;
}

export function workdaysBetween(start: Date, end: Date): number {
  let count = 0;
  let current = new Date(start);
  while (current <= end) {
    if (!isWeekend(current)) count++;
    current = addDays(current, 1);
  }
  return count;
}

export function formatDateShort(date: Date): string {
  return format(date, 'dd MMM', { locale: es });
}

export function formatMonth(date: Date): string {
  return format(date, 'MMM yyyy', { locale: es });
}

export function getWorkdayIndex(start: Date, target: Date): number {
  let count = 0;
  let current = new Date(start);
  while (current < target) {
    if (!isWeekend(current)) count++;
    current = addDays(current, 1);
  }
  return count;
}
