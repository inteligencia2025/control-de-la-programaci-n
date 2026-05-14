import { useMemo, useRef, useState } from 'react';
import { Camera, Download, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import { Button } from '@/components/ui/button';
import { useProject } from '@/context/ProjectContext';
import { addDays, format, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { getEffectiveStartDateSimple as getEffectiveStartDate, calcActivityWorkdays, advanceWorkdays, safeParse } from '@/utils/schedulingUtils';

const MONTH_DAYS = 28; // 4 semanas calendario

export function GanttChart() {
  const { project } = useProject();
  const svgRef = useRef<SVGSVGElement>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    preliminares: true, estructura: true, cubierta: true, ascensores: true, acabados: true, fachada: true, avaluosEntregas: true,
  });
  const toggle = (k: string) => setCollapsed(c => ({ ...c, [k]: !c[k] }));

  const chartData = useMemo(() => {
    const enabled = project.activities.filter(a => a.enabled);
    if (enabled.length === 0) return null;

    const isLinearWithDates = (a: typeof enabled[number]) =>
      !!a.endDate && (a.category === 'preliminares' || a.category === 'cubierta' || a.category === 'fachada');

    const getStart = (a: typeof enabled[number]) =>
      isLinearWithDates(a) ? safeParse(a.startDate) : getEffectiveStartDate(a, project.activities);

    const getEnd = (a: typeof enabled[number]) => {
      if (isLinearWithDates(a)) return safeParse(a.endDate!);
      const start = getStart(a);
      const wd = calcActivityWorkdays(a);
      return advanceWorkdays(start, wd);
    };

    const acts = enabled.map(activity => ({
      activity,
      startDate: getStart(activity),
      endDate: getEnd(activity),
    }));

    const projectStart = new Date(Math.min(...acts.map(a => a.startDate.getTime())));
    const projectEndDate = new Date(Math.max(...acts.map(a => a.endDate.getTime())));
    const totalCalDays = Math.max(1, differenceInCalendarDays(projectEndDate, projectStart));
    const numMonths = Math.max(1, Math.ceil(totalCalDays / MONTH_DAYS));

    type Group = { key: string; label: string; barColor: string; bgFill: string; filter: (a: typeof acts[number]) => boolean };
    const groupDefs: Group[] = [
      { key: 'preliminares', label: 'Preliminares', barColor: '#7f8c8d', bgFill: 'hsl(var(--muted) / 0.55)', filter: a => a.activity.category === 'preliminares' },
      { key: 'estructura', label: 'Estructura', barColor: '#1e3a5f', bgFill: 'hsl(var(--primary) / 0.15)', filter: a => {
        if (a.activity.category !== 'estructura') return false;
        const n = (a.activity.name || '').toUpperCase();
        return n.includes('VACIADO MURO') || n.includes('VACIADO LOSA');
      }},
      { key: 'cubierta', label: 'Cubierta', barColor: '#2d8a56', bgFill: 'hsl(var(--accent) / 0.35)', filter: a => a.activity.category === 'cubierta' && a.activity.cubiertaRow !== 'ascensores' },
      { key: 'ascensores', label: 'Ascensores', barColor: '#16a085', bgFill: 'hsl(var(--accent) / 0.22)', filter: a => a.activity.category === 'cubierta' && a.activity.cubiertaRow === 'ascensores' },
      { key: 'acabados', label: 'Acabados', barColor: '#e69500', bgFill: 'hsl(40 90% 50% / 0.15)', filter: a => a.activity.category === 'acabados' },
      { key: 'fachada', label: 'Fachada', barColor: '#c0392b', bgFill: 'hsl(0 70% 50% / 0.12)', filter: a => a.activity.category === 'fachada' && !['AVALUOS', 'ENTREGAS', 'ESCRITURACIÓN', 'ESCRITURACION'].includes(a.activity.name?.toUpperCase?.() || '') },
      { key: 'avaluosEntregas', label: 'Avalúos y Escrituración', barColor: '#8e44ad', bgFill: 'hsl(280 60% 50% / 0.12)', filter: a => a.activity.category === 'fachada' && ['AVALUOS', 'ENTREGAS', 'ESCRITURACIÓN', 'ESCRITURACION'].includes(a.activity.name?.toUpperCase?.() || '') },
    ];

    const groups = groupDefs.map(g => {
      const items = acts.filter(g.filter);
      if (items.length === 0) return null;
      const minStart = new Date(Math.min(...items.map(i => i.startDate.getTime())));
      const maxEnd = new Date(Math.max(...items.map(i => i.endDate.getTime())));
      const startMonths = differenceInCalendarDays(minStart, projectStart) / MONTH_DAYS;
      const durationMonths = Math.max(0.05, differenceInCalendarDays(maxEnd, minStart) / MONTH_DAYS);
      return { ...g, items, minStart, maxEnd, startMonths, durationMonths };
    }).filter(Boolean) as Array<Group & { items: typeof acts; minStart: Date; maxEnd: Date; startMonths: number; durationMonths: number }>;

    return { groups, projectStart, projectEndDate, totalCalDays, numMonths };
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

  const handleExportPDF = async () => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const w = svgEl.width.baseVal.value;
    const h = svgEl.height.baseVal.value;
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const orientation = w >= h ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'pt', format: [w, h] });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
      pdf.save(`gantt-${project.name || 'proyecto'}.pdf`);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };
  const handleExportJSON = () => {
    if (!chartData) return;
    const data = {
      project: project.name,
      projectStart: format(chartData.projectStart, 'yyyy-MM-dd'),
      projectEnd: format(chartData.projectEndDate, 'yyyy-MM-dd'),
      totalMonths: +(chartData.totalCalDays / MONTH_DAYS).toFixed(2),
      totalWeeks: +(chartData.totalCalDays / 7).toFixed(1),
      groups: chartData.groups.map(g => ({
        category: g.key,
        label: g.label,
        startMonth: +g.startMonths.toFixed(2),
        durationMonths: +g.durationMonths.toFixed(2),
        startDate: format(g.minStart, 'yyyy-MM-dd'),
        endDate: format(g.maxEnd, 'yyyy-MM-dd'),
        activitiesCount: g.items.length,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gantt-${project.name || 'proyecto'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
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

  const { groups, projectStart, projectEndDate, totalCalDays, numMonths } = chartData;
  const MONTH_W = 90;
  const ROW_H = 36;
  const LABEL_W = 200;
  const MONTHNUM_H = 24;
  const MONTH_H = 24;
  const HEADER_H = MONTHNUM_H + MONTH_H;
  const SUMMARY_H = 80;
  let totalRows = 0;
  groups.forEach(g => { totalRows++; if (!collapsed[g.key]) totalRows += g.items.length; });
  const WIDTH = LABEL_W + numMonths * MONTH_W + 20;
  const HEIGHT = HEADER_H + totalRows * ROW_H + SUMMARY_H + 20;

  let rowIdx = 0;
  const renderedGroups = groups.map(g => {
    const groupRow = rowIdx++;
    const isOpen = !collapsed[g.key];
    const childRows = isOpen
      ? g.items.map(it => {
          const startMonths = differenceInCalendarDays(it.startDate, projectStart) / MONTH_DAYS;
          const durationMonths = Math.max(0.05, differenceInCalendarDays(it.endDate, it.startDate) / MONTH_DAYS);
          const r = rowIdx++;
          return { it, startMonths, durationMonths, r };
        })
      : [];
    return { g, groupRow, isOpen, childRows };
  });

  const totalUnits = project.buildingConfig.floors * project.buildingConfig.unitsPerFloor;
  const totalMonthsLabel = (totalCalDays / MONTH_DAYS).toFixed(1);
  const totalWeeksLabel = Math.round(totalCalDays / 7);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h3 className="text-sm font-semibold">Diagrama Gantt — Resumen Mensual (1 mes = 4 semanas)</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportJSON} className="gap-1.5"><Download className="h-3.5 w-3.5" />Exportar JSON</Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5"><FileText className="h-3.5 w-3.5" />Exportar PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5"><Camera className="h-3.5 w-3.5" />Exportar PNG</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-card rounded-lg border border-border inline-block">
          <svg ref={svgRef} width={WIDTH} height={HEIGHT}>
            {Array.from({ length: numMonths }, (_, i) => (
              <g key={`mn-${i}`}>
                <rect x={LABEL_W + i * MONTH_W} y={0} width={MONTH_W} height={MONTHNUM_H} fill="hsl(var(--accent))" stroke="hsl(var(--border))" strokeWidth={0.5} />
                <text x={LABEL_W + i * MONTH_W + MONTH_W / 2} y={MONTHNUM_H - 7} textAnchor="middle" className="fill-accent-foreground text-[12px] font-semibold">Mes {i + 1}</text>
              </g>
            ))}
            {Array.from({ length: numMonths }, (_, i) => {
              const d = addDays(projectStart, i * MONTH_DAYS);
              return (
                <g key={`mh-${i}`}>
                  <rect x={LABEL_W + i * MONTH_W} y={MONTHNUM_H} width={MONTH_W} height={MONTH_H} fill="hsl(var(--primary))" stroke="hsl(var(--border))" strokeWidth={0.5} />
                  <text x={LABEL_W + i * MONTH_W + MONTH_W / 2} y={MONTHNUM_H + MONTH_H - 8} textAnchor="middle" className="fill-primary-foreground text-[11px] font-medium">{format(d, 'MMM yy', { locale: es })}</text>
                </g>
              );
            })}
            {Array.from({ length: numMonths + 1 }, (_, i) => (
              <line key={`vl-${i}`} x1={LABEL_W + i * MONTH_W} x2={LABEL_W + i * MONTH_W} y1={HEADER_H} y2={HEADER_H + totalRows * ROW_H} stroke="hsl(var(--border))" strokeWidth={0.5} />
            ))}
            {renderedGroups.map(({ g, groupRow, isOpen, childRows }) => {
              const yG = HEADER_H + groupRow * ROW_H;
              const barX = LABEL_W + g.startMonths * MONTH_W;
              const barW = Math.max(8, g.durationMonths * MONTH_W);
              return (
                <g key={g.key}>
                  <rect x={0} y={yG} width={WIDTH} height={ROW_H} fill={g.bgFill} />
                  <line x1={0} x2={WIDTH} y1={yG + ROW_H} y2={yG + ROW_H} stroke="hsl(var(--border))" strokeWidth={0.3} />
                  <g onClick={() => toggle(g.key)} className="cursor-pointer">
                    <text x={12} y={yG + ROW_H / 2 + 4} className="fill-foreground text-[12px] font-semibold">
                      {isOpen ? '▾' : '▸'} {g.label} ({g.items.length})
                    </text>
                  </g>
                  <rect x={barX} y={yG + 6} width={barW} height={ROW_H - 12} rx={4} fill={g.barColor} opacity={0.85} />
                  <text x={barX + barW / 2} y={yG + ROW_H / 2 + 4} textAnchor="middle" className="text-[10px] font-bold" fill="white">
                    {g.durationMonths.toFixed(1)} m
                  </text>
                  {childRows.map(({ it, startMonths, durationMonths, r }) => {
                    const y = HEADER_H + r * ROW_H;
                    const cx = LABEL_W + startMonths * MONTH_W;
                    const cw = Math.max(6, durationMonths * MONTH_W);
                    return (
                      <g key={it.activity.id}>
                        <line x1={0} x2={WIDTH} y1={y + ROW_H} y2={y + ROW_H} stroke="hsl(var(--border))" strokeWidth={0.3} />
                        <text x={24} y={y + ROW_H / 2 + 4} className="fill-foreground text-[10px]">{it.activity.name}</text>
                        <rect x={cx} y={y + 8} width={cw} height={ROW_H - 16} rx={3} fill={it.activity.color} opacity={0.85} />
                        <text x={cx + cw / 2} y={y + ROW_H / 2 + 3} textAnchor="middle" className="text-[9px] font-medium" fill="white">{durationMonths.toFixed(1)} m</text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            <rect x={10} y={HEADER_H + totalRows * ROW_H + 10} width={WIDTH - 20} height={SUMMARY_H} rx={6}
              fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={24} y={HEADER_H + totalRows * ROW_H + 32} className="fill-foreground text-[12px] font-bold">
              Resumen del Proyecto — {project.name || 'Sin nombre'}
            </text>
            <text x={24} y={HEADER_H + totalRows * ROW_H + 50} className="fill-foreground text-[11px]">
              Inicio: {format(projectStart, 'dd/MM/yyyy', { locale: es })}  |  Fin: {format(projectEndDate, 'dd/MM/yyyy', { locale: es })}  |  Duración: {totalMonthsLabel} meses ({totalWeeksLabel} semanas)
            </text>
            <text x={24} y={HEADER_H + totalRows * ROW_H + 68} className="fill-foreground text-[11px]">
              Total meses (eje): {numMonths}  |  Total unidades: {totalUnits}
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}
