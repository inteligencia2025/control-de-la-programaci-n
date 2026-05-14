## Problema

En `ProjectContext.updateActivity` (líneas 622–651), cuando se modifica una actividad se hace una "cascada" que **reescribe el `startDate` almacenado** de todas las actividades sucesoras. Esa cascada se dispara cuando cambia cualquiera de: `startDate`, `rate`, `crews`, `unitStart`, `unitEnd`.

Por eso, al ajustar el **ritmo** o las **cuadrillas** de una actividad, las sucesoras se "corren" en pantalla y además quedan persistidas con la nueva fecha.

## Cambio propuesto

Limitar la cascada de reescritura de `startDate` únicamente a cambios de **fecha de inicio** de la predecesora. Los cambios de `rate`, `crews`, `unitStart` y `unitEnd` no deben mover las fechas almacenadas de las sucesoras.

### Detalle técnico

En `src/context/ProjectContext.tsx`, dentro de `updateActivity`:

- Cambiar la condición `schedulingChanged` para que solo sea verdadera cuando `prev.startDate !== a.startDate`.
- Eliminar `rate`, `crews`, `unitStart` y `unitEnd` como disparadores de la cascada.
- El cálculo visual en el LOB (vía `getEffectiveStartDate`) seguirá reflejando el efecto del nuevo ritmo en tiempo real sin tocar datos almacenados.

No se modifica ningún otro archivo.

## Resultado

- Editar ritmo o cuadrillas de una actividad ya no desplaza las fechas guardadas de otras actividades.
- Cambiar la fecha de inicio de una predecesora sigue propagando a sucesoras (comportamiento actual deseado).
- El gráfico LOB sigue mostrando correctamente el balance entre actividades porque ese cálculo es en tiempo de render.