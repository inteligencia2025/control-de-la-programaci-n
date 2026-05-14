# Arreglar exportación PNG del gráfico LOB

## Problema
Al pulsar "Exportar PNG" el archivo se descarga pero el sistema operativo lo reporta como dañado/corrupto.

## Causa raíz
En `src/components/LOBChart.tsx` (`handleExportPNG`, líneas 346-367) la exportación tiene varios problemas que producen un PNG inválido o vacío:

1. El SVG serializado no incluye los atributos `xmlns` ni `xmlns:xlink`, lo que hace que algunos navegadores fallen al cargarlo como `<img>`. Cuando `img.onload` no se dispara (o se dispara sin contenido), `canvas.toDataURL` produce un data URL vacío/inválido que se descarga como un .png "dañado".
2. No hay manejador `img.onerror`, por lo que los fallos son silenciosos.
3. El SVG usa colores con tokens de diseño HSL (`hsl(var(--...))`) y `currentColor` heredado del DOM. Al serializarlo sin esos estilos computados, el render resulta vacío/transparente.
4. El ancla `<a>` no se añade al DOM antes del `click()`, lo cual en algunos navegadores impide la descarga real del blob.
5. Para SVGs grandes, `canvas.toDataURL` puede fallar; conviene usar `canvas.toBlob` + `URL.createObjectURL`.

## Cambios propuestos
Reescribir `handleExportPNG` en `src/components/LOBChart.tsx`:

- Clonar el `<svg>` y añadir `xmlns="http://www.w3.org/2000/svg"` y `xmlns:xlink="http://www.w3.org/1999/xlink"`.
- Fijar explícitamente `width` y `height` en el clon.
- Inyectar un `<style>` dentro del clon con las variables CSS resueltas desde `getComputedStyle(document.documentElement)` para los tokens utilizados (background, foreground, border, primary, accent, muted, etc.) y un `color` base, de modo que `hsl(var(--token))` y `currentColor` se rendericen igual que en pantalla.
- Serializar a Blob (`type: image/svg+xml;charset=utf-8`) y crear un `URL.createObjectURL` para `img.src` (más robusto que base64).
- Agregar `img.onerror` con un `toast` informativo y limpieza del object URL.
- En `onload`, dibujar sobre canvas 2x con fondo blanco y exportar con `canvas.toBlob(blob => ...)` a un `<a>` que se añade al `document.body`, se hace `click()` y se elimina; revocar ambos object URLs.

## Validación
- Pulsar "Exportar PNG" y abrir el archivo descargado: debe verse el gráfico con los mismos colores y trazos del preview.
- Probar en Chrome y Firefox.

No se modifica lógica de negocio ni de cálculo; solo el flujo de exportación visual.
