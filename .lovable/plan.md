## Objetivo

Convertir el Gantt actual (escala diaria de días laborales) en un **resumen mensual del LOB**, donde 1 mes = 4 semanas calendario (28 días). Una sola barra por categoría, con duraciones fraccionales en meses.

## Cambios en `src/components/GanttChart.tsx`

### 1. Cambiar la escala de tiempo

- Constante `MONTH_DAYS = 28` (4 semanas calendario).
- Calcular `projectStart` y `projectEndDate` en fechas calendario reales (no en workdays):
  - `projectStart` = fecha mínima entre todas las actividades habilitadas (ya se calcula).
  - Para cada actividad calcular `endDate` real (sumando workdays con `advanceWorkdays` o usando `endDate` si existe).
- `totalCalDays = ceil((projectEndDate - projectStart) / 1 día)`.
- `totalMonths = totalCalDays / 28` (fraccional, redondeado hacia arriba para el ancho del eje).

### 2. Eje X mensual

- Eliminar la fila de etiquetas diarias (`workdays`, `DAY_H`) y la fila "Mes N" + "MMM yy" basada en días.
- Generar columnas de meses: `numMonths = ceil(totalCalDays / 28)`.
- Cada columna tiene ancho fijo (ej. `MONTH_W = 90px`).
- Header en dos filas:
  - Fila 1: "Mes 1, Mes 2, …, Mes N".
  - Fila 2: etiqueta de mes calendario aproximado (`MMM yy` de `projectStart + i*28 días`) para contexto.

### 3. Barras por categoría (resumen)

Eliminar la lógica de expandir/colapsar y la renderización de actividades individuales. Para cada grupo en `groups`:

- Calcular `minStartDate` y `maxEndDate` en **fechas calendario** considerando todas las actividades del grupo.
- `startMonths = (minStartDate - projectStart) / 28` (fraccional).
- `durationMonths = (maxEndDate - minStartDate) / 28` (fraccional).
- Renderizar una sola fila por categoría con una barra:
  - `x = LABEL_W + startMonths * MONTH_W`.
  - `width = durationMonths * MONTH_W`.
  - Etiqueta dentro: `${durationMonths.toFixed(1)} m`.
- Mantener colores actuales (`barColor` y `bgFill` por categoría).
- Ocultar grupos vacíos.

### 4. Eliminar el estado `collapsed` y `toggle`

Ya no hay nivel expandible. Se elimina también la condicional `isCollapsed`/`!isCollapsed`.

### 5. Resumen del proyecto

Actualizar el bloque inferior:
- Inicio / Fin (ya en formato dd/MM/yyyy).
- Reemplazar "Duración: X días laborales" por "Duración: Y meses (Z semanas)" con `Y = (totalCalDays/28).toFixed(1)`, `Z = (totalCalDays/7).toFixed(0)`.
- Mantener "Total unidades".

### 6. Exportaciones

- **PNG**: sigue funcionando porque exporta el SVG nuevo tal cual.
- **JSON**: simplificar a resumen por categoría: `{ category, startMonth, durationMonths, startDate, endDate, activitiesCount }` en lugar del listado por actividad.

## Detalles visuales

- Líneas verticales sutiles entre meses para guía.
- Mantener encabezados con `hsl(var(--accent))` y `hsl(var(--primary))` actuales.
- Reducir altura: `ROW_H = 36`, header total ≈ `52px`.
- Sin etiquetas diarias → diagrama mucho más compacto y legible.

## Archivos a tocar

- `src/components/GanttChart.tsx` (única edición).

No se tocan utilidades de scheduling, LOB, ni tipos.