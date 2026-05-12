# Blindar el auto-guardado para que no se pierdan actividades

Ya restauraste Fiorenza desde tu copia local — perfecto. Ahora hay que evitar que el bug se repita.

## Causa raíz
`src/context/ProjectContext.tsx` → `doSave` hace `DELETE all + INSERT` para actividades, lookahead y PAC. Si se dispara con `project.activities = []` (estado por defecto que aparece momentáneamente al cambiar de proyecto, o por una carrera entre `loadProject` y el effect de auto-save), borra todo en BD sin reinsertar nada. El guard `loadedProjectIdRef` que pusimos antes no cierra del todo la ventana.

## Cambios en `src/context/ProjectContext.tsx`

### 1. Guard anti-wipe en `doSave`
Antes de borrar/insertar cada tabla:
- Contar cuántas filas existen ya en BD para ese `projectId`.
- Si `data.activities.length === 0` y la BD tiene > 0 actividades, **abortar** todo el guardado (`console.warn` + `return`). Solo se permite guardar vacío si el usuario explícitamente borró la última (flag `intentionalEmptyRef`, ver punto 3).
- Misma regla para `lookahead` y `pac_records`.

### 2. Reemplazar `DELETE all + INSERT` por `upsert + diff`
Por cada tabla:
- `upsert` de los registros presentes en `data` (por `id`, `onConflict: 'id'`).
- `delete` solo de los `id` que ya no están: `.delete().eq('project_id', projectId).not('id', 'in', '(<lista actual>)')`.
- Así, una salvada mal disparada nunca puede destruir todo: en el peor caso no borra nada.

### 3. `dirtyRef` — no auto-guardar hasta que el usuario edite
- `dirtyRef = useRef(false)`.
- Se marca `true` solo dentro del `setProject` envuelto (acciones del usuario).
- Se resetea a `false` al final de `loadProject`, `switchProject`, `createNewProject` y tras cada `doSave` exitoso.
- El `useEffect` de auto-save chequea `dirtyRef.current` antes de llamar al debounce.
- `intentionalEmptyRef = useRef(false)` → se marca `true` solo cuando `removeActivity` deja la lista vacía, así el guard del punto 1 sabe que el vacío fue intencional. Se resetea tras el guardado.

### 4. Re-validar `loadedProjectIdRef.current === projectId` después de cada `await` dentro de `doSave`
No solo al inicio. Si durante el guardado el usuario cambió de proyecto, abortar a mitad para no contaminar otra fila.

### 5. Cancelar debounce en `beforeunload`
Listener `window.addEventListener('beforeunload', () => debouncedSave.cancel())` para evitar que un guardado a medias se dispare al cerrar.

## Verificación
- Reproducir el flujo: abrir Fiorenza → cambiar a Majestic → volver a Fiorenza → revisar Network: ningún `DELETE` debe pasar mientras el `project` esté en estado por defecto.
- Confirmar en BD (`SELECT count FROM activities WHERE project_id = …`) que el conteo se mantiene tras varios cambios de proyecto sin editar.

## Archivos tocados
- `src/context/ProjectContext.tsx` (único cambio).
