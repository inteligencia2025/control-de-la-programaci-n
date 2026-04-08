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
import {
  Users, UserPlus, Shield, ShieldOff, KeyRound, ArrowLeft, Search,
  RefreshCw, ClipboardList, CheckCircle2, XCircle, AlertTriangle
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
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('No autenticado');

    const { data, error } = await supabase.functions.invoke('admin-manage-users', { body });
    if (error) throw new Error(error.message);
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

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadAudit();
    }
  }, [isAdmin, loadUsers, loadAudit]);

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

  const handleCreate = async () => {
    if (!newEmail || !newName || !newPassword) {
      toast({ title: 'Error', description: 'Todos los campos son obligatorios', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Error', description: 'La contraseña debe tener al menos 8 caracteres', variant: 'destructive' });
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
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
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

  const handleChangeRole = async (u: AdminUser, newRole: string) => {
    if (u.id === user.id) {
      toast({ title: 'Error', description: 'No puedes cambiar tu propio rol', variant: 'destructive' });
      return;
    }
    try {
      await callAdmin({ action: 'change_role', user_id: u.id, new_role: newRole });
      toast({ title: 'Éxito', description: 'Rol actualizado' });
      loadUsers(); loadAudit();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
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
              <h1 className="text-lg font-semibold text-foreground">Gestión de Usuarios</h1>
              <p className="text-xs text-muted-foreground">Panel de administración</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadUsers(); loadAudit(); }}>
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
    </div>
  );
};

export default Admin;
