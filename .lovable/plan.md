
## Objetivo

Agregar dentro de **Control PAC** una nueva sub-pestaña **"Avance de obra"** que replica el formato del Excel: una matriz de actividades × unidades donde cada celda guarda un estado (E, P, R, N/A), calcula % de avance real por actividad y total, y se compara contra el % programado del LOB.

## Alcance funcional

### 1. Vistas según tipo de proyecto

- **Casas**: una sola matriz.
  - Filas: actividades (LOB + extras).
  - Columnas: unidades 1..N (de `defaultUnits` / `buildingConfig`).
  - Encabezados de grupo por categoría (Estructura, Acabados, Fachada, Urbanismo…).

- **Edificios**: una matriz por actividad, agrupadas en pestañas o acordeones.
  - Filas: pisos (de mayor a menor, como en el Excel).
  - Columnas: apartamentos por piso (1..unitsPerFloor).
  - Si `hasCubierta`, fila adicional para cubierta/muros cubierta/ascensores.
  - Pie de cada matriz: total de unidades y % avance ejecutadas.

### 2. Estados por celda

Ciclo con click: vacío → **E** (verde) → **P** (azul) → **R** (rojo) → **N/A** (gris) → vacío.
Solo los 4 estados del Excel, sin %, sin fechas.

### 3. Actividades (LOB + extras)

- Se precargan automáticamente las actividades activas del LOB del proyecto.
- Botón **"Agregar actividad extra"** para items no repetitivos (Urbanismo, Acceso principal, Nichos, etc.) — solo viven en el módulo de avance, no afectan LOB.
- Reordenar y eliminar extras; ocultar/mostrar actividades del LOB.

### 4. Cálculos

- **% Avance Real por actividad** = `count(E) / count(celdas aplicables, excluyendo N/A)`.
- **% Programado a la fecha** por actividad: derivado del LOB usando `startDate`, `rate`, `unitStart`, `unitEnd` y la fecha actual (qué unidades deberían estar completas hoy).
- **Desviación** = Real − Programado (verde si ≥ 0, rojo si < 0).
- **% Avance total del proyecto** = promedio ponderado (por unidades aplicables) de todas las actividades.
- Tarjetas resumen arriba: % Real, % Programado, Desviación, # actividades atrasadas.

### 5. Persistencia

Nueva tabla `progress_cells` en Lovable Cloud:
- `project_id`, `activity_key` (id LOB o extra), `unit_number` (entero), `status` ('E'|'P'|'R'|'NA'), `updated_at`.
- Tabla `progress_extra_activities` para extras: `project_id`, `name`, `category`, `sort_order`.
- RLS igual al resto: dueño del proyecto o asignado.
- Guardado debounced al cambiar celdas (mismo patrón que LOB/PAC).

### 6. UX

- Sticky header con nombres de unidades, sticky first column con actividades.
- Leyenda fija de estados.
- Botones: exportar a Excel (mismo formato), limpiar fila, marcar fila completa.
- Tooltip en celda con fecha del último cambio y unidad/actividad.

## Cambios técnicos

### Archivos nuevos
- `src/components/ProgressTracking.tsx` — contenedor con switch casas/edificios.
- `src/components/ProgressMatrixHouses.tsx` — matriz única.
- `src/components/ProgressMatrixBuildings.tsx` — matriz por actividad.
- `src/components/ProgressSummary.tsx` — tarjetas Real vs Programado.
- `src/utils/progressUtils.ts` — cálculo de % programado desde LOB y % real desde celdas.

### Archivos modificados
- `src/components/ProductionControl.tsx` — agregar sub-tab "Avance" dentro del Tabs existente.
- `src/types/project.ts` — tipos `ProgressCell`, `ProgressExtraActivity`, `ProgressStatus`.
- `src/context/ProjectContext.tsx` — cargar/guardar progress_cells y extras.
- `src/integrations/supabase/types.ts` — se regenera tras la migración.

### Migración Supabase
- Crear `progress_cells` y `progress_extra_activities` con RLS basada en `projects.user_id` / `is_assigned_to_project`.
- Índices `(project_id, activity_key)` para lectura rápida.

## Lo que NO entra en este plan

- % parciales por celda, fechas por celda, sincronización bidireccional con PAC, fotos por unidad, historial de cambios. Si los quieres después se agregan en una segunda iteración.
