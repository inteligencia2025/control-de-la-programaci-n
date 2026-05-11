## Problema

En el módulo de Control PAC, al trabajar en el proyecto "Arboletes del castillo Etapa 3" (y en general cuando se cambia de proyecto activo), la información ingresada se borra.

## Causa raíz

En `src/context/ProjectContext.tsx`, el guardado automático (auto-save) usa este efecto:

```ts
useEffect(() => {
  if (!loaded || !activeProjectId || !user || !loadedFromDbRef.current) return;
  debouncedSave(project, activeProjectId);
}, [project, activeProjectId, loaded, user, debouncedSave]);
```

Cuando se cambia de proyecto con `switchProject(id)`:

1. `setActiveProjectId(nuevoId)` cambia el id activo de inmediato.
2. En ese mismo render `project` aún contiene los **datos del proyecto anterior** (la carga es asíncrona).
3. El efecto se dispara con la combinación `(datosViejos, nuevoId)` y agenda un guardado debounced (1.5s) que escribiría los datos del proyecto anterior dentro de la fila del nuevo proyecto (un PATCH + DELETE de actividades/lookahead/PAC + INSERT de los datos viejos).
4. `loadProject(nuevoId)` termina y reemplaza el state; el efecto vuelve a disparar y normalmente reprograma el debounce, pero si la carga toma más de 1.5s o el guardado ya está en vuelo, **se sobrescribe el proyecto nuevo con los datos del anterior** o se borran los registros existentes.

`loadedFromDbRef.current` solo protege la primera carga inicial; no se reinicia en cambios de proyecto, por lo que no actúa como salvaguarda.

Esto explica por qué el síntoma aparece justo en Arboletes (proyecto al que se cambia desde Majestic en los logs de red): al alternar entre proyectos se ejecutan PATCH + DELETE de actividades, lookahead y PAC sobre Arboletes con la combinación incorrecta, eliminando datos recién ingresados que aún no se habían persistido.

## Solución (sólo frontend, sin cambios de schema)

En `src/context/ProjectContext.tsx`:

1. **Añadir un ref `loadedProjectIdRef`** que guarde el id del proyecto cuyos datos están actualmente cargados en `project`.
2. **Marcar "no listo para guardar" durante cambios y cargas**:
   - Al inicio de `switchProject`, antes de `setActiveProjectId`, poner `loadedFromDbRef.current = false` y `loadedProjectIdRef.current = ''`.
   - Al inicio de `loadProject`, asegurar también `loadedFromDbRef.current = false`.
   - Al final de `loadProject`, después de `setProjectInternal(projectData)`, asignar `loadedProjectIdRef.current = projectId` y `loadedFromDbRef.current = true`.
3. **Endurecer el efecto de auto-save** para que sólo guarde cuando los datos cargados correspondan al proyecto activo:

```ts
useEffect(() => {
  if (!loaded || !activeProjectId || !user) return;
  if (!loadedFromDbRef.current) return;
  if (loadedProjectIdRef.current !== activeProjectId) return;
  debouncedSave(project, activeProjectId);
}, [project, activeProjectId, loaded, user, debouncedSave]);
```

4. **Cancelar guardados pendientes al cambiar de proyecto** para evitar que un debounce previo se ejecute sobre el nuevo id. Modificar `useDebouncedCallback` para exponer un `cancel()`, e invocarlo dentro de `switchProject`, `createNewProject`, `deleteProject` (cuando hay reasignación de activo) y al inicio de la carga inicial cuando hay cambio de `user`.

5. **(Defensa adicional)** En `doSave`, comparar `projectId` recibido contra `loadedProjectIdRef.current`; si no coinciden, retornar sin hacer nada. Esto evita cualquier escritura cruzada incluso si se cuela un timer.

## Archivos a modificar

- `src/context/ProjectContext.tsx` (único cambio).

## Verificación

- Cargar Majestic, ingresar un PAC, cambiar a Arboletes, verificar que Arboletes mantiene su estado real y Majestic conserva el PAC ingresado.
- En Arboletes: agregar varios registros PAC seguidos, esperar el "Guardando…", refrescar la página y confirmar que los datos persisten.
- Revisar pestaña Network: al cambiar de proyecto no debe haber un PATCH/DELETE/INSERT que envíe datos del proyecto anterior contra el `project_id` del nuevo proyecto.
