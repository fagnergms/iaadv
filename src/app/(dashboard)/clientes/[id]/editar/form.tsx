"use client";

import { useActionState } from "react";
import type { Cliente } from "@prisma/client";
import { updateClienteAction } from "@/app/actions/clientes";
import { Field, inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export function EditarClienteForm({ cliente }: { cliente: Cliente }) {
  const action = updateClienteAction.bind(null, cliente.id);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="flex max-w-md flex-col gap-4 rounded-lg border border-slate bg-paper-raised p-6"
    >
      <Field label="Nome">
        <input
          name="nome"
          defaultValue={cliente.nome}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Telefone">
        <input
          name="telefone"
          defaultValue={cliente.telefone}
          required
          className={inputClass}
        />
      </Field>
      <Field label="CPF">
        <input
          name="cpf"
          defaultValue={cliente.cpf}
          required
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
        className={`${buttonClass("primary")} mt-2`}
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
