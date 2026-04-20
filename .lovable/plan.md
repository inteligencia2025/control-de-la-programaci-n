

# Plan: Papelera de proyectos (soft delete + restauración)

## Objetivo
Evitar la pérdida definitiva de proyectos al eliminarlos. En lugar de borrado físico, los proyectos se marcan como eliminados y pueden restaurarse desde el panel de administración durante 30 días.

## Cambios en la base de datos

Agregar dos columnas a la tabla `projects`:
- `deleted_at` (timestamp, nullable) — marca cuándo fue eliminado
- `deleted_by` (uuid, nullable) — quién lo eliminó

Actualizar las políticas RLS:
- `SELECT` normal de proyectos: solo devuelve los que tienen `deleted_at IS NULL` (los activos).
- Nueva política `SELECT` para administradores: pueden ver también los eliminados (para la papelera).
- Las políticas de `activities`, `lookahead_items`, `pac_records` se mantienen igual (siguen ligadas al proyecto, simplemente no aparecerán mientras esté en la papelera).

Cambiar el comportamiento de "Eliminar":
- En `ProjectContext.deleteProject` → en lugar de `DELETE FROM projects`, hacer `UPDATE projects SET deleted_at = now(), deleted_by = auth.uid()`.
- Los datos asociados (actividades, lookahead, PAC) se conservan intactos.

Borrado definitivo automático opcional (no incluido en este plan): un job que limpie proyectos con `deleted_at` mayor a 30 días. Por ahora, los administradores podrán borrar definitivamente desde la papelera.

## Cambios en la interfaz

### Panel de administración (`src/pages/Admin.tsx`)
Añadir nueva pestaña **"Papelera"** que muestre:
- Tabla con: nombre del proyecto, eliminado por (nombre del admin), fecha de eliminación, días restantes hasta borrado definitivo.
- Botón **Restaurar** por fila → vuelve a poner `deleted_at = NULL`. El proyecto reaparece en la lista.
- Botón **Eliminar definitivamente** por fila → ejecuta `DELETE` real (con confirmación). Esto sí elimina los datos en cascada.

### Toolbar (`src/components/ProjectToolbar.tsx`)
- Cambiar el tooltip del botón de basurero a "Mover a papelera".
- Mostrar un toast tras eliminar: *"Proyecto movido a papelera. Puede restaurarse desde Administración → Papelera durante 30 días."*

### Contexto (`src/context/ProjectContext.tsx`)
- `deleteProject`: ejecuta UPDATE en lugar de DELETE.
- `loadProjectsList`: filtra automáticamente `deleted_at IS NULL` (la RLS ya lo garantiza, pero se filtra explícito en la query también).
- Agregar `restoreProject(id)` y `permanentlyDeleteProject(id)` para uso desde el panel admin.

## Sobre el proyecto que ya eliminaste
Este plan **no recupera el proyecto que ya borraste** — esos datos ya fueron eliminados de la base de datos. Lo que evita es que vuelva a pasar. Si necesitas recuperar ese proyecto específico, la única vía sería un respaldo previo de la base de datos, que actualmente no está configurado.

## Resumen de archivos
- Nueva migración: agregar `deleted_at`, `deleted_by` y actualizar políticas RLS.
- `src/context/ProjectContext.tsx`: modificar `deleteProject`, agregar `restoreProject` y `permanentlyDeleteProject`.
- `src/pages/Admin.tsx`: nueva pestaña "Papelera".
- `src/components/ProjectToolbar.tsx`: ajustar tooltip y mensaje al eliminar.

