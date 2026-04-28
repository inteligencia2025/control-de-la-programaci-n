Corregiré el módulo de Control de Producción para que, cuando una semana ya fue calificada, conserve la fecha real de esa calificación y no cambie si después se modifica la programación o las fechas de actividades.

Cambios propuestos:

1. Usar la fecha guardada en cada registro PAC como referencia histórica
- Actualmente la app calcula el rango de la semana con base en las actividades del LOB cada vez que se renderiza.
- Eso hace que una semana ya calificada pueda mostrar otra fecha si cambia el inicio del proyecto o las actividades.
- Ajustaré la lógica para que, si la semana tiene registros PAC, el rango se calcule desde la fecha guardada del registro, no desde el LOB actualizado.

2. Guardar la fecha correcta al crear/importar calificaciones
- Al agregar una actividad PAC manualmente o cargar desde LOB, el campo `date` se fijará con la fecha de inicio de esa semana evaluada.
- Para semana 1 del 20 al 24 de abril, los registros quedarán anclados al 20 de abril.
- Si se arrastran pendientes a la siguiente semana, se guardará la fecha de inicio de la nueva semana.

3. Mostrar y exportar fechas estables
- El encabezado “Semana X: fecha inicio — fecha fin” usará la fecha anclada cuando exista calificación.
- PDF, Excel y los indicadores mensuales usarán esa misma fecha histórica para evitar cambios posteriores.

Detalles técnicos:

- Archivo principal: `src/components/ProductionControl.tsx`.
- Crearé una función auxiliar para obtener el rango de una semana PAC:
  - Si existen registros para esa semana con `date`, usa la fecha mínima guardada como inicio.
  - Si no existen registros, mantiene el cálculo actual desde el LOB.
  - El fin de semana será inicio + 4 días para mostrar lunes a viernes.
- Actualizaré `handleAdd`, `handleLoadFromLOB` y `handleCarryOverPending` para asignar `date` con el inicio real de la semana evaluada.
- No se requiere cambio de estructura de base de datos porque `pac_records.date` ya existe y se persiste.