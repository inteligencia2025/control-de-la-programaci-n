import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ProjectData, Activity, LookaheadItem, PACRecord } from '@/types/project';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getEffectiveStartDateSimple, getEffectiveRate, smartCeil, ensureWorkday, advanceWorkdays, safeParse } from '@/utils/schedulingUtils';
import { addWorkdays } from '@/utils/dateUtils';

const MAX_UNDO = 30;

const defaultProject: ProjectData = {
  name: 'Nuevo Proyecto',
  projectType: 'casas',
  buildingConfig: { floors: 10, unitsPerFloor: 4 },
  activities: [],
  lookahead: [],
  pacRecords: [],
  contractors: [],
  responsibles: [],
  customFailureCauses: [],
  projectStartDate: new Date().toISOString().split('T')[0],
  defaultUnits: 10,
};

const getActiveProjectStorageKey = (userId: string) => `lob-active-project:${userId}`;

interface ProjectIndexEntry {
  id: string;
  name: string;
}

interface ProjectContextType {
  project: ProjectData;
  setProject: React.Dispatch<React.SetStateAction<ProjectData>>;
  activeProjectId: string;
  projectsList: ProjectIndexEntry[];
  createNewProject: (name?: string) => void;
  switchProject: (id: string) => void;
  deleteProject: (id: string) => void;
  addActivity: (a: Activity) => void;
  updateActivity: (a: Activity) => void;
  removeActivity: (id: string) => void;
  addLookahead: (item: LookaheadItem) => void;
  updateLookahead: (item: LookaheadItem) => void;
  removeLookahead: (id: string) => void;
  addPACRecord: (r: PACRecord) => void;
  updatePACRecord: (r: PACRecord) => void;
  removePACRecord: (id: string) => void;
  saveToFile: () => void;
  loadFromFile: (file: File) => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
};

