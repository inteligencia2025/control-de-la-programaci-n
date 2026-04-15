import { useMemo, useRef, useState, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { Activity, getUnitLabel } from '@/types/project';
import { addDays, isWeekend, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Camera, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { getEffectiveStartDate as getEffectiveStartDateShared, smartCeil } from '@/utils/schedulingUtils';

interface LinePoint { workdayIndex: number; unit: number; }

function getEffectiveStartDate(activity: Activity, activities: Activity[], visited: Set<string> = new Set()): Date {
  return getEffectiveStartDateShared(activity, activities, visited);
}

function getActivityLine(activity: Activity, projectStart: Date, activities: Activity[]): LinePoint[] {
  const points: LinePoint[] = [];
  let start = getEffectiveStartDate(activity, activities);
  const bufferUnits = activity.bufferUnits || 0;
  const actualUnitStart = activity.unitStart + bufferUnits;
  const totalUnits = Math.abs(activity.unitEnd - actualUnitStart) + 1;
  const effectiveRate = activity.rate * (activity.crews || 1);
  const totalWorkdays = smartCeil(totalUnits / effectiveRate);
  let startIndex = 0;
  let current = new Date(projectStart);
  while (current < start) { if (!isWeekend(current)) startIndex++; current = addDays(current, 1); }
  while (isWeekend(start)) { start = addDays(start, 1); startIndex++; }
  points.push({ workdayIndex: startIndex, unit: actualUnitStart });
  for (let i = 1; i <= totalWorkdays; i++) {
    const unit = actualUnitStart + (activity.unitEnd > actualUnitStart ? 1 : -1) * effectiveRate * i;
    const clampedUnit = activity.unitEnd > actualUnitStart ? Math.min(unit, activity.unitEnd) : Math.max(unit, activity.unitEnd);
    points.push({ workdayIndex: startIndex + i, unit: clampedUnit });
  }
  return points;
}

/** Get individual crew lines for multi-crew activities */
function getCrewLines(activity: Activity, projectStart: Date, activities: Activity[]): LinePoint[][] {
  const crews = activity.crews || 1;
  if (crews <= 1) return [];
  let start = getEffectiveStartDate(activity, activities);
  const bufferUnits = activity.bufferUnits || 0;
  const actualUnitStart = activity.unitStart + bufferUnits;
  const totalUnits = Math.abs(activity.unitEnd - actualUnitStart) + 1;
  const direction = activity.unitEnd > actualUnitStart ? 1 : -1;
  const unitsPerCrew = totalUnits / crews;

  let startIndex = 0;
  let current = new Date(projectStart);
  while (current < start) { if (!isWeekend(current)) startIndex++; current = addDays(current, 1); }
  while (isWeekend(start)) { start = addDays(start, 1); startIndex++; }

  const crewLines: LinePoint[][] = [];
  for (let c = 0; c < crews; c++) {
    const crewUnitStart = actualUnitStart + direction * Math.round(c * unitsPerCrew);
    const crewUnitEnd = actualUnitStart + direction * Math.round((c + 1) * unitsPerCrew) - direction;
    const crewUnits = Math.abs(crewUnitEnd - crewUnitStart) + 1;
    const crewWorkdays = smartCeil(crewUnits / activity.rate);
    const points: LinePoint[] = [{ workdayIndex: startIndex, unit: crewUnitStart }];
    for (let i = 1; i <= crewWorkdays; i++) {
      const unit = crewUnitStart + direction * activity.rate * i;
      const clamped = direction > 0 ? Math.min(unit, crewUnitEnd) : Math.max(unit, crewUnitEnd);
      points.push({ workdayIndex: startIndex + i, unit: clamped });
    }
    crewLines.push(points);
  }
  return crewLines;
}

function getBufferLine(activity: Activity, projectStart: Date, activities: Activity[]): LinePoint[] | null {
  if (!activity.bufferDays && !activity.bufferUnits) return null;
  const mainLine = getActivityLine(activity, projectStart, activities);
  if (mainLine.length === 0) return null;
  const lastPoint = mainLine[mainLine.length - 1];
  const bufferPoints: LinePoint[] = [{ ...lastPoint }];
  const bufferWorkdays = activity.bufferDays || 0;
  if (bufferWorkdays > 0) bufferPoints.push({ workdayIndex: lastPoint.workdayIndex + bufferWorkdays, unit: lastPoint.unit });
  return bufferPoints;
}

function findIntersections(lines: { activity: Activity; points: LinePoint[] }[]) {
  const intersections: { x: number; y: number; a1: string; a2: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const l1 = lines[i].points; const l2 = lines[j].points;
      for (let k = 0; k < l1.length - 1; k++) {
        for (let m = 0; m < l2.length - 1; m++) {
          const x1 = l1[k].workdayIndex, y1 = l1[k].unit, x2 = l1[k+1].workdayIndex, y2 = l1[k+1].unit;
          const x3 = l2[m].workdayIndex, y3 = l2[m].unit, x4 = l2[m+1].workdayIndex, y4 = l2[m+1].unit;
          const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
          if (Math.abs(denom) < 0.001) continue;
          const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;
          const u = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denom;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            intersections.push({ x: x1 + t*(x2-x1), y: y1 + t*(y2-y1), a1: lines[i].activity.name, a2: lines[j].activity.name });
          }
        }
      }
    }
  }
  return intersections;
}

