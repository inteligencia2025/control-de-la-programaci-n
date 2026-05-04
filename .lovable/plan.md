# Corregir falsa interferencia en el último piso del gráfico LOB

## Problema
En `getActivityLine` (`src/components/LOBChart.tsx`, líneas 31‑50) el bucle usa `totalWorkdays = smartCeil(totalUnits / effectiveRate)` y luego clampa con `Math.min/Math.max`. Cuando los pisos son divisibles exactamente (ej. 12 pisos a 1 u/día) o cuando el redondeo agrega un día extra, se inserta un punto adicional en `(startIndex + totalWorkdays, unitEnd)` que ya está en el tope. Esto crea un **segmento horizontal fantasma** en el último piso que cruza la línea de la actividad sucesora y dispara una "interferencia" falsa.

## Solución
Reemplazar el bucle de dibujo para que la línea termine exactamente cuando se alcanza `unitEnd`, sin colas horizontales.

### Cambio en `src/components/LOBChart.tsx` (líneas 43‑48)

```tsx
points.push({ workdayIndex: startIndex, unit: actualUnitStart });
const dir = activity.unitEnd > actualUnitStart ? 1 : -1;
// Workdays fraccionarios exactos para cubrir todas las unidades (sin smartCeil al final).
const exactWorkdays = totalUnits / effectiveRate;
for (let i = 1; i <= Math.floor(exactWorkdays); i++) {
  const unit = actualUnitStart + dir * effectiveRate * i;
  const clampedUnit = dir > 0 ? Math.min(unit, activity.unitEnd) : Math.max(unit, activity.unitEnd);
  points.push({ workdayIndex: startIndex + i, unit: clampedUnit });
  if (clampedUnit === activity.unitEnd) break; // detener al llegar al tope
}
// Si quedó remanente fraccionario, cerrar exactamente en (workday fraccionario, unitEnd).
const last = points[points.length - 1];
if (last.unit !== activity.unitEnd) {
  points.push({ workdayIndex: startIndex + exactWorkdays, unit: activity.unitEnd });
}
```

## Resultado esperado
- La línea de cada actividad termina precisamente en su último piso, sin tramo horizontal residual.
- Desaparecen las marcas de "Interferencia" falsas en el piso 12 (o el último piso de cualquier configuración) entre actividades consecutivas.
- Las interferencias reales (cruces verdaderos por diferencia de ritmos) se siguen detectando normalmente.
- No se modifica la lógica de fechas ni `schedulingUtils` — el cambio es puramente visual/geométrico en la generación de puntos de la línea.
