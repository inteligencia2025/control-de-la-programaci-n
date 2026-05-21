## Plan

1. Ajustar el guardado inmediato de contratistas en Control PAC
   - Cambiar el flujo de `handleAddContractor` para construir el siguiente estado del proyecto y enviarlo directamente a un guardado inmediato.
   - Evitar depender de `setTimeout + flushSave()`, porque al cambiar de pestaña el navegador puede pausar ese temporizador antes de que alcance a guardar.

2. Hacer el guardado manual más confiable en el contexto del proyecto
   - Agregar una función de guardado inmediato que reciba explícitamente el `ProjectData` actualizado.
   - Reutilizar la lógica existente de `doSave`, respetando `dirtyRef`, proyecto activo, anti-wipe guard y reglas actuales de persistencia.
   - Mantener `flushSave()` para cierres/cambios de pestaña, pero hacerlo compatible con el nuevo guardado explícito.

3. Aplicar el mismo patrón a causas personalizadas
   - Actualizar `handleAddCause` igual que contratistas, ya que usa el mismo flujo de guardado crítico.

4. Validar el resultado
   - Verificar que TypeScript compile mediante el chequeo automático del entorno.
   - Confirmar en el código que el contratista queda incluido en el payload guardado antes de limpiar el input o depender del debounce.

## Detalles técnicos

La causa probable es una carrera de estado: `setProject(...)` actualiza React de forma asíncrona, pero `flushSave()` lee `latestProjectRef.current`. Si el usuario cambia de pestaña inmediatamente, el `setTimeout` puede no ejecutarse o puede leer todavía el proyecto anterior, guardando sin el contratista nuevo. La solución es guardar el objeto `nextProject` explícito en el mismo handler que lo crea.