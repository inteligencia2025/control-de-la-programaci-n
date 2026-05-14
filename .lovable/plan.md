## Problema

Las líneas horizontales por unidad representan correctamente la duración (1/rate) de una cuadrilla, pero están ancladas con espaciado de `1/rate` entre unidades, ignorando que con más cuadrillas el ritmo efectivo aumenta. Esto provoca que las líneas se extiendan mucho más allá de la diagonal.

## Solución

Cada segmento horizontal debe **anclarse al punto de la diagonal** correspondiente a esa unidad (que sí usa el ritmo efectivo) y extenderse hacia la derecha con longitud `1/rate` (duración real de una cuadrilla en esa unidad).

Así, al aumentar cuadrillas:
- Las unidades se ubican más juntas en el tiempo (diagonal más empinada).
- Cada segmento sigue midiendo 1/rate días (lo que tarda una cuadrilla).
- Los segmentos quedan paralelos y desplazados, representando visualmente las cuadrillas trabajando en paralelo.

### Cambio en `src/components/LOBChart.tsx` (bloque "Per-unit duration markers", ~línea 875)

- Mantener `wdPerUnit = 1 / normalizeRate(activity.rate)` (longitud del segmento).
- Cambiar el cálculo de `wdStart` para usar el **ritmo efectivo** (alineado con la diagonal):
  - `wdStart = startWd + k / effectiveRate`
  - `wdEnd = wdStart + wdPerUnit`
- Mantener la condición `if (wdPerUnit <= 1) return null;`.

## Resultado

Cada unidad tendrá una línea horizontal que arranca en el punto de la diagonal (ritmo efectivo) y se extiende 1/rate días, mostrando visualmente que con más cuadrillas se acelera el avance pero cada cuadrilla mantiene su tiempo por unidad.