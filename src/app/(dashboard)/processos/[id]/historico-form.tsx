"use client";

import { useActionState } from "react";
import { addHistoricoAction } from "@/app/actions/processos";

export function AddHistoricoForm({ processoId }: { processoId: string }) {
  const action = addHistoricoAction.bind(null, processoId);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <label>
        Nova atualização de status
        <textarea name="texto" required />
      </label>
      {state?.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Adicionar"}
      </button>
    </form>
  );
}
