-- Caderno de erros: adiciona status e o campo "o que eu errei / o que lembrar".
ALTER TABLE public.question_errors
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS what text;
