## Problema

Al arrastrar una actividad (ej. mortero) en el gráfico LOB ocurren dos cosas indeseadas:

1. **La actividad "desaparece"**: aunque guardamos un nuevo `startDate`, la función `getEffectiveStartDate` recalcula su posición a partir de su **predecesora** (la empuja fuera del rango visible o la regresa a su lugar original).
2. **Arrastra a las demás**: el código actual también desplaza todas las actividades posteriores (cascada), cuando el usuario quiere mover **solo una**.

## Solución

En `src/components/LOBChart.tsx`, dentro del handler `onUp` del drag:

1. **Mover únicamente la actividad arrastrada** (eliminar el filtro/loop que recorre todas las actividades posteriores).
2. **Romper el vínculo de predecesora** de esa actividad al moverla manualmente: poner `predecessorId: undefined` y `bufferDays: 0`, `bufferUnits: 0`. Así su posición manual queda fija y no es recalculada por el motor LOB. Las demás actividades conservan su posición.
3. Mantener el shift en `startDate` (y `endDate` si existe, para cubierta) usando `shiftWorkdays` con el delta del drag.

### Cambio puntual

```ts
// onUp – reemplazar el bloque del for...toShift por:
const updated: Activity = {
  ...a,
  startDate: shiftWorkdays(a.startDate, curr.lastDelta),
  predecessorId: undefined,
  bufferDays: 0,
  bufferUnits: 0,
};
if (a.endDate) updated.endDate = shiftWorkdays(a.endDate, curr.lastDelta);
updateActivity(updated);
```

## Resultado

- Mover una actividad la deja exactamente donde el usuario la suelta.
- Su predecesora se desvincula automáticamente (queda como actividad independiente con la nueva fecha de inicio).
- Las demás actividades no se desplazan.
- La edición sigue disponible vía clic (el flag `moved` ya impide el clic accidental al final del drag).

## Nota

Si en el futuro el usuario quiere reasignar otra predecesora, lo puede hacer desde el formulario de edición del panel LOB.
