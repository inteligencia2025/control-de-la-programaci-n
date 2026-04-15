
Objetivo: eliminar los saltos de 1 día hábil que siguen apareciendo y dejar una sola lógica consistente de programación.

Qué encontré
- El arreglo anterior corrigió solo un caso: `Math.ceil(1 / rate)` con `smartCeil`.
- El problema sigue porque el sistema todavía usa ritmos crudos en varios puntos:
  - `src/utils/schedulingUtils.ts`
    - `effectivePredRate = pred.rate * crews`
    - `effectiveSuccRate = activity.rate * crews`
    - comparación `effectiveSuccRate > effectivePredRate`
    - cálculo de `delayNeeded`
  - `src/components/GanttChart.tsx`, `LookaheadTable.tsx` y `ProductionControl.tsx`
    - varias duraciones siguen usando `activity.rate` sin normalizar y, en algunos casos, sin aplicar cuadrillas
  - `src/components/LOBChart.tsx`
    - la línea principal, las barras internas y las líneas por cuadrilla mezclan ritmo efectivo y ritmo crudo
- Esto permite que diferencias mínimas como `0.999`, `1.000`, `1.001` activen retrasos extra aunque no sea sábado.
- Además, hoy hay inconsistencia entre vistas: no todas calculan fecha y duración exactamente igual.

Plan de implementación
1. Fortalecer `src/utils/schedulingUtils.ts`
- Agregar helpers compartidos:
  - `normalizeRate(rate)`
  - `getEffectiveRate(activity)` = ritmo × cuadrillas, ya normalizado
  - helper de comparación con tolerancia para ritmos casi iguales
  - `calcActivityWorkdays(activity)` usando el ritmo efectivo normalizado
- Aplicar esos helpers dentro de:
  - `getEffectiveStartDate`
  - `getEffectiveStartDateSimple`

2. Corregir la lógica de predecesoras
- En `getEffectiveStartDate`, dejar de comparar ritmos crudos.
- Usar ritmo efectivo normalizado para:
  - `firstUnitWorkdays`
  - `predWorkdaysToFinishUnit`
  - `succWorkdaysToReachUnit`
- Ajustar la condición de “sucesor más rápido” para que no se active por ruido decimal; solo cuando realmente sea más rápido.

3. Unificar duraciones en todas las vistas
- Reemplazar cálculos manuales repetidos por helpers compartidos en:
  - `src/components/LOBChart.tsx`
  - `src/components/GanttChart.tsx`
  - `src/components/LookaheadTable.tsx`
  - `src/components/ProductionControl.tsx`
- Corregir los lugares donde hoy se usa `activity.rate` en vez de `rate * crews`.

4. Saneamiento visual
- En `src/components/LOBPanel.tsx`, mostrar el ritmo efectivo ya normalizado para evitar valores engañosos como `0.999` cuando operativamente debe ser `1`.

5. Validación funcional
- Probar casos donde hoy falla:
  - predecesora termina jueves y sucesora debe iniciar viernes
  - salto de 1 día hábil en días no sábado
  - actividades con 1 y varias cuadrillas
  - ritmos reales decimales válidos como `0.333`, `0.75`, `1.25`
- Verificar que LOB, Gantt, Lookahead y Producción muestren la misma fecha y duración.

Resultado esperado
- Se eliminan los saltos artificiales de un día causados por precisión decimal.
- La dependencia con predecesoras se mantiene.
- Todas las vistas quedan alineadas con la misma lógica de programación.
- El “ritmo efectivo” deja de mostrar valores confusos cerca de 1.
