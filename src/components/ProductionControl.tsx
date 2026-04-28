import { useState, useMemo } from 'react';
import { Plus, Trash2, Printer, UserPlus, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject } from '@/context/ProjectContext';
import { PACRecord, DEFAULT_FAILURE_CAUSES, Activity, isPACCompliant } from '@/types/project';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, LineChart, Line, ReferenceLine, ComposedChart } from 'recharts';
import { addDays, isWeekend, startOfWeek, format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getEffectiveStartDateSimple, smartCeil, calcActivityWorkdays, advanceWorkdays } from '@/utils/schedulingUtils';

const PIE_COLORS = ['#c0392b', '#2980b9', '#e69500', '#8e44ad', '#16a085', '#7f8c8d', '#d35400', '#27ae60', '#1e3a5f', '#e74c3c'];

function getPACRating(pac: number): { label: string; color: string; className: string } {
  if (pac >= 90) return { label: 'M.SO', color: 'hsl(var(--success))', className: 'bg-success text-success-foreground' };
  if (pac >= 80) return { label: 'M.SA', color: 'hsl(var(--warning))', className: 'bg-warning text-warning-foreground' };
  return { label: 'M.M', color: 'hsl(var(--destructive))', className: 'bg-destructive text-destructive-foreground' };
}

function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

function getEffectiveStartDate(activity: Activity, activities: Activity[]): Date {
  return getEffectiveStartDateSimple(activity, activities);
}

function getProjectWeekDates(weekNum: number, activities: Activity[]) {
  // Find earliest effective start date from enabled activities
  let earliest: Date | null = null;
  for (const a of activities) {
    if (!a.enabled) continue;
    const start = getEffectiveStartDate(a, activities);
    if (!earliest || start < earliest) earliest = start;
  }
  if (!earliest) {
    const today = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekStart = addDays(today, (weekNum - 1) * 7);
    return { weekStart, weekEnd: addDays(weekStart, 4) };
  }
  const projectStart = startOfWeek(earliest, { weekStartsOn: 1 });
  const weekStart = addDays(projectStart, (weekNum - 1) * 7);
  const weekEnd = addDays(weekStart, 4);
  return { weekStart, weekEnd };
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (year && month && day) return new Date(year, month - 1, day);
  return new Date(dateStr);
}

