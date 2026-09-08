import { cookies } from "next/headers";
import { obterConversaValida } from "@/lib/atendimento";
import { listarMensagens } from "@/lib/mensagens";
import { IdentificarForm } from "./identificar-form";
import { Chat } from "./chat";

export default async function AtendimentoPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("atendimento_session")?.value;
  const sessao = sessionToken ? await obterConversaValida(sessionToken) : null;

  if (!sessao) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div className="w-full max-w-sm rounded-lg border border-slate bg-paper-raised p-8">
          <p className="font-serif text-lg font-semibold text-ink">Escritório</p>
          <h1 className="mt-1 mb-6 text-sm text-ink-muted">
            Fale com a gente
          </h1>
          <IdentificarForm />
        </div>
      </main>
    );
  }

  const mensagens = await listarMensagens(sessao.conversa.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 bg-paper px-4 py-8">
      <h1 className="font-serif text-lg font-semibold text-ink">
        Olá, {sessao.cliente.nome}
      </h1>
      <Chat mensagensIniciais={mensagens} />
    </main>
  );
}
