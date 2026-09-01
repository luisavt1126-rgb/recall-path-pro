import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnalyzeInput = {
  title: string;
  banca: string;
  year: number | null;
  source: "pdf" | "banca";
  text?: string;
};

type TopicRow = {
  area: string;
  subject: string;
  topic: string | null;
  question_count: number;
  incidence_pct: number;
};

const SYSTEM = `Você é um analista de provas de residência médica brasileiras.
Classifique as questões em três níveis:
1. "area" — grande área: Clínica Médica, Cirurgia, Pediatria, Ginecologia e Obstetrícia, Medicina Preventiva e Social.
2. "subject" — assunto dentro da grande área (ex.: Cardiologia, Infectologia, Obstetrícia de alto risco).
3. "topic" — tópico específico cobrado (ex.: Insuficiência cardíaca com FE reduzida).

Responda APENAS com JSON válido, sem markdown, no formato:
{"total_questions": number, "summary": "2 a 4 frases em português sobre o padrão da prova",
 "topics": [{"area": string, "subject": string, "topic": string, "question_count": number, "incidence_pct": number}]}
incidence_pct é o percentual do total de questões (0-100), com uma casa decimal.
Agrupe tópicos repetidos somando as questões. Máximo de 60 tópicos, ordenados do mais incidente para o menos.`;

function buildUserPrompt(input: AnalyzeInput) {
  if (input.source === "pdf" && input.text) {
    return `Analise o conteúdo desta prova (${input.title}${input.banca ? ` — banca ${input.banca}` : ""}${
      input.year ? `, ano ${input.year}` : ""
    }) e calcule a incidência real dos assuntos com base nas questões presentes no texto.\n\nTEXTO DA PROVA:\n${input.text}`;
  }
  return `Não tenho o PDF. Com base no seu conhecimento do padrão histórico das provas da banca "${input.banca}"${
    input.year ? ` (referência: ${input.year})` : ""
  }, estime a incidência típica de assuntos. Use total_questions como o tamanho habitual da prova e deixe claro no summary que se trata de uma estimativa baseada em padrão histórico, não na contagem de uma prova específica.`;
}

function parseJson(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Resposta da IA em formato inesperado.");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export const analyzeExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AnalyzeInput) => {
    if (!input.title?.trim()) throw new Error("Informe o nome da prova.");
    if (input.source === "banca" && !input.banca?.trim()) {
      throw new Error("Informe a banca para a busca automática.");
    }
    if (input.source === "pdf" && !input.text?.trim()) {
      throw new Error("Não consegui ler texto nesse PDF (pode ser digitalizado como imagem).");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Serviço de IA indisponível no momento.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: buildUserPrompt(data) },
        ],
      }),
    });

    if (response.status === 429) throw new Error("Muitas análises seguidas. Tente de novo em instantes.");
    if (response.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!response.ok) throw new Error("Não consegui analisar a prova agora. Tente novamente.");

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseJson(content) as {
      total_questions?: number;
      summary?: string;
      topics?: Array<Partial<TopicRow>>;
    };

    const topics: TopicRow[] = (parsed.topics ?? [])
      .filter((t) => t.area && t.subject)
      .slice(0, 60)
      .map((t) => ({
        area: String(t.area),
        subject: String(t.subject),
        topic: t.topic ? String(t.topic) : null,
        question_count: Math.max(0, Math.round(Number(t.question_count) || 0)),
        incidence_pct: Math.max(0, Math.round((Number(t.incidence_pct) || 0) * 10) / 10),
      }));

    if (topics.length === 0) throw new Error("A IA não identificou assuntos nessa prova.");

    const { supabase, userId } = context;
    const { data: analysis, error } = await supabase
      .from("exam_analyses")
      .insert({
        user_id: userId,
        title: data.title.trim(),
        banca: data.banca?.trim() || null,
        year: data.year,
        source: data.source,
        total_questions: Math.max(0, Math.round(Number(parsed.total_questions) || 0)),
        summary: parsed.summary ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { error: topicError } = await supabase.from("exam_topics").insert(
      topics.map((t) => ({ ...t, user_id: userId, analysis_id: analysis.id })),
    );
    if (topicError) throw new Error(topicError.message);

    return { analysisId: analysis.id as string, topics: topics.length };
  });
