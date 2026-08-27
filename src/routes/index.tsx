import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Residuum · Painel de estudos para residência médica" },
      {
        name: "description",
        content:
          "Organize agenda, horas, revisão espaçada, baralhos do Anki e desempenho em questões para a residência médica.",
      },
      { property: "og:title", content: "Residuum · Painel de estudos para residência médica" },
      {
        property: "og:description",
        content: "Saiba o que estudar hoje, o que revisar e como está sua evolução.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/hoje" });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-brand font-display text-lg font-bold text-brand-foreground">
        R
      </div>
      <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        Residência médica
      </p>
      <h1 className="mt-2 max-w-xl font-display text-3xl font-semibold sm:text-4xl">
        Residuum: seu sistema central de estudos
      </h1>
      <p className="mt-4 max-w-md text-sm text-muted-foreground">
        Agenda, controle de horas, revisão espaçada, baralhos do Anki e desempenho em questões —
        tudo em um painel. O Anki continua cuidando dos flashcards.
      </p>
      <Link
        to="/auth"
        className="mt-8 rounded-lg bg-brand px-5 py-3 text-sm font-medium text-brand-foreground"
      >
        Entrar / criar conta
      </Link>
    </div>
  );
}
