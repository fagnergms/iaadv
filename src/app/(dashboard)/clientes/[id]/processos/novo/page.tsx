"use client";

import { use } from "react";
import { useActionState } from "react";
import { createProcessoAction } from "@/app/actions/processos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export default function NovoProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clienteId } = use(params);
  const action = createProcessoAction.bind(null, clienteId);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Novo processo" />
      <form
        action={formAction}
        className="flex max-w-md flex-col gap-4 rounded-lg border border-slate bg-paper-raised p-6"
      >
        <Field label="Número do processo">
          <input name="numeroProcesso" required className={inputClass} />
        </Field>
        <Field label="Descrição">
          <input name="descricao" required className={inputClass} />
        </Field>
        <Field label="Status inicial">
          <input name="statusAtual" required className={inputClass} />
        </Field>
        {state?.error && (
          <p role="alert" className="text-sm text-brick">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className={`${buttonClass("primary")} mt-2`}
        >
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
