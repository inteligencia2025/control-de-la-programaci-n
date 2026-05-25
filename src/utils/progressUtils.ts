import { Activity, BuildingConfig, ProjectType, ProgressCell, ProgressStatus, getCubiertaUnits, getUnitLabel } from '@/types/project';
import { getEffectiveStartDateSimple, getEffectiveRate, workdayIndexBetween, safeParse } from '@/utils/schedulingUtils';

/** Total number of units in a project (houses count or floors*unitsPerFloor [+3 if cubierta]) */
export function getProjectTotalUnits(projectType: ProjectType, buildingConfig: BuildingConfig, defaultUnits?: number): number {
  if (projectType === 'casas') return Math.max(1, defaultUnits || 10);
  const base = buildingConfig.floors * buildingConfig.unitsPerFloor;
  const cu = getCubiertaUnits(buildingConfig);
  return cu ? base + 3 : base;
}

/** Returns array of unit numbers 1..N for the project */
export function listProjectUnits(projectType: ProjectType, buildingConfig: BuildingConfig, defaultUnits?: number): number[] {
  const total = getProjectTotalUnits(projectType, buildingConfig, defaultUnits);
  return Array.from({ length: total }, (_, i) => i + 1);
}

export function unitLabel(unit: number, projectType: ProjectType, buildingConfig: BuildingConfig, unitLabels?: Record<string, string>): string {
  const custom = unitLabels?.[String(unit)];
  if (custom) return custom;
  return getUnitLabel(unit, projectType, buildingConfig);
}

/** Map status → tailwind classes (background + text) */
export function statusClasses(status: ProgressStatus | null): string {
  switch (status) {
    case 'E': return 'bg-success text-success-foreground';
    case 'P': return 'bg-primary text-primary-foreground';
    case 'R': return 'bg-destructive text-destructive-foreground';
    case 'NA': return 'bg-muted text-muted-foreground';
    default: return 'bg-background hover:bg-secondary';
  }
}

/** Cycle: null → E → P → R → NA → null */
export function nextStatus(s: ProgressStatus | null): ProgressStatus | null {
  if (s === null) return 'E';
  if (s === 'E') return 'P';
  if (s === 'P') return 'R';
  if (s === 'R') return 'NA';
  return null;
}

export interface ActivityProgressStats {
  total: number;       // applicable units (excludes NA)
  executed: number;    // E count
  programmed: number;  // P count
  restricted: number;  // R count
  realPct: number;     // executed / total
}

export function computeActivityStats(cells: ProgressCell[], activityKey: string, totalUnits: number): ActivityProgressStats {
  const own = cells.filter(c => c.activityKey === activityKey);
  const naCount = own.filter(c => c.status === 'NA').length;
  const executed = own.filter(c => c.status === 'E').length;
  const programmed = own.filter(c => c.status === 'P').length;
  const restricted = own.filter(c => c.status === 'R').length;
  const total = Math.max(0, totalUnits - naCount);
  const realPct = total > 0 ? Math.round((executed / total) * 100) : 0;
  return { total, executed, programmed, restricted, realPct };
}

/** Scheduled % per LOB activity at today's date: units that should be done now / total units of that activity */
export function computeScheduledPct(activity: Activity, allActivities: Activity[], at: Date = new Date()): number {
  const start = getEffectiveStartDateSimple(activity, allActivities);
  if (at < start) return 0;
  const totalUnits = Math.max(1, activity.unitEnd - activity.unitStart + 1);
  const wd = workdayIndexBetween(start, at);
  const rate = getEffectiveRate(activity);
  const unitsDone = Math.min(totalUnits, Math.max(0, wd * rate));
  return Math.round((unitsDone / totalUnits) * 100);
}