// Debounce helper - uses ref to avoid dependency on fn changing
function useDebouncedCallback<T extends (...args: any[]) => any>(fn: T, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const debounced = useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), delay);
  }, [delay]) as T & { cancel: () => void };
  (debounced as any).cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  };
  return debounced;
}

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projectsList, setProjectsList] = useState<ProjectIndexEntry[]>([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [project, setProjectInternal] = useState<ProjectData>(defaultProject);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loadedFromDbRef = useRef(false); // true only after DB data is set into state
  const loadedProjectIdRef = useRef<string>(''); // id of project whose data is currently in `project` state
  const dirtyRef = useRef(false); // true once user makes a real edit; prevents auto-save firing from a load
  const intentionalEmptyRef = useRef<{ activities: boolean; lookahead: boolean; pac: boolean }>({ activities: false, lookahead: false, pac: false });

  // Undo/Redo
  const undoStack = useRef<ProjectData[]>([]);
  const redoStack = useRef<ProjectData[]>([]);
  const skipHistory = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const pushUndo = useCallback((prev: ProjectData) => {
    if (skipHistory.current) return;
    undoStack.current = [...undoStack.current.slice(-(MAX_UNDO - 1)), prev];
    redoStack.current = [];
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const setProject: React.Dispatch<React.SetStateAction<ProjectData>> = useCallback((action) => {
    setProjectInternal(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      const structuralChange =
        JSON.stringify(prev.activities) !== JSON.stringify(next.activities) ||
        JSON.stringify(prev.lookahead) !== JSON.stringify(next.lookahead) ||
        JSON.stringify(prev.pacRecords) !== JSON.stringify(next.pacRecords) ||
        prev.projectStartDate !== next.projectStartDate ||
        prev.defaultUnits !== next.defaultUnits ||
        prev.projectType !== next.projectType;
      if (structuralChange) pushUndo(prev);
      // Mark intentional empties so the anti-wipe guard allows them through
      if (prev.activities.length > 0 && next.activities.length === 0) intentionalEmptyRef.current.activities = true;
      if (prev.lookahead.length > 0 && next.lookahead.length === 0) intentionalEmptyRef.current.lookahead = true;
      if (prev.pacRecords.length > 0 && next.pacRecords.length === 0) intentionalEmptyRef.current.pac = true;
      // Any user-driven setProject marks the project as dirty (eligible for auto-save)
      dirtyRef.current = true;
      return next;
    });
  }, [pushUndo]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    setProjectInternal(current => {
      redoStack.current = [...redoStack.current, current];
      return prev;
    });
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    setProjectInternal(current => {
      undoStack.current = [...undoStack.current, current];
      return next;
    });
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ---- LOAD from Supabase ----
  useEffect(() => {
    if (!user) {
      debouncedSave.cancel?.();
      setProjectsList([]);
      setActiveProjectId('');
      setProjectInternal(defaultProject);
      setLoaded(false);
      loadedFromDbRef.current = false;
      loadedProjectIdRef.current = '';
      dirtyRef.current = false;
      return;
    }
    const load = async () => {
      debouncedSave.cancel?.();
      loadedFromDbRef.current = false;
      loadedProjectIdRef.current = '';
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (!projects || projects.length === 0) {
        // No projects available - set empty state (only admins can create)
        setProjectsList([]);
        setActiveProjectId('');
        setProjectInternal(defaultProject);
        loadedFromDbRef.current = true;
        loadedProjectIdRef.current = '';
      } else {
        const projectEntries = projects.map(p => ({ id: p.id, name: p.name }));
        const storedProjectId = localStorage.getItem(getActiveProjectStorageKey(user.id));
        const selectedProjectId = projectEntries.some(p => p.id === storedProjectId)
          ? storedProjectId!
          : projectEntries[0].id;

        setProjectsList(projectEntries);
        setActiveProjectId(selectedProjectId);
        await loadProject(selectedProjectId);
      }
      setLoaded(true);
    };
    load();
  }, [user]);

  const loadProject = async (projectId: string) => {
    debouncedSave.cancel?.();
    loadedFromDbRef.current = false;
    loadedProjectIdRef.current = '';
    dirtyRef.current = false;
    intentionalEmptyRef.current = { activities: false, lookahead: false, pac: false };
    const [
      { data: proj },
      { data: acts },
      { data: look },
      { data: pacs },
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('activities').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('lookahead_items').select('*').eq('project_id', projectId),
      supabase.from('pac_records').select('*').eq('project_id', projectId),
    ]);

    if (!proj) return;

    const projectData: ProjectData = {
      name: proj.name,
      projectType: (proj.project_type as any) || 'casas',
      buildingConfig: (proj.building_config as any) || { floors: 10, unitsPerFloor: 4 },
      activities: (acts || []).map((a: any, i: number) => ({
        id: a.id,
        name: a.name,
        unitStart: a.unit_start,
        unitEnd: a.unit_end,
        startDate: a.start_date,
        endDate: a.end_date || undefined,
        rate: Number(a.rate),
        color: a.color,
        category: (() => {
          const n = (a.name || '').toUpperCase();
          if (n.includes('FACHADA') || n.includes('VENTANA') || n === 'CTO' || n.includes('MEDIDOR') || n === 'RETIE') return 'fachada';
          return a.category;
        })(),
        cubiertaRow: a.category === 'cubierta'
          ? (a.unit_start === 1 ? 'cubierta' : a.unit_start === 2 ? 'muros_cubierta' : 'ascensores')
          : undefined,
        predecessorId: a.predecessor_id || undefined,
        bufferDays: Number(a.buffer_days),
        bufferUnits: Number(a.buffer_units),
        crews: a.crews,
        enabled: a.enabled,
      })),
      lookahead: (look || []).map((l: any) => ({
        id: l.id,
        activityId: l.activity_id,
        activityName: l.activity_name,
        responsible: l.responsible,
        week: l.week,
        restrictions: (l.restrictions as any) || {},
        commitment: l.commitment || undefined,
        commitmentDate: l.commitment_date || undefined,
        commitmentMet: l.commitment_met ?? undefined,
        commitmentCause: l.commitment_cause || undefined,
      })),
      pacRecords: (pacs || []).map((r: any) => ({
        id: r.id,
        date: r.date,
        weekNumber: r.week_number,
        activityName: r.activity_name,
        responsible: r.responsible,
        planned: r.planned,
        completed: r.completed,
        plannedPct: r.planned_pct != null ? Number(r.planned_pct) : (r.planned ? 100 : 0),
        completedPct: r.completed_pct != null ? Number(r.completed_pct) : (r.completed ? 100 : 0),
        failureCause: r.failure_cause,
        failureDescription: r.failure_description || undefined,
      })),
      contractors: (proj.contractors as string[]) || [],
      responsibles: (proj.responsibles as string[]) || [],
      customFailureCauses: (proj.custom_failure_causes as string[]) || [],
      projectStartDate: proj.project_start_date || undefined,
      defaultUnits: proj.default_units || 10,
      unitLabels: (proj.unit_labels as Record<string, string>) || {},
    };

    // Auto-inject newly added preloaded fachada activities (AVALUOS, ESCRITURACIÓN)
    // for existing projects that already had other fachada activities loaded.
    // One-time per project via localStorage flag so user-deletions are respected.
    // Also rename legacy 'ENTREGAS' -> 'ESCRITURACIÓN'.
    projectData.activities = projectData.activities.map(a =>
      a.name === 'ENTREGAS' ? { ...a, name: 'ESCRITURACIÓN' } : a
    );
    const injectKey = `lob-preload-fachada-v4:${projectId}`;
    try {
      if (!localStorage.getItem(injectKey)) {
        const hasFachada = projectData.activities.some(a => a.category === 'fachada');
        if (hasFachada) {
          const existingNames = new Set(projectData.activities.map(a => a.name));
          const toInject: Activity[] = [];
          const lastFachada = [...projectData.activities].reverse().find(a => a.category === 'fachada');
          const baseStart = lastFachada?.startDate || projectData.projectStartDate || new Date().toISOString().split('T')[0];
          const newOnes = [
            { name: 'AVALUOS', durationDays: 10 },
            { name: 'ESCRITURACIÓN', durationDays: 10 },
          ];
          for (const n of newOnes) {
            if (existingNames.has(n.name)) continue;
            toInject.push({
              id: crypto.randomUUID(),
              name: n.name,
              category: 'fachada',
              unitStart: 1,
              unitEnd: 1,
              startDate: baseStart,
              endDate: (() => { const [yy, mm, dd] = baseStart.split('-').map(Number); return addWorkdays(new Date(yy, mm - 1, dd), Math.max(1, n.durationDays - 1)).toISOString().split('T')[0]; })(),
              rate: 1,
              color: '#8e44ad',
              predecessorId: undefined,
              bufferDays: 0,
              bufferUnits: 0,
              crews: 1,
              enabled: true,
            });
          }
          if (toInject.length > 0) {
            projectData.activities = [...projectData.activities, ...toInject];
          }
        }
        localStorage.setItem(injectKey, '1');
      }
    } catch {}

    skipHistory.current = true;
    setProjectInternal(projectData);
    undoStack.current = [];
    redoStack.current = [];
    skipHistory.current = false;
    updateUndoRedoState();
    // Mark that DB data has been loaded into state for this specific project
    loadedProjectIdRef.current = projectId;
    loadedFromDbRef.current = true;
    // Force a save check to persist any injection/rename
    dirtyRef.current = true;
    intentionalEmptyRef.current = { activities: false, lookahead: false, pac: false };
  };

  // ---- SAVE to Supabase (debounced) ----
  const saveProjectRef = useRef<ProjectData | null>(null);
  const activeIdRef = useRef(activeProjectId);
  activeIdRef.current = activeProjectId;

  const doSave = useCallback(async (data: ProjectData, projectId: string) => {
    if (!user || !projectId) return;
    // Defense: do not save if the loaded project no longer matches the target id
    if (loadedProjectIdRef.current !== projectId) return;

    const stillCurrent = () => loadedProjectIdRef.current === projectId;

    // ---- ANTI-WIPE GUARD ----
    // If our in-memory data is empty for a list, only allow that to be persisted
    // when the user explicitly emptied it (intentionalEmptyRef). Otherwise, if
    // the DB still has rows, abort the entire save to prevent destroying data
    // due to a stale render or race condition.
    try {
      if (data.activities.length === 0 && !intentionalEmptyRef.current.activities) {
        const { count } = await supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId);
        if ((count ?? 0) > 0) {
          console.warn('[doSave] Aborted: in-memory activities=0 but DB has', count, 'for', projectId);
          return;
        }
      }
      if (data.lookahead.length === 0 && !intentionalEmptyRef.current.lookahead) {
        const { count } = await supabase
          .from('lookahead_items')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId);
        if ((count ?? 0) > 0) {
          console.warn('[doSave] Aborted: in-memory lookahead=0 but DB has', count, 'for', projectId);
          return;
        }
      }
      if (data.pacRecords.length === 0 && !intentionalEmptyRef.current.pac) {
        const { count } = await supabase
          .from('pac_records')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId);
        if ((count ?? 0) > 0) {
          console.warn('[doSave] Aborted: in-memory pacRecords=0 but DB has', count, 'for', projectId);
          return;
        }
      }
    } catch (err) {
      console.error('[doSave] Anti-wipe guard query failed, aborting save:', err);
      return;
    }
    if (!stillCurrent()) return;

    setSaving(true);
    try {
      // Update project metadata
      await supabase.from('projects').update({
        name: data.name,
        project_type: data.projectType,
        building_config: data.buildingConfig as any,
        contractors: data.contractors,
        responsibles: data.responsibles,
        custom_failure_causes: data.customFailureCauses,
        project_start_date: data.projectStartDate || null,
        default_units: data.defaultUnits || 10,
        unit_labels: (data.unitLabels || {}) as any,
        updated_at: new Date().toISOString(),
      }).eq('id', projectId);
      if (!stillCurrent()) return;

      // ---- Sync activities (upsert + diff delete) ----
      if (data.activities.length > 0) {
        await supabase.from('activities').upsert(
          data.activities.map((a, i) => ({
            id: a.id,
            project_id: projectId,
            name: a.name,
            unit_start: a.unitStart,
            unit_end: a.unitEnd,
            start_date: a.startDate,
            end_date: a.endDate || null,
            rate: a.rate,
            color: a.color,
            category: a.category,
            predecessor_id: a.predecessorId || null,
            buffer_days: a.bufferDays,
            buffer_units: a.bufferUnits,
            crews: a.crews,
            enabled: a.enabled,
            sort_order: i,
          })),
          { onConflict: 'id' }
        );
        if (!stillCurrent()) return;
        const ids = data.activities.map(a => a.id);
        await supabase
          .from('activities')
          .delete()
          .eq('project_id', projectId)
          .not('id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`);
      } else if (intentionalEmptyRef.current.activities) {
        await supabase.from('activities').delete().eq('project_id', projectId);
      }
      if (!stillCurrent()) return;

      // ---- Sync lookahead ----
      if (data.lookahead.length > 0) {
        await supabase.from('lookahead_items').upsert(
          data.lookahead.map(l => ({
            id: l.id,
            project_id: projectId,
            activity_id: l.activityId,
            activity_name: l.activityName,
            responsible: l.responsible,
            week: l.week,
            restrictions: l.restrictions as any,
            commitment: l.commitment || null,
            commitment_date: l.commitmentDate || null,
            commitment_met: l.commitmentMet ?? null,
            commitment_cause: l.commitmentCause || null,
          })),
          { onConflict: 'id' }
        );
        if (!stillCurrent()) return;
        const ids = data.lookahead.map(l => l.id);
        await supabase
          .from('lookahead_items')
          .delete()
          .eq('project_id', projectId)
          .not('id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`);
      } else if (intentionalEmptyRef.current.lookahead) {
        await supabase.from('lookahead_items').delete().eq('project_id', projectId);
      }
      if (!stillCurrent()) return;

      // ---- Sync PAC records ----
      if (data.pacRecords.length > 0) {
        await supabase.from('pac_records').upsert(
          data.pacRecords.map(r => ({
            id: r.id,
            project_id: projectId,
            date: r.date,
            week_number: r.weekNumber,
            activity_name: r.activityName,
            responsible: r.responsible,
            planned: r.planned,
            completed: r.completed,
            planned_pct: r.plannedPct ?? 0,
            completed_pct: r.completedPct ?? 0,
            failure_cause: r.failureCause,
            failure_description: r.failureDescription || null,
          })),
          { onConflict: 'id' }
        );
        if (!stillCurrent()) return;
        const ids = data.pacRecords.map(r => r.id);
        await supabase
          .from('pac_records')
          .delete()
          .eq('project_id', projectId)
          .not('id', 'in', `(${ids.map(id => `"${id}"`).join(',')})`);
      } else if (intentionalEmptyRef.current.pac) {
        await supabase.from('pac_records').delete().eq('project_id', projectId);
      }

      // Reset intentional-empty flags after a successful save
      intentionalEmptyRef.current = { activities: false, lookahead: false, pac: false };
      dirtyRef.current = false;
    } catch (err) {
      console.error('Error saving project:', err);
    }
    setSaving(false);
  }, [user]);

  const debouncedSave = useDebouncedCallback((data: ProjectData, projectId: string) => {
    doSave(data, projectId);
  }, 1500);

  // Auto-save on project changes — only when loaded data corresponds to active project AND user has actually edited
  useEffect(() => {
    if (!loaded || !activeProjectId || !user) return;
    if (!loadedFromDbRef.current) return;
    if (loadedProjectIdRef.current !== activeProjectId) return;
    if (!dirtyRef.current) return;
    debouncedSave(project, activeProjectId);
  }, [project, activeProjectId, loaded, user, debouncedSave]);

  // Cancel pending debounce on unload to avoid half-saves with stale state
  useEffect(() => {
    const handler = () => debouncedSave.cancel?.();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [debouncedSave]);

  // Also update project name in list
  useEffect(() => {
    if (!activeProjectId) return;
    setProjectsList(prev => prev.map(p => p.id === activeProjectId ? { ...p, name: project.name } : p));
  }, [project.name, activeProjectId]);

  const createNewProject = useCallback(async (name?: string) => {
    if (!user) return;
    const { data: newP } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name: name || 'Nuevo Proyecto' })
      .select('id, name')
      .single();
    if (newP) {
      debouncedSave.cancel?.();
      loadedFromDbRef.current = false;
      loadedProjectIdRef.current = '';
      dirtyRef.current = false;
      intentionalEmptyRef.current = { activities: false, lookahead: false, pac: false };
      setProjectsList(prev => [...prev, { id: newP.id, name: newP.name }]);
      setActiveProjectId(newP.id);
      localStorage.setItem(getActiveProjectStorageKey(user.id), newP.id);
      skipHistory.current = true;
      setProjectInternal({ ...defaultProject, name: newP.name });
      undoStack.current = [];
      redoStack.current = [];
      skipHistory.current = false;
      updateUndoRedoState();
      // Mark as loaded for this new (empty) project so subsequent edits save correctly
      loadedProjectIdRef.current = newP.id;
      loadedFromDbRef.current = true;
    }
  }, [user, updateUndoRedoState, debouncedSave]);

  const switchProject = useCallback(async (id: string) => {
    debouncedSave.cancel?.();
    loadedFromDbRef.current = false;
    loadedProjectIdRef.current = '';
    dirtyRef.current = false;
    intentionalEmptyRef.current = { activities: false, lookahead: false, pac: false };
    setActiveProjectId(id);
    if (user) localStorage.setItem(getActiveProjectStorageKey(user.id), id);
    await loadProject(id);
  }, [user, debouncedSave]);

  const deleteProject = useCallback(async (id: string) => {
    if (projectsList.length <= 1) return;
    // Soft delete: mark as deleted instead of removing
    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id || null })
      .eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo mover a papelera', variant: 'destructive' });
      return;
    }
    toast({
      title: 'Proyecto movido a papelera',
      description: 'Puede restaurarse desde Administración → Papelera durante 30 días.',
    });
    setProjectsList(prev => {
      const updated = prev.filter(p => p.id !== id);
      if (id === activeProjectId && updated.length > 0) {
        setActiveProjectId(updated[0].id);
        if (user) localStorage.setItem(getActiveProjectStorageKey(user.id), updated[0].id);
        loadProject(updated[0].id);
      }
      return updated;
    });
  }, [projectsList, activeProjectId, user, toast]);

  const addActivity = useCallback((a: Activity) => setProject(p => ({ ...p, activities: [...p.activities, a] })), [setProject]);
  const updateActivity = useCallback((a: Activity) => setProject(p => {
    const prev = p.activities.find(x => x.id === a.id);
    let activities = p.activities.map(x => x.id === a.id ? a : x);
    // Only cascade when the predecessor's stored startDate changed.
    // Changes to rate/crews/unit range affect visual LOB scheduling at render time
    // (via getEffectiveStartDate) but must NOT rewrite successors' stored dates.
    const schedulingChanged = !!prev && prev.startDate !== a.startDate;
    if (!schedulingChanged) return { ...p, activities };
    // Cascade: update stored startDate of all successors based on predecessor constraint
    const cascadeSuccessors = (changedId: string) => {
      const successors = activities.filter(s => s.predecessorId === changedId);
      for (const succ of successors) {
        const pred = activities.find(x => x.id === succ.predecessorId);
        if (!pred) continue;
        // Calculate predecessor-derived start (ignoring successor's stored baseStart)
        const predStart = safeParse(pred.startDate);
        const effectivePredRate = getEffectiveRate(pred);
        const firstUnitWorkdays = smartCeil(1 / effectivePredRate);
        const bufferDays = succ.bufferDays || 0;
        const predConstraintDate = ensureWorkday(advanceWorkdays(predStart, firstUnitWorkdays + bufferDays));
        const newDateStr = predConstraintDate.toISOString().split('T')[0];
        if (succ.startDate !== newDateStr) {
          activities = activities.map(x => x.id === succ.id ? { ...x, startDate: newDateStr } : x);
          cascadeSuccessors(succ.id);
        }
      }
    };
    cascadeSuccessors(a.id);
    return { ...p, activities };
  }), [setProject]);
  const removeActivity = useCallback((id: string) => setProject(p => ({ ...p, activities: p.activities.filter(x => x.id !== id) })), [setProject]);
  const addLookahead = useCallback((item: LookaheadItem) => setProject(p => ({ ...p, lookahead: [...p.lookahead, item] })), [setProject]);
  const updateLookahead = useCallback((item: LookaheadItem) => setProject(p => ({ ...p, lookahead: p.lookahead.map(x => x.id === item.id ? item : x) })), [setProject]);
  const removeLookahead = useCallback((id: string) => setProject(p => ({ ...p, lookahead: p.lookahead.filter(x => x.id !== id) })), [setProject]);
  const addPACRecord = useCallback((r: PACRecord) => setProject(p => ({ ...p, pacRecords: [...p.pacRecords, r] })), [setProject]);
  const updatePACRecord = useCallback((r: PACRecord) => setProject(p => ({ ...p, pacRecords: p.pacRecords.map(x => x.id === r.id ? r : x) })), [setProject]);
  const removePACRecord = useCallback((id: string) => setProject(p => ({ ...p, pacRecords: p.pacRecords.filter(x => x.id !== id) })), [setProject]);

  const saveToFile = useCallback(() => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  const loadFromFile = useCallback(async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text) as ProjectData;
    setProject({ ...defaultProject, ...data });
  }, [setProject]);

  return (
    <ProjectContext.Provider value={{
      project, setProject,
      activeProjectId, projectsList,
      createNewProject, switchProject, deleteProject,
      addActivity, updateActivity, removeActivity,
      addLookahead, updateLookahead, removeLookahead,
      addPACRecord, updatePACRecord, removePACRecord,
      saveToFile, loadFromFile,
      undo, redo, canUndo, canRedo, saving,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};
