## Problema

Con ritmo 0.25/día (1 unidad = 4 días), el segmento horizontal por unidad se dibuja con longitud `wdPerUnit = 1/rate = 4` días-ancho. Visualmente esto cubre 5 marcas de día (día 1 al día 5), proyectándose un día extra. La duración real de una cuadrilla en una unidad son 4 días contados de forma inclusiva (día 1 al día 4 → ancho de 3).

## Solución

En `src/components/LOBChart.tsx` (~línea 883), restar 1 a la longitud del segmento horizontal para que represente exactamente los días que la cuadrilla pasa en la unidad:

- `wdEnd = wdStart + wdPerUnit - 1`

La condición de mostrar sólo cuando `wdPerUnit > 1` se mantiene (duración 1 día → longitud 0, no se dibuja).

## Resultado

- Ritmo 0.25/día → segmento de 3 días-ancho representando 4 días de trabajo (inclusivo).
- Ritmo 0.5/día → segmento de 1 día-ancho representando 2 días.
- Aumentar cuadrillas sigue acelerando la diagonal (anclaje con `effectiveRate`), pero cada segmento mantiene la duración real por cuadrilla.
