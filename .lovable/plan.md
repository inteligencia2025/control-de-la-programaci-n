## Asistente IA Lean Construction

Añadir un asistente de IA que analice las causas de no cumplimiento (PAC) en períodos semanal, mensual y anual para cada proyecto, integrado en dos lugares:

1. **Control del PAC** — dentro de la sección de Indicadores.
2. **Lookahead** — dentro del Resumen.

### Funcionalidad del asistente

- Analiza los registros `pac_records` del proyecto activo (incluyendo `failure_cause`, `failure_description`, `planned_pct`, `completed_pct`, `responsible`, `date`, `week_number`) y los `lookahead_items` (restricciones marcadas, compromisos cumplidos/incumplidos, causas).
- Genera un análisis principal con:
  - **% PAC** del período (semana actual, mes actual, año en curso).
  - **Top causas de no cumplimiento** ordenadas por frecuencia e impacto.
  - **Patrones detectados** (responsables recurrentes, actividades problemáticas, restricciones más comunes en lookahead).
  - **Recomendaciones Lean Construction** accionables (Last Planner System, eliminación de restricciones, mejora de compromisos).
- Selector de período: Semanal / Mensual / Anual.
- Botón "Actualizar análisis" para regenerar bajo demanda (evitar costo en cada render).
- Render del resultado en Markdown con secciones claras.

### Implementación técnica

**Backend (Edge Function nueva: `pac-lean-assistant`)**
- Recibe `{ projectId, scope: 'week' | 'month' | 'year', view: 'pac' | 'lookahead' }`.
- Valida JWT del usuario y que tenga acceso al proyecto (RLS lo cubre al consultar con el token del usuario).
- Consulta `pac_records` y `lookahead_items` filtrados por proyecto y rango de fechas.
- Pre-agrega estadísticas en el servidor (conteo de causas, % PAC por semana, etc.) para reducir tokens.
- Llama a Lovable AI Gateway (`google/gemini-3-flash-preview`) con un system prompt experto en Lean Construction + Last Planner System, y los datos agregados como contexto.
- Maneja errores 429 (rate limit) y 402 (créditos) devolviéndolos al cliente.
- Devuelve `{ analysis: string, stats: {...} }`.

**Frontend**
- Nuevo componente `src/components/LeanAssistant.tsx` reutilizable, con props `{ scope, view }` y selector de período interno.
- Usa `supabase.functions.invoke('pac-lean-assistant', ...)`.
- Renderiza Markdown con `react-markdown` (añadir dependencia).
- Estados: loading skeleton, error con toast, contenido con scroll.
- Integración:
  - `ProductionControl.tsx` → tarjeta nueva en la sección de Indicadores titulada "Asistente Lean IA".
  - `LookaheadTable.tsx` → tarjeta nueva en el Resumen con el mismo asistente (variante `view='lookahead'`).

### Detalles técnicos

- Modelo: `google/gemini-3-flash-preview` (rápido y económico, ideal para análisis textual breve).
- Sin persistencia: el análisis se genera bajo demanda y no se guarda en BD (evita tabla nueva).
- Cache local opcional en memoria del componente para no recalcular al cambiar de pestaña sin pedirlo.
- Idioma del análisis: español (siguiendo el resto del proyecto).

### Preguntas antes de implementar

1. ¿El asistente debe generarse automáticamente al abrir la pestaña, o solo al pulsar un botón "Generar análisis"? (recomiendo botón para controlar costos).
2. ¿Quieres que también guarde un histórico de análisis (tabla nueva) o es suficiente con generarlo en vivo?
