import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Scope = "week" | "month" | "year";

interface PacRow {
  date: string;
  week_number: number;
  activity_name: string;
  responsible: string;
  planned_pct: number;
  completed_pct: number;
  failure_cause: string | null;
  failure_description: string | null;
}

interface LookaheadRow {
  activity_name: string;
  responsible: string;
  week: number;
  restrictions: Record<string, boolean>;
  commitment: string | null;
  commitment_met: boolean | null;
  commitment_cause: string | null;
}


function inScope(dateStr: string, scope: Scope, ref: Date): boolean {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(y, m - 1, d);
  if (scope === "year") return dt.getFullYear() === ref.getFullYear();
  if (scope === "month")
    return dt.getFullYear() === ref.getFullYear() && dt.getMonth() === ref.getMonth();
  // week: last 7 days relative to reference date (inclusive)
  const diff = (ref.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= -0.5 && diff <= 7.5;
}

function isPlanned(r: PacRow): boolean {
  // Consider planned if planned_pct > 0 OR the legacy planned flag was set
  return (r.planned_pct ?? 0) > 0 || (r as any).planned === true;
}

function isCompliantRow(r: PacRow): boolean {
  const planned = (r.planned_pct ?? 0);
  const done = (r.completed_pct ?? 0);
  if (planned > 0) return done >= planned;
  // Fallback to boolean completed when no pct recorded
  return (r as any).completed === true;
}

function aggregate(
  pac: PacRow[],
  lookahead: LookaheadRow[],
  scope: Scope,
  weekNumber?: number,
) {
  let filtered: PacRow[];
  let filteredLook = lookahead;
  if (scope === "week" && typeof weekNumber === "number") {
    // Filter directly by the week the user is viewing
    filtered = pac.filter((r) => r.week_number === weekNumber);
    filteredLook = lookahead.filter((l) => l.week === weekNumber);
  } else {
    // Use the most recent record date as the reference, falling back to now.
    const latestTs = pac.reduce((acc, r) => {
      if (!r.date) return acc;
      const [y, m, d] = r.date.split("-").map(Number);
      if (!y || !m || !d) return acc;
      const t = new Date(y, m - 1, d).getTime();
      return t > acc ? t : acc;
    }, 0);
    const ref = latestTs > 0 ? new Date(latestTs) : new Date();
    filtered = pac.filter((r) => inScope(r.date, scope, ref));
  }
  const planned = filtered.filter(isPlanned);
  const compliant = planned.filter(isCompliantRow);


  const pacPct = planned.length
    ? Math.round((compliant.length / planned.length) * 100)
    : 0;

  const causes: Record<string, number> = {};
  const byResponsible: Record<string, { planned: number; compliant: number }> = {};
  const byActivity: Record<string, { planned: number; compliant: number }> = {};

  for (const r of filtered) {
    const rowPlanned = isPlanned(r);
    const rowOk = isCompliantRow(r);
    if (rowPlanned && !rowOk && r.failure_cause) {
      causes[r.failure_cause] = (causes[r.failure_cause] || 0) + 1;
    }
    const resp = r.responsible || "Sin asignar";
    if (!byResponsible[resp]) byResponsible[resp] = { planned: 0, compliant: 0 };
    if (rowPlanned) byResponsible[resp].planned++;
    if (rowPlanned && rowOk) byResponsible[resp].compliant++;

    const act = r.activity_name || "Sin nombre";
    if (!byActivity[act]) byActivity[act] = { planned: 0, compliant: 0 };
    if (rowPlanned) byActivity[act].planned++;
    if (rowPlanned && rowOk) byActivity[act].compliant++;
  }

  const topCauses = Object.entries(causes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cause, count]) => ({ cause, count }));

  const responsibleStats = Object.entries(byResponsible)
    .map(([name, v]) => ({
      name,
      planned: v.planned,
      pac: v.planned ? Math.round((v.compliant / v.planned) * 100) : 0,
    }))
    .sort((a, b) => a.pac - b.pac)
    .slice(0, 8);

  const worstActivities = Object.entries(byActivity)
    .map(([name, v]) => ({
      name,
      planned: v.planned,
      pac: v.planned ? Math.round((v.compliant / v.planned) * 100) : 0,
    }))
    .filter((a) => a.planned > 0)
    .sort((a, b) => a.pac - b.pac)
    .slice(0, 5);

  const restrictionCounts: Record<string, number> = {};
  let totalRestrictionFlags = 0;
  let pendingFlags = 0;
  const commitmentMet = lookahead.filter((l) => l.commitment_met === true).length;
  const commitmentUnmet = lookahead.filter((l) => l.commitment_met === false).length;
  const unmetCauses: Record<string, number> = {};

  for (const it of lookahead) {
    const r = it.restrictions || {};
    for (const [k, v] of Object.entries(r)) {
      totalRestrictionFlags++;
      if (!v) {
        pendingFlags++;
        restrictionCounts[k] = (restrictionCounts[k] || 0) + 1;
      }
    }
    if (it.commitment_met === false && it.commitment_cause) {
      unmetCauses[it.commitment_cause] = (unmetCauses[it.commitment_cause] || 0) + 1;
    }
  }
  const topRestrictions = Object.entries(restrictionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, count]) => ({ id, count }));

  return {
    scope,
    pacPct,
    plannedCount: planned.length,
    compliantCount: compliant.length,
    topCauses,
    responsibleStats,
    worstActivities,
    lookahead: {
      total: lookahead.length,
      pendingFlags,
      totalRestrictionFlags,
      topRestrictions,
      commitmentMet,
      commitmentUnmet,
      topUnmetCauses: Object.entries(unmetCauses)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([cause, count]) => ({ cause, count })),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { projectId, scope, view } = await req.json();
    if (!projectId || !["week", "month", "year"].includes(scope)) {
      return new Response(JSON.stringify({ error: "Parámetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [pacRes, lookRes, projRes] = await Promise.all([
      supabase
        .from("pac_records")
        .select(
          "date, week_number, activity_name, responsible, planned_pct, completed_pct, failure_cause, failure_description",
        )
        .eq("project_id", projectId),
      supabase
        .from("lookahead_items")
        .select(
          "activity_name, responsible, week, restrictions, commitment, commitment_met, commitment_cause",
        )
        .eq("project_id", projectId),
      supabase.from("projects").select("name").eq("id", projectId).single(),
    ]);

    if (pacRes.error || lookRes.error) {
      return new Response(
        JSON.stringify({ error: "Sin acceso al proyecto" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stats = aggregate(
      (pacRes.data || []) as PacRow[],
      (lookRes.data || []) as LookaheadRow[],
      scope as Scope,
    );

    const scopeLabel =
      scope === "week" ? "última semana" : scope === "month" ? "mes en curso" : "año en curso";

    const systemPrompt = `Eres un experto en Lean Construction y Last Planner System (LPS). Analiza datos reales de PAC (Porcentaje de Asignaciones Completadas) y de la planificación lookahead de un proyecto de construcción. Responde SIEMPRE en español, en formato Markdown conciso, con encabezados ## y listas. Tu análisis debe ser práctico, accionable y basado en evidencia de los datos provistos. No inventes datos que no estén en el contexto. IMPORTANTE: un PAC de 0% con plannedCount > 0 significa que SÍ hay actividades planificadas pero ninguna se cumplió; NO digas que "no hay datos" en ese caso.`;

    const focus =
      view === "lookahead"
        ? "Enfócate en restricciones pendientes, compromisos incumplidos y cómo liberar el flujo de trabajo."
        : "Enfócate en causas raíz de no cumplimiento, responsables con bajo desempeño y acciones correctivas.";

    const userPrompt = `Proyecto: ${projRes.data?.name || "Sin nombre"}
Período de análisis: ${scopeLabel}
Actividades planificadas en el período: ${stats.plannedCount}
Actividades cumplidas en el período: ${stats.compliantCount}
PAC calculado: ${stats.pacPct}%
${focus}

Datos agregados (JSON):
${JSON.stringify(stats, null, 2)}

Entrega un análisis con estas secciones:
## Resumen ejecutivo
PAC del período (${stats.pacPct}% sobre ${stats.plannedCount} actividades planificadas), tendencia y diagnóstico en 2-3 líneas. Si plannedCount es 0 entonces sí indica que no hay datos cargados; en caso contrario describe el desempeño.

## Principales causas de no cumplimiento
Lista priorizada con su impacto y por qué ocurren.

## Patrones y riesgos detectados
Responsables, actividades y restricciones críticas.

## Recomendaciones Lean Construction
Acciones específicas basadas en Last Planner System (PPC, análisis de causas, liberación de restricciones, planificación pull) para la próxima semana.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Demasiadas solicitudes. Intenta en unos momentos." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResp.status === 402) {
      return new Response(
        JSON.stringify({
          error: "Créditos agotados. Añade créditos a tu workspace de Lovable AI.",
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResp.ok || !aiResp.body) {
      const t = await aiResp.text().catch(() => "");
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Error del asistente IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream the AI response back to the client as SSE.
    // This keeps the connection alive while the model thinks and avoids
    // browser "Failed to fetch" caused by long idle responses.
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        // Send stats first as a single SSE event
        controller.enqueue(
          encoder.encode(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`),
        );

        const reader = aiResp.body!.getReader();
        let buffer = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
                controller.close();
                return;
              }
              try {
                const json = JSON.parse(data);
                const delta = json?.choices?.[0]?.delta?.content;
                if (delta) {
                  controller.enqueue(
                    encoder.encode(
                      `event: delta\ndata: ${JSON.stringify({ t: delta })}\n\n`,
                    ),
                  );
                }
              } catch {
                // ignore parse errors on partial chunks
              }
            }
          }
          controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
          controller.close();
        } catch (e) {
          console.error("stream error", e);
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: String(e) })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("pac-lean-assistant error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
