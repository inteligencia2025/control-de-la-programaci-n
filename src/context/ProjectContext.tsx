import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ProjectData, Activity, LookaheadItem, PACRecord } from '@/types/project';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getEffectiveStartDateSimple, getEffectiveRate, smartCeil, ensureWorkday, advanceWorkdays, safeParse } from '@/utils/schedulingUtils';

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
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), delay);
  }, [delay]) as T;
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
      setProjectsList([]);
      setActiveProjectId('');
      setProjectInternal(defaultProject);
      setLoaded(false);
      loadedFromDbRef.current = false;
      return;
    }
    const load = async () => {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, name')
        .order('created_at', { ascending: true });

      if (!projects || projects.length === 0) {
        // No projects available - set empty state (only admins can create)
        setProjectsList([]);
        setActiveProjectId('');
        setProjectInternal(defaultProject);
        loadedFromDbRef.current = true;
      } else {
        setProjectsList(projects.map(p => ({ id: p.id, name: p.name })));
        setActiveProjectId(projects[0].id);
        await loadProject(projects[0].id);
      }
      setLoaded(true);
    };
    load();
  }, [user]);

  const loadProject = async (projectId: string) => {
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
        rate: Number(a.rate),
        color: a.color,
        category: a.category,
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

    skipHistory.current = true;
    setProjectInternal(projectData);
    undoStack.current = [];
    redoStack.current = [];
    skipHistory.current = false;
    updateUndoRedoState();
    // Mark that DB data has been loaded into state
    loadedFromDbRef.current = true;
  };

  // ---- SAVE to Supabase (debounced) ----
  const saveProjectRef = useRef<ProjectData | null>(null);
  const activeIdRef = useRef(activeProjectId);
  activeIdRef.current = activeProjectId;

  const doSave = useCallback(async (data: ProjectData, projectId: string) => {
    if (!user || !projectId) return;
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

      // Sync activities: delete all then insert
      await supabase.from('activities').delete().eq('project_id', projectId);
      if (data.activities.length > 0) {
        await supabase.from('activities').insert(
          data.activities.map((a, i) => ({
            id: a.id,
            project_id: projectId,
            name: a.name,
            unit_start: a.unitStart,
            unit_end: a.unitEnd,
            start_date: a.startDate,
            rate: a.rate,
            color: a.color,
            category: a.category,
            predecessor_id: a.predecessorId || null,
            buffer_days: a.bufferDays,
            buffer_units: a.bufferUnits,
            crews: a.crews,
            enabled: a.enabled,
            sort_order: i,
          }))
        );
      }

      // Sync lookahead
      await supabase.from('lookahead_items').delete().eq('project_id', projectId);
      if (data.lookahead.length > 0) {
        await supabase.from('lookahead_items').insert(
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
          }))
        );
      }

      // Sync PAC records
      await supabase.from('pac_records').delete().eq('project_id', projectId);
      if (data.pacRecords.length > 0) {
        await supabase.from('pac_records').insert(
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
          }))
        );
      }
    } catch (err) {
      console.error('Error saving project:', err);
    }
    setSaving(false);
  }, [user]);

  const debouncedSave = useDebouncedCallback((data: ProjectData, projectId: string) => {
    doSave(data, projectId);
  }, 1500);

  // Auto-save on project changes — only after DB data has been loaded
  useEffect(() => {
    if (!loaded || !activeProjectId || !user || !loadedFromDbRef.current) return;
    debouncedSave(project, activeProjectId);
  }, [project, activeProjectId, loaded, user, debouncedSave]);

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
      setProjectsList(prev => [...prev, { id: newP.id, name: newP.name }]);
      setActiveProjectId(newP.id);
      skipHistory.current = true;
      setProjectInternal({ ...defaultProject, name: newP.name });
      undoStack.current = [];
      redoStack.current = [];
      skipHistory.current = false;
      updateUndoRedoState();
    }
  }, [user, updateUndoRedoState]);

  const switchProject = useCallback(async (id: string) => {
    setActiveProjectId(id);
    await loadProject(id);
  }, []);

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
        loadProject(updated[0].id);
      }
      return updated;
    });
  }, [projectsList, activeProjectId, user, toast]);

  const addActivity = useCallback((a: Activity) => setProject(p => ({ ...p, activities: [...p.activities, a] })), [setProject]);
  const updateActivity = useCallback((a: Activity) => setProject(p => {
    let activities = p.activities.map(x => x.id === a.id ? a : x);
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
