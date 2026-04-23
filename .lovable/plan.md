## Problema

Cuando ingresas **66 días** para "Movimiento de Tierras", el gráfico muestra **92 días**. Esto se debe a una inconsistencia entre cómo se guarda y cómo se muestra la duración de las actividades preliminares:

- **Al guardar** (`LOBPanel.tsx`, función `endDateFromDuration`): toma los 66 días como **días laborales** (lunes a viernes) y avanza 65 días laborales desde la fecha de inicio. Como cada semana tiene 5 días laborales y 7 calendario, 66 días laborales ≈ **92 días calendario**.
- **Al mostrar en el gráfico** (`LOBChart.tsx`, línea 200): calcula la duración como `differenceInCalendarDays(end, start) + 1`, contando **días calendario**. Por eso muestra 92.

El usuario ingresa días laborales, pero el resumen del gráfico los traduce a calendario → desajuste.

## Solución

Unificar el criterio: la duración mostrada en el gráfico debe ser **días laborales** (consistente con la entrada del usuario y con el resto de la app, que ya usa "Tiempo (Días laborales L-V)" como eje X).

### Cambio puntual

En `src/components/LOBChart.tsx`, dentro del bloque que construye `preliminaresLines` (líneas 192-202):

Reemplazar:
```ts
const duration = Math.max(1, differenceInCalendarDays(end, start) + 1);
```

Por un cálculo basado en días laborales entre `startIdx` y `endIdx` (ambos ya son índices de días laborales calculados por `dateToWorkdayIdx`):
```ts
const duration = Math.max(1, endIdx - startIdx + 1);
```

Esto reusa los índices de día laboral ya calculados, así que la duración mostrada coincidirá exactamente con lo que el usuario ingresó (66d → 66d).

### Verificación

- Ingresar 66 días en Movimiento de Tierras → la barra del gráfico mostrará `(66d)`.
- La fecha final visual seguirá siendo correcta (la barra termina en el día laboral #66 desde el inicio).
- Aplica también a las demás preliminares (Localización, Hiladeros, Cimentación Profunda, Vaciado Losa).

## Archivos a modificar

- `src/components/LOBChart.tsx` (1 línea)
