import { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2, XCircle, RefreshCw, FileSpreadsheet, ChevronDown, ChevronRight, UserPlus, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProject } from '@/context/ProjectContext';
import { LookaheadItem, Activity, RESTRICTION_CATEGORIES, createEmptyRestrictions, DEFAULT_FAILURE_CAUSES } from '@/types/project';
import { addDays, isWeekend, startOfWeek, format } from 'date-fns';
import * as XLSX from 'xlsx';
import { getEffectiveStartDateSimple, calcActivityWorkdays, advanceWorkdays } from '@/utils/schedulingUtils';

const MAX_WEEKS = 12;

function getEffectiveStartDate(activity: Activity, activities: Activity[]): Date {
  return getEffectiveStartDateSimple(activity, activities);
}

function getActivityWeekRange(activity: Activity, activities: Activity[]): { start: Date; end: Date } {
  const start = getEffectiveStartDate(activity, activities);
  const totalWorkdays = calcActivityWorkdays(activity);
  return { start, end: advanceWorkdays(start, totalWorkdays) };
}

function getProjectWeekStartDate(weekNum: number, activities: Activity[]): Date {
  // Find the earliest effective start date from all enabled activities
  let earliest: Date | null = null;
  for (const a of activities) {
    if (!a.enabled) continue;
    const start = getEffectiveStartDate(a, activities);
    if (!earliest || start < earliest) earliest = start;
  }
  if (!earliest) {
    // Fallback to current week if no activities
    const today = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addDays(today, (weekNum - 1) * 7);
  }
  const projectStart = startOfWeek(earliest, { weekStartsOn: 1 });
  return addDays(projectStart, (weekNum - 1) * 7);
}

function getRestrictionProgress(restrictions: Record<string, boolean>): number {
  const allIds = RESTRICTION_CATEGORIES.flatMap(c => c.items.map(i => i.id));
  const total = allIds.length;
  if (total === 0) return 100;
  const completed = allIds.filter(id => restrictions[id]).length;
  return Math.round((completed / total) * 100);
}

function allClear(r: Record<string, boolean>) {
  const allIds = RESTRICTION_CATEGORIES.flatMap(c => c.items.map(i => i.id));
  return allIds.every(id => r[id]);
}

