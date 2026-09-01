// Cronograma padrão do cursinho (Medgrupo / Medcurso — intensivo ENAMED),
// organizado por grande área e apostila, com revisões automáticas no estilo
// Anki/FSRS calibradas para 95% de retenção.

export type Lesson = {
  area: string;
  title: string;
  duration: number;
};

export const MEDCURSO_LESSONS: Lesson[] = [
  // Clínica Médica
  { area: "Clínica Médica", title: "Cardiologia I — HAS, IC e arritmias", duration: 120 },
  { area: "Clínica Médica", title: "Cardiologia II — SCA, valvopatias e ECG", duration: 120 },
  { area: "Clínica Médica", title: "Pneumologia — asma, DPOC e pneumonias", duration: 120 },
  { area: "Clínica Médica", title: "Nefrologia — IRA, DRC e distúrbios hidroeletrolíticos", duration: 120 },
  { area: "Clínica Médica", title: "Gastroenterologia — DRGE, DII e pancreatite", duration: 120 },
  { area: "Clínica Médica", title: "Hepatologia — hepatites, cirrose e suas complicações", duration: 90 },
  { area: "Clínica Médica", title: "Endocrinologia — diabetes, tireoide e adrenal", duration: 120 },
  { area: "Clínica Médica", title: "Hematologia — anemias, leucemias e distúrbios da coagulação", duration: 120 },
  { area: "Clínica Médica", title: "Reumatologia — LES, AR e vasculites", duration: 90 },
  { area: "Clínica Médica", title: "Infectologia — HIV, tuberculose e endemias", duration: 120 },
  { area: "Clínica Médica", title: "Neurologia — AVC, cefaleias e epilepsia", duration: 120 },
  { area: "Clínica Médica", title: "Emergências clínicas — sepse, choque e PCR", duration: 120 },

  // Cirurgia
  { area: "Cirurgia", title: "Trauma I — ATLS, vias aéreas e choque hemorrágico", duration: 120 },
  { area: "Cirurgia", title: "Trauma II — abdome, tórax e TCE", duration: 120 },
  { area: "Cirurgia", title: "Abdome agudo e apendicite", duration: 90 },
  { area: "Cirurgia", title: "Cirurgia do aparelho digestivo — vias biliares e esôfago", duration: 120 },
  { area: "Cirurgia", title: "Coloproctologia e hérnias", duration: 90 },
  { area: "Cirurgia", title: "Cirurgia vascular — aneurismas, DAOP e TVP", duration: 90 },
  { area: "Cirurgia", title: "Urologia — litíase, HPB e câncer urológico", duration: 90 },
  { area: "Cirurgia", title: "Pré e pós-operatório, queimaduras e cicatrização", duration: 90 },

  // Pediatria
  { area: "Pediatria", title: "Neonatologia — reanimação, icterícia e prematuridade", duration: 120 },
  { area: "Pediatria", title: "Crescimento, desenvolvimento e aleitamento materno", duration: 90 },
  { area: "Pediatria", title: "Imunizações e puericultura", duration: 90 },
  { area: "Pediatria", title: "Infectologia pediátrica e exantemáticas", duration: 120 },
  { area: "Pediatria", title: "Pneumologia pediátrica — bronquiolite, asma e pneumonia", duration: 90 },
  { area: "Pediatria", title: "Emergências pediátricas e desidratação", duration: 90 },

  // Ginecologia e Obstetrícia
  { area: "Ginecologia e Obstetrícia", title: "Obstetrícia I — pré-natal e fisiologia da gestação", duration: 120 },
  { area: "Ginecologia e Obstetrícia", title: "Obstetrícia II — alto risco, DHEG e diabetes gestacional", duration: 120 },
  { area: "Ginecologia e Obstetrícia", title: "Obstetrícia III — parto, puerpério e hemorragias", duration: 120 },
  { area: "Ginecologia e Obstetrícia", title: "Ginecologia endócrina — ciclo, SOP e amenorreias", duration: 90 },
  { area: "Ginecologia e Obstetrícia", title: "Oncoginecologia e rastreamento", duration: 90 },
  { area: "Ginecologia e Obstetrícia", title: "Infecções genitais, DIP e planejamento familiar", duration: 90 },

  // Medicina Preventiva
  { area: "Medicina Preventiva", title: "SUS — princípios, leis e financiamento", duration: 90 },
  { area: "Medicina Preventiva", title: "Epidemiologia — indicadores e tipos de estudo", duration: 120 },
  { area: "Medicina Preventiva", title: "Bioestatística e testes diagnósticos", duration: 120 },
  { area: "Medicina Preventiva", title: "Atenção primária e saúde da família", duration: 90 },
  { area: "Medicina Preventiva", title: "Vigilância em saúde, notificação e ética médica", duration: 90 },
];

// Intervalos derivados do FSRS com retenção alvo de 95%: revisões mais
// próximas no começo e espaçamento crescente conforme a memória estabiliza.
export const FSRS_95_OFFSETS = [1, 3, 8, 17, 35, 70];

export const PLAN_TAG = "medcurso";

export type PlanEvent = {
  title: string;
  category: string;
  starts_at: string;
  duration_min: number;
  plan_tag: string;
  notes: string | null;
};

function atTime(date: Date, time: string) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h ?? 19, m ?? 0, 0, 0);
  return d;
}

export function generateMedcursoPlan(options: {
  startDate: Date;
  weekdays: number[]; // 0 = domingo ... 6 = sábado
  lessonTime: string;
  reviewTime: string;
  areas?: string[];
}): PlanEvent[] {
  const { startDate, weekdays, lessonTime, reviewTime } = options;
  const days = weekdays.length ? [...weekdays].sort((a, b) => a - b) : [1, 3, 5];
  const lessons = options.areas?.length
    ? MEDCURSO_LESSONS.filter((l) => options.areas!.includes(l.area))
    : MEDCURSO_LESSONS;

  const events: PlanEvent[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  for (const lesson of lessons) {
    // avança até o próximo dia de aula disponível
    let guard = 0;
    while (!days.includes(cursor.getDay()) && guard < 14) {
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
    const lessonDate = new Date(cursor);

    events.push({
      title: `Aula: ${lesson.title}`,
      category: "med_curso",
      starts_at: atTime(lessonDate, lessonTime).toISOString(),
      duration_min: lesson.duration,
      plan_tag: PLAN_TAG,
      notes: `${lesson.area} · cronograma Medcurso`,
    });

    FSRS_95_OFFSETS.forEach((offset, index) => {
      const reviewDate = new Date(lessonDate);
      reviewDate.setDate(reviewDate.getDate() + offset);
      events.push({
        title: `Revisão ${index + 1} — ${lesson.title}`,
        category: "revisar",
        starts_at: atTime(reviewDate, reviewTime).toISOString(),
        duration_min: Math.max(20, Math.round(lesson.duration / (index + 2))),
        plan_tag: PLAN_TAG,
        notes: `${lesson.area} · revisão D+${offset} (retenção 95%)`,
      });
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return events;
}

export const MEDCURSO_AREAS = Array.from(new Set(MEDCURSO_LESSONS.map((l) => l.area)));
