import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConfirmarForm } from "./confirmar-form";

export default async function ConfirmarPage() {
  // O telefone nunca passa pela URL (query string apareceria em log de
  // acesso/proxy reverso e no historico do navegador) - so existe aqui
  // como um cookie httpOnly setado por identificarTelefoneAction depois de
  // Turnstile + lookup por telefone OK. Essa pagina so precisa saber SE o
  // cookie existe pra decidir o que renderizar; o valor em si nunca e
  // passado pra ConfirmarForm (client component) - confirmarCpfAction lê o
  // mesmo cookie direto no servidor quando o formulário é enviado.
  const cookieStore = await cookies();
  const telefone = cookieStore.get("atendimento_pending_telefone")?.value;
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
