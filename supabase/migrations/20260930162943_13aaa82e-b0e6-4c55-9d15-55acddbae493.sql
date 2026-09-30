-- Adiciona hierarquia Grande Área -> Especialidade nas disciplinas.
ALTER TABLE public.disciplines
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.disciplines(id) ON DELETE CASCADE;

-- Remove as áreas antigas (lista plana) para o seed recriar a hierarquia.
-- (Sem assuntos vinculados neste momento; cascade em subjects é inofensivo.)
DELETE FROM public.disciplines;
