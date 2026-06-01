import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, CheckCircle2, AlertTriangle, CalendarDays } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  LineChart, Line, Cell, ReferenceLine,
} from 'recharts';

function getPACRating(pac: number): { label: string; color: string; className: string } {
  if (pac >= 90) return { label: 'M.SO', color: 'hsl(var(--success))', className: 'bg-success text-success-foreground' };
  if (pac >= 80) return { label: 'M.SA', color: 'hsl(var(--warning))', className: 'bg-warning text-warning-foreground' };
  return { label: 'M.M', color: 'hsl(var(--destructive))', className: 'bg-destructive text-destructive-foreground' };
}
import { format, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { advanceWorkdays, ensureWorkday } from '@/utils/schedulingUtils';

interface ProjectRow {
  id: string;
  name: string;
  project_start_date: string | null;
  building_config: any;
  default_units: number | null;
  project_type: string;
}
interface ActivityRow {
  id: string; project_id: string; name: string; start_date: string; end_date: string | null;
  unit_start: number; unit_end: number; rate: number; buffer_days: number; crews: number;
}
interface PacRow {
  project_id: string; date: string; week_number: number;
  planned: boolean; completed: boolean;
  planned_pct: number | null; completed_pct: number | null;
}
interface ProgressRow {
  project_id: string; status: string;
}

function computeActivityEnd(a: ActivityRow): Date {
  if (a.end_date) {
    const [y, m, d] = a.end_date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const [y, m, d] = a.start_date.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const units = Math.max(1, (a.unit_end - a.unit_start + 1));
  const rate = Math.max(0.0001, Number(a.rate)) * Math.max(1, a.crews || 1);
  const workdays = Math.ceil(units / rate);
  return ensureWorkday(advanceWorkdays(start, Math.max(0, workdays - 1)));
}

export function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [pac, setPac] = useState<PacRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: pRows }, { data: aRows }, { data: pacRows }, { data: prRows }] = await Promise.all([
        supabase.from('projects').select('id,name,project_start_date,building_config,default_units,project_type').is('deleted_at', null).order('name'),
        supabase.from('activities').select('id,project_id,name,start_date,end_date,unit_start,unit_end,rate,buffer_days,crews'),
        supabase.from('pac_records').select('project_id,date,week_number,planned,completed,planned_pct,completed_pct'),
        (supabase as any).from('progress_cells').select('project_id,status'),
      ]);
      setProjects((pRows as any) || []);
      setActivities((aRows as any) || []);
      setPac((pacRows as any) || []);
      setProgress((prRows as any) || []);
      setLoading(false);
    })();
  }, []);

  // Available months from PAC records
  const months = useMemo(() => {
    const set = new Set<string>();
    pac.forEach(r => {
      if (!r.date) return;
      try { set.add(format(startOfMonth(parseISO(r.date)), 'yyyy-MM')); } catch {}
    });
    return Array.from(set).sort();
  }, [pac]);

  const filteredPac = useMemo(() => {
    return pac.filter(r => {
      if (projectFilter !== 'all' && r.project_id !== projectFilter) return false;
      if (monthFilter !== 'all') {
        try {
          if (format(startOfMonth(parseISO(r.date)), 'yyyy-MM') !== monthFilter) return false;
        } catch { return false; }
      }
      return true;
    });
  }, [pac, projectFilter, monthFilter]);

  // PAC per project for selected month
  const pacByProject = useMemo(() => {
    const map = new Map<string, { planned: number; completed: number }>();
    filteredPac.forEach(r => {
      if (!r.planned) return;
      const cur = map.get(r.project_id) || { planned: 0, completed: 0 };
      cur.planned += 1;
      const pPct = Number(r.planned_pct ?? (r.planned ? 100 : 0));
      const cPct = Number(r.completed_pct ?? (r.completed ? 100 : 0));
      if (pPct > 0 && cPct >= pPct) cur.completed += 1;
      map.set(r.project_id, cur);
    });
    return projects
      .filter(p => projectFilter === 'all' || p.id === projectFilter)
      .map(p => {
        const s = map.get(p.id) || { planned: 0, completed: 0 };
        const pct = s.planned > 0 ? Math.round((s.completed / s.planned) * 100) : 0;
        return { id: p.id, name: p.name, planned: s.planned, completed: s.completed, pac: pct };
      });
  }, [filteredPac, projects, projectFilter]);

  // PAC trend by month (all projects or filtered)
  const pacTrend = useMemo(() => {
    const map = new Map<string, { planned: number; completed: number }>();
    pac.forEach(r => {
      if (projectFilter !== 'all' && r.project_id !== projectFilter) return;
      if (!r.planned || !r.date) return;
      let key: string;
      try { key = format(startOfMonth(parseISO(r.date)), 'yyyy-MM'); } catch { return; }
      const cur = map.get(key) || { planned: 0, completed: 0 };
      cur.planned += 1;
      const pPct = Number(r.planned_pct ?? 100);
      const cPct = Number(r.completed_pct ?? 0);
      if (pPct > 0 && cPct >= pPct) cur.completed += 1;
      map.set(key, cur);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      month: format(parseISO(`${k}-01`), 'MMM yy', { locale: es }),
      pac: v.planned > 0 ? Math.round((v.completed / v.planned) * 100) : 0,
    }));
  }, [pac, projectFilter]);

  // Execution progress per project (from progress_cells: E executed, P/R/NA other)
  const execByProject = useMemo(() => {
    const map = new Map<string, { e: number; p: number; r: number; total: number }>();
    progress.forEach(c => {
      const cur = map.get(c.project_id) || { e: 0, p: 0, r: 0, total: 0 };
      if (c.status === 'NA') { map.set(c.project_id, cur); return; }
      cur.total += 1;
      if (c.status === 'E') cur.e += 1;
      else if (c.status === 'P') cur.p += 1;
      else if (c.status === 'R') cur.r += 1;
      map.set(c.project_id, cur);
    });
    return projects
      .filter(p => projectFilter === 'all' || p.id === projectFilter)
      .map(p => {
        const s = map.get(p.id) || { e: 0, p: 0, r: 0, total: 0 };
        const pct = s.total > 0 ? Math.round((s.e / s.total) * 100) : 0;
        return { id: p.id, name: p.name, ejecutado: s.e, programado: s.p, restringido: s.r, total: s.total, avance: pct };
      });
  }, [progress, projects, projectFilter]);

  // Project timeline (start / end)
  const timeline = useMemo(() => {
    return projects
      .filter(p => projectFilter === 'all' || p.id === projectFilter)
      .map(p => {
        const acts = activities.filter(a => a.project_id === p.id);
        const starts = acts.map(a => {
          const [y, m, d] = a.start_date.split('-').map(Number);
          return new Date(y, m - 1, d).getTime();
        });
        const ends = acts.map(a => computeActivityEnd(a).getTime());
        let start: number | null = null;
        let end: number | null = null;
        if (p.project_start_date) {
          const [y, m, d] = p.project_start_date.split('-').map(Number);
          start = new Date(y, m - 1, d).getTime();
        }
        if (starts.length) start = start ? Math.min(start, ...starts) : Math.min(...starts);
        if (ends.length) end = Math.max(...ends);
        return { id: p.id, name: p.name, start, end };
      })
      .filter(t => t.start && t.end);
  }, [projects, activities, projectFilter]);

  // Global KPIs
  const kpis = useMemo(() => {
    let planned = 0, compliant = 0;
    filteredPac.forEach(r => {
      if (!r.planned) return;
      planned += 1;
      const pPct = Number(r.planned_pct ?? 100);
      const cPct = Number(r.completed_pct ?? 0);
      if (pPct > 0 && cPct >= pPct) compliant += 1;
    });
    const avgPac = planned > 0 ? Math.round((compliant / planned) * 100) : 0;
    const totalAvance = execByProject.reduce((s, x) => s + x.avance, 0);
    const avgAvance = execByProject.length > 0 ? Math.round(totalAvance / execByProject.length) : 0;
    return { avgPac, planned, compliant, avgAvance, projectCount: projects.length };
  }, [filteredPac, execByProject, projects]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const monthLabel = (k: string) => {
    try { return format(parseISO(`${k}-01`), "MMMM yyyy", { locale: es }); } catch { return k; }
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header & filters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard Administrador</h2>
          <p className="text-sm text-muted-foreground">Resumen mensual del PAC y avance de ejecución de todos los proyectos</p>
        </div>
        <div className="flex gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Proyecto</label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proyectos</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Mes</label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los meses</SelectItem>
                {months.map(m => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">PAC Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" style={{ color: getPACRating(kpis.avgPac).color }}>{kpis.avgPac}%</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={getPACRating(kpis.avgPac).className + ' text-[10px] px-1.5 py-0'}>{getPACRating(kpis.avgPac).label}</Badge>
              <p className="text-xs text-muted-foreground">{kpis.compliant}/{kpis.planned} cumplidas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avance Ejecución</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.avgAvance}%</div>
            <p className="text-xs text-muted-foreground mt-1">Promedio entre proyectos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Actividades Planeadas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.planned}</div>
            <p className="text-xs text-muted-foreground mt-1">Periodo seleccionado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Proyectos</CardTitle>
            <CalendarDays className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.projectCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Activos en el sistema</p>
          </CardContent>
        </Card>
      </div>

      {/* PAC by project */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Indicador PAC por proyecto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center justify-end flex-wrap">
            <Badge className="bg-destructive text-destructive-foreground text-xs">M.M &lt; 80%</Badge>
            <Badge className="bg-warning text-warning-foreground text-xs">M.SA 80-90%</Badge>
            <Badge className="bg-success text-success-foreground text-xs">M.SO ≥ 90%</Badge>
          </div>
          {pacByProject.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Sin registros PAC para el filtro seleccionado.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pacByProject} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <ReferenceLine y={90} stroke="hsl(var(--success))" strokeDasharray="5 5" />
                <ReferenceLine y={80} stroke="hsl(var(--warning))" strokeDasharray="5 5" />
                <Bar dataKey="pac" name="PAC" radius={[4, 4, 0, 0]}>
                  {pacByProject.map((entry, i) => <Cell key={i} fill={getPACRating(entry.pac).color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* PAC trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendencia mensual del PAC</CardTitle>
        </CardHeader>
        <CardContent>
          {pacTrend.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No hay histórico mensual disponible.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={pacTrend} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <ReferenceLine y={90} stroke="hsl(var(--success))" strokeDasharray="5 5" />
                <ReferenceLine y={80} stroke="hsl(var(--warning))" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="pac" stroke="hsl(var(--primary))" strokeWidth={2} dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  return <circle cx={cx} cy={cy} r={4} fill={getPACRating(payload.pac).color} stroke="hsl(var(--background))" strokeWidth={1} />;
                }} name="PAC" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Execution progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avance de ejecución por proyecto</CardTitle>
        </CardHeader>
        <CardContent>
          {execByProject.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Sin datos de avance.</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={execByProject} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="ejecutado" stackId="a" fill="hsl(var(--success))" name="Ejecutado" />
                <Bar dataKey="programado" stackId="a" fill="hsl(var(--primary))" name="Programado" />
                <Bar dataKey="restringido" stackId="a" fill="hsl(var(--destructive))" name="Restringido" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cronograma: fecha de inicio y fin de proyectos</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No hay actividades programadas todavía.</div>
          ) : (
            <ProjectTimeline data={timeline} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectTimeline({ data }: { data: { id: string; name: string; start: number | null; end: number | null }[] }) {
  const valid = data.filter(d => d.start && d.end) as { id: string; name: string; start: number; end: number }[];
  if (valid.length === 0) return null;
  const min = Math.min(...valid.map(d => d.start));
  const max = Math.max(...valid.map(d => d.end));
  const range = Math.max(1, max - min);

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{format(new Date(min), 'MMM yyyy', { locale: es })}</span>
        <span>{format(new Date(max), 'MMM yyyy', { locale: es })}</span>
      </div>
      <div className="space-y-2">
        {valid.map(d => {
          const left = ((d.start - min) / range) * 100;
          const width = Math.max(1, ((d.end - d.start) / range) * 100);
          const today = Date.now();
          const progress = today < d.start ? 0 : today > d.end ? 100 :
            Math.round(((today - d.start) / (d.end - d.start)) * 100);
          return (
            <div key={d.id} className="grid grid-cols-[180px_1fr_auto] gap-3 items-center">
              <div className="text-sm truncate" title={d.name}>{d.name}</div>
              <div className="relative h-6 bg-secondary rounded-md overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 bg-primary/30 border border-primary rounded-md"
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <div className="flex gap-2 items-center text-xs text-muted-foreground whitespace-nowrap">
                <Badge variant="outline" className="font-normal">{format(new Date(d.start), 'dd/MM/yy')}</Badge>
                <span>→</span>
                <Badge variant="outline" className="font-normal">{format(new Date(d.end), 'dd/MM/yy')}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
