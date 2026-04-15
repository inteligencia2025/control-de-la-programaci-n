
Objetivo: corregir el salto injustificado de actividades que deberían poder iniciar un viernes cuando la predecesora completa su primera unidad el jueves, y eliminar el efecto colateral del “ritmo efectivo 0.999”.

Qué encontré
- La causa más probable sí está relacionada con ese 0.999.
- En `src/components/LOBChart.tsx`, el inicio de una sucesora depende de:
  - `effectivePredRate = pred.rate * (pred.crews || 1)`
  - `firstUnitWorkdays = Math.ceil(1 / effectivePredRate)`
- Si el ritmo guardado es `0.999`, entonces:
  - `1 / 0.999 = 1.001...`
  - `Math.ceil(...) = 2`
  - el sistema interpreta que la primera unidad tarda 2 días hábiles, no 1
  - por eso una predecesora que arranca jueves empuja la sucesora a lunes
- Esto explica exactamente el patrón que reportas: el problema aparece “en todos los viernes”.
- Además, la lógica está duplicada en varios componentes (`LOBChart.tsx`, `GanttChart.tsx`, `LookaheadTable.tsx`, `ProductionControl.tsx`), así que aunque se corrija en uno, hoy seguiría inconsistente en otros.

Implementación propuesta
1. Centralizar la lógica de programación
- Crear utilidades compartidas en `src/utils/dateUtils.ts` o en un nuevo módulo de scheduling.
- Mover allí:
  - parseo seguro de fecha
  - cálculo de inicio efectivo
  - duración en días hábiles
  - conversión fecha ↔ índice hábil
- Así evitamos 4 versiones distintas de la misma regla.

2. Normalizar ritmos para evitar errores de flotantes
- Agregar una función tipo:
  - `normalizeRate(rate: number): number`
- Regla:
  - si el valor está extremadamente cerca de un entero (por ejemplo `0.999`, `1.0000001`), tratarlo como ese entero
  - mantener decimales reales como `1.25`, `0.75`, etc.
- Usar esa normalización antes de calcular:
  - `firstUnitWorkdays`
  - `effectiveRate`
  - duraciones
  - líneas LOB y Gantt

3. Ajustar la regla de inicio de sucesoras
- En vez de depender directamente de `Math.ceil(1 / rate)` con el número crudo, usar el ritmo normalizado.
- Eso hará que:
  - si la predecesora termina la primera unidad el jueves 9
  - la sucesora pueda iniciar el viernes 10
  - sin quitar la dependencia entre actividades

4. Aplicar la corrección en todos los módulos afectados
- `src/components/LOBChart.tsx`
- `src/components/GanttChart.tsx`
- `src/components/LookaheadTable.tsx`
- `src/components/ProductionControl.tsx`

5. Revisar visualización del “ritmo efectivo”
- En `src/components/LOBPanel.tsx`, el valor mostrado usa `toFixed(3)`.
- Mantendría la precisión visual, pero mostrando una versión saneada:
  - si es prácticamente 1, mostrar `1.000` o incluso `1`
  - evitar que el usuario vea `0.999` cuando operativamente debe ser 1
- Si prefieres, puedo dejarlo siempre con 3 decimales pero ya corregido.

6. Validación funcional
- Probar este caso:
  - predecesora inicia jueves 9 de abril
  - ritmo 1 u/día
  - buffer 0
  - sucesora con predecesora asignada
- Resultado esperado:
  - primera unidad de predecesora termina jueves 9
  - sucesora inicia viernes 10
- También validar que:
  - si realmente la primera unidad tarda 2 días, sí salte correctamente
  - no se rompan LOB, Gantt, Lookahead y Producción

Detalle técnico
```text
Problema actual:
0.999 u/día -> ceil(1 / 0.999) = ceil(1.001...) = 2 días

Comportamiento esperado:
0.999 ~ 1.0 -> tratar como 1
ceil(1 / 1) = 1 día
jueves 9 -> viernes 10
```

Resultado esperado tras el cambio
- Las dependencias se conservan.
- No habrá saltos artificiales de viernes a lunes por errores de precisión.
- Todos los módulos usarán la misma lógica de programación.
- El “ritmo efectivo” dejará de mostrar valores engañosos cerca de 1.
