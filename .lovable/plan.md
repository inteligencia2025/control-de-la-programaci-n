
## Por qué aparece la unidad "1304" en un edificio de 12×8

Investigué el código y el problema **no es de la fórmula de etiquetas** — es que el sistema está generando **una unidad extra que no debería existir** en un edificio de 12 pisos × 8 apartamentos (total: 96 unidades, numeradas 1 a 96).

### Causa raíz

Hay **tres fuentes** que pueden estar creando la unidad 97 (que se etiqueta como piso 13, apto 01 → "1301"... y por extensión "1304" si hay actividad ahí):

1. **`hasCubierta` activado**: Cuando se activa el toggle "Tiene Cubierta", el sistema añade automáticamente 3 unidades extra encima del piso 12 (97=Cubierta, 98=Muros Cub., 99=Ascensores). Si una actividad normal (no de categoría `cubierta`) tiene `unitEnd > 96`, se grafica en esas filas con la etiqueta de piso 13.

2. **Actividades con `unitEnd` desactualizado**: Si el edificio se redimensionó (antes era más grande, ahora 12×8), las actividades guardadas en BD pueden conservar `unitEnd = 97` o más, y el gráfico las dibuja en filas que ya no corresponden a ningún piso real.

3. **Eje Y del LOBChart**: El eje se construye desde `1` hasta `totalUnits + (hasCubierta ? 3 : 0)`. Si `hasCubierta` está activo pero el usuario no quiere ver esas filas para actividades normales, igualmente aparecen.

### Diagnóstico necesario antes de aplicar cambios

Para saber cuál de las tres causas aplica a tu caso, necesito confirmar:

- ¿Tienes activado el toggle **"Tiene Cubierta"** en la configuración del edificio?
- La actividad que aparece en "1304", ¿es una actividad normal (estructura/acabados) o una de las tres especiales (Cubierta / Muros Cub. / Ascensores)?

## Plan de corrección

Aplicaré **dos protecciones** para que nunca aparezcan unidades fantasma:

### 1. Clamp de `unitEnd` en el gráfico (`src/components/LOBChart.tsx`)
Para actividades **no-cubierta**, limitar el rango graficado a `[1, totalUnits]` (96 en tu caso). Si una actividad tiene `unitEnd = 100` por datos viejos, se recortará a 96 visualmente.

### 2. Auto-corrección al cambiar configuración (`src/context/ProjectContext.tsx`)
Cuando el usuario cambie pisos/apartamentos por piso, recorrer todas las actividades **no-cubierta** y hacer:
```ts
unitEnd = Math.min(unitEnd, totalUnits)
unitStart = Math.min(unitStart, totalUnits)
```
Esto sanea los datos persistidos y evita que vuelva a aparecer la unidad fantasma.

### 3. Eje Y solo muestra cubierta si `hasCubierta` está activo
Verificar que en `LOBChart.tsx` las 3 filas extra (Cubierta/Muros/Ascensores) **solo** se rendericen cuando `buildingConfig.hasCubierta === true`. Si no, el eje termina exactamente en el piso 12.

### Archivos a modificar
- `src/components/LOBChart.tsx` — clamp visual + render condicional de filas cubierta
- `src/context/ProjectContext.tsx` — sanear `unitStart`/`unitEnd` al cambiar `buildingConfig`

### Lo que NO se toca
- La fórmula `getUnitLabel` (sigue mostrando `1201`, `1202`, etc. correctamente para 12 pisos)
- Las actividades de categoría `cubierta` (siguen funcionando como hasta ahora cuando `hasCubierta` está activo)
- La base de datos (no se requiere migración)

**Confírmame si tienes "Tiene Cubierta" activado o no, y aplico el plan.**
