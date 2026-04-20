import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Users, UserPlus, Shield, ShieldOff, KeyRound, ArrowLeft, Search,
  RefreshCw, ClipboardList, CheckCircle2, XCircle, AlertTriangle,
  FolderOpen, UserCheck, UserMinus, Trash2, RotateCcw, Trash
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  status: string;
  role: string;
  created_at: string;
  last_sign_in: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
}

interface AuditEntry {
  id: string;
  admin_id: string;
  target_user_id: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface ProjectEntry {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  user_created: 'Usuario creado',
  user_suspended: 'Usuario suspendido',
  user_reactivated: 'Usuario reactivado',
  password_reset: 'Contraseña restablecida',
  role_changed: 'Rol cambiado',
  profile_updated: 'Perfil actualizado',
};

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');

  // Projects tab
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectEntry | null>(null);
  const [projectAssignments, setProjectAssignments] = useState<string[]>([]); // user_ids assigned
  const [pendingAssignments, setPendingAssignments] = useState<string[]>([]);
  const [assignSearch, setAssignSearch] = useState('');
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  // Trash bin
  const [deletedProjects, setDeletedProjects] = useState<ProjectEntry[]>([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [trashSearch, setTrashSearch] = useState('');
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [projectToPermDelete, setProjectToPermDelete] = useState<ProjectEntry | null>(null);
  const [trashActionLoading, setTrashActionLoading] = useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Create form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [suspendReason, setSuspendReason] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const callAdmin = useCallback(async (body: Record<string, unknown>) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
    const token = sessionData?.session?.access_token;
    if (sessionError || !token) {
      throw new Error('Sesión expirada. Por favor, vuelve a iniciar sesión.');
    }

    const { data, error } = await supabase.functions.invoke('admin-manage-users', { body });
    if (error) {
      let msg = 'Error al comunicarse con el servidor';
      if (data?.error) {
        msg = data.error;
      } else {
        try {
          const match = error.message?.match(/\{.*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed?.error) msg = parsed.error;
          } else if (error.message) {
            msg = error.message;
          }
        } catch {
          if (error.message) msg = error.message;
        }
      }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingData(true);
    try {
      const data = await callAdmin({ action: 'list_users' });
      setUsers(data.users || []);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setLoadingData(false);
  }, [callAdmin, toast]);

  const loadAudit = useCallback(async () => {
    const { data } = await supabase
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setAuditLog((data as AuditEntry[]) || []);
  }, []);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    const { data } = await supabase
      .from('projects')
      .select('id, name, user_id, created_at')
      .order('created_at', { ascending: false });
    setProjects((data as ProjectEntry[]) || []);
    setLoadingProjects(false);
  }, []);

  const loadDeletedProjects = useCallback(async () => {
    setLoadingDeleted(true);
    const { data } = await supabase
      .from('projects')
      .select('id, name, user_id, created_at, deleted_at, deleted_by')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    setDeletedProjects((data as ProjectEntry[]) || []);
    setLoadingDeleted(false);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadAudit();
      loadProjects();
      loadDeletedProjects();
    }
  }, [isAdmin, loadUsers, loadAudit, loadProjects, loadDeletedProjects]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const filteredUsers = users.filter(u => {
    const matchesSearch = !search ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'all' || u.status === filterStatus;
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const filteredProjects = projects.filter(p =>
    !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (!/[A-Z]/.test(password)) return 'La contraseña debe contener al menos una letra mayúscula';
    if (!/[a-z]/.test(password)) return 'La contraseña debe contener al menos una letra minúscula';
    if (!/[0-9]/.test(password)) return 'La contraseña debe contener al menos un número';
    return null;
  };

  const handleCreate = async () => {
    if (!newEmail || !newName || !newPassword) {
      toast({ title: 'Campos requeridos', description: 'Todos los campos son obligatorios', variant: 'destructive' });
      return;
    }
    const pwError = validatePassword(newPassword);
    if (pwError) {
      toast({ title: 'Contraseña inválida', description: pwError, variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      await callAdmin({ action: 'create_user', email: newEmail, password: newPassword, full_name: newName, role: newRole });
      toast({ title: 'Éxito', description: 'Usuario creado correctamente' });
      setCreateOpen(false);
      setNewEmail(''); setNewName(''); setNewPassword(''); setNewRole('user');
      loadUsers(); loadAudit();
    } catch (err: any) {
      toast({ title: 'Error al crear usuario', description: err.message, variant: 'destructive' });
    }
    setActionLoading(false);
  };

  const handleSuspend = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await callAdmin({ action: 'suspend_user', user_id: selectedUser.id, reason: suspendReason });
      toast({ title: 'Éxito', description: 'Usuario suspendido' });
      setSuspendOpen(false); setSuspendReason('');
      loadUsers(); loadAudit();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setActionLoading(false);
  };

  const handleReactivate = async (u: AdminUser) => {
    try {
      await callAdmin({ action: 'reactivate_user', user_id: u.id });
      toast({ title: 'Éxito', description: 'Usuario reactivado' });
      loadUsers(); loadAudit();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (resetPassword) {
      const pwError = validatePassword(resetPassword);
      if (pwError) {
        toast({ title: 'Contraseña inválida', description: pwError, variant: 'destructive' });
        return;
      }
    }
    setActionLoading(true);
    try {
      await callAdmin({
        action: 'reset_password',
        user_id: selectedUser.id,
        ...(resetPassword ? { new_password: resetPassword } : {}),
      });
      toast({ title: 'Éxito', description: resetPassword ? 'Contraseña actualizada' : 'Enlace de restablecimiento generado' });
      setResetPwOpen(false); setResetPassword('');
      loadAudit();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setActionLoading(false);
  };

  const handleChangeRole = async (u: AdminUser, newRoleValue: string) => {
    if (u.id === user.id) {
      toast({ title: 'Error', description: 'No puedes cambiar tu propio rol', variant: 'destructive' });
      return;
    }
    if (u.role === newRoleValue) return;
    setActionLoading(true);
    try {
      await callAdmin({ action: 'change_role', user_id: u.id, new_role: newRoleValue });
      toast({ title: 'Éxito', description: `Rol cambiado a ${newRoleValue === 'admin' ? 'Administrador' : 'Usuario'}` });
      loadUsers(); loadAudit();
    } catch (err: any) {
      toast({ title: 'Error al cambiar rol', description: err.message, variant: 'destructive' });
    }
    setActionLoading(false);
  };

  // Project assignment handlers
  const openAssignDialog = async (project: ProjectEntry) => {
    setSelectedProject(project);
    setAssignSearch('');
    // Load current assignments
    const { data } = await supabase
      .from('project_assignments')
      .select('user_id')
      .eq('project_id', project.id);
    const assignedIds = (data || []).map(d => d.user_id);
    setProjectAssignments(assignedIds);
    setPendingAssignments(assignedIds);
    setAssignDialogOpen(true);
  };

  const toggleUserAssignment = (userId: string) => {
    setPendingAssignments(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const saveAssignments = async () => {
    if (!selectedProject) return;
    setSavingAssignments(true);
    try {
      const toAdd = pendingAssignments.filter(id => !projectAssignments.includes(id));
      const toRemove = projectAssignments.filter(id => !pendingAssignments.includes(id));

      if (toRemove.length > 0) {
        for (const userId of toRemove) {
          await supabase
            .from('project_assignments')
            .delete()
            .eq('project_id', selectedProject.id)
            .eq('user_id', userId);
        }
      }

      if (toAdd.length > 0) {
        await supabase
          .from('project_assignments')
          .insert(toAdd.map(userId => ({
            project_id: selectedProject.id,
            user_id: userId,
          })));
      }

      setProjectAssignments(pendingAssignments);
      toast({ title: 'Éxito', description: 'Asignaciones actualizadas correctamente' });
      setAssignDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setSavingAssignments(false);
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getUserEmail = (userId: string | null) => {
    if (!userId) return '—';
    const u = users.find(x => x.id === userId);
    return u?.email || userId.slice(0, 8) + '...';
  };

  const getOwnerName = (userId: string) => {
    const u = users.find(x => x.id === userId);
    return u?.full_name || u?.email || '—';
  };

  const filteredAssignUsers = users.filter(u =>
    !assignSearch ||
    u.full_name.toLowerCase().includes(assignSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(assignSearch.toLowerCase())
  );

  const filteredDeleted = deletedProjects.filter(p =>
    !trashSearch || p.name.toLowerCase().includes(trashSearch.toLowerCase())
  );

  const daysRemaining = (deletedAt: string | null | undefined) => {
    if (!deletedAt) return 0;
    const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(30 - elapsed));
  };

  const restoreProject = async (p: ProjectEntry) => {
    setTrashActionLoading(true);
    const { error } = await supabase
      .from('projects')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', p.id);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo restaurar el proyecto', variant: 'destructive' });
    } else {
      toast({ title: 'Proyecto restaurado', description: `"${p.name}" vuelve a estar disponible.` });
      loadProjects();
      loadDeletedProjects();
    }
    setTrashActionLoading(false);
  };

  const permanentlyDelete = async () => {
    if (!projectToPermDelete) return;
    setTrashActionLoading(true);
    // Delete dependent rows first (no FK cascade configured)
    await supabase.from('activities').delete().eq('project_id', projectToPermDelete.id);
    await supabase.from('lookahead_items').delete().eq('project_id', projectToPermDelete.id);
    await supabase.from('pac_records').delete().eq('project_id', projectToPermDelete.id);
    await supabase.from('project_assignments').delete().eq('project_id', projectToPermDelete.id);
    const { error } = await supabase.from('projects').delete().eq('id', projectToPermDelete.id);
    if (error) {
      toast({ title: 'Error', description: 'No se pudo eliminar definitivamente', variant: 'destructive' });
    } else {
      toast({ title: 'Proyecto eliminado', description: 'Los datos se han borrado permanentemente.' });
      loadDeletedProjects();
    }
    setPermDeleteOpen(false);
    setProjectToPermDelete(null);
    setTrashActionLoading(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="lean-gradient p-2 rounded-lg">
              <Shield className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Panel de Administración</h1>
              <p className="text-xs text-muted-foreground">Gestión de usuarios y proyectos</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadUsers(); loadAudit(); loadProjects(); loadDeletedProjects(); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualizar
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> Crear usuario
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Usuarios
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" /> Proyectos
            </TabsTrigger>
            <TabsTrigger value="trash" className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Papelera
              {deletedProjects.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{deletedProjects.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Auditoría
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o correo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="suspended">Suspendidos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="user">Usuario</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {loadingData ? (
                  <div className="p-8 text-center text-muted-foreground">Cargando usuarios...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Correo</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Creado</TableHead>
                        <TableHead>Último acceso</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No se encontraron usuarios
                          </TableCell>
                        </TableRow>
                      ) : filteredUsers.map(u => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell>
                            <Select
                              value={u.role}
                              onValueChange={(v) => handleChangeRole(u, v)}
                              disabled={u.id === user?.id}
                            >
                              <SelectTrigger className="w-[130px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">
                                  <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Admin</span>
                                </SelectItem>
                                <SelectItem value="user">Usuario</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {u.status === 'active' ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Activo
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" /> Suspendido
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(u.created_at)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(u.last_sign_in)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {u.status === 'active' && u.id !== user?.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => { setSelectedUser(u); setSuspendOpen(true); }}
                                >
                                  <ShieldOff className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {u.status === 'suspended' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-emerald-600"
                                  onClick={() => handleReactivate(u)}
                                >
                                  <Shield className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setSelectedUser(u); setResetPwOpen(true); }}
                              >
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar proyectos..."
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {loadingProjects ? (
                  <div className="p-8 text-center text-muted-foreground">Cargando proyectos...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proyecto</TableHead>
                        <TableHead>Propietario</TableHead>
                        <TableHead>Creado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProjects.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No se encontraron proyectos
                          </TableCell>
                        </TableRow>
                      ) : filteredProjects.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-muted-foreground">{getOwnerName(p.user_id)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => openAssignDialog(p)}
                            >
                              <Users className="h-3.5 w-3.5" /> Gestionar usuarios
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trash Bin Tab */}
          <TabsContent value="trash">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar en papelera..."
                  value={trashSearch}
                  onChange={e => setTrashSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="text-xs text-muted-foreground self-center">
                Los proyectos eliminados se conservan 30 días antes del borrado definitivo.
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {loadingDeleted ? (
                  <div className="p-8 text-center text-muted-foreground">Cargando papelera...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proyecto</TableHead>
                        <TableHead>Eliminado por</TableHead>
                        <TableHead>Fecha de eliminación</TableHead>
                        <TableHead>Días restantes</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDeleted.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            La papelera está vacía
                          </TableCell>
                        </TableRow>
                      ) : filteredDeleted.map(p => {
                        const days = daysRemaining(p.deleted_at);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-muted-foreground">{getOwnerName(p.deleted_by || '')}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(p.deleted_at || null)}</TableCell>
                            <TableCell>
                              <Badge variant={days <= 7 ? 'destructive' : 'outline'} className="text-xs">
                                {days} días
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => restoreProject(p)}
                                  disabled={trashActionLoading}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => { setProjectToPermDelete(p); setPermDeleteOpen(true); }}
                                  disabled={trashActionLoading}
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> Bitácora de auditoría
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Acción</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Usuario afectado</TableHead>
                      <TableHead>Detalles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLog.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          Sin registros de auditoría
                        </TableCell>
                      </TableRow>
                    ) : auditLog.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{formatDate(entry.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{ACTION_LABELS[entry.action] || entry.action}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{getUserEmail(entry.admin_id)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{getUserEmail(entry.target_user_id)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {JSON.stringify(entry.details)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear nuevo usuario</DialogTitle>
            <DialogDescription>Complete los datos para crear un nuevo usuario en el sistema.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre completo *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Juan Pérez" />
            </div>
            <div>
              <Label>Correo electrónico *</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="usuario@ejemplo.com" />
            </div>
            <div>
              <Label>Contraseña temporal *</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
            </div>
            <div>
              <Label>Rol</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuario estándar</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={actionLoading}>
              {actionLoading ? 'Creando...' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend User Dialog */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Suspender usuario
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de suspender a <strong>{selectedUser?.full_name || selectedUser?.email}</strong>?
              El usuario no podrá iniciar sesión mientras esté suspendido.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motivo de suspensión (opcional)</Label>
            <Textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Ingrese el motivo..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={actionLoading}>
              {actionLoading ? 'Suspendiendo...' : 'Suspender usuario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPwOpen} onOpenChange={setResetPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
            <DialogDescription>
              Restableciendo contraseña de <strong>{selectedUser?.full_name || selectedUser?.email}</strong>.
              Deje vacío para generar un enlace de restablecimiento.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Nueva contraseña temporal (opcional)</Label>
            <Input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Mínimo 8 caracteres o vacío para enlace" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPwOpen(false)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={actionLoading}>
              {actionLoading ? 'Procesando...' : resetPassword ? 'Asignar contraseña' : 'Generar enlace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Users to Project Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Asignar usuarios
            </DialogTitle>
            <DialogDescription>
              Proyecto: <strong>{selectedProject?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar usuarios..."
              value={assignSearch}
              onChange={e => setAssignSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex-1 overflow-y-auto border rounded-md divide-y max-h-[400px]">
            {filteredAssignUsers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">No se encontraron usuarios</div>
            ) : filteredAssignUsers.map(u => {
              const isAssigned = pendingAssignments.includes(u.id);
              const isOwner = selectedProject?.user_id === u.id;
              return (
                <label
                  key={u.id}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${isOwner ? 'opacity-60' : ''}`}
                >
                  <Checkbox
                    checked={isAssigned || isOwner}
                    disabled={isOwner}
                    onCheckedChange={() => !isOwner && toggleUserAssignment(u.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.full_name || '—'}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                  </div>
                  {isOwner && (
                    <Badge variant="outline" className="text-xs shrink-0">Propietario</Badge>
                  )}
                  {isAssigned && !isOwner && (
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs shrink-0">
                      <UserCheck className="h-3 w-3 mr-1" /> Asignado
                    </Badge>
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>{pendingAssignments.length} usuario(s) asignado(s)</span>
            {pendingAssignments.length !== projectAssignments.length ||
             !pendingAssignments.every(id => projectAssignments.includes(id)) ? (
              <Badge variant="outline" className="text-xs">Cambios sin guardar</Badge>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveAssignments} disabled={savingAssignments}>
              {savingAssignments ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
