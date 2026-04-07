import { useMemo, useRef, useState } from 'react';
import { Camera, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProject } from '@/context/ProjectContext';
import { Activity } from '@/types/project';
import { addDays, isWeekend, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

function safeParse(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (y && m && d) return new Date(y, m - 1, d);
  const parsed = parseISO(dateStr);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date();
}

function getEffectiveStartDate(activity: Activity, activities: Activity[]): Date {
  const baseStart = safeParse(activity.startDate);
  if (!activity.predecessorId) return baseStart;
  const pred = activities.find(a => a.id === activity.predecessorId);
  if (!pred) return baseStart;
  const predStart = getEffectiveStartDate(pred, activities);
  const firstUnitWorkdays = Math.ceil(1 / pred.rate);
  const bufferDays = activity.bufferDays || 0;
  let current = new Date(predStart);
  let count = 0;
  while (count < firstUnitWorkdays + bufferDays) { current = addDays(current, 1); if (!isWeekend(current)) count++; }
  let successorStart = current;
  while (isWeekend(successorStart)) successorStart = addDays(successorStart, 1);
  return successorStart > baseStart ? successorStart : baseStart;
}

const ESTRUCTURA_COLOR = 'hsl(var(--primary))';
const ACABADOS_COLOR = '#e69500';

export function GanttChart() {
  const { project } = useProject();
  const svgRef = useRef<SVGSVGElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ estructura: false, acabados: false });
  const toggle = (cat: string) => setCollapsed(c => ({ ...c, [cat]: !c[cat] }));

  const chartData = useMemo(() => {
    const enabled = project.activities.filter(a => a.enabled);
    if (enabled.length === 0) return null;
    const projectStart = new Date(Math.min(...enabled.map(a => getEffectiveStartDate(a, project.activities).getTime())));
    const activities = enabled.map(activity => {
      const start = getEffectiveStartDate(activity, project.activities);
      const totalUnits = Math.abs(activity.unitEnd - activity.unitStart) + 1;
      const totalWorkdays = Math.ceil(totalUnits / activity.rate);
      let startIdx = 0;
      let cur = new Date(projectStart);
      while (cur < start) { if (!isWeekend(cur)) startIdx++; cur = addDays(cur, 1); }
      return { activity, startIdx, duration: totalWorkdays };
    });
    const maxDay = Math.max(...activities.map(a => a.startIdx + a.duration)) + 3;

    // Compute project dates
    let projectEndDate = new Date(projectStart);
    let endWorkdays = maxDay - 3;
    let cur2 = new Date(projectStart);
    let countWd = 0;
    while (countWd < endWorkdays) { cur2 = addDays(cur2, 1); if (!isWeekend(cur2)) countWd++; }
    projectEndDate = cur2;

    const workdays: { label: string; month: string; date: Date }[] = [];
    let current = new Date(projectStart);
    while (workdays.length <= maxDay) {
      if (!isWeekend(current)) workdays.push({ label: format(current, 'dd', { locale: es }), month: format(current, 'MMM yy', { locale: es }), date: new Date(current) });
      current = addDays(current, 1);
    }
    return {
      estructura: activities.filter(a => a.activity.category === 'estructura'),
      acabados: activities.filter(a => a.activity.category === 'acabados'),
      workdays, maxDay, projectStart, projectEndDate, totalWorkdays: endWorkdays,
    };
  }, [project.activities]);

  const handleExport = async () => {
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
      a.download = 'gantt.png';
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (!chartData) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium">Sin datos para el Gantt</p>
          <p className="text-sm mt-1">Agrega actividades en la pestaña LOB</p>
        </div>
      </div>
    );
  }

  const { estructura, acabados, workdays, maxDay, projectStart, projectEndDate, totalWorkdays } = chartData;
  const COL_W = 28; const ROW_H = 32; const LABEL_W = 200; const HEADER_H = 44;
  const groups = [
    { key: 'estructura', label: 'Estructura', items: estructura, color: ESTRUCTURA_COLOR, barColor: '#1e3a5f' },
    { key: 'acabados', label: 'Acabados', items: acabados, color: ACABADOS_COLOR, barColor: '#e69500' },
  ];

  const groupSummary: Record<string, { minStart: number; maxEnd: number }> = {};
  groups.forEach(g => {
    if (g.items.length > 0) {
      const minStart = Math.min(...g.items.map(i => i.startIdx));
      const maxEnd = Math.max(...g.items.map(i => i.startIdx + i.duration));
      groupSummary[g.key] = { minStart, maxEnd };
    }
  });

  let totalRows = 0;
  groups.forEach(g => { totalRows++; if (!collapsed[g.key]) totalRows += g.items.length; });
  const SUMMARY_H = 60;
  const WIDTH = LABEL_W + maxDay * COL_W + 20;
  const HEIGHT = HEADER_H + totalRows * ROW_H + SUMMARY_H + 20;
  const months: { month: string; start: number; end: number }[] = [];
  workdays.forEach((wd, i) => {
    if (months.length === 0 || months[months.length - 1].month !== wd.month) months.push({ month: wd.month, start: i, end: i });
    else months[months.length - 1].end = i;
  });
  let rowIdx = 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h3 className="text-sm font-semibold">Diagrama Gantt</h3>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5"><Camera className="h-3.5 w-3.5" />Exportar PNG</Button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-card rounded-lg border border-border inline-block">
          <svg ref={svgRef} width={WIDTH} height={HEIGHT}>
            {months.map((m, i) => (
              <g key={`mh-${i}`}>
                <rect x={LABEL_W + m.start * COL_W} y={0} width={(m.end - m.start + 1) * COL_W} height={20} fill="hsl(var(--primary))" />
                <text x={LABEL_W + ((m.start + m.end) / 2) * COL_W + COL_W / 2} y={14} textAnchor="middle" className="fill-primary-foreground text-[9px] font-medium">{m.month}</text>
              </g>
            ))}
            {workdays.map((wd, i) => (
              <g key={`dh-${i}`}>
                {i % 5 === 0 && <text x={LABEL_W + i * COL_W + COL_W / 2} y={36} textAnchor="middle" className="fill-muted-foreground text-[8px]">{wd.label}</text>}
                <line x1={LABEL_W + i * COL_W} x2={LABEL_W + i * COL_W} y1={HEADER_H} y2={HEADER_H + totalRows * ROW_H} stroke="hsl(var(--border))" strokeWidth={0.3} />
              </g>
            ))}
            {groups.map(g => {
              const groupRow = rowIdx++;
              const groupY = HEADER_H + groupRow * ROW_H;
              const isCollapsed = collapsed[g.key];
              const summary = groupSummary[g.key];
              return (
                <g key={g.key}>
                  <rect x={0} y={groupY} width={WIDTH} height={ROW_H}
                    fill={g.key === 'estructura' ? 'hsl(var(--primary) / 0.15)' : 'hsl(40 90% 50% / 0.15)'} />
                  <g onClick={() => toggle(g.key)} className="cursor-pointer">
                    <text x={12} y={groupY + ROW_H / 2 + 4} className="fill-foreground text-[11px] font-semibold">
                      {isCollapsed ? '▸' : '▾'} {g.label} ({g.items.length})
                    </text>
                  </g>
                  {isCollapsed && summary && (
                    <g>
                      <rect x={LABEL_W + summary.minStart * COL_W} y={groupY + 6}
                        width={(summary.maxEnd - summary.minStart) * COL_W} height={ROW_H - 12} rx={3}
                        fill={g.barColor} opacity={0.7} />
                      <text x={LABEL_W + summary.minStart * COL_W + ((summary.maxEnd - summary.minStart) * COL_W) / 2}
                        y={groupY + ROW_H / 2 + 3} textAnchor="middle" className="text-[9px] font-bold" fill="white">
                        {summary.maxEnd - summary.minStart} días
                      </text>
                    </g>
                  )}
                  {!isCollapsed && g.items.map(({ activity, startIdx, duration }) => {
                    const r = rowIdx++;
                    const y = HEADER_H + r * ROW_H;
                    return (
                      <g key={activity.id}>
                        <line x1={0} x2={WIDTH} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth={0.3} />
                        <text x={8} y={y + ROW_H / 2 + 4} className="fill-foreground text-[10px]">{activity.name}</text>
                        <rect x={LABEL_W + startIdx * COL_W} y={y + 6} width={duration * COL_W} height={ROW_H - 12} rx={3} fill={activity.color} opacity={0.85} />
                        <text x={LABEL_W + startIdx * COL_W + (duration * COL_W) / 2} y={y + ROW_H / 2 + 3} textAnchor="middle" className="text-[8px] font-medium" fill="white">{duration}d</text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {/* Project Summary Box */}
            <rect x={10} y={HEADER_H + totalRows * ROW_H + 10} width={WIDTH - 20} height={SUMMARY_H} rx={6}
              fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={24} y={HEADER_H + totalRows * ROW_H + 32} className="fill-foreground text-[12px] font-bold">
              Resumen del Proyecto
            </text>
            <text x={24} y={HEADER_H + totalRows * ROW_H + 48} className="fill-foreground text-[11px]">
              Inicio: {format(projectStart, 'dd/MM/yyyy', { locale: es })}  |  Fin: {format(projectEndDate, 'dd/MM/yyyy', { locale: es })}  |  Duración: {totalWorkdays} días laborales
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
