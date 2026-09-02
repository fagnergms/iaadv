"use client";

import { use } from "react";
import { useActionState } from "react";
import { createProcessoAction } from "@/app/actions/processos";

export default function NovoProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clienteId } = use(params);
  const action = createProcessoAction.bind(null, clienteId);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <div>
      <h1>Novo processo</h1>
      <form action={formAction}>
        <label>
          Número do processo
          <input name="numeroProcesso" required />
        </label>
        <label>
          Descrição
          <input name="descricao" required />
        </label>
        <label>
          Status inicial
          <input name="statusAtual" required />
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
