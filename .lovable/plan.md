## Problema

En la revisión del Lookahead no aparecen las actividades de cimentación porque la lógica actual de `handleAutoLoad` y `lobActivityCount` en `src/components/LookaheadTable.tsx`:

1. Solo trae actividades **que se traslapan con la semana seleccionada**.
2. Como *fallback* (cuando no hay traslape) busca actividades que arranquen dentro de los próximos **21 días (3 semanas)**.

La metodología Lookahead exige ver las actividades a ejecutar **6 semanas antes** de su inicio. Si en una semana ya hay alguna actividad activa, las próximas (cimentación, etc.) no se cargan aunque empiecen en 4–5 semanas.

## Cambio

En `src/components/LookaheadTable.tsx`:

1. Cambiar la ventana de anticipación de 21 días a **42 días (6 semanas)**.
2. Cambiar la lógica de "fallback" por una lógica **acumulativa**: el botón LOB siempre carga
   - actividades que se traslapan con la semana actual, **más**
   - actividades cuyo inicio cae dentro de las próximas 6 semanas desde el fin de la semana seleccionada.
3. Aplicar la misma regla al contador `lobActivityCount` (el número que aparece junto al botón "LOB (n)").

Esto se aplica a las dos ocurrencias del bloque (líneas ~95–110 y ~235–247).

## Notas

- Sin cambios en scheduling, persistencia ni en otros módulos.
- Se respetan los items ya existentes en la semana (no se duplican).
- Solo se edita `src/components/LookaheadTable.tsx`.
