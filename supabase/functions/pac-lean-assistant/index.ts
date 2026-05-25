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

function isCompliant(r: PacRow) {
  return r.planned_pct > 0 && r.completed_pct >= r.planned_pct;
}

function inScope(dateStr: string, scope: Scope, now: Date): boolean {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(y, m - 1, d);
  if (scope === "year") return dt.getFullYear() === now.getFullYear();
  if (scope === "month")
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  // week: last 7 days
  const diff = (now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
}

function aggregate(pac: PacRow[], lookahead: LookaheadRow[], scope: Scope) {
  const now = new Date();
  const filtered = pac.filter((r) => inScope(r.date, scope, now));
  const planned = filtered.filter((r) => r.planned_pct > 0);
  const compliant = planned.filter(isCompliant);
  const pacPct = planned.length
    ? Math.round((compliant.length / planned.length) * 100)
    : 0;

  const causes: Record<string, number> = {};
  const byResponsible: Record<string, { planned: number; compliant: number }> = {};
  const byActivity: Record<string, { planned: number; compliant: number }> = {};

  for (const r of filtered) {
    if (r.planned_pct > 0 && !isCompliant(r) && r.failure_cause) {
      causes[r.failure_cause] = (causes[r.failure_cause] || 0) + 1;
    }
    const resp = r.responsible || "Sin asignar";
    if (!byResponsible[resp]) byResponsible[resp] = { planned: 0, compliant: 0 };
    if (r.planned_pct > 0) byResponsible[resp].planned++;
    if (isCompliant(r)) byResponsible[resp].compliant++;

    const act = r.activity_name || "Sin nombre";
    if (!byActivity[act]) byActivity[act] = { planned: 0, compliant: 0 };
    if (r.planned_pct > 0) byActivity[act].planned++;
    if (isCompliant(r)) byActivity[act].compliant++;
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

  // Lookahead restrictions stats
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

    const systemPrompt = `Eres un experto en Lean Construction y Last Planner System (LPS). Analiza datos reales de PAC (Porcentaje de Asignaciones Completadas) y de la planificación lookahead de un proyecto de construcción. Responde SIEMPRE en español, en formato Markdown conciso, con encabezados ## y listas. Tu análisis debe ser práctico, accionable y basado en evidencia de los datos provistos. No inventes datos que no estén en el contexto.`;

    const focus =
      view === "lookahead"
        ? "Enfócate en restricciones pendientes, compromisos incumplidos y cómo liberar el flujo de trabajo."
        : "Enfócate en causas raíz de no cumplimiento, responsables con bajo desempeño y acciones correctivas.";

    const userPrompt = `Proyecto: ${projRes.data?.name || "Sin nombre"}
Período de análisis: ${scopeLabel}
${focus}

Datos agregados (JSON):
${JSON.stringify(stats, null, 2)}

Entrega un análisis con estas secciones:
## Resumen ejecutivo
PAC del período, tendencia y diagnóstico en 2-3 líneas.

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
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Error del asistente IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const analysis = data?.choices?.[0]?.message?.content || "Sin contenido generado.";

    return new Response(JSON.stringify({ analysis, stats }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pac-lean-assistant error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
