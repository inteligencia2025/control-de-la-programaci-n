import { Save, Upload, FileSpreadsheet, HardHat, PlusCircle, Trash2, Undo2, Redo2, LogOut, Loader2, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProject } from '@/context/ProjectContext';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { RESTRICTION_CATEGORIES } from '@/types/project';

export function ProjectToolbar() {
  const { project, setProject, saveToFile, loadFromFile, activeProjectId, projectsList, createNewProject, switchProject, deleteProject, undo, redo, canUndo, canRedo, saving } = useProject();
  const { signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState('');

  const handleImport = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { await loadFromFile(file); e.target.value = ''; }
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    if (project.activities.length > 0) {
      const actData = project.activities.map(a => ({
        Actividad: a.name, 'Unidad Inicio': a.unitStart, 'Unidad Final': a.unitEnd,
        'Fecha Inicio': a.startDate, 'Ritmo (u/día)': a.rate, Categoría: a.category,
        'Buffer Días': a.bufferDays, 'Buffer Unidades': a.bufferUnits, Habilitada: a.enabled ? 'Sí' : 'No',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actData), 'Actividades');
    }
    if (project.lookahead.length > 0) {
      const laData = project.lookahead.flatMap(l =>
        RESTRICTION_CATEGORIES.flatMap(cat =>
          cat.items.map(ri => ({
            Actividad: l.activityName, Responsable: l.responsible, Semana: l.week,
            Área: cat.name, Restricción: ri.label, Estado: l.restrictions[ri.id] ? '✓' : '✗',
          }))
        )
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(laData), 'Lookahead');
    }
    if (project.pacRecords.length > 0) {
      const pacData = project.pacRecords.map(r => ({
        Semana: r.weekNumber, Fecha: r.date, Actividad: r.activityName,
        Responsable: r.responsible, Completada: r.completed ? 'Sí' : 'No',
        'Causa Incumplimiento': r.failureCause || '-',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pacData), 'PAC');
    }
    XLSX.writeFile(wb, `${project.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const closeDeleteDialog = () => { setDeleteStep(0); setConfirmText(''); };

  const confirmDelete = () => {
    if (confirmText.trim() !== project.name.trim()) return;
    deleteProject(activeProjectId);
    closeDeleteDialog();
  };

  return (
    <header className="lean-gradient px-6 py-3 flex items-center gap-4 shadow-md">
      <div className="flex items-center gap-2">
        <HardHat className="h-7 w-7 text-accent" />
        {isAdmin ? (
          <Input value={project.name} onChange={e => setProject(p => ({ ...p, name: e.target.value }))}
            className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground font-semibold text-lg w-48 placeholder:text-primary-foreground/50" />
        ) : (
          <span className="text-primary-foreground font-semibold text-lg truncate max-w-[12rem]">{project.name}</span>
        )}
      </div>

      {/* Project selector */}
      <div className="flex items-center gap-1">
        <Select value={activeProjectId} onValueChange={switchProject}>
          <SelectTrigger className="h-8 w-44 text-xs bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
            <SelectValue placeholder="Seleccionar proyecto" />
          </SelectTrigger>
          <SelectContent>
            {projectsList.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => createNewProject()} title="Nuevo proyecto">
            <PlusCircle className="h-4 w-4" />
          </Button>
        )}
        {isAdmin && projectsList.length > 1 && (
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => setDeleteStep(1)} title="Mover a papelera">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo} title="Deshacer (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo} title="Rehacer (Ctrl+Y)">
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={saveToFile} className="gap-1.5"><Save className="h-4 w-4" />Guardar</Button>
        <Button variant="secondary" size="sm" onClick={handleImport} className="gap-1.5"><Upload className="h-4 w-4" />Importar</Button>
        <Button variant="secondary" size="sm" onClick={handleExportExcel} className="gap-1.5"><FileSpreadsheet className="h-4 w-4" />Excel</Button>
        {saving && <Loader2 className="h-4 w-4 text-primary-foreground/60 animate-spin" />}
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
        {isAdmin && (
          <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => navigate('/admin')} title="Gestión de usuarios">
            <Shield className="h-4 w-4" />
          </Button>
        )}
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={signOut} title="Cerrar sesión">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      {/* Paso 1: confirmación inicial */}
      <AlertDialog open={deleteStep === 1} onOpenChange={(o) => !o && closeDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ¿Mover proyecto a papelera?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de mover el proyecto <strong>"{project.name}"</strong> a la papelera.
              Esta acción afecta todas sus actividades, lookahead y registros PAC.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); setDeleteStep(2); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Paso 2: confirmación escribiendo nombre */}
      <AlertDialog open={deleteStep === 2} onOpenChange={(o) => !o && closeDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Confirmación final
            </AlertDialogTitle>
            <AlertDialogDescription>
              Para confirmar, escribe el nombre exacto del proyecto:{' '}
              <strong className="text-foreground">{project.name}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={project.name}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={confirmText.trim() !== project.name.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
