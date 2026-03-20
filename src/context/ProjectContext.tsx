import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ProjectData, Activity, LookaheadItem, PACRecord } from '@/types/project';

const STORAGE_KEY = 'lean-construction-project';
const PROJECTS_INDEX_KEY = 'lean-construction-projects-index';
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

function getProjectStorageKey(id: string) {
  return `lean-project-${id}`;
}

function loadProjectsIndex(): ProjectIndexEntry[] {
  try {
    const raw = localStorage.getItem(PROJECTS_INDEX_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveProjectsIndex(index: ProjectIndexEntry[]) {
  localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));
}

function migrateProject(parsed: any): ProjectData {
  return {
    ...defaultProject,
    ...parsed,
    projectType: parsed.projectType || 'casas',
    buildingConfig: parsed.buildingConfig || { floors: 10, unitsPerFloor: 4 },
    activities: (parsed.activities || []).map((a: any) => ({
      ...a,
      bufferDays: a.bufferDays ?? 0,
      bufferUnits: a.bufferUnits ?? 0,
      crews: a.crews ?? 1,
      enabled: a.enabled ?? true,
    })),
    pacRecords: (parsed.pacRecords || []).map((r: any) => ({
      ...r,
      weekNumber: r.weekNumber ?? 1,
    })),
    lookahead: (parsed.lookahead || []).map((l: any) => ({
      ...l,
      restrictions: typeof l.restrictions === 'object' ? l.restrictions : {},
    })),
    responsibles: parsed.responsibles || [],
    projectStartDate: parsed.projectStartDate || new Date().toISOString().split('T')[0],
    defaultUnits: parsed.defaultUnits || 10,
  };
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
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projectsList, setProjectsList] = useState<ProjectIndexEntry[]>(() => {
    const idx = loadProjectsIndex();
    if (idx.length > 0) return idx;
    const oldData = localStorage.getItem(STORAGE_KEY);
    const id = crypto.randomUUID();
    const name = oldData ? (JSON.parse(oldData).name || 'Nuevo Proyecto') : 'Nuevo Proyecto';
    const entry = { id, name };
    if (oldData) {
      localStorage.setItem(getProjectStorageKey(id), oldData);
      localStorage.removeItem(STORAGE_KEY);
    }
    saveProjectsIndex([entry]);
    return [entry];
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projectsList[0]?.id || '';
  });

  const [project, setProjectInternal] = useState<ProjectData>(() => {
    if (!activeProjectId) return defaultProject;
    try {
      const raw = localStorage.getItem(getProjectStorageKey(activeProjectId));
      if (raw) return migrateProject(JSON.parse(raw));
    } catch {}
    return defaultProject;
  });

  // Undo/Redo stacks
  const undoStack = useRef<ProjectData[]>([]);
  const redoStack = useRef<ProjectData[]>([]);
  const skipHistory = useRef(false);

  const pushUndo = useCallback((prev: ProjectData) => {
    if (skipHistory.current) return;
    undoStack.current = [...undoStack.current.slice(-(MAX_UNDO - 1)), prev];
    redoStack.current = [];
  }, []);

  const setProject: React.Dispatch<React.SetStateAction<ProjectData>> = useCallback((action) => {
    setProjectInternal(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      // Only push to undo if structural data changed (skip name-only changes for typing)
      const structuralChange =
        JSON.stringify(prev.activities) !== JSON.stringify(next.activities) ||
        JSON.stringify(prev.lookahead) !== JSON.stringify(next.lookahead) ||
        JSON.stringify(prev.pacRecords) !== JSON.stringify(next.pacRecords) ||
        prev.projectStartDate !== next.projectStartDate ||
        prev.defaultUnits !== next.defaultUnits ||
        prev.projectType !== next.projectType;
      if (structuralChange) {
        pushUndo(prev);
      }
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
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    setProjectInternal(current => {
      undoStack.current = [...undoStack.current, current];
      return next;
    });
  }, []);

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Save project whenever it changes
  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem(getProjectStorageKey(activeProjectId), JSON.stringify(project));
      setProjectsList(prev => {
        const updated = prev.map(p => p.id === activeProjectId ? { ...p, name: project.name } : p);
        saveProjectsIndex(updated);
        return updated;
      });
    }
  }, [project, activeProjectId]);

  const createNewProject = useCallback((name?: string) => {
    const id = crypto.randomUUID();
    const newProject = { ...defaultProject, name: name || 'Nuevo Proyecto' };
    localStorage.setItem(getProjectStorageKey(id), JSON.stringify(newProject));
    setProjectsList(prev => {
      const updated = [...prev, { id, name: newProject.name }];
      saveProjectsIndex(updated);
      return updated;
    });
    setActiveProjectId(id);
    skipHistory.current = true;
    setProjectInternal(newProject);
    undoStack.current = [];
    redoStack.current = [];
    skipHistory.current = false;
  }, []);

  const switchProject = useCallback((id: string) => {
    try {
      const raw = localStorage.getItem(getProjectStorageKey(id));
      if (raw) {
        setActiveProjectId(id);
        skipHistory.current = true;
        setProjectInternal(migrateProject(JSON.parse(raw)));
        undoStack.current = [];
        redoStack.current = [];
        skipHistory.current = false;
      }
    } catch {}
  }, []);

  const deleteProject = useCallback((id: string) => {
    if (projectsList.length <= 1) return;
    localStorage.removeItem(getProjectStorageKey(id));
    setProjectsList(prev => {
      const updated = prev.filter(p => p.id !== id);
      saveProjectsIndex(updated);
      if (id === activeProjectId && updated.length > 0) {
        const newActive = updated[0];
        setActiveProjectId(newActive.id);
        try {
          const raw = localStorage.getItem(getProjectStorageKey(newActive.id));
          if (raw) {
            skipHistory.current = true;
            setProjectInternal(migrateProject(JSON.parse(raw)));
            undoStack.current = [];
            redoStack.current = [];
            skipHistory.current = false;
          }
        } catch {}
      }
      return updated;
    });
  }, [projectsList, activeProjectId]);

  const addActivity = useCallback((a: Activity) => {
    setProject(p => ({ ...p, activities: [...p.activities, a] }));
  }, [setProject]);

  const updateActivity = useCallback((a: Activity) => {
    setProject(p => ({ ...p, activities: p.activities.map(x => x.id === a.id ? a : x) }));
  }, [setProject]);

  const removeActivity = useCallback((id: string) => {
    setProject(p => ({ ...p, activities: p.activities.filter(x => x.id !== id) }));
  }, [setProject]);

  const addLookahead = useCallback((item: LookaheadItem) => {
    setProject(p => ({ ...p, lookahead: [...p.lookahead, item] }));
  }, [setProject]);

  const updateLookahead = useCallback((item: LookaheadItem) => {
    setProject(p => ({ ...p, lookahead: p.lookahead.map(x => x.id === item.id ? item : x) }));
  }, [setProject]);

  const removeLookahead = useCallback((id: string) => {
    setProject(p => ({ ...p, lookahead: p.lookahead.filter(x => x.id !== id) }));
  }, [setProject]);

  const addPACRecord = useCallback((r: PACRecord) => {
    setProject(p => ({ ...p, pacRecords: [...p.pacRecords, r] }));
  }, [setProject]);

  const updatePACRecord = useCallback((r: PACRecord) => {
    setProject(p => ({ ...p, pacRecords: p.pacRecords.map(x => x.id === r.id ? r : x) }));
  }, [setProject]);

  const removePACRecord = useCallback((id: string) => {
    setProject(p => ({ ...p, pacRecords: p.pacRecords.filter(x => x.id !== id) }));
  }, [setProject]);

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
      undo, redo, canUndo, canRedo,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};