export function LookaheadTable() {
  const { project, addLookahead, updateLookahead, removeLookahead, setProject } = useProject();
  const [weekFilter, setWeekFilter] = useState<number>(1);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [showReview, setShowReview] = useState(false);
  const [showAddResponsible, setShowAddResponsible] = useState(false);
  const [newResponsible, setNewResponsible] = useState('');

  // Calculate how many weeks the project spans
  const totalProjectWeeks = useMemo(() => {
    const enabledActivities = project.activities.filter(a => a.enabled);
    if (enabledActivities.length === 0) return 6;
    let earliest: Date | null = null;
    let latest: Date | null = null;
    for (const a of enabledActivities) {
      const range = getActivityWeekRange(a, project.activities);
      if (!earliest || range.start < earliest) earliest = range.start;
      if (!latest || range.end > latest) latest = range.end;
    }
    if (!earliest || !latest) return 6;
    const diffMs = latest.getTime() - earliest.getTime();
    const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
    return Math.max(6, Math.min(diffWeeks + 1, MAX_WEEKS));
  }, [project.activities]);

  const WEEKS = useMemo(() => Array.from({ length: totalProjectWeeks }, (_, i) => i + 1), [totalProjectWeeks]);

  const filteredItems = project.lookahead.filter(i => i.week === weekFilter);

  const handleAutoLoad = () => {
    const weekStart = getProjectWeekStartDate(weekFilter, project.activities);
    const weekEnd = addDays(weekStart, 6);
    const existingIds = new Set(project.lookahead.filter(i => i.week === weekFilter).map(i => i.activityId));
    
    const newItems: LookaheadItem[] = project.activities
      .filter(a => a.enabled)
      .filter(a => {
        const range = getActivityWeekRange(a, project.activities);
        return range.start <= weekEnd && range.end >= weekStart;
      })
      .filter(a => !existingIds.has(a.id))
      .map(a => {
        // Carry forward progress from previous weeks
        let prevRestrictions: Record<string, boolean> | null = null;
        let prevResponsible = '';
        let prevCommitment = '';
        let prevCommitmentMet: boolean | undefined;
        for (let w = weekFilter - 1; w >= 1; w--) {
          const prevItem = project.lookahead.find(l => l.activityId === a.id && l.week === w);
          if (prevItem) {
            prevRestrictions = prevItem.restrictions;
            prevResponsible = prevItem.responsible;
            // If commitment was met, carry empty; if not met, carry the commitment
            if (prevItem.commitmentMet === false) {
              prevCommitment = prevItem.commitment || '';
            }
            prevCommitmentMet = undefined; // Reset for new week
            break;
          }
        }
        const restrictions = createEmptyRestrictions();
        if (prevRestrictions) {
          for (const key in prevRestrictions) {
            if (prevRestrictions[key]) restrictions[key] = true;
          }
        }
        return {
          id: crypto.randomUUID(), activityId: a.id, activityName: a.name,
          responsible: prevResponsible, week: weekFilter, restrictions,
          commitment: prevCommitment,
        };
      });

    if (newItems.length > 0) {
      setProject(p => ({ ...p, lookahead: [...p.lookahead, ...newItems] }));
    }
  };

  const handleAdd = () => {
    const item: LookaheadItem = {
      id: crypto.randomUUID(), activityId: '', activityName: '',
      responsible: '', week: weekFilter, restrictions: createEmptyRestrictions(),
    };
    addLookahead(item);
  };

  const handleAddResponsible = () => {
    if (!newResponsible.trim()) return;
    setProject(p => ({ ...p, responsibles: [...(p.responsibles || []), newResponsible.trim()] }));
    setNewResponsible('');
    setShowAddResponsible(false);
  };

  const toggleRestriction = (item: LookaheadItem, key: string) => {
    updateLookahead({ ...item, restrictions: { ...item.restrictions, [key]: !item.restrictions[key] } });
  };

  const catComplete = (r: Record<string, boolean>, catId: string) => {
    const cat = RESTRICTION_CATEGORIES.find(c => c.id === catId);
    return cat ? cat.items.every(i => r[i.id]) : false;
  };

  const handleExportExcel = () => {
    const rows = filteredItems.flatMap(item =>
      RESTRICTION_CATEGORIES.flatMap(cat =>
        cat.items.map(ri => ({
          Actividad: item.activityName, Responsable: item.responsible, Semana: item.week,
          Área: cat.name, Restricción: ri.label, Estado: item.restrictions[ri.id] ? '✓ Liberada' : '✗ Pendiente',
        }))
      )
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `Lookahead S${weekFilter}`);
    XLSX.writeFile(wb, `lookahead_semana_${weekFilter}.xlsx`);
  };

  const weekStart = getProjectWeekStartDate(weekFilter, project.activities);
  const weekEnd = addDays(weekStart, 6);
  const lobActivityCount = project.activities.filter(a => {
    if (!a.enabled) return false;
    const range = getActivityWeekRange(a, project.activities);
    return range.start <= weekEnd && range.end >= weekStart;
  }).length;

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const aComplete = allClear(a.restrictions) ? 1 : 0;
      const bComplete = allClear(b.restrictions) ? 1 : 0;
      if (aComplete !== bComplete) return bComplete - aComplete;
      return getRestrictionProgress(b.restrictions) - getRestrictionProgress(a.restrictions);
    });
  }, [filteredItems]);

  const allCauses = useMemo(() => [...DEFAULT_FAILURE_CAUSES, ...(project.customFailureCauses || [])], [project.customFailureCauses]);
  const responsibles = project.responsibles || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
        <h3 className="text-sm font-semibold">Lookahead Planning</h3>
        <div className="flex gap-0.5 overflow-x-auto max-w-[200px]">
          {WEEKS.map(w => (
            <Button key={w} variant={weekFilter === w ? 'default' : 'outline'} size="sm" className="h-6 text-[10px] px-2 shrink-0" onClick={() => setWeekFilter(w)}>S{w}</Button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">{format(weekStart, 'dd/MM')} - {format(addDays(weekStart, 4), 'dd/MM')}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setShowReview(!showReview)} className="gap-1 h-6 text-[10px]">{showReview ? 'Restricciones' : 'Revisión'}</Button>
          <Button size="sm" variant="outline" onClick={handleExportExcel} className="gap-1 h-6 text-[10px]"><FileSpreadsheet className="h-3 w-3" />Excel</Button>
          <Button size="sm" variant="outline" onClick={() => setShowAddResponsible(!showAddResponsible)} className="gap-1 h-6 text-[10px]"><UserPlus className="h-3 w-3" />Responsable</Button>
          <Button size="sm" variant="outline" onClick={handleAutoLoad} className="gap-1 h-6 text-[10px]" disabled={lobActivityCount === 0}>
            <RefreshCw className="h-3 w-3" />LOB ({lobActivityCount})
          </Button>
          <Button size="sm" onClick={handleAdd} className="gap-1 h-6 text-[10px]"><Plus className="h-3 w-3" />Agregar</Button>
        </div>
      </div>

      {showAddResponsible && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-secondary/30">
          <Input value={newResponsible} onChange={e => setNewResponsible(e.target.value)} placeholder="Nombre del responsable" className="h-7 text-xs w-48" />
          <Button size="sm" className="h-7 text-xs" onClick={handleAddResponsible}>Añadir</Button>
          <span className="text-xs text-muted-foreground">Responsables: {responsibles.join(', ') || 'ninguno'}</span>
        </div>
      )}

      {showReview ? (
        <LookaheadReview items={filteredItems} weekStart={weekStart} allCauses={allCauses} responsibles={responsibles} updateItem={updateLookahead} removeItem={removeLookahead} />
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-3">
            {sortedItems.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">Sin actividades en la semana {weekFilter}. Usa "LOB" para importar.</p>
            ) : sortedItems.map(item => {
              const progress = getRestrictionProgress(item.restrictions);
              const isComplete = progress === 100;
              return (
                <div key={item.id} className={`border rounded-lg p-3 bg-card space-y-2 ${isComplete ? 'border-success/50 bg-success/5' : 'border-border'}`}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input value={item.activityName} onChange={e => updateLookahead({ ...item, activityName: e.target.value })} className="h-7 text-xs" placeholder="Actividad" />
                      <Input value={item.responsible} onChange={e => updateLookahead({ ...item, responsible: e.target.value })} className="h-7 text-xs" placeholder="Responsable" />
                    </div>
                    {isComplete ? (
                      <Badge className="bg-success text-success-foreground gap-1 text-[10px] shrink-0"><CheckCircle2 className="h-3 w-3" /> 100% ✓ Cerrada</Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 text-[10px] shrink-0"><XCircle className="h-3 w-3" /> {progress}%</Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeLookahead(item.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${isComplete ? 'bg-success' : 'bg-primary'}`} style={{ width: `${progress}%` }} />
                  </div>
                  {!isComplete && (
                    <div className="mt-2 border-l-2 border-primary/20 ml-1">
                      {RESTRICTION_CATEGORIES.map(cat => {
                        const isOpen = !collapsedCats[`${item.id}-${cat.id}`];
                        const complete = catComplete(item.restrictions, cat.id);
                        const completedCount = cat.items.filter(i => item.restrictions[i.id]).length;
                        return (
                          <div key={cat.id} className="relative">
                            {/* Horizontal connector line */}
                            <div className="absolute left-0 top-[14px] w-3 border-t border-primary/20" />
                            <Collapsible open={isOpen} onOpenChange={o => setCollapsedCats(c => ({ ...c, [`${item.id}-${cat.id}`]: !o }))}>
                              <div className="flex items-center ml-4">
                                <CollapsibleTrigger className="flex items-center gap-1.5 flex-1 text-left px-2 py-1.5 rounded hover:bg-secondary/50 transition-colors group">
                                  {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                  <span className={`text-[11px] font-medium flex-1 ${complete ? 'text-success line-through' : ''}`}>{cat.name}</span>
                                  <Badge variant={complete ? 'default' : 'secondary'} className={`text-[9px] h-4 px-1.5 ${complete ? 'bg-success text-success-foreground' : ''}`}>
                                    {completedCount}/{cat.items.length}
                                  </Badge>
                                </CollapsibleTrigger>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 ml-1 shrink-0"
                                  title={complete ? 'Desmarcar todo' : 'Marcar todo'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newRestrictions = { ...item.restrictions };
                                    const newVal = !complete;
                                    cat.items.forEach(ri => { newRestrictions[ri.id] = newVal; });
                                    updateLookahead({ ...item, restrictions: newRestrictions });
                                  }}
                                >
                                  <CheckCheck className={`h-3 w-3 ${complete ? 'text-success' : 'text-muted-foreground'}`} />
                                </Button>
                              </div>
                              <CollapsibleContent>
                                <div className="ml-4 border-l-2 border-muted-foreground/15 pl-1">
                                  {cat.items.map((ri, idx) => {
                                    const checked = item.restrictions[ri.id] || false;
                                    return (
                                      <div key={ri.id} className="relative flex items-center">
                                        {/* Horizontal connector for each item */}
                                        <div className="absolute left-0 top-1/2 w-3 border-t border-muted-foreground/15" />
                                        <label className="flex items-center gap-2 cursor-pointer py-1 pl-4 pr-2 ml-1 rounded hover:bg-secondary/30 transition-colors w-full">
                                          <Checkbox checked={checked} onCheckedChange={() => toggleRestriction(item, ri.id)} className="h-3.5 w-3.5" />
                                          <span className={`text-[10px] ${checked ? 'text-muted-foreground line-through' : ''}`}>{ri.label}</span>
                                        </label>
                                      </div>
                                    );
                                  })}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

interface ReviewProps {
  items: LookaheadItem[];
  weekStart: Date;
  allCauses: string[];
  responsibles: string[];
  updateItem: (item: LookaheadItem) => void;
  removeItem: (id: string) => void;
}

function LookaheadReview({ items, weekStart, allCauses, responsibles, updateItem, removeItem }: ReviewProps) {
  const updateField = (item: LookaheadItem, field: string, value: any) => {
    updateItem({ ...item, [field]: value } as any);
  };

  return (
    <div className="flex-1 overflow-auto p-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40 text-[10px]">Actividad</TableHead>
            <TableHead className="text-[10px] w-28">Responsable</TableHead>
            <TableHead className="text-[10px] min-w-[200px]">Compromiso</TableHead>
            <TableHead className="text-[10px] w-28">Fecha Comp.</TableHead>
            <TableHead className="text-[10px] text-center w-16">Cumple</TableHead>
            <TableHead className="text-[10px] min-w-[180px]">Causa</TableHead>
            <TableHead className="w-8"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">Sin actividades</TableCell></TableRow>
          ) : items.map(item => {
            const commitment = item.commitment || '';
            const commitmentDate = item.commitmentDate || '';
            const commitmentMet = item.commitmentMet;
            const commitmentCause = item.commitmentCause || '';
            const progress = getRestrictionProgress(item.restrictions);
            const isComplete = progress === 100;

            return (
              <TableRow key={item.id} className={isComplete ? 'bg-success/5' : ''}>
                <TableCell>
                  <Input value={item.activityName} onChange={e => updateItem({ ...item, activityName: e.target.value })}
                    className="h-7 text-[10px]" placeholder="Nombre actividad" />
                </TableCell>
                <TableCell>
                  {responsibles.length > 0 ? (
                    <Select value={item.responsible || '_empty'} onValueChange={v => updateItem({ ...item, responsible: v === '_empty' ? '' : v })}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_empty">— Seleccionar —</SelectItem>
                        {responsibles.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={item.responsible} onChange={e => updateItem({ ...item, responsible: e.target.value })}
                      className="h-7 text-[10px]" placeholder="Responsable" />
                  )}
                </TableCell>
                <TableCell>
                  <Textarea value={commitment} onChange={e => updateField(item, 'commitment', e.target.value)}
                    className="min-h-[32px] text-[10px] resize-none py-1" placeholder="Describir compromiso..." />
                </TableCell>
                <TableCell>
                  <Input type="date" value={commitmentDate} onChange={e => updateField(item, 'commitmentDate', e.target.value)}
                    className="h-7 text-[10px] w-[110px]" />
                </TableCell>
                <TableCell className="text-center">
                  <Select value={commitmentMet === undefined ? '_none' : commitmentMet ? 'si' : 'no'}
                    onValueChange={v => updateField(item, 'commitmentMet', v === '_none' ? undefined : v === 'si')}>
                    <SelectTrigger className="h-7 text-[10px] w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">—</SelectItem>
                      <SelectItem value="si">✓ Sí</SelectItem>
                      <SelectItem value="no">✗ No</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {commitmentMet === false ? (
                    <Textarea value={commitmentCause} onChange={e => updateField(item, 'commitmentCause', e.target.value)}
                      className="min-h-[32px] text-[10px] resize-none py-1" placeholder="Escribir causa..." />
                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
