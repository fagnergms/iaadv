"use client";

import { useActionState } from "react";
import { createClienteAction } from "@/app/actions/clientes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export default function NovoClientePage() {
  const [state, formAction, pending] = useActionState(createClienteAction, {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Novo cliente" />
      <form
        action={formAction}
        className="flex max-w-md flex-col gap-4 rounded-lg border border-slate bg-paper-raised p-6"
      >
        <Field label="Nome">
          <input name="nome" required className={inputClass} />
        </Field>
        <Field label="Telefone (formato +5511999999999)">
          <input name="telefone" required className={inputClass} />
        </Field>
        <Field label="CPF">
          <input name="cpf" required className={inputClass} />
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
