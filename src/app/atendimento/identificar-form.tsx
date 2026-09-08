"use client";

import { useActionState } from "react";
import Script from "next/script";
import { identificarTelefoneAction } from "@/app/actions/atendimento";
import { inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export function IdentificarForm() {
  const [state, formAction, pending] = useActionState(identificarTelefoneAction, {});

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Seu telefone (com DDD)</span>
          <input
            name="telefone"
            placeholder="+5511999999999"
            required
            className={inputClass}
          />
        </label>
        <div
          className="cf-turnstile"
          data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        />
        {state?.error && (
          <p role="alert" className="text-sm text-brick">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Verificando..." : "Continuar"}
        </button>
      </form>
    </>
  );
}
