"use client";

import { useActionState } from "react";
import type { Processo } from "@prisma/client";
import { updateProcessoAction } from "@/app/actions/processos";

export function EditarProcessoForm({ processo }: { processo: Processo }) {
  const action = updateProcessoAction.bind(null, processo.id);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction}>
      <label>
        Número do processo
        <input name="numeroProcesso" defaultValue={processo.numeroProcesso} required />
      </label>
      <label>
        Descrição
        <input name="descricao" defaultValue={processo.descricao} required />
      </label>
      <label>
        Situação
        <select name="situacao" defaultValue={processo.situacao}>
          <option value="ativo">Ativo</option>
          <option value="encerrado">Encerrado</option>
        </select>
      </label>
      {state?.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