function getPACWeekDates(weekNum: number, activities: Activity[], pacRecords: PACRecord[]) {
  const storedDates = pacRecords
    .filter(r => r.weekNumber === weekNum && r.date)
    .map(r => parseLocalDate(r.date))
    .filter(d => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (storedDates.length > 0) {
    const weekStart = storedDates[0];
    return { weekStart, weekEnd: addDays(weekStart, 4) };
  }

  return getProjectWeekDates(weekNum, activities);
}

export function ProductionControl() {
  const { project, setProject, addPACRecord, updatePACRecord, removePACRecord } = useProject();
  const [weekView, setWeekView] = useState<number>(1);
  const [responsibleFilter, setResponsibleFilter] = useState<string>('all');
  const [newContractor, setNewContractor] = useState('');
  const [newCause, setNewCause] = useState('');
  const [showAddContractor, setShowAddContractor] = useState(false);
  const [showAddCause, setShowAddCause] = useState(false);
  const [expandedChart, setExpandedChart] = useState<string | null>(null);
  const [historyWeek, setHistoryWeek] = useState<string>('current');

  // Calculate total project weeks
  const totalProjectWeeks = useMemo(() => {
    const enabledActivities = project.activities.filter(a => a.enabled);
    if (enabledActivities.length === 0) return 6;
    let earliest: Date | null = null;
    let latest: Date | null = null;
    for (const a of enabledActivities) {
      const start = getEffectiveStartDate(a, project.activities);
      const totalWorkdays = calcActivityWorkdays(a);
      let endDate = new Date(start); let count = 0;
      while (count < totalWorkdays) { endDate = addDays(endDate, 1); if (!isWeekend(endDate)) count++; }
      if (!earliest || start < earliest) earliest = start;
      if (!latest || endDate > latest) latest = endDate;
    }
    if (!earliest || !latest) return 6;
    const diffMs = latest.getTime() - earliest.getTime();
    return Math.max(6, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1);
  }, [project.activities]);

  const displayWeek = historyWeek !== 'current' ? parseInt(historyWeek) : weekView;
  const { weekStart: weekStartDate, weekEnd: weekEndDate } = getPACWeekDates(displayWeek, project.activities, project.pacRecords);

  // Get all weeks that have records
  const recordedWeeks = useMemo(() => {
    const weeks = new Set(project.pacRecords.map(r => r.weekNumber));
    return Array.from(weeks).sort((a, b) => a - b);
  }, [project.pacRecords]);

  const allCauses = useMemo(() => [...DEFAULT_FAILURE_CAUSES, ...(project.customFailureCauses || [])], [project.customFailureCauses]);

  const handleAdd = () => {
    const record: PACRecord = {
      id: crypto.randomUUID(), date: format(weekStartDate, 'yyyy-MM-dd'),
      weekNumber: displayWeek, activityName: '', responsible: '',
      planned: true, completed: false, plannedPct: 100, completedPct: 0,
      failureCause: '', failureDescription: '',
    };
    addPACRecord(record);
  };

  const handleCarryOverPending = () => {
    const pending = weekRecords.filter(r => r.plannedPct > 0 && r.completedPct < r.plannedPct);
    if (pending.length === 0) return;
    const nextWeek = displayWeek + 1;
    const nextWeekStart = project.pacRecords.some(r => r.weekNumber === nextWeek && r.date)
      ? getPACWeekDates(nextWeek, project.activities, project.pacRecords).weekStart
      : addDays(weekStartDate, 7);
    const existingNextWeek = new Set(
      project.pacRecords.filter(r => r.weekNumber === nextWeek).map(r => r.activityName)
    );
    const carried: PACRecord[] = pending
      .filter(r => !existingNextWeek.has(r.activityName))
      .map(r => {
        const remaining = Math.max(0, Math.min(100, r.plannedPct - r.completedPct));
        return {
          id: crypto.randomUUID(),
          date: format(nextWeekStart, 'yyyy-MM-dd'),
          weekNumber: nextWeek,
          activityName: r.activityName,
          responsible: r.responsible,
          planned: remaining > 0,
          completed: false,
          plannedPct: remaining,
          completedPct: 0,
          failureCause: r.failureCause || '',
          failureDescription: r.failureDescription || '',
        };
      });
    if (carried.length > 0) {
      setProject(p => ({ ...p, pacRecords: [...p.pacRecords, ...carried] }));
    }
  };

  const handleLoadFromLOB = () => {
    const weekStart = getPACWeekDates(displayWeek, project.activities, project.pacRecords).weekStart;
    const weekEnd = addDays(weekStart, 6);
    const weekDate = format(weekStart, 'yyyy-MM-dd');
    const existingNames = new Set(project.pacRecords.filter(r => r.weekNumber === displayWeek).map(r => r.activityName));
    const newRecords: PACRecord[] = project.activities
      .filter(a => a.enabled)
      .filter(a => {
        const start = getEffectiveStartDate(a, project.activities);
        const totalWorkdays = calcActivityWorkdays(a);
        let endDate = new Date(start); let count = 0;
        while (count < totalWorkdays) { endDate = addDays(endDate, 1); if (!isWeekend(endDate)) count++; }
        return start <= weekEnd && endDate >= weekStart;
      })
      .filter(a => !existingNames.has(a.name))
      .map(a => ({
        id: crypto.randomUUID(), date: weekDate,
        weekNumber: displayWeek, activityName: a.name, responsible: '',
        planned: true, completed: false, plannedPct: 100, completedPct: 0,
        failureCause: '', failureDescription: '',
      }));
    if (newRecords.length > 0) setProject(p => ({ ...p, pacRecords: [...p.pacRecords, ...newRecords] }));
  };

  const handleAddContractor = () => {
    if (!newContractor.trim()) return;
    setProject(p => ({ ...p, contractors: [...(p.contractors || []), newContractor.trim()] }));
    setNewContractor(''); setShowAddContractor(false);
  };

  const handleAddCause = () => {
    if (!newCause.trim()) return;
    setProject(p => ({ ...p, customFailureCauses: [...(p.customFailureCauses || []), newCause.trim()] }));
    setNewCause(''); setShowAddCause(false);
  };

  const contractors = project.contractors || [];
  const responsibles = useMemo(() => {
    const set = new Set([...contractors, ...project.pacRecords.map(r => r.responsible).filter(Boolean)]);
    return Array.from(set);
  }, [project.pacRecords, contractors]);

  const weekRecords = project.pacRecords.filter(r => r.weekNumber === displayWeek);
  const filtered = responsibleFilter === 'all' ? weekRecords : weekRecords.filter(r => r.responsible === responsibleFilter);

  const weekPAC = useMemo(() => {
    const planned = filtered.filter(r => r.plannedPct > 0);
    const compliant = planned.filter(r => isPACCompliant(r));
    return planned.length > 0 ? Math.round((compliant.length / planned.length) * 100) : 0;
  }, [filtered]);

  const contractorPAC = useMemo(() => {
    const byResp: Record<string, { planned: number; completed: number }> = {};
    weekRecords.forEach(r => {
      if (!r.responsible) return;
      if (!byResp[r.responsible]) byResp[r.responsible] = { planned: 0, completed: 0 };
      if (r.plannedPct > 0) byResp[r.responsible].planned++;
      if (isPACCompliant(r)) byResp[r.responsible].completed++;
    });
    return Object.entries(byResp).map(([name, data]) => {
      const pac = data.planned > 0 ? Math.round((data.completed / data.planned) * 100) : 0;
      return { name, pac, planned: data.planned, completed: data.completed, ...getPACRating(pac) };
    });
  }, [weekRecords]);

  const cumulativePAC = useMemo(() => {
    const byResp: Record<string, { planned: number; completed: number }> = {};
    project.pacRecords.forEach(r => {
      if (!r.responsible) return;
      if (!byResp[r.responsible]) byResp[r.responsible] = { planned: 0, completed: 0 };
      if (r.plannedPct > 0) byResp[r.responsible].planned++;
      if (isPACCompliant(r)) byResp[r.responsible].completed++;
    });
    return Object.entries(byResp).map(([name, data]) => {
      const pac = data.planned > 0 ? Math.round((data.completed / data.planned) * 100) : 0;
      return { name, pac };
    }).sort((a, b) => b.pac - a.pac);
  }, [project.pacRecords]);

  // PAC mensual: agrupa registros por mes calendario según fecha de inicio de cada semana
  const monthlyPAC = useMemo(() => {
    const currentMonthKey = format(weekStartDate, 'yyyy-MM');
    let planned = 0;
    let completed = 0;
    project.pacRecords.forEach(r => {
      const { weekStart } = getPACWeekDates(r.weekNumber, project.activities, project.pacRecords);
      if (format(weekStart, 'yyyy-MM') !== currentMonthKey) return;
      if (responsibleFilter !== 'all' && r.responsible !== responsibleFilter) return;
      if (r.plannedPct > 0) planned++;
      if (isPACCompliant(r)) completed++;
    });
    const pac = planned > 0 ? Math.round((completed / planned) * 100) : 0;
    return { pac, planned, completed, monthLabel: format(weekStartDate, 'MMMM yyyy') };
  }, [project.pacRecords, project.activities, weekStartDate, responsibleFilter]);

  const monthlyRating = getPACRating(monthlyPAC.pac);

  const weeklyEvolution = useMemo(() => {
    const byWeek: Record<number, { planned: number; completed: number }> = {};
    project.pacRecords.forEach(r => {
      if (!byWeek[r.weekNumber]) byWeek[r.weekNumber] = { planned: 0, completed: 0 };
      if (r.plannedPct > 0) byWeek[r.weekNumber].planned++;
      if (isPACCompliant(r)) byWeek[r.weekNumber].completed++;
    });
    return Object.entries(byWeek).map(([week, data]) => ({
      week: `S${week}`, weekNum: +week,
      pac: data.planned > 0 ? Math.round((data.completed / data.planned) * 100) : 0,
    })).sort((a, b) => a.weekNum - b.weekNum);
  }, [project.pacRecords]);

  const paretoData = useMemo(() => {
    const causes: Record<string, number> = {};
    project.pacRecords.filter(r => r.plannedPct > 0 && !isPACCompliant(r) && r.failureCause).forEach(r => {
      causes[r.failureCause] = (causes[r.failureCause] || 0) + 1;
    });
    const sorted = Object.entries(causes).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, c) => s + c.value, 0);
    let cumulative = 0;
    return sorted.map(item => { cumulative += item.value; return { ...item, cumPct: total > 0 ? Math.round((cumulative / total) * 100) : 0 }; });
  }, [project.pacRecords]);

  const handlePrint = () => window.print();

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(16);
    doc.text(`Control de Producción — PAC`, 14, 18);
    doc.setFontSize(11);
    doc.text(`Semana ${displayWeek}: ${format(weekStartDate, 'dd/MM/yyyy')} — ${format(weekEndDate, 'dd/MM/yyyy')}`, 14, 26);
    doc.text(`PAC: ${weekPAC}% (${rating.label})`, 14, 33);
    if (responsibleFilter !== 'all') {
      doc.text(`Filtro: ${responsibleFilter}`, 14, 40);
    }

    // Activities table
    const tableData = filtered.map(r => [
      r.activityName || '-',
      r.responsible || '-',
      `${r.plannedPct ?? 0}%`,
      `${r.completedPct ?? 0}%`,
      r.failureCause || '-',
      r.failureDescription || '-',
    ]);

    autoTable(doc, {
      startY: responsibleFilter !== 'all' ? 45 : 38,
      head: [['Actividad', 'Responsable', 'Programado', 'Ejecutado', 'Causa Incumplimiento', 'Descripción']],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 35 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 55 },
        5: { cellWidth: 55 },
      },
    });

    // Contractor PAC summary on next section
    if (contractorPAC.length > 0) {
      const finalY = (doc as any).lastAutoTable?.finalY || 80;
      doc.setFontSize(12);
      doc.text('Resumen por Contratista', 14, finalY + 10);

      autoTable(doc, {
        startY: finalY + 14,
        head: [['Contratista', 'PAC %', 'Calificación', 'Planificadas', 'Completadas']],
        body: contractorPAC.map(c => [c.name, `${c.pac}%`, c.label, String(c.planned), String(c.completed)]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
      });
    }

    doc.save(`pac_semana_${displayWeek}.pdf`);
  };

  const handleExportExcel = () => {
    const rows = weekRecords.map(r => ({
      Semana: r.weekNumber, Actividad: r.activityName,
      Responsable: r.responsible,
      'Programado %': r.plannedPct ?? 0,
      'Ejecutado %': r.completedPct ?? 0,
      Cumple: isPACCompliant(r) ? 'Sí' : 'No',
      'Causa Incumplimiento': r.failureCause || '-',
      'Descripción': r.failureDescription || '-',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `PAC S${displayWeek}`);
    const contractorRows = contractorPAC.map(c => ({
      Contratista: c.name, PAC: `${c.pac}%`, Calificación: c.label, Planificadas: c.planned, Completadas: c.completed,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contractorRows), 'Contratistas');
    XLSX.writeFile(wb, `pac_semana_${displayWeek}.xlsx`);
  };

  const rating = getPACRating(weekPAC);
  const toggleExpand = (chartId: string) => setExpandedChart(prev => prev === chartId ? null : chartId);
  const chartHeight = (chartId: string) => expandedChart === chartId ? 'h-[500px]' : 'h-52';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
        <h3 className="text-base font-bold">Control de Producción — PAC</h3>
        <div className="flex gap-0.5 overflow-x-auto max-w-[300px]">
          {Array.from({ length: totalProjectWeeks }, (_, i) => i + 1).map(w => (
            <Button key={w} variant={weekView === w ? 'default' : 'outline'} size="sm" className="h-7 text-xs shrink-0" onClick={() => { setWeekView(w); setHistoryWeek('current'); }}>S{w}</Button>
          ))}
        </div>
        {/* History dropdown */}
        {recordedWeeks.length > 0 && (
          <Select value={historyWeek} onValueChange={v => setHistoryWeek(v)}>
            <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Historial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Semana actual</SelectItem>
              {recordedWeeks.map(w => (
                <SelectItem key={w} value={String(w)}>Semana {w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
          <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Contratista" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los contratistas</SelectItem>
            {responsibles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={handleLoadFromLOB} className="gap-1 h-7 text-xs">LOB</Button>
          <Button size="sm" variant="outline" onClick={handleCarryOverPending} className="gap-1 h-7 text-xs" title="Lleva los pendientes (ejecutado < programado) a la siguiente semana">Arrastrar pendientes →S{displayWeek + 1}</Button>
          <Button size="sm" variant="outline" onClick={handleExportExcel} className="gap-1 h-7 text-xs">Excel</Button>
          <Button size="sm" variant="outline" onClick={handleExportPDF} className="gap-1 h-7 text-xs">PDF</Button>
          <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1 h-7 text-xs"><Printer className="h-3 w-3" />Imprimir</Button>
          <Button size="sm" variant="outline" onClick={() => setShowAddContractor(!showAddContractor)} className="gap-1 h-7 text-xs"><UserPlus className="h-3 w-3" />Contratista</Button>
          <Button size="sm" onClick={handleAdd} className="gap-1 h-7 text-xs"><Plus className="h-3 w-3" />Agregar</Button>
        </div>
      </div>

      {showAddContractor && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-secondary/30">
          <Input value={newContractor} onChange={e => setNewContractor(e.target.value)} placeholder="Nombre del contratista" className="h-7 text-xs w-48" />
          <Button size="sm" className="h-7 text-xs" onClick={handleAddContractor}>Añadir</Button>
          <span className="text-xs text-muted-foreground">Contratistas: {contractors.join(', ') || 'ninguno'}</span>
        </div>
      )}

      <Tabs defaultValue="programacion" className="flex-1 flex flex-col min-h-0">
        <div className="border-b border-border px-4">
          <TabsList className="bg-transparent h-9 gap-1">
            <TabsTrigger value="programacion" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs px-4 h-7 rounded-md font-semibold">Programación</TabsTrigger>
            <TabsTrigger value="indicadores" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs px-4 h-7 rounded-md font-semibold">Indicadores</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="programacion" className="flex-1 overflow-auto m-0 p-3">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-3xl font-bold" style={{ color: rating.color }}>{weekPAC}%</div>
            <Badge className={`${rating.className} text-base px-4 py-1.5`}>{rating.label}</Badge>
            <span className="text-sm text-muted-foreground font-medium">
              Semana {displayWeek}: {format(weekStartDate, 'dd/MM/yyyy')} — {format(weekEndDate, 'dd/MM/yyyy')}
            </span>
            <div className="ml-auto flex gap-2">
              <Badge className="bg-destructive text-destructive-foreground text-sm px-3 py-1">M.M &lt;80%</Badge>
              <Badge className="bg-warning text-warning-foreground text-sm px-3 py-1">M.SA 80-90%</Badge>
              <Badge className="bg-success text-success-foreground text-sm px-3 py-1">M.SO ≥90%</Badge>
            </div>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px] w-[34%] text-xs font-semibold">Actividad</TableHead>
                  <TableHead className="min-w-[160px] w-40 text-xs font-semibold">Responsable</TableHead>
                  <TableHead className="text-center w-32 text-xs font-semibold">Programado %</TableHead>
                  <TableHead className="text-center w-32 text-xs font-semibold">Ejecutado %</TableHead>
                  <TableHead className="min-w-[220px] w-[28%] text-xs font-semibold">Causa / Descripción</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">Sin registros. Agrega actividades o carga desde LOB.</TableCell></TableRow>
                ) : filtered.map(r => {
                  const compliant = isPACCompliant(r);
                  const hasShortfall = r.plannedPct > 0 && r.completedPct < r.plannedPct;
                  const clampPct = (v: number) => Math.max(0, Math.min(100, isFinite(v) ? v : 0));
                  return (
                  <TableRow key={r.id}>
                    <TableCell className="min-w-[260px] w-[34%] align-top">
                      <Input value={r.activityName} onChange={e => updatePACRecord({ ...r, activityName: e.target.value })} className="h-7 text-xs w-full" placeholder="Actividad" title={r.activityName} />
                    </TableCell>
                    <TableCell className="align-top">
                      {responsibles.length > 0 ? (
                        <Select value={r.responsible || '_empty'} onValueChange={v => updatePACRecord({ ...r, responsible: v === '_empty' ? '' : v })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_empty">— Seleccionar —</SelectItem>
                            {responsibles.map(resp => <SelectItem key={resp} value={resp}>{resp}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={r.responsible} onChange={e => updatePACRecord({ ...r, responsible: e.target.value })} className="h-7 text-xs" placeholder="Responsable" />
                      )}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={r.plannedPct ?? 0}
                          onChange={e => {
                            const val = clampPct(parseFloat(e.target.value));
                            updatePACRecord({ ...r, plannedPct: val, planned: val > 0 });
                          }}
                          className="h-8 text-sm text-right pr-6 font-medium"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center align-top">
                      <div className="relative">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={r.completedPct ?? 0}
                          onChange={e => {
                            const val = clampPct(parseFloat(e.target.value));
                            updatePACRecord({ ...r, completedPct: val, completed: r.plannedPct > 0 && val >= r.plannedPct });
                          }}
                          className={`h-8 text-sm text-right pr-6 font-medium ${compliant ? 'border-success' : hasShortfall ? 'border-destructive' : ''}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[220px] w-[28%] align-top">
                      {hasShortfall ? (
                        <div className="flex flex-col gap-1.5">
                          <Select value={r.failureCause || 'none'} onValueChange={v => updatePACRecord({ ...r, failureCause: v === 'none' ? '' : v })}>
                            <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Seleccionar causa —</SelectItem>
                              {allCauses.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Textarea
                            value={r.failureDescription || ''}
                            onChange={e => updatePACRecord({ ...r, failureDescription: e.target.value })}
                            className="min-h-[40px] text-xs resize-y py-1 w-full"
                            placeholder="Describir causa..."
                          />
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removePACRecord(r.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="indicadores" className="flex-1 overflow-auto m-0 p-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-1 pt-2 px-3">
                <CardTitle className="text-xs font-bold">PAC Semana {displayWeek}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2">
                <div className="text-3xl font-bold" style={{ color: rating.color }}>{weekPAC}%</div>
                <Badge className={`${rating.className} text-xs px-2 py-0.5 mt-1`}>{rating.label}</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-2 px-3">
                <CardTitle className="text-xs font-bold capitalize">PAC Mensual — {monthlyPAC.monthLabel}</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2">
                <div className="text-3xl font-bold" style={{ color: monthlyRating.color }}>{monthlyPAC.pac}%</div>
                <Badge className={`${monthlyRating.className} text-xs px-2 py-0.5 mt-1`}>{monthlyRating.label}</Badge>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {monthlyPAC.completed} de {monthlyPAC.planned} actividades planificadas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-3 px-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold">PAC por Contratista</CardTitle>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => toggleExpand('contractor')}>
                  {expandedChart === 'contractor' ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
              </CardHeader>
              <CardContent className={`px-3 pb-3 transition-all ${expandedChart === 'contractor' ? 'max-h-[500px]' : 'max-h-48'} overflow-auto`}>
                <div className="space-y-2">
                  {contractorPAC.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos</p> : (
                    contractorPAC.map(c => (
                      <div key={c.name} className="flex items-center gap-2">
                        <span className="text-sm flex-1 truncate">{c.name}</span>
                        <span className="text-base font-bold" style={{ color: c.color }}>{c.pac}%</span>
                        <Badge className={`${c.className} text-xs px-2 py-0.5`}>{c.label}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-3 items-center justify-center py-2 bg-secondary/30 rounded-lg">
            <span className="text-base font-bold">Rangos de Medición:</span>
            <Badge className="bg-destructive text-destructive-foreground text-base px-4 py-1.5">M.M: PAC &lt; 80%</Badge>
            <Badge className="bg-warning text-warning-foreground text-base px-4 py-1.5">M.SA: 80% ≤ PAC &lt; 90%</Badge>
            <Badge className="bg-success text-success-foreground text-base px-4 py-1.5">M.SO: PAC ≥ 90%</Badge>
          </div>

          <Card>
            <CardHeader className="pb-1 pt-3 px-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold">PAC Acumulado por Contratista</CardTitle>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => toggleExpand('cumulative')}>
                {expandedChart === 'cumulative' ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </Button>
            </CardHeader>
            <CardContent className={`px-1 pb-2 ${chartHeight('cumulative')}`}>
              {cumulativePAC.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cumulativePAC} margin={{ left: 10, right: 10, top: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="category" dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="pac" radius={[3, 3, 0, 0]} name="PAC %">
                      {cumulativePAC.map((entry, i) => <Cell key={i} fill={getPACRating(entry.pac).color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center pt-10">Sin datos</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-3 px-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold">Evolución PAC Semanal</CardTitle>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => toggleExpand('evolution')}>
                {expandedChart === 'evolution' ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </Button>
            </CardHeader>
            <CardContent className={`px-1 pb-2 ${chartHeight('evolution')}`}>
              {weeklyEvolution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyEvolution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="pac" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="PAC %" />
                    <ReferenceLine y={90} stroke="hsl(var(--success))" strokeDasharray="5 5" />
                    <ReferenceLine y={80} stroke="hsl(var(--warning))" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center pt-10">Sin datos</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-3 px-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold">Diagrama de Pareto — Causas de Incumplimiento</CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddCause(!showAddCause)}>
                  <Plus className="h-3 w-3 mr-1" />Causa
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => toggleExpand('pareto')}>
                  {expandedChart === 'pareto' ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
              </div>
            </CardHeader>
            {showAddCause && (
              <div className="flex items-center gap-2 px-3 py-1">
                <Input value={newCause} onChange={e => setNewCause(e.target.value)} placeholder="Nueva causa de incumplimiento" className="h-7 text-xs w-64" />
                <Button size="sm" className="h-7 text-xs" onClick={handleAddCause}>Añadir</Button>
              </div>
            )}
            <CardContent className={`px-3 pb-3 ${expandedChart === 'pareto' ? 'h-[500px]' : 'h-64'}`}>
              {paretoData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={paretoData} margin={{ left: 10, right: 40, top: 10, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-30} textAnchor="end" height={50} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip />
                    <Bar yAxisId="left" dataKey="value" name="Frecuencia" radius={[3, 3, 0, 0]}>
                      {paretoData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} name="% Acumulado" />
                    <ReferenceLine yAxisId="right" y={80} stroke="hsl(var(--destructive))" strokeDasharray="5 5" />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center pt-16">Sin causas de incumplimiento registradas</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
