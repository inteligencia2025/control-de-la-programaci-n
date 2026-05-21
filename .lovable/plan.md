# Corregir pérdida de contratistas (y otros datos) al cerrar la app

## Causa raíz

En `src/context/ProjectContext.tsx` el guardado es debounced 1500 ms. Cuando el usuario agrega un contratista en Control PAC (`handleAddContractor` en `ProductionControl.tsx`) y cierra la pestaña, hace logout o cambia de proyecto antes de 1.5 s:

- El handler `beforeunload` (línea 544-548) **cancela** el debounce en vez de ejecutarlo.
- No se hace flush al cambiar `user` ni en `switchProject`.

Resultado: el cambio nunca llega a Supabase y al volver desde otro perfil no aparece.

## Cambios

### `src/context/ProjectContext.tsx`

1. Añadir un `latestProjectRef` que siempre tenga el último `project` (para evitar capturas obsoletas en handlers).
2. Implementar `flushSave()`:
   - Cancela el debounce pendiente.
   - Si `dirtyRef.current` y hay `activeProjectId`, ejecuta `doSave(latestProjectRef.current, activeProjectId)` y `await` el resultado.
3. Reemplazar el handler `beforeunload`:
   - En vez de `debouncedSave.cancel()`, disparar `doSave(latestProjectRef.current, activeProjectId)` sin await (la petición fetch normalmente alcanza a salir; se complementa con `visibilitychange`).
   - Agregar listener `visibilitychange`: cuando `document.visibilityState === 'hidden'`, llamar `flushSave()`. Esto cubre PWAs / móviles donde `beforeunload` no dispara.
4. En `switchProject` y en el `useEffect` de cambio de `user` (logout), llamar `await flushSave()` antes de cancelar el debounce y limpiar refs, para que un cambio en vuelo se persista antes de cargar otro proyecto / vaciar estado.
5. Exponer `flushSave` en el contexto (`ProjectContextType` + valor del provider).

### `src/components/ProductionControl.tsx`

En `handleAddContractor` y `handleAddCause`, tras `setProject`, llamar `flushSave()` para persistir inmediatamente. Estos son cambios pequeños y críticos, no tiene sentido esperar 1.5 s.

## Notas técnicas

- `doSave` ya valida `loadedProjectIdRef.current === projectId` y tiene el anti-wipe guard, así que llamarlo desde `flushSave` es seguro.
- `flushSave` no rompe el `dirtyRef` para futuros cambios: `doSave` ya lo limpia al final si tiene éxito.
- No se modifican RLS, esquema ni lógica de scheduling/UI. Solo persistencia cliente.
