## Problema

En `src/components/LookaheadTable.tsx` hay una constante `MAX_WEEKS = 12` que recorta el número de semanas mostradas en el Lookahead, sin importar la duración real del proyecto. Por eso Fiorenza Etapa 1 (23 meses ≈ 100 semanas) solo muestra hasta la S12.

```ts
const MAX_WEEKS = 12;
...
return Math.max(6, Math.min(diffWeeks + 1, MAX_WEEKS));
```

## Cambio

Subir el tope para cubrir proyectos largos y dejar que el cálculo real de duración mande:

1. Cambiar `MAX_WEEKS` a `260` (≈ 5 años, margen amplio).
2. Mantener la fórmula `Math.max(6, Math.min(diffWeeks + 1, MAX_WEEKS))` para que:
   - Proyectos cortos sigan mostrando mínimo 6 semanas.
   - Proyectos largos muestren todas las semanas reales hasta el tope.

Con esto, Fiorenza Etapa 1 generará automáticamente las ~100 semanas que abarca su cronograma.

## Notas

- No cambia lógica de negocio, scheduling, ni persistencia.
- La barra superior de selección de semanas ya es scrollable horizontalmente, así que mostrar 100 botones S1…S100 no rompe el layout.
- Solo se edita `src/components/LookaheadTable.tsx`.
