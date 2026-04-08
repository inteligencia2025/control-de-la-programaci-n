
## Plan de implementación

### 1. Base de datos (migración)
- **Tabla `profiles`**: `user_id`, `full_name`, `status` (active/suspended), `suspended_at`, `suspension_reason`, `created_at`, `last_sign_in`
- **Tabla `user_roles`**: `user_id`, `role` (enum: admin, user)
- **Tabla `admin_audit_log`**: `admin_id`, `target_user_id`, `action`, `details`, `created_at`
- **Función `has_role`**: Security definer para verificar roles sin recursión RLS
- **Trigger**: Auto-crear perfil y rol "user" al registrarse

### 2. Edge Function: `admin-manage-users`
Operaciones admin usando `service_role` key:
- Crear usuario (con `supabase.auth.admin.createUser`)
- Suspender/Reactivar usuario (actualizar `profiles.status` + `auth.users.banned`)
- Restablecer contraseña (generar enlace o asignar temporal)
- Cambiar rol

### 3. Frontend
- **Eliminar registro** de Auth.tsx (solo login)
- **Página `/admin`**: 
  - Lista de usuarios con búsqueda y filtros
  - Diálogos para crear, suspender, reactivar, restablecer contraseña
  - Tabla de auditoría
- **Protección de ruta**: Solo accesible si el usuario tiene rol `admin`
- **Hook `useUserRole`**: Para verificar si el usuario actual es admin

### 4. Seguridad
- RLS en todas las tablas nuevas
- Solo admins pueden acceder al edge function
- Auditoría de todas las acciones
- Validación de permisos en frontend y backend
