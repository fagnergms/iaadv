"use client";

import { useActionState } from "react";
import type { Processo } from "@prisma/client";
import { updateProcessoAction } from "@/app/actions/processos";
import { Field, inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export function EditarProcessoForm({ processo }: { processo: Processo }) {
  const action = updateProcessoAction.bind(null, processo.id);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="flex max-w-md flex-col gap-4 rounded-lg border border-slate bg-paper-raised p-6"
    >
      <Field label="Número do processo">
        <input
          name="numeroProcesso"
          defaultValue={processo.numeroProcesso}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Descrição">
        <input
          name="descricao"
          defaultValue={processo.descricao}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Situação">
        <select
          name="situacao"
          defaultValue={processo.situacao}
          className={inputClass}
        >
          <option value="ativo">Ativo</option>
          <option value="encerrado">Encerrado</option>
        </select>
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
