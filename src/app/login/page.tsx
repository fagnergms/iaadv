"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Field, inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, {});

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate bg-paper-raised p-8">
        <p className="font-serif text-lg font-semibold text-ink">
          Escritório
        </p>
        <h1 className="mt-1 mb-6 text-sm text-ink-muted">
          Entrar no painel
        </h1>
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="E-mail">
            <input
              type="email"
              name="email"
              required
              className={inputClass}
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              name="password"
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
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
