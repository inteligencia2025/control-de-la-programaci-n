## Diagnóstico

El video sí muestra el problema: al añadir **“Jorge Eduardo Cardona”**, el nombre aparece en la lista y en el selector, pero luego al cambiar de proyecto/pestaña vuelve a desaparecer.

La señal clave está en las peticiones de red: después del flujo se están enviando `PATCH` a `projects` con `contractors: []`. Es decir, no es solo un problema visual: una sincronización posterior está sobrescribiendo en la base el arreglo de contratistas con una versión vieja/vacía.

## Plan de corrección

1. **Proteger los metadatos del proyecto contra sobrescrituras antiguas**
   - En el guardado general, evitar que una versión vieja del estado pueda pisar `contractors`, `responsibles` o `customFailureCauses` cuando solo se están guardando actividades/PAC/lookahead.
   - Esto corrige el caso visto en red: guardados posteriores no deben volver a mandar `contractors: []` si ya existe una lista más reciente.

2. **Agregar operaciones dedicadas para listas simples**
   - Crear funciones específicas en el contexto para añadir contratistas y causas personalizadas.
   - Estas funciones actualizarán solo la columna necesaria del proyecto, con el arreglo final explícito, sin ejecutar toda la sincronización de actividades/PAC.

3. **Actualizar Control PAC para usar esas operaciones**
   - `handleAddContractor` usará la nueva función dedicada.
   - `handleAddCause` usará la misma estrategia.
   - Mantener actualización inmediata en pantalla para que el selector muestre el contratista recién agregado.

4. **Evitar duplicados y entradas vacías**
   - Normalizar el nombre con `trim()`.
   - No añadir el mismo contratista dos veces.

5. **Validación**
   - Confirmar en el código que añadir contratista ya no dispara un guardado completo con datos viejos.
   - Verificar que el payload de guardado dedicado incluya el nuevo contratista y que los guardados posteriores no puedan limpiar la lista.