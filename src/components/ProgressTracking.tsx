import { useMemo, useState } from 'react';
import { Plus, Trash2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProject } from '@/context/ProjectContext';
import { Activity, ProgressStatus } from '@/types/project';
import {
  listProjectUnits,
  unitLabel,
  statusClasses,
  nextStatus,
  computeActivityStats,
  computeScheduledPct,
} from '@/utils/progressUtils';

interface Row {
  key: string;          // activity_key
  name: string;
  category: string;
  isExtra: boolean;
  totalUnits: number;   // for stat denominator
  activity?: Activity;  // LOB activity if applicable
}

export function ProgressTracking() {
  const { project, setProgressCell, addProgressExtra, removeProgressExtra, removeActivity } = useProject();

  const handleRemoveRow = (r: Row) => {
    if (r.isExtra) {
      if (window.confirm(`¿Eliminar la actividad extra "${r.name}"? Se perderá su avance registrado.`)) {
        removeProgressExtra(r.key.replace('extra:', ''));
      }
    } else {
      if (window.confirm(`¿Eliminar la actividad "${r.name}" del proyecto? Esto la quitará también del LOB y se perderá su avance.`)) {
        removeActivity(r.key);
      }
    }
  };
  const [newExtraName, setNewExtraName] = useState('');
  const [showAddExtra, setShowAddExtra] = useState(false);

  const isCasas = project.projectType === 'casas';
  const units = useMemo(
    () => listProjectUnits(project.projectType, project.buildingConfig, project.defaultUnits, project.activities),
    [project.projectType, project.buildingConfig, project.defaultUnits, project.activities],
  );
  const totalUnits = units.length;
  const cells = project.progressCells || [];
  const extras = project.progressExtras || [];

  const rows: Row[] = useMemo(() => {
    // For casas: each activity row spans the units defined in the activity (unitStart..unitEnd).
    // For edificios: each activity applies to ALL apartments in the building.
    const lobRows: Row[] = project.activities.map(a => ({
      key: a.id,
      name: a.name,
      category: a.category,
      isExtra: false,
      totalUnits: isCasas
        ? Math.max(1, (a.unitEnd || totalUnits) - (a.unitStart || 1) + 1)
        : totalUnits,
      activity: a,
    }));
    const extraRows: Row[] = extras
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(e => ({
        key: `extra:${e.id}`,
        name: e.name,
        category: e.category,
        isExtra: true,
        totalUnits,
      }));
    return [...lobRows, ...extraRows];
  }, [project.activities, extras, totalUnits, isCasas]);


  // Group rows by category in original order
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach(r => {
      const k = r.category || 'otros';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries());
  }, [rows]);

  const cellLookup = useMemo(() => {
    const m = new Map<string, ProgressStatus>();
    cells.forEach(c => m.set(`${c.activityKey}|${c.unitNumber}`, c.status));
    return m;
  }, [cells]);

  const getStatus = (key: string, unit: number): ProgressStatus | null =>
    cellLookup.get(`${key}|${unit}`) || null;

  const handleClickCell = (key: string, unit: number) => {
    const curr = getStatus(key, unit);
    const next = nextStatus(curr);
    setProgressCell(key, unit, next);
  };

  const handleAddExtra = async () => {
    const name = newExtraName.trim();
    if (!name) return;
    await addProgressExtra(name);
    setNewExtraName('');
    setShowAddExtra(false);
  };

  // Project-level metrics
  const projectMetrics = useMemo(() => {
    let totalReal = 0, totalSched = 0, n = 0, atrasadas = 0;
    rows.forEach(r => {
      const s = computeActivityStats(cells, r.key, r.totalUnits);
      totalReal += s.realPct;
      let sched = 0;
      if (r.activity) sched = computeScheduledPct(r.activity, project.activities);
      totalSched += sched;
      if (sched - s.realPct > 5) atrasadas++;
      n++;
    });
    return {
      realPct: n > 0 ? Math.round(totalReal / n) : 0,
      schedPct: n > 0 ? Math.round(totalSched / n) : 0,
      atrasadas,
      totalActs: n,
    };
  }, [rows, cells, project.activities]);

  const deviation = projectMetrics.realPct - projectMetrics.schedPct;

  const handleExportExcel = () => {
    const header = ['Actividad', ...units.map(u => unitLabel(u, project.projectType, project.buildingConfig, project.unitLabels)), '% Real', '% Programado', 'Desv.'];
    const data: any[][] = [header];
    rows.forEach(r => {
      const stats = computeActivityStats(cells, r.key, r.totalUnits);
      const sched = r.activity ? computeScheduledPct(r.activity, project.activities) : 0;
      const cellsRow = units.map(u => getStatus(r.key, u) || '');
      data.push([r.name, ...cellsRow, `${stats.realPct}%`, `${sched}%`, `${stats.realPct - sched}%`]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Avance');
    XLSX.writeFile(wb, `avance_${project.name.replace(/\s+/g, '_')}.xlsx`);
  };

  // Empty state
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Toolbar
          showAddExtra={showAddExtra}
          setShowAddExtra={setShowAddExtra}
          newExtraName={newExtraName}
          setNewExtraName={setNewExtraName}
          onAddExtra={handleAddExtra}
        />
        <Card className="p-8 text-center text-muted-foreground">
          <p className="font-semibold mb-1">No hay actividades para registrar avance</p>
          <p className="text-sm">Agregue actividades en el LOB del proyecto, o añada una actividad extra arriba.</p>
        </Card>
      </div>
    );
  }

  // ---------- CASAS view ----------
  if (isCasas) {
    return (
      <div className="flex flex-col gap-3">
        <SummaryBar metrics={projectMetrics} deviation={deviation} onExport={handleExportExcel} />
        <Toolbar
          showAddExtra={showAddExtra}
          setShowAddExtra={setShowAddExtra}
          newExtraName={newExtraName}
          setNewExtraName={setNewExtraName}
          onAddExtra={handleAddExtra}
        />
        <Legend />
        <Card className="overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-secondary sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 bg-secondary z-20 text-left px-2 py-1.5 border-b border-r border-border min-w-[320px] w-[320px]">
                  Actividad
                </th>
                {units.map(u => (
                  <th key={u} className="px-1.5 py-1.5 border-b border-border text-center font-semibold min-w-[36px]">
                    {unitLabel(u, project.projectType, project.buildingConfig, project.unitLabels)}
                  </th>
                ))}
                <th className="px-2 py-1.5 border-b border-l border-border text-center min-w-[60px]">% Real</th>
                <th className="px-2 py-1.5 border-b border-border text-center min-w-[60px]">% Prog.</th>
                <th className="px-2 py-1.5 border-b border-border text-center min-w-[60px]">Desv.</th>
                <th className="border-b border-border w-8"></th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap(([cat, catRows]) => [
                <tr key={`g-${cat}`} className="bg-muted/50">
                  <td colSpan={units.length + 5} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {cat}
                  </td>
                </tr>,
                ...catRows.map(r => {
                  const stats = computeActivityStats(cells, r.key, r.totalUnits);
                  const sched = r.activity ? computeScheduledPct(r.activity, project.activities) : 0;
                  const dev = stats.realPct - sched;
                  return (
                    <tr key={r.key} className="hover:bg-secondary/30">
                      <td className="sticky left-0 bg-background z-10 px-2 py-1 border-r border-border font-medium whitespace-normal break-words w-[320px] min-w-[320px] max-w-[320px] leading-tight" title={r.name}>
                        {r.name}
                      </td>
                      {units.map(u => {
                        const s = getStatus(r.key, u);
                        return (
                          <td key={u} className="border border-border/40 p-0 text-center">
                            <button
                              onClick={() => handleClickCell(r.key, u)}
                              className={`w-full h-7 text-[10px] font-bold ${statusClasses(s)}`}
                              title={`${r.name} – U${u}${s ? ` – ${s}` : ''}`}
                            >
                              {s === 'NA' ? 'N/A' : s || ''}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2 py-0.5 border-l border-border text-center font-bold">{stats.realPct}%</td>
                      <td className="px-2 py-0.5 text-center">{sched}%</td>
                      <td className={`px-2 py-0.5 text-center font-semibold ${dev >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {dev > 0 ? '+' : ''}{dev}%
                      </td>
                      <td className="text-center">
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive"
                          title={r.isExtra ? 'Eliminar actividad extra' : 'Eliminar actividad del proyecto'}
                          onClick={() => handleRemoveRow(r)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ])}
            </tbody>
          </table>
        </Card>
        <ProgressChart rows={rows} cells={cells} />
      </div>
    );
  }


  // ---------- EDIFICIOS view (one matrix per activity) ----------
  const { floors, unitsPerFloor } = project.buildingConfig;
  const cubierta = project.buildingConfig.hasCubierta;

  return (
    <div className="flex flex-col gap-3">
      <SummaryBar metrics={projectMetrics} deviation={deviation} onExport={handleExportExcel} />
      <Toolbar
        showAddExtra={showAddExtra}
        setShowAddExtra={setShowAddExtra}
        newExtraName={newExtraName}
        setNewExtraName={setNewExtraName}
        onAddExtra={handleAddExtra}
      />
      <Legend />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map(r => {
          const stats = computeActivityStats(cells, r.key, r.totalUnits);
          const sched = r.activity ? computeScheduledPct(r.activity, project.activities) : 0;
          const dev = stats.realPct - sched;
          return (
            <Card key={r.key} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-sm whitespace-normal break-words leading-tight pr-2" title={r.name}>{r.name}</h4>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive"
                  title={r.isExtra ? 'Eliminar actividad extra' : 'Eliminar actividad del proyecto'}
                  onClick={() => handleRemoveRow(r)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">{r.category}</div>
              <table className="w-full text-xs border-collapse mb-2">
                <thead>
                  <tr>
                    <th className="text-[10px] font-semibold text-muted-foreground text-left">Piso</th>
                    {Array.from({ length: unitsPerFloor }, (_, i) => i + 1).map(ap => (
                      <th key={ap} className="text-[10px] font-semibold text-muted-foreground text-center">{ap}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cubierta && (
                    <>
                      <BuildingFloorRow label="Asc." units={[floors * unitsPerFloor + 3]} getStatus={getStatus} onClick={handleClickCell} rowKey={r.key} span={unitsPerFloor} />
                      <BuildingFloorRow label="M.Cub" units={[floors * unitsPerFloor + 2]} getStatus={getStatus} onClick={handleClickCell} rowKey={r.key} span={unitsPerFloor} />
                      <BuildingFloorRow label="Cub." units={[floors * unitsPerFloor + 1]} getStatus={getStatus} onClick={handleClickCell} rowKey={r.key} span={unitsPerFloor} />
                    </>
                  )}
                  {Array.from({ length: floors }, (_, i) => floors - i).map(f => {
                    const rowUnits = Array.from({ length: unitsPerFloor }, (_, j) => (f - 1) * unitsPerFloor + j + 1);
                    return (
                      <tr key={f}>
                        <td className="text-[10px] font-semibold text-muted-foreground pr-1">{f}</td>
                        {rowUnits.map(u => {
                          const s = getStatus(r.key, u);
                          return (
                            <td key={u} className="border border-border/40 p-0 text-center">
                              <button
                                onClick={() => handleClickCell(r.key, u)}
                                className={`w-full h-6 text-[10px] font-bold ${statusClasses(s)}`}
                                title={`${r.name} – U${u}${s ? ` – ${s}` : ''}`}
                              >
                                {s === 'NA' ? 'N/A' : s || ''}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-between text-[11px]">
                <div>
                  <div className="text-muted-foreground">Total unidades: <b>{stats.total}</b></div>
                  <div className="text-muted-foreground">Ejecutadas: <b>{stats.executed}</b></div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{stats.realPct}%</div>
                  <div className="text-[10px] text-muted-foreground">
                    Prog: {sched}% · <span className={dev >= 0 ? 'text-success' : 'text-destructive'}>
                      {dev > 0 ? '+' : ''}{dev}%
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <ProgressChart rows={rows} cells={cells} />
    </div>
  );
}

function ProgressChart({ rows, cells }: { rows: Row[]; cells: { activityKey: string; unitNumber: number; status: ProgressStatus }[] }) {
  const data = useMemo(() => {
    return rows.map(r => {
      const s = computeActivityStats(cells, r.key, r.totalUnits);
      return { name: r.name, pct: s.realPct };
    });
  }, [rows, cells]);
  const max = 100;
  if (data.length === 0) return null;
  return (
    <Card className="p-3">
      <h4 className="text-sm font-bold mb-2">% Avance Real por actividad</h4>
      <div className="space-y-1 max-h-[300px] overflow-auto pr-2">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <div className="w-44 truncate" title={d.name}>{d.name}</div>
            <div className="flex-1 bg-muted h-4 rounded overflow-hidden relative">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(d.pct / max) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-end pr-1 text-[10px] font-bold">
                {d.pct}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BuildingFloorRow({ label, units, getStatus, onClick, rowKey, span }: {
  label: string; units: number[]; getStatus: (k: string, u: number) => ProgressStatus | null;
  onClick: (k: string, u: number) => void; rowKey: string; span: number;
}) {
  const u = units[0];
  const s = getStatus(rowKey, u);
  return (
    <tr>
      <td className="text-[10px] font-semibold text-muted-foreground pr-1">{label}</td>
      <td colSpan={span} className="border border-border/40 p-0 text-center">
        <button
          onClick={() => onClick(rowKey, u)}
          className={`w-full h-6 text-[10px] font-bold ${statusClasses(s)}`}
        >
          {s === 'NA' ? 'N/A' : s || ''}
        </button>
      </td>
    </tr>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="font-semibold">Leyenda:</span>
      <Badge className="bg-success text-success-foreground">E — Ejecutado</Badge>
      <Badge className="bg-primary text-primary-foreground">P — Programado</Badge>
      <Badge className="bg-destructive text-destructive-foreground">R — Restricción</Badge>
      <Badge className="bg-muted text-muted-foreground">N/A — No aplica</Badge>
      <span className="text-muted-foreground ml-2">Click en celda para cambiar estado</span>
    </div>
  );
}

function SummaryBar({ metrics, deviation, onExport }: { metrics: { realPct: number; schedPct: number; atrasadas: number; totalActs: number }; deviation: number; onExport: () => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      <Card className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground">% Avance Real</div>
        <div className="text-2xl font-bold">{metrics.realPct}%</div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground">% Programado</div>
        <div className="text-2xl font-bold">{metrics.schedPct}%</div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground">Desviación</div>
        <div className={`text-2xl font-bold ${deviation >= 0 ? 'text-success' : 'text-destructive'}`}>
          {deviation > 0 ? '+' : ''}{deviation}%
        </div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] uppercase text-muted-foreground">Atrasadas</div>
        <div className="text-2xl font-bold text-destructive">{metrics.atrasadas}</div>
        <div className="text-[10px] text-muted-foreground">de {metrics.totalActs}</div>
      </Card>
      <Card className="p-3 flex items-center justify-center">
        <Button onClick={onExport} variant="outline" size="sm" className="gap-1 h-8 text-xs">
          <Download className="h-3 w-3" />Exportar Excel
        </Button>
      </Card>
    </div>
  );
}

function Toolbar({ showAddExtra, setShowAddExtra, newExtraName, setNewExtraName, onAddExtra }: {
  showAddExtra: boolean; setShowAddExtra: (b: boolean) => void;
  newExtraName: string; setNewExtraName: (s: string) => void; onAddExtra: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddExtra(!showAddExtra)}>
        <Plus className="h-3 w-3" />Actividad extra
      </Button>
      {showAddExtra && (
        <>
          <Input
            value={newExtraName}
            onChange={e => setNewExtraName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAddExtra(); }}
            placeholder="Ej: Urbanismo, Acceso principal..."
            className="h-7 text-xs w-64"
          />
          <Button size="sm" className="h-7 text-xs" onClick={onAddExtra}>Añadir</Button>
        </>
      )}
    </div>
  );
}
