import { useState, useMemo, useRef, useCallback } from 'react';
import { Plus, Trash2, Edit2, Home, Building2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


import { useProject } from '@/context/ProjectContext';
import { Activity, DEFAULT_COLORS, getUnitLabel } from '@/types/project';
import { PRELOADED_ACTIVITIES, getDefaultColor } from '@/data/preloadedActivities';
import { addDays, isWeekend } from 'date-fns';

function getNextWorkday(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  let cur = new Date(y, m - 1, d);
  cur = addDays(cur, 1);
  while (isWeekend(cur)) cur = addDays(cur, 1);
  return cur.toISOString().split('T')[0];
}

export function LOBPanel() {
  const { project, setProject, addActivity, removeActivity, updateActivity } = useProject();
  const [editId, setEditId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const projectStartDate = project.projectStartDate || new Date().toISOString().split('T')[0];
  const defaultUnits = project.defaultUnits || 10;

  const suggestedStartDate = useMemo(() => {
    if (project.activities.length === 0) return projectStartDate;
    const last = project.activities[project.activities.length - 1];
    return getNextWorkday(last.startDate);
  }, [project.activities, projectStartDate]);

  const [form, setForm] = useState({
    name: '',
    unitStart: 1,
    unitEnd: defaultUnits,
    startDate: suggestedStartDate,
    rate: 1,
    color: DEFAULT_COLORS[0],
    category: 'estructura' as 'estructura' | 'acabados' | 'zonas_sociales',
    predecessorId: '' as string,
    bufferDays: 0,
    bufferUnits: 0,
    crews: 1,
  });

  const resetForm = () => {
    const nextDate = project.activities.length === 0
      ? projectStartDate
      : getNextWorkday(project.activities[project.activities.length - 1].startDate);
    setForm({
      name: '', unitStart: 1, unitEnd: defaultUnits,
      startDate: nextDate,
      rate: 1, color: DEFAULT_COLORS[project.activities.length % DEFAULT_COLORS.length],
      category: 'estructura', predecessorId: '', bufferDays: 0, bufferUnits: 0, crews: 1,
    });
    setEditId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const activity: Activity = {
      ...form, id: editId || crypto.randomUUID(),
      predecessorId: form.predecessorId || undefined,
      enabled: true,
    };
    if (editId) updateActivity(activity);
    else addActivity(activity);
    resetForm();
  };

  const handleEdit = (a: Activity) => {
    // Defer to avoid React DOM reconciliation crash with large SVG
    requestAnimationFrame(() => {
      setForm({
        name: a.name, unitStart: a.unitStart, unitEnd: a.unitEnd,
        startDate: a.startDate, rate: a.rate, color: a.color, category: a.category,
        predecessorId: a.predecessorId || '', bufferDays: a.bufferDays, bufferUnits: a.bufferUnits, crews: a.crews || 1,
      });
      setEditId(a.id);
    });
  };

  const handleLoadPreloaded = () => {
    const existingNames = new Set(project.activities.map(a => a.name));
    const totalUnits = project.projectType === 'edificio'
      ? project.buildingConfig.floors * project.buildingConfig.unitsPerFloor
      : defaultUnits;

    const toAdd = PRELOADED_ACTIVITIES.filter(p => !existingNames.has(p.name));
    const newActivities: Activity[] = [];
    let lastDate = project.activities.length > 0
      ? project.activities[project.activities.length - 1].startDate
      : projectStartDate;
    let lastId: string | undefined = project.activities.length > 0
      ? project.activities[project.activities.length - 1].id
      : undefined;

    for (let i = 0; i < toAdd.length; i++) {
      const p = toAdd[i];
      const startDate = i === 0 && project.activities.length === 0 ? projectStartDate : getNextWorkday(lastDate);
      const id = crypto.randomUUID();
      const activity: Activity = {
        id, name: p.name, unitStart: 1, unitEnd: totalUnits, startDate, rate: 1,
        color: getDefaultColor(project.activities.length + i), category: p.category,
        bufferDays: 0, bufferUnits: 0, crews: 1, enabled: true, predecessorId: lastId,
      };
      newActivities.push(activity);
      lastDate = startDate;
      lastId = id;
    }

    if (newActivities.length > 0) {
      setProject(p => ({ ...p, activities: [...p.activities, ...newActivities] }));
    }
  };

  const toggleActivityEnabled = (id: string) => {
    setProject(p => ({
      ...p,
      activities: p.activities.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a),
    }));
  };

  const handleDelete = (id: string) => {
    if (editId === id) resetForm();
    requestAnimationFrame(() => removeActivity(id));
  };

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setProject(p => {
      const acts = [...p.activities].map(a => ({ ...a }));
      // Swap startDates
      const dateA = acts[dragIndex].startDate;
      const dateB = acts[dropIndex].startDate;
      acts[dragIndex] = { ...acts[dragIndex], startDate: dateB };
      acts[dropIndex] = { ...acts[dropIndex], startDate: dateA };
      // Clear predecessor links between the two to avoid cycles
      const aId = acts[dragIndex].id;
      const bId = acts[dropIndex].id;
      if (acts[dragIndex].predecessorId === bId) acts[dragIndex].predecessorId = undefined;
      if (acts[dropIndex].predecessorId === aId) acts[dropIndex].predecessorId = undefined;
      // Move element from dragIndex to dropIndex
      const [moved] = acts.splice(dragIndex, 1);
      acts.splice(dropIndex, 0, moved);
      return { ...p, activities: acts };
    });
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, setProject]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const availablePredecessors = project.activities.filter(a => a.id !== editId);
  const unitLabel = project.projectType === 'casas' ? 'Unidad' : 'Piso';

  return (
    <div className="w-80 border-r border-border bg-card flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold">Tipo:</Label>
            <div className="flex gap-1">
              <Button
                variant={project.projectType === 'casas' ? 'default' : 'outline'}
                size="sm" className="h-7 text-xs gap-1"
                onClick={() => setProject(p => ({ ...p, projectType: 'casas' }))}
              >
                <Home className="h-3 w-3" /> Casas
              </Button>
              <Button
                variant={project.projectType === 'edificio' ? 'default' : 'outline'}
                size="sm" className="h-7 text-xs gap-1"
                onClick={() => setProject(p => ({ ...p, projectType: 'edificio' }))}
              >
                <Building2 className="h-3 w-3" /> Edificio
              </Button>
            </div>
          </div>
          {project.projectType === 'edificio' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Pisos</Label>
                <Input type="number" min={1} value={project.buildingConfig.floors}
                  onChange={e => setProject(p => ({ ...p, buildingConfig: { ...p.buildingConfig, floors: +e.target.value || 1 } }))}
                  className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px]">Unid/Piso</Label>
                <Input type="number" min={1} value={project.buildingConfig.unitsPerFloor}
                  onChange={e => setProject(p => ({ ...p, buildingConfig: { ...p.buildingConfig, unitsPerFloor: +e.target.value || 1 } }))}
                  className="h-7 text-xs" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Fecha Inicio Proyecto</Label>
              <Input type="date" value={projectStartDate}
                onChange={e => setProject(p => ({ ...p, projectStartDate: e.target.value }))}
                className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-[10px]">Nro. Unidades</Label>
              <Input type="number" min={1} value={defaultUnits}
                onChange={e => setProject(p => ({ ...p, defaultUnits: +e.target.value || 1 }))}
                className="h-7 text-xs" />
            </div>
          </div>
        </div>

        <div ref={formRef} key={editId || 'new-activity'} className="p-3 border-b border-border">
          <h3 className="font-semibold text-xs mb-2">{editId ? '✏️ Editar' : 'Agregar'} Actividad</h3>
          <form onSubmit={handleSubmit} className="space-y-2">
            <div>
              <Label className="text-[10px]">Nombre</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Cimentación" className="h-7 text-xs" />
            </div>
            {form.category === 'zonas_sociales' ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Fecha Inicio</Label>
                    <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Duración (días)</Label>
                    <Input type="number" min={1} value={Math.abs(form.unitEnd - form.unitStart) + 1}
                      onChange={e => setForm(f => ({ ...f, unitStart: 1, unitEnd: Math.max(1, +e.target.value || 1), rate: 1 }))}
                      className="h-7 text-xs" />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Predecesora</Label>
                  <Select value={form.predecessorId || '_none'} onValueChange={v => setForm(f => ({ ...f, predecessorId: v === '_none' ? '' : v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Sin predecesora" /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      <SelectItem value="_none">Sin predecesora</SelectItem>
                      {availablePredecessors.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">{unitLabel} Inicio</Label>
                    <Input type="number" value={form.unitStart} onChange={e => setForm(f => ({ ...f, unitStart: +e.target.value }))} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">{unitLabel} Final</Label>
                    <Input type="number" value={form.unitEnd} onChange={e => setForm(f => ({ ...f, unitEnd: +e.target.value }))} className="h-7 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Fecha Inicio</Label>
                    <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Ritmo (u/día)</Label>
                    <Input type="number" step="0.1" min="0.1" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: +e.target.value }))} className="h-7 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Cuadrillas</Label>
                    <Input type="number" min={1} max={10} value={form.crews} onChange={e => setForm(f => ({ ...f, crews: Math.max(1, +e.target.value || 1) }))} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Ritmo efectivo</Label>
                    <div className="h-7 flex items-center text-xs font-medium text-primary px-2 bg-primary/5 rounded border border-border">
                      {(form.rate * form.crews).toFixed(1)} u/d
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Buffer (días)</Label>
                    <Input type="number" min={0} value={form.bufferDays} onChange={e => setForm(f => ({ ...f, bufferDays: +e.target.value }))} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Buffer (unidades)</Label>
                    <Input type="number" min={0} value={form.bufferUnits} onChange={e => setForm(f => ({ ...f, bufferUnits: +e.target.value }))} className="h-7 text-xs" />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Predecesora</Label>
                  <Select value={form.predecessorId || '_none'} onValueChange={v => setForm(f => ({ ...f, predecessorId: v === '_none' ? '' : v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Sin predecesora" /></SelectTrigger>
                    <SelectContent className="max-h-48">
                      <SelectItem value="_none">Sin predecesora</SelectItem>
                      {availablePredecessors.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Categoría</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as any }))}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estructura">Estructura</SelectItem>
                    <SelectItem value="acabados">Acabados</SelectItem>
                    <SelectItem value="zonas_sociales">Zonas Sociales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">Color</Label>
                <Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-7 p-1 cursor-pointer" />
              </div>
            </div>
            <Button type="submit" size="sm" className="w-full gap-1 h-7 text-xs">
              {editId ? <Edit2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {editId ? 'Actualizar' : 'Agregar'}
            </Button>
            {editId && <Button type="button" variant="outline" size="sm" className="w-full h-7 text-xs" onClick={resetForm}>Cancelar</Button>}
          </form>
        </div>

        {/* Preloaded Activities Button */}
        <div className="p-3 border-b border-border">
          <Button variant="outline" size="sm" className="w-full gap-1.5 h-7 text-xs" onClick={handleLoadPreloaded}>
            <Plus className="h-3 w-3" />
            Cargar Actividades Precargadas ({PRELOADED_ACTIVITIES.length})
          </Button>
          <p className="text-[9px] text-muted-foreground mt-1 text-center">Las actividades precargadas son editables después de cargarlas</p>
        </div>

        <div className="p-2 space-y-0.5">
          {project.activities.map((a, index) => {
            const pred = a.predecessorId ? project.activities.find(x => x.id === a.predecessorId) : null;
            return (
              <div
                key={a.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onDragEnd={handleDragEnd}
                className={`group flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-secondary transition-colors ${!a.enabled ? 'opacity-40' : ''} ${editId === a.id ? 'ring-1 ring-primary bg-primary/5' : ''} ${dragOverIndex === index && dragIndex !== index ? 'border-t-2 border-primary' : ''} ${dragIndex === index ? 'opacity-30' : ''}`}
              >
                <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Arrastrar para reordenar">
                  <GripVertical className="h-3.5 w-3.5" />
                </div>
                <input type="checkbox" checked={a.enabled} onChange={() => toggleActivityEnabled(a.id)} className="h-3 w-3 accent-primary cursor-pointer shrink-0" />
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium truncate">{a.name}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {a.category === 'zonas_sociales'
                      ? `${Math.abs(a.unitEnd - a.unitStart) + 1} días`
                      : `${getUnitLabel(a.unitStart, project.projectType, project.buildingConfig)}-${getUnitLabel(a.unitEnd, project.projectType, project.buildingConfig)} | ${a.rate} u/d${(a.crews || 1) > 1 ? ` ×${a.crews} cuad.` : ''}${a.bufferDays > 0 ? ` | B:${a.bufferDays}d` : ''}`
                    }
                    {pred && <span className="ml-1">← {pred.name}</span>}
                  </p>
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button
                    type="button"
                    className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleEdit(a); }}
                    title="Editar"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-destructive/10 text-destructive transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {project.activities.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">Sin actividades. Agrega una o carga las precargadas.</p>
          )}
        </div>
      </div>
    </div>
  );
}
