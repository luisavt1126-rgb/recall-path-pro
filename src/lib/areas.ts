/** Grande área -> especialidades (classificadores fixos). */
export type CoreArea = {
  area: string;
  specialties: string[];
};

export const CORE_AREAS: CoreArea[] = [
  {
    area: "Clínica Médica",
    specialties: [
      "Cardiologia",
      "Endocrinologia",
      "Infectologia",
      "Nefrologia",
      "Gastroenterologia",
      "Pneumologia",
      "Reumatologia",
      "Hematologia",
      "Neurologia",
      "Dermatologia",
      "Psiquiatria",
      "Oftalmologia",
      "Otorrinolaringologia",
    ],
  },
  {
    area: "GO/Obstetrícia",
    specialties: ["Obstetrícia", "Ginecologia"],
  },
  {
    area: "Cirurgia",
    specialties: [
      "Cirurgia Geral",
      "Cirurgia Abdominal",
      "Urologia",
      "Ortopedia",
      "Neurocirurgia",
      "Cirurgia Vascular",
      "Cirurgia Pediátrica",
    ],
  },
  {
    area: "Pediatria",
    specialties: [
      "Pediatria Geral",
      "Neonatologia",
      "Puericultura",
      "Emergências Pediátricas",
      "Infectologia Pediátrica",
    ],
  },
  {
    area: "Medicina Preventiva/Saúde Coletiva",
    specialties: [
      "Epidemiologia",
      "Bioestatística",
      "SUS",
      "Medicina de Família e Comunidade",
      "Vigilância em Saúde",
    ],
  },
];
