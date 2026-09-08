"use client";

import { useActionState, useRef, useEffect } from "react";
import { enviarMensagemAction } from "@/app/actions/atendimento";
import { inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";
import type { MensagemChat } from "@prisma/client";

export function Chat({ mensagensIniciais }: { mensagensIniciais: MensagemChat[] }) {
  const [state, formAction, pending] = useActionState(enviarMensagemAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // So limpa o campo em caso de sucesso genuino: nao pendente E sem erro.
    // Antes desta correcao, o efeito rodava a cada mudanca de `state`
    // (inclusive quando `state.error` estava preenchido apos uma falha),
    // mas so checava `pending` - entao um retorno com erro tambem limpava o
    // formulario, apagando o texto que o cliente acabou de digitar bem no
    // momento em que ele mais precisaria dele pra tentar de novo ou pra ler
    // o que tinha escrito.
    if (!pending && !state?.error) {
      formRef.current?.reset();
    }
  }, [pending, state]);

  return (
    <div className="flex h-[70vh] flex-col gap-4">
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate bg-paper-raised p-4">
        <ul className="flex flex-col gap-3">
          {mensagensIniciais.map((m) => (
            <li
              key={m.id}
              className={`flex ${m.remetente === "cliente" ? "justify-end" : "justify-start"}`}
            >
              <span
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  m.remetente === "cliente"
                    ? "bg-brass text-white"
                    : "bg-slate-soft text-ink"
                }`}
              >
                {m.texto}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <form ref={formRef} action={formAction} className="flex gap-2">
        <input name="texto" required className={`${inputClass} flex-1`} />
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "..." : "Enviar"}
        </button>
      </form>
      {state?.error && (
        <p role="alert" className="text-sm text-brick">
          {state.error}
        </p>
      )}
    </div>
  );
}
