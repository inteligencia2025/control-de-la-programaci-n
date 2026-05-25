import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProject } from '@/context/ProjectContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type Scope = 'week' | 'month' | 'year';

interface Props {
  view: 'pac' | 'lookahead';
  weekNumber?: number;
}

const SCOPE_LABELS: Record<Scope, string> = {
  week: 'Semanal',
  month: 'Mensual',
  year: 'Anual',
};

const SUPABASE_URL = 'https://qxgoujqndhurhoasbfla.supabase.co';

export function LeanAssistant({ view, weekNumber }: Props) {
  const { activeProjectId } = useProject();
  const [scope, setScope] = useState<Scope>('week');
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async () => {
    if (!activeProjectId) {
      toast({ title: 'Selecciona un proyecto', variant: 'destructive' });
      return;
    }
    // cancel any in-flight request
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setAnalysis('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sesión no válida');

      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/pac-lean-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ projectId: activeProjectId, scope, view }),
          signal: ac.signal,
        },
      );

      if (!resp.ok || !resp.body) {
        let msg = `Error ${resp.status}`;
        try {
          const j = await resp.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events separated by blank lines
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const lines = chunk.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;
          if (event === 'delta') {
            try {
              const j = JSON.parse(data);
              if (j?.t) {
                acc += j.t;
                setAnalysis(acc);
              }
            } catch {}
          } else if (event === 'error') {
            try {
              const j = JSON.parse(data);
              throw new Error(j?.error || 'Error en el stream');
            } catch (e) {
              throw e;
            }
          } else if (event === 'done') {
            // finished
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      const msg = e?.message || 'Error al generar el análisis';
      toast({ title: 'Asistente IA', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2 pt-3 px-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Asistente Lean Construction IA
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week" className="text-xs">{SCOPE_LABELS.week}</SelectItem>
              <SelectItem value="month" className="text-xs">{SCOPE_LABELS.month}</SelectItem>
              <SelectItem value="year" className="text-xs">{SCOPE_LABELS.year}</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={generate} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {analysis ? 'Actualizar' : 'Generar análisis'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading && !analysis && (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Analizando datos del proyecto…
          </p>
        )}
        {!loading && !analysis && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Pulsa "Generar análisis" para obtener un diagnóstico {SCOPE_LABELS[scope].toLowerCase()} de causas de no cumplimiento y recomendaciones Lean Construction.
          </p>
        )}
        {analysis && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-headings:text-foreground prose-headings:font-semibold prose-h2:text-sm prose-h2:mt-3 prose-h2:mb-1 prose-p:text-xs prose-li:text-xs prose-strong:text-foreground">
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
