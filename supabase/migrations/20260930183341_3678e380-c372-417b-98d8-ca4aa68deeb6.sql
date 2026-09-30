-- Caderno de erros: subassunto digitável (texto livre), além do subtopic_id.
ALTER TABLE public.question_errors
  ADD COLUMN IF NOT EXISTS subtopic_name text;
