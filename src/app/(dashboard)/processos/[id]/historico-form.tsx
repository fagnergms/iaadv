"use client";

import { useActionState } from "react";
import { addHistoricoAction } from "@/app/actions/processos";
import { Field, inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export function AddHistoricoForm({ processoId }: { processoId: string }) {
  const action = addHistoricoAction.bind(null, processoId);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-slate bg-paper-raised p-4"
    >
      <Field label="Nova atualização de status">
        <textarea
          name="texto"
          required
          rows={2}
          className={inputClass}
        />
      </Field>
      {state?.error && (
        <p role="alert" className="text-sm text-brick">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass("secondary")} self-start`}
      >
        {pending ? "Salvando..." : "Adicionar"}
      </button>
    </form>
  );
}
