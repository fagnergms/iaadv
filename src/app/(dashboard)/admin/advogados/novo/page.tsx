"use client";

import { useActionState } from "react";
import { createAdvogadoAction } from "@/app/actions/advogados";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export default function NovoAdvogadoPage() {
  const [state, formAction, pending] = useActionState(createAdvogadoAction, {});

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Novo advogado" />
      <form
        action={formAction}
        className="flex max-w-md flex-col gap-4 rounded-lg border border-slate bg-paper-raised p-6"
      >
        <Field label="Nome">
          <input name="nome" required className={inputClass} />
        </Field>
        <Field label="E-mail">
          <input type="email" name="email" required className={inputClass} />
        </Field>
        <Field label="Senha inicial">
          <input
            type="password"
            name="senha"
            required
            minLength={8}
            className={inputClass}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="isAdmin" className="h-4 w-4" />
          É administrador
        </label>
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
