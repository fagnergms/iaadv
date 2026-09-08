"use client";

import { useActionState } from "react";
import { confirmarCpfAction } from "@/app/actions/atendimento";
import { inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export function ConfirmarForm({ telefone }: { telefone: string }) {
  const action = confirmarCpfAction.bind(null, telefone);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">
          Confirme os últimos 4 dígitos do seu CPF
        </span>
        <input
          name="cpf"
          maxLength={4}
          required
          className={inputClass}
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-brick">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Confirmando..." : "Confirmar"}
      </button>
    </form>
  );
}