export function LOBChart() {
  const { project } = useProject();
  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [clickTooltip, setClickTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; name: string } | null>(null);

  const enabledActivities = useMemo(() => project.activities.filter(a => a.enabled), [project.activities]);
  const lobActivities = useMemo(() => enabledActivities.filter(a => a.category !== 'zonas_sociales'), [enabledActivities]);
  const ganttActivities = useMemo(() => enabledActivities.filter(a => a.category === 'zonas_sociales'), [enabledActivities]);

  const chartData = useMemo(() => {
    if (enabledActivities.length === 0) return null;
    const effectiveStarts = enabledActivities.map(a => getEffectiveStartDate(a, project.activities));
    const projectStart = new Date(Math.min(...effectiveStarts.map(d => d.getTime())));
    const lines = lobActivities.map(activity => {
      const points = getActivityLine(activity, projectStart, project.activities);
      const duration = points.length > 1 ? points[points.length - 1].workdayIndex - points[0].workdayIndex : 0;
      const crewLines = getCrewLines(activity, projectStart, project.activities);
      return { activity, points, buffer: getBufferLine(activity, projectStart, project.activities), duration, crewLines };
    });
    const lobMaxWorkday = lines.length > 0 ? Math.max(...lines.flatMap(l => {
      const pts = l.points.map(p => p.workdayIndex);
      if (l.buffer) pts.push(...l.buffer.map(p => p.workdayIndex));
      return pts;
    })) : 0;
    // We'll compute gantt bars after workdays are built, but need a preliminary maxWorkday
    const prelimGanttMax = ganttActivities.reduce((max, activity) => {
      const start = getEffectiveStartDate(activity, project.activities);
      const totalUnits = Math.abs(activity.unitEnd - activity.unitStart) + 1;
      const effectiveRate = activity.rate * (activity.crews || 1);
      const durationDays = Math.ceil(totalUnits / effectiveRate);
      let startIdx = 0;
      let cur = new Date(projectStart);
      while (cur < start) { if (!isWeekend(cur)) startIdx++; cur = addDays(cur, 1); }
      return Math.max(max, startIdx + durationDays);
    }, 0);
    const maxWorkday = Math.max(lobMaxWorkday, prelimGanttMax) + 5;
    const lobUnits = lobActivities.flatMap(a => [a.unitStart, a.unitEnd]);
    const minUnit = lobUnits.length > 0 ? Math.min(...lobUnits) - 1 : 0;
    const maxUnit = lobUnits.length > 0 ? Math.max(...lobUnits) + 1 : 2;
    const workdays: { date: Date; label: string; dayName: string; month: string; monthIdx: number }[] = [];
    let current = new Date(projectStart);
    let monthCounter = 0; let lastMonth = '';
    while (workdays.length <= maxWorkday) {
      if (!isWeekend(current)) {
        const monthStr = format(current, 'MMM yy', { locale: es });
        if (monthStr !== lastMonth) { monthCounter++; lastMonth = monthStr; }
        workdays.push({ date: new Date(current), label: format(current, 'dd', { locale: es }), dayName: format(current, 'EEE', { locale: es }), month: monthStr, monthIdx: monthCounter });
      }
      current = addDays(current, 1);
    }
    const intersections = findIntersections(lines.map(l => ({ activity: l.activity, points: l.points })));
    // Compute Gantt bars for zonas_sociales
    const ganttBars = ganttActivities.map(activity => {
      const start = getEffectiveStartDate(activity, project.activities);
      const totalUnits = Math.abs(activity.unitEnd - activity.unitStart) + 1;
      const effectiveRate = activity.rate * (activity.crews || 1);
      const durationDays = Math.ceil(totalUnits / effectiveRate);
      let startIdx = 0;
      let cur = new Date(projectStart);
      while (cur < start) { if (!isWeekend(cur)) startIdx++; cur = addDays(cur, 1); }
      return { activity, startIdx, endIdx: startIdx + durationDays, duration: durationDays };
    });
    const totalDuration = maxWorkday - 5;
    return { lines, workdays, minUnit, maxUnit, maxWorkday, intersections, projectStart, totalDuration, ganttBars };
  }, [lobActivities, ganttActivities, enabledActivities, project.activities]);

  const handleExportPNG = async () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    const svgEl = svgRef.current;
    canvas.width = svgEl.width.baseVal.value * 2;
    canvas.height = svgEl.height.baseVal.value * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'lineas_balance.png';
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartData || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / zoom;
    const my = (e.clientY - rect.top) / zoom;
    const { maxWorkday, workdays, lines, minUnit, maxUnit } = chartData;
    const unitRange = maxUnit - minUnit;
    const PAD = { top: 40, right: 30, bottom: 110, left: 80 };
    const W = Math.max(900, maxWorkday * 40 + PAD.left + PAD.right);
    const plotW = W - PAD.left - PAD.right;
    const plotH = unitRange * 32;

    const wdIdx = Math.round(((mx - PAD.left) / plotW) * maxWorkday);
    if (wdIdx >= 0 && wdIdx < workdays.length) {
      setHoverDay(wdIdx);
    } else {
      setHoverDay(null);
    }

    // Find closest line segment
    let bestDist = Infinity;
    let bestName = '';
    for (const { activity, points } of lines) {
      for (let i = 0; i < points.length - 1; i++) {
        const x1 = PAD.left + (points[i].workdayIndex / maxWorkday) * plotW;
        const y1 = PAD.top + plotH - ((points[i].unit - minUnit) / unitRange) * plotH;
        const x2 = PAD.left + (points[i + 1].workdayIndex / maxWorkday) * plotW;
        const y2 = PAD.top + plotH - ((points[i + 1].unit - minUnit) / unitRange) * plotH;
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((mx - x1) * dx + (my - y1) * dy) / len2));
        const px = x1 + t * dx, py = y1 + t * dy;
        const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
        if (dist < bestDist) { bestDist = dist; bestName = activity.name; }
      }
    }

    if (bestDist < 15) {
      setHoverTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 24, name: bestName });
    } else {
      setHoverTooltip(null);
    }
  }, [chartData, zoom]);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!chartData || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / zoom;
    const my = (e.clientY - rect.top) / zoom;
    const { lines, minUnit, maxUnit, maxWorkday, workdays } = chartData;
    const UNIT_H = 32;
    const unitRange = maxUnit - minUnit;
    const PADDING = { top: 40, right: 30, bottom: 110, left: 80 };
    const WIDTH = Math.max(900, maxWorkday * 40 + PADDING.left + PADDING.right);
    const plotH = unitRange * UNIT_H;
    const plotW = WIDTH - PADDING.left - PADDING.right;

    let best: { dist: number; activity: Activity; unit: number; wdIdx: number } | null = null;
    for (const { activity, points } of lines) {
      for (const p of points) {
        const px = PADDING.left + (p.workdayIndex / maxWorkday) * plotW;
        const py = PADDING.top + plotH - ((p.unit - minUnit) / (maxUnit - minUnit)) * plotH;
        const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
        if (dist < 20 && (!best || dist < best.dist)) {
          best = { dist, activity, unit: p.unit, wdIdx: p.workdayIndex };
        }
      }
    }
    if (best && workdays[best.wdIdx]) {
      const wd = workdays[best.wdIdx];
      const activitiesOnDay = lines.filter(l => {
        const first = l.points[0]?.workdayIndex ?? 0;
        const last = l.points[l.points.length - 1]?.workdayIndex ?? 0;
        return best!.wdIdx >= first && best!.wdIdx <= last;
      }).map(l => {
        for (let i = 0; i < l.points.length - 1; i++) {
          if (best!.wdIdx >= l.points[i].workdayIndex && best!.wdIdx <= l.points[i+1].workdayIndex) {
            const t = (best!.wdIdx - l.points[i].workdayIndex) / (l.points[i+1].workdayIndex - l.points[i].workdayIndex || 1);
            const interpUnit = l.points[i].unit + t * (l.points[i+1].unit - l.points[i].unit);
            const unitNum = Math.round(interpUnit);
            const customLabel = project.unitLabels?.[String(unitNum)];
            const unitLbl = customLabel || getUnitLabel(unitNum, project.projectType, project.buildingConfig);
            return `${l.activity.name}: Unidad ${unitLbl}`;
          }
        }
        return l.activity.name;
      });
      setClickTooltip({
        x: e.clientX - rect.left + 10,
        y: e.clientY - rect.top - 10,
        content: `📅 ${format(wd.date, 'EEEE dd/MM/yyyy', { locale: es })}\n\n${activitiesOnDay.join('\n')}`,
      });
    } else {
      setClickTooltip(null);
    }
  }, [chartData, zoom, project.projectType, project.buildingConfig]);

  if (!chartData) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">Sin datos para graficar</p>
          <p className="text-sm mt-1">Agrega actividades en el panel lateral</p>
        </div>
      </div>
    );
  }

  const { lines, workdays, minUnit, maxUnit, maxWorkday, intersections, totalDuration, ganttBars } = chartData;
  const unitRange = maxUnit - minUnit;
  const UNIT_H = 32;
  const PADDING = { top: 40, right: 30, bottom: 110, left: 80 };
  const WIDTH = Math.max(900, maxWorkday * 40 + PADDING.left + PADDING.right);
  const allLegendItems = [...lines.map(l => ({ activity: l.activity, duration: l.duration })), ...ganttBars.map(g => ({ activity: g.activity, duration: g.duration }))];
  const LEGEND_ITEMS_PER_ROW = 4;
  const legendRows = Math.ceil(allLegendItems.length / LEGEND_ITEMS_PER_ROW);
  const LEGEND_H = legendRows * 22 + 10;
  const GANTT_AREA_H = ganttBars.length > 0 ? ganttBars.length * 28 + 20 : 0;
  const DURATION_BOX_H = 32;
  const plotH = unitRange * UNIT_H;
  const HEIGHT = PADDING.top + plotH + GANTT_AREA_H + PADDING.bottom + LEGEND_H + DURATION_BOX_H + 10;
  const plotW = WIDTH - PADDING.left - PADDING.right;

  const scaleX = (v: number) => PADDING.left + (v / maxWorkday) * plotW;
  const scaleY = (v: number) => PADDING.top + plotH - ((v - minUnit) / (maxUnit - minUnit)) * plotH;

  const months: { month: string; startIdx: number; endIdx: number }[] = [];
  workdays.forEach((wd, i) => {
    if (months.length === 0 || months[months.length - 1].month !== wd.month) months.push({ month: wd.month, startIdx: i, endIdx: i });
    else months[months.length - 1].endIdx = i;
  });

  const ganttAreaY = PADDING.top + plotH + 68;
  const legendY = ganttAreaY + GANTT_AREA_H + 10;
  const legendItemW = (WIDTH - PADDING.left - PADDING.right) / LEGEND_ITEMS_PER_ROW;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-2">
        <h3 className="text-sm font-semibold">Líneas de Balance</h3>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(3, z + 0.15))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setZoom(1)}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPNG} className="gap-1.5 ml-2">
            <Camera className="h-3.5 w-3.5" />Exportar PNG
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 relative" onClick={() => setClickTooltip(null)}>
        <div ref={chartRef} className="bg-card rounded-lg border border-border p-2 inline-block origin-top-left" style={{ transform: `scale(${zoom})` }}>
          <svg ref={svgRef} width={WIDTH} height={HEIGHT} className="select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => { setHoverDay(null); setHoverTooltip(null); }}
            onClick={(e) => { e.stopPropagation(); handleClick(e); }}>
            {/* Month shading */}
            {months.map((m, i) => (
              <rect key={`ms-${i}`} x={scaleX(m.startIdx) - 2} y={PADDING.top}
                width={scaleX(m.endIdx) - scaleX(m.startIdx) + 4} height={plotH}
                fill={i % 2 === 0 ? 'hsl(var(--muted))' : 'transparent'} opacity={0.35} />
            ))}
            {/* Month separator lines */}
            {months.slice(1).map((m, i) => (
              <line key={`ml-${i}`} x1={scaleX(m.startIdx) - 2} x2={scaleX(m.startIdx) - 2}
                y1={PADDING.top} y2={PADDING.top + plotH}
                stroke="hsl(var(--foreground))" strokeWidth={1} strokeDasharray="6 3" opacity={0.5} />
            ))}
            {/* Horizontal grid per unit */}
            {Array.from({ length: maxUnit - minUnit + 1 }, (_, i) => minUnit + i).map(u => (
              <line key={`h-${u}`} x1={PADDING.left} x2={WIDTH - PADDING.right} y1={scaleY(u)} y2={scaleY(u)} stroke="hsl(var(--border))" strokeWidth={0.5} />
            ))}
            {/* Y axis labels — BIGGER */}
            {Array.from({ length: maxUnit - minUnit + 1 }, (_, i) => minUnit + i).map(u => {
              const customLabel = project.unitLabels?.[String(u)];
              const label = customLabel || getUnitLabel(u, project.projectType, project.buildingConfig);
              return (
                <g key={`yl-${u}`}>
                  <text x={PADDING.left - 12} y={scaleY(u)} textAnchor="end" dominantBaseline="middle" className="fill-foreground text-[13px] font-semibold">
                    {label}
                  </text>
                  {u % 2 === 0 && u < maxUnit && (
                    <rect x={PADDING.left} y={scaleY(u + 1)} width={plotW} height={UNIT_H} fill="hsl(var(--muted))" opacity={0.12} />
                  )}
                </g>
              );
            })}
            {/* Vertical cursor line for hovered day */}
            {hoverDay !== null && (
              <line x1={scaleX(hoverDay)} x2={scaleX(hoverDay)} y1={PADDING.top} y2={PADDING.top + plotH}
                stroke="hsl(var(--primary))" strokeWidth={1.5} opacity={0.6} strokeDasharray="4 2" />
            )}
            {/* X axis — BIGGER labels */}
            {workdays.map((wd, i) => (
              <g key={`x-${i}`}>
                <line x1={scaleX(i)} x2={scaleX(i)} y1={PADDING.top} y2={PADDING.top + plotH} stroke="hsl(var(--border))" strokeWidth={0.3} />
                <text x={scaleX(i)} y={PADDING.top + plotH + 14} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {wd.dayName.charAt(0).toUpperCase()}
                </text>
                <text x={scaleX(i)} y={PADDING.top + plotH + 28} textAnchor="middle" className="fill-foreground text-[11px] font-medium">
                  {wd.label}
                </text>
              </g>
            ))}
            {/* Month labels */}
            {months.map((m, i) => (
              <text key={`m-${i}`} x={scaleX((m.startIdx + m.endIdx) / 2)} y={PADDING.top + plotH + 46} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">{m.month}</text>
            ))}





            {/* Activity lines with data points */}
            {lines.map(({ activity, points, crewLines }) => {
              const crews = activity.crews || 1;
              const effectiveRate = activity.rate * crews;
              const bufferUnits = activity.bufferUnits || 0;
              const actualUnitStart = activity.unitStart + bufferUnits;
              const direction = activity.unitEnd > actualUnitStart ? 1 : -1;
              const startWd = points.length > 0 ? points[0].workdayIndex : 0;
              return (
              <g key={activity.id}>
                <polyline points={points.map(p => `${scaleX(p.workdayIndex)},${scaleY(p.unit)}`).join(' ')}
                  fill="none" stroke={activity.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p, i) => (
                  <circle key={i} cx={scaleX(p.workdayIndex)} cy={scaleY(p.unit)} r={3} fill={activity.color} stroke="white" strokeWidth={1} className="cursor-pointer" />
                ))}
                {/* Buffer line (dashed extension) */}
                {(() => {
                  const buf = chartData.lines.find(l => l.activity.id === activity.id)?.buffer;
                  if (!buf || buf.length < 2) return null;
                  return (
                    <polyline points={buf.map(p => `${scaleX(p.workdayIndex)},${scaleY(p.unit)}`).join(' ')}
                      fill="none" stroke={activity.color} strokeWidth={2} strokeDasharray="6 4" opacity={0.6} strokeLinecap="round" />
                  );
                })()}
                {points.length > 0 && (
                  <text x={scaleX(points[points.length - 1].workdayIndex) + 6} y={scaleY(points[points.length - 1].unit)}
                    className="text-[10px] font-medium" fill={activity.color} dominantBaseline="middle">
                    {activity.name}{crews > 1 ? ` (×${crews})` : ''}
                  </text>
                )}
              </g>
              );
            })}
            {/* Intersections */}
            {intersections.map((inter, i) => (
              <g key={`int-${i}`}>
                <circle cx={scaleX(inter.x)} cy={scaleY(inter.y)} r={8} fill="hsl(var(--destructive))" opacity={0.25} />
                <circle cx={scaleX(inter.x)} cy={scaleY(inter.y)} r={4} fill="hsl(var(--destructive))" />
                <title>Conflicto: {inter.a1} × {inter.a2}</title>
              </g>
            ))}
            {/* Gantt bars for Zonas Sociales */}
            {ganttBars.length > 0 && (
              <g>
                <text x={PADDING.left} y={ganttAreaY - 4} className="fill-foreground text-[11px] font-semibold">
                  Zonas Sociales
                </text>
                <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={ganttAreaY} y2={ganttAreaY}
                  stroke="hsl(var(--border))" strokeWidth={0.5} />
                {ganttBars.map(({ activity, startIdx, endIdx, duration }, i) => {
                  const barY = ganttAreaY + 4 + i * 28;
                  const barX = scaleX(startIdx);
                  const barW = scaleX(endIdx) - scaleX(startIdx);
                  return (
                    <g key={`gantt-${activity.id}`}>
                      <rect x={barX} y={barY} width={Math.max(barW, 4)} height={20} rx={4}
                        fill={activity.color} opacity={0.85} />
                      <text x={barX + 5} y={barY + 14} className="text-[10px] font-medium" fill="white" dominantBaseline="middle">
                        {activity.name} ({duration}d)
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
            {/* Axis lines */}
            <line x1={PADDING.left} x2={PADDING.left} y1={PADDING.top} y2={PADDING.top + plotH} stroke="hsl(var(--foreground))" strokeWidth={1} />
            <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={PADDING.top + plotH} y2={PADDING.top + plotH} stroke="hsl(var(--foreground))" strokeWidth={1} />
            {/* Axis titles */}
            <text x={PADDING.left / 2} y={(PADDING.top + plotH) / 2} textAnchor="middle"
              transform={`rotate(-90, ${PADDING.left / 2 - 10}, ${(PADDING.top + plotH) / 2})`}
              className="fill-foreground text-[13px] font-semibold">
              {project.projectType === 'casas' ? 'Unidades' : 'Pisos / Apartamentos'}
            </text>
            <text x={WIDTH / 2} y={PADDING.top + plotH + 62} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
              Tiempo (Días laborales L-V)
            </text>
            {/* Legend — BIGGER font */}
            {allLegendItems.map(({ activity, duration }, i) => {
              const col = i % LEGEND_ITEMS_PER_ROW;
              const row = Math.floor(i / LEGEND_ITEMS_PER_ROW);
              const x = PADDING.left + col * legendItemW;
              const y = legendY + row * 22;
              return (
                <g key={`lbl-${activity.id}`}>
                  <rect x={x} y={y} width={10} height={10} rx={2} fill={activity.color} />
                  <text x={x + 14} y={y + 9} className="fill-foreground text-[12px] font-medium" dominantBaseline="middle">
                    {activity.name} ({duration}d){activity.category === 'zonas_sociales' ? ' ■' : ''}
                  </text>
                </g>
              );
            })}
            {/* Total Duration Box */}
            <rect x={PADDING.left} y={legendY + legendRows * 22 + 5} width={320} height={26} rx={4}
              fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={PADDING.left + 14} y={legendY + legendRows * 22 + 21}
              className="fill-foreground text-[12px] font-semibold" dominantBaseline="middle">
              Duración total programada: {totalDuration} días laborales
            </text>
          </svg>
        </div>
        {clickTooltip && (
          <div className="absolute bg-popover border border-border rounded-md shadow-lg px-3 py-2 z-50 text-xs whitespace-pre-line"
            style={{ left: clickTooltip.x, top: clickTooltip.y }}
            onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-0.5 right-1 text-muted-foreground hover:text-foreground text-xs" onClick={() => setClickTooltip(null)}>✕</button>
            {clickTooltip.content}
          </div>
        )}
        {hoverTooltip && !clickTooltip && (
          <div className="absolute pointer-events-none bg-popover border border-border rounded-md shadow-md px-2.5 py-1 z-50 text-xs font-medium"
            style={{ left: hoverTooltip.x, top: hoverTooltip.y }}>
            {hoverTooltip.name}
          </div>
        )}
      </div>
    </div>
  );
}
