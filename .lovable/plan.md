## Problema

Actualmente la línea horizontal de duración por unidad usa `1 / effectiveRate` (ritmo × cuadrillas). Con ritmo 0.25 u/d y 4 cuadrillas el ritmo efectivo = 1 u/d, por lo que `wdPerUnit = 1` y la línea se ve corta o no se dibuja, aunque cada cuadrilla realmente tarda **4 días** por unidad.

## Solución

La línea horizontal debe representar el tiempo real que toma ejecutar una unidad por **una cuadrilla**, es decir `1 / rate` (ignorando el número de cuadrillas).

### Cambio en `src/components/LOBChart.tsx`

En el bloque "Per-unit duration markers" (línea ~875):

- Reemplazar `const wdPerUnit = 1 / effectiveRate;` por `const wdPerUnit = 1 / normalizeRate(activity.rate);`
- Mantener la condición `if (wdPerUnit <= 1) return null;` (sólo se dibuja cuando la duración por unidad es mayor a 1 día).

Asegurarse de que `normalizeRate` esté importado desde `@/utils/schedulingUtils` (ya se usa en otras partes del archivo, verificar import).

## Resultado

Para el caso del usuario (rate 0.25, crews 4): `wdPerUnit = 4` → cada unidad mostrará un segmento horizontal de 4 días, reflejando el tiempo real de una cuadrilla por unidad, como en la imagen 2.