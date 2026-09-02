"use client";

import { useActionState } from "react";
import { createClienteAction } from "@/app/actions/clientes";

export default function NovoClientePage() {
  const [state, formAction, pending] = useActionState(createClienteAction, {});

  return (
    <div>
      <h1>Novo cliente</h1>
      <form action={formAction}>
        <label>
          Nome
          <input name="nome" required />
        </label>
        <label>
          Telefone (formato +5511999999999)
          <input name="telefone" required />
        </label>
        <label>
          CPF
          <input name="cpf" required />
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
