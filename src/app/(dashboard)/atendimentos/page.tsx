import { auth } from "@/lib/auth";
import { listEscalonamentosPendentes } from "@/lib/escalonamentos";
import { resolverEscalonamentoAction } from "@/app/actions/escalonamentos";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClass } from "@/components/ui/button-styles";

export default async function AtendimentosPage() {
  const session = await auth();
  const escalonamentos = await listEscalonamentosPendentes(session!.user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Atendimentos pendentes" />

      {escalonamentos.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum atendimento pendente.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {escalonamentos.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-2 rounded-lg border border-slate bg-paper-raised p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{e.telefone}</span>
                <span className="text-xs text-ink-muted">
                  {e.criadoEm.toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </span>
              </div>
              <p className="text-sm text-ink">{e.mensagemCliente}</p>
              {e.motivo && (
                <p className="text-xs text-ink-muted">Motivo: {e.motivo}</p>
              )}
              <form
                action={async () => {
                  "use server";
                  await resolverEscalonamentoAction(e.id);
                }}
                className="self-start"
              >
                <button type="submit" className={buttonClass("secondary")}>
                  Marcar como resolvido
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
