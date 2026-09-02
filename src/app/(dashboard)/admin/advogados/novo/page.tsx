"use client";

import { useActionState } from "react";
import { createAdvogadoAction } from "@/app/actions/advogados";

export default function NovoAdvogadoPage() {
  const [state, formAction, pending] = useActionState(createAdvogadoAction, {});

  return (
    <div>
      <h1>Novo advogado</h1>
      <form action={formAction}>
        <label>
          Nome
          <input name="nome" required />
        </label>
        <label>
          E-mail
          <input type="email" name="email" required />
        </label>
        <label>
          Senha inicial
          <input type="password" name="senha" required minLength={8} />
        </label>
        <label>
          <input type="checkbox" name="isAdmin" /> É administrador
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
