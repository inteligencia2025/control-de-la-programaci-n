import { useMemo, useRef, useState } from 'react';
import { Camera, Download } from 'lucide-react';
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
            {/* Resumen */}
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
