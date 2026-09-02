"use client";

import { useActionState } from "react";
import type { Cliente } from "@prisma/client";
import { updateClienteAction } from "@/app/actions/clientes";

export function EditarClienteForm({ cliente }: { cliente: Cliente }) {
  const action = updateClienteAction.bind(null, cliente.id);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <label>
        Nome
        <input name="nome" defaultValue={cliente.nome} required />
      </label>
      <label>
        Telefone
        <input name="telefone" defaultValue={cliente.telefone} required />
      </label>
      <label>
        CPF
        <input name="cpf" defaultValue={cliente.cpf} required />
      </label>
      {state?.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
