import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/actions";
import { useProfile } from "@/lib/data";
import { Panel, Field, inputClass, buttonClass } from "@/components/bits";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações · Residuum" },
      {
        name: "description",
        content: "Ajuste seu nome e a meta semanal de horas de estudo no Residuum.",
      },
      { property: "og:title", content: "Configurações · Residuum" },
      {
        property: "og:description",
        content: "Personalize meta semanal de horas e dados do perfil.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("30");
  const [notifications, setNotifications] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setGoal(String(profile.weekly_goal_hours ?? 30));
  }, [profile]);

  useEffect(() => {
    if (typeof window !== "undefined") setNotifications(localStorage.getItem("daily-reminder") === "on");
  }, []);

  const toggleNotifications = async () => {
    if (!("Notification" in window)) {
      toast.error("Este navegador não oferece notificações");
      return;
    }
    if (notifications) {
      localStorage.setItem("daily-reminder", "off");
      setNotifications(false);
      toast.success("Lembretes desativados");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast.error("Permissão de notificações não concedida");
      return;
    }
    localStorage.setItem("daily-reminder", "on");
    setNotifications(true);
    toast.success("Lembrete diário ativado");
  };

  const save = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const { error } = await supabase
        .from("profiles")
        .update({
          name: name.trim() || null,
          weekly_goal_hours: Number(goal) || 0,
        })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Configurações salvas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
    <Panel title="Perfil e metas">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="Seu nome">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como quer ser chamada"
          />
        </Field>
        <Field label="Meta semanal de horas">
          <input
            className={inputClass}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <div className="sm:col-span-2">
          <button className={buttonClass} disabled={save.isPending}>
            Salvar configurações
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            A meta semanal é usada na barra lateral e nos gráficos de horas.
          </p>
        </div>
      </form>
    </Panel>
    <Panel title="Lembretes de revisão">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Resumo diário de revisões</p>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Mostra uma notificação ao abrir ou retomar o app pela primeira vez no dia. No iPhone, instale o Residuum na tela inicial.
          </p>
        </div>
        <button type="button" className={notifications ? buttonClass : "rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium"} onClick={toggleNotifications}>
          {notifications ? "Notificações ativadas" : "Ativar notificações"}
        </button>
      </div>
    </Panel>
    </div>
  );
}
