import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "@/lib/actions";
import { useSubjectSubtopics, type Subject } from "@/lib/data";
import { inputClass, buttonClass, ghostButtonClass } from "@/components/bits";

/**
 * Subassuntos organizacionais de um assunto (sem SRS próprio).
 * Permite listar, adicionar, renomear e excluir.
 */
export function SubjectSubtopics({ subject }: { subject: Subject }) {
  const qc = useQueryClient();
  const { data: subtopics = [] } = useSubjectSubtopics(subject.id);

  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const userId = await requireUserId();
      const { error } = await supabase.from("subject_subtopics").insert({
        user_id: userId,
        subject_id: subject.id,
        name: name.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["subject_subtopics"] });
      toast.success("Subassunto adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ id, newName }: { id: string; newName: string }) => {
      const { error } = await supabase
        .from("subject_subtopics")
        .update({ name: newName.trim() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      setEditingName("");
      qc.invalidateQueries({ queryKey: ["subject_subtopics"] });
      toast.success("Subassunto atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subject_subtopics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subject_subtopics"] });
      toast.success("Subassunto removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitAdd = () => {
    if (name.trim()) add.mutate();
  };

  const submitRename = () => {
    if (editingId && editingName.trim()) {
      rename.mutate({ id: editingId, newName: editingName });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitAdd();
            }
          }}
          placeholder="Novo subassunto (ex.: Insulinoterapia)"
          aria-label="Novo subassunto"
        />
        <button
          type="button"
          className={buttonClass}
          disabled={!name.trim() || add.isPending}
          onClick={submitAdd}
        >
          Adicionar
        </button>
      </div>

      {subtopics.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum subassunto ainda.</p>
      ) : (
        <ul className="space-y-2">
          {subtopics.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              {editingId === t.id ? (
                <>
                  <input
                    className={inputClass}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitRename();
                      }
                    }}
                    autoFocus
                    aria-label="Nome do subassunto"
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!editingName.trim() || rename.isPending}
                    onClick={submitRename}
                  >
                    Salvar
                  </button>
                  <button type="button" className={ghostButtonClass} onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm">{t.name}</span>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingId(t.id);
                      setEditingName(t.name);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted-foreground hover:text-rose"
                    onClick={() => remove.mutate(t.id)}
                  >
                    Excluir
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
