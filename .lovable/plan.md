# Mejorar la exportación del gráfico de Líneas de Balance para impresión

## Problema
El PNG actual sale con zonas que se ven oscuras / ilegibles y con baja calidad para imprimir o plottear, porque:

1. La exportación hereda los tokens del tema actual (modo oscuro o tokens HSL que el navegador resuelve a colores apagados sobre fondo blanco), por eso aparecen áreas "oscuras" o sin contraste.
2. La escala está limitada a 2x (`Math.min(2, ...)`), lo que para un SVG muy ancho da un PNG de baja densidad → al ampliarlo en el plotter se ve borroso.
3. No hay márgenes, título, leyenda ni cabecera del proyecto en la imagen — necesario para plottear.
4. PNG no es el formato ideal para plotter: el SVG/PDF vectorial se imprime nítido a cualquier tamaño.

## Solución propuesta

Reemplazar el botón único "PNG" por un menú de exportación con tres opciones, todas en `src/components/LOBChart.tsx`:

### 1. PNG en alta resolución (para imprimir)
- Forzar **paleta clara fija** al serializar el SVG (no usar los tokens del tema): fondo `#ffffff`, texto `#0f172a`, grilla `#e2e8f0`, ejes `#475569`. Así se elimina cualquier zona oscura sin importar el tema activo.
- Aumentar densidad a **300 DPI equivalente**: calcular `scale` para que el lado largo del PNG quede en ~300 px/pulgada respecto al tamaño físico deseado (A3/A2), respetando el límite de canvas (~16000 px). Si excede, hacer **mosaico (tiling)**: renderizar el SVG en varios canvas y combinarlos.
- Añadir una **cabecera** dibujada en el canvas (no en el SVG) con: nombre del proyecto, fecha de exportación, escala temporal y leyenda de colores por actividad.
- Añadir margen blanco perimetral de 40 px para que el plotter no recorte.

### 2. SVG vectorial (recomendado para plotter)
- Descargar el SVG ya saneado (paleta clara fija + cabecera SVG + márgenes). El plotter lo imprime nítido a cualquier tamaño sin pixelar.

### 3. PDF tamaño A3 horizontal (opcional, recomendado por defecto)
- Usar `jspdf` + `svg2pdf.js` (o renderizar el PNG de alta resolución dentro del PDF) para generar un PDF A3 apaisado listo para enviar a imprenta. Incluye cabecera y leyenda.

## Detalles técnicos

- Crear helper `buildExportSvg(svgEl, { width, height, projectName })` que clona el SVG, fija atributos `xmlns`, sustituye los `hsl(var(--token))` por colores HEX explícitos de la paleta clara y antepone un grupo `<g>` con la cabecera/leyenda.
- Crear helper `renderSvgToPng(svgString, { width, height, dpi })` que calcula la escala objetivo y, si excede `MAX_SIDE`, divide la imagen en mosaicos horizontales de hasta 16000 px y los pega en un único canvas final (o devuelve el archivo más grande tolerable).
- Para el SVG: serializar `buildExportSvg(...)` y descargar como `image/svg+xml`.
- Para el PDF: `bun add jspdf svg2pdf.js`, generar A3 (`420x297 mm`) e insertar el SVG vectorial con `svg2pdf`.
- Reemplazar el botón actual por un `DropdownMenu` con las tres opciones (PNG alta resolución, SVG, PDF A3).
- No se modifica nada del cálculo de programación ni del render en pantalla; solo el flujo de exportación.

## Validación
- Exportar PNG: abrir en visor, comprobar que no hay áreas oscuras y que el texto se lee al 100%.
- Exportar SVG: abrir en navegador y en Inkscape/Illustrator, comprobar trazos y textos.
- Exportar PDF: abrir e imprimir en A3, comprobar que la cabecera y la leyenda aparecen y el contenido cabe.
- Probar con un proyecto pequeño y otro grande (>40 actividades) para validar el mosaico.

## Pregunta antes de implementar
¿Cuál de las 3 opciones quiere como prioridad? Recomiendo:
1. **PDF A3** como botón principal (mejor para plottear/imprimir).
2. **SVG** como alternativa (vectorial, ideal para imprenta).
3. **PNG alta resolución** como respaldo.

Si está de acuerdo, lo implemento así. Si prefiere solo arreglar el PNG actual (sin PDF ni SVG), también es posible y más rápido.
