-- Substitui as 5 grandes áreas pelas especialidades clínicas menores.
-- O modelo passa a ser: Área/Especialidade -> Assunto -> Subassunto.
DELETE FROM public.disciplines
WHERE name IN (
  'Clínica Médica',
  'Cirurgia',
  'Ginecologia e Obstetrícia',
  'Pediatria',
  'Medicina Preventiva'
);
