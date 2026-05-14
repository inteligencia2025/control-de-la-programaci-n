## Objetivo

Representar visualmente en el gráfico de Líneas de Balance el tiempo que toma ejecutar cada unidad, mostrando segmentos horizontales en cada punto unitario (como en la imagen 2).

## Comportamiento

Para cada actividad en el LOB, en cada punto unitario de su línea diagonal se dibujará un pequeño segmento horizontal hacia la derecha cuya longitud (en el eje X) representa el tiempo de ejecución de esa unidad por una cuadrilla.

- **Longitud del segmento** = `1 / rate` workdays (tiempo que una cuadrilla tarda en completar una unidad).
- **Color**: el mismo color de la actividad, con un grosor menor al de la línea principal (~1px) o ligera transparencia para no saturar.
- **Visibilidad**: solo se renderiza cuando `1/rate >= 1` día (si el ritmo es mayor a 1 u/día el segmento sería muy corto / invisible y se omite).
- Aplicado tanto a la línea consolidada como a las `crewLines` (cuando hay varias cuadrillas, cada cuadrilla muestra sus propios segmentos por unidad).

Esto deja claro al usuario:
- Ritmo lento (ej. 0.2 u/d → 5 días por unidad) se ve como segmentos largos.
- Más cuadrillas → líneas paralelas, cada una con sus segmentos.

## Cambios técnicos

Archivo: `src/components/LOBChart.tsx`

1. En el bloque de render de líneas (alrededor de la línea 400-500 donde se dibujan `lines` y `crewLines`), añadir un nuevo loop que, por cada punto entero de unidad de la línea, dibuje un `<line>` SVG horizontal:
   - `x1 = PAD.left + (workdayIndex / maxWorkday) * plotW`
   - `x2 = PAD.left + ((workdayIndex + 1/rate) / maxWorkday) * plotW`
   - `y1 = y2 = lobTop + plotH - ((unit - minUnit) / unitRange) * plotH`
2. Iterar solo sobre puntos cuya `unit` sea entera (que coincidan con unidades reales).
3. Usar `stroke={activity.color}` con `strokeWidth={1}` y opacidad ~0.6.
4. Saltar el render cuando `1 / normalizeRate(activity.rate) < 1` (ritmo ≥ 1 u/día).

No se modifica la lógica de scheduling ni de fechas — es un cambio puramente visual.

## Resultado esperado

El gráfico mostrará pequeños "trazos horizontales" en cada unidad indicando la duración real de trabajo por unidad, similar a la imagen 2 adjunta.