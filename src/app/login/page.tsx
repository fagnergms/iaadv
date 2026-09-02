"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <main>
      <h1>Entrar</h1>
      <form action={formAction}>
        <label>
          E-mail
          <input type="email" name="email" required />
        </label>
        <label>
          Senha
          <input type="password" name="password" required />
        </label>
        {state?.error && <p role="alert">{state.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
