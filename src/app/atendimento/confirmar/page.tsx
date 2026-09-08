import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { obterTelefonePendente } from "@/lib/atendimento";
import { ConfirmarForm } from "./confirmar-form";

export default async function ConfirmarPage() {
  // O telefone nunca passa pela URL (query string apareceria em log de
  // acesso/proxy reverso e no historico do navegador) e o cookie
  // atendimento_pending_telefone nunca guarda o telefone em si - guarda um
  // token opaco setado por identificarTelefoneAction depois de Turnstile +
  // lookup por telefone OK (ver comentario la). Essa pagina resolve o token
  // com a mesma obterTelefonePendente que confirmarCpfAction usa - so pra
  // decidir o que renderizar (token ausente/invalido/expirado = sem
  // confirmacao pendente = volta pro inicio do fluxo); o telefone resolvido
  // nunca e passado pra ConfirmarForm (client component) - a action le o
  // cookie e resolve de novo, direto no servidor, quando o formulario e
  // enviado.
  const cookieStore = await cookies();
  const pendingToken = cookieStore.get("atendimento_pending_telefone")?.value;
  const telefone = pendingToken ? await obterTelefonePendente(pendingToken) : null;
  if (!telefone) redirect("/atendimento");

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate bg-paper-raised p-8">
        <p className="font-serif text-lg font-semibold text-ink">Escritório</p>
        <h1 className="mt-1 mb-6 text-sm text-ink-muted">Confirmar identidade</h1>
        <ConfirmarForm />
      </div>
    </main>
  );
}
