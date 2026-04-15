import { addDays, isWeekend, parseISO } from 'date-fns';
import { Activity } from '@/types/project';

/**
 * Rounds a floating-point number to the nearest integer if it's
 * extremely close (within 1e-9), preventing Math.ceil errors
 * like ceil(1.001) = 2 when the true value should be 1.
 */
export function smartCeil(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-4) return rounded;
  return Math.ceil(value);
}

/** Parse a YYYY-MM-DD string safely into a Date */
export function safeParse(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  const parsed = parseISO(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date();
}

/** Advance by N workdays from a start date */
export function advanceWorkdays(start: Date, workdays: number): Date {
  let current = new Date(start);
  let count = 0;
  while (count < workdays) {
    current = addDays(current, 1);
    if (!isWeekend(current)) count++;
  }
  return current;
}

/** Skip to next workday if current date is a weekend */
export function ensureWorkday(date: Date): Date {
  let d = new Date(date);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** Count workday index from projectStart to target (exclusive of target) */
export function workdayIndexBetween(projectStart: Date, target: Date): number {
  let count = 0;
  let current = new Date(projectStart);
  while (current < target) {
    if (!isWeekend(current)) count++;
    current = addDays(current, 1);
  }
  return count;
}

/**
 * Calculate the effective start date for an activity, considering
 * predecessor constraints, buffer days, and LOB balancing.
 */
export function getEffectiveStartDate(
  activity: Activity,
  activities: Activity[],
  visited: Set<string> = new Set()
): Date {
  const baseStart = safeParse(activity.startDate);
  if (!activity.predecessorId) return baseStart;
  if (visited.has(activity.id)) return baseStart;
  visited.add(activity.id);

  const pred = activities.find(a => a.id === activity.predecessorId);
  if (!pred) return baseStart;

  const predStart = getEffectiveStartDate(pred, activities, visited);
  const effectivePredRate = pred.rate * (pred.crews || 1);
  const effectiveSuccRate = activity.rate * (activity.crews || 1);
  const bufferDays = activity.bufferDays || 0;

  // Find overlapping unit range
  const predMin = Math.min(pred.unitStart, pred.unitEnd);
  const predMax = Math.max(pred.unitStart, pred.unitEnd);
  const succBufUnits = activity.bufferUnits || 0;
  const succActualStart = activity.unitStart + succBufUnits;
  const succMin = Math.min(succActualStart, activity.unitEnd);
  const succMax = Math.max(succActualStart, activity.unitEnd);
  const overlapMin = Math.max(predMin, succMin);
  const overlapMax = Math.min(predMax, succMax);

  // Check first unit constraint (using smartCeil to avoid float issues)
  const firstUnitWorkdays = smartCeil(1 / effectivePredRate);
  let maxDelay = firstUnitWorkdays;

  // Check last overlapping unit — critical when successor is faster
  if (overlapMin <= overlapMax && effectiveSuccRate > effectivePredRate) {
    const lastUnit = overlapMax;
    const predWorkdaysToFinishUnit = smartCeil((lastUnit - predMin + 1) / effectivePredRate);
    const succWorkdaysToReachUnit = Math.floor((lastUnit - succMin) / effectiveSuccRate);
    const delayNeeded = predWorkdaysToFinishUnit - succWorkdaysToReachUnit;
    if (delayNeeded > maxDelay) maxDelay = delayNeeded;
  }

  const successorStart = ensureWorkday(advanceWorkdays(predStart, maxDelay + bufferDays));
  return successorStart > baseStart ? successorStart : baseStart;
}

/**
 * Simplified version of getEffectiveStartDate for components that don't
 * need the full LOB balancing (LookaheadTable, ProductionControl, GanttChart).
 * Uses smartCeil to prevent float rounding bugs.
 */
export function getEffectiveStartDateSimple(
  activity: Activity,
  activities: Activity[],
  visited: Set<string> = new Set()
): Date {
  const baseStart = safeParse(activity.startDate);
  if (!activity.predecessorId) return baseStart;
  if (visited.has(activity.id)) return baseStart;
  visited.add(activity.id);

  const pred = activities.find(a => a.id === activity.predecessorId);
  if (!pred) return baseStart;

  const predStart = getEffectiveStartDateSimple(pred, activities, visited);
  const effectivePredRate = pred.rate * (pred.crews || 1);
  const firstUnitWorkdays = smartCeil(1 / effectivePredRate);
  const bufferDays = activity.bufferDays || 0;

  const successorStart = ensureWorkday(advanceWorkdays(predStart, firstUnitWorkdays + bufferDays));
  return successorStart > baseStart ? successorStart : baseStart;
}

/** Calculate total workdays for an activity */
export function calcActivityWorkdays(activity: Activity): number {
  const totalUnits = Math.abs(activity.unitEnd - activity.unitStart) + 1;
  const effectiveRate = activity.rate * (activity.crews || 1);
  return smartCeil(totalUnits / effectiveRate);
}
