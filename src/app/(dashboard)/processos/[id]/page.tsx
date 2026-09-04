import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProcessoForAdvogado } from "@/lib/processos";
import { listHistoricoForProcesso } from "@/lib/historico";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { buttonClass } from "@/components/ui/button-styles";
import { AddHistoricoForm } from "./historico-form";

export default async function ProcessoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const processo = await getProcessoForAdvogado(session!.user.id, id);
  if (!processo) notFound();

  const historico = await listHistoricoForProcesso(session!.user.id, id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={processo.numeroProcesso}
        action={
          <Link
            href={`/processos/${processo.id}/editar`}
            className={buttonClass("secondary")}
          >
            Editar processo
          </Link>
        }
      />

      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink">{processo.descricao}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-muted">
            Status atual: {processo.statusAtual}
          </span>
          <StatusBadge tone={processo.situacao === "ativo" ? "moss" : "slate"}>
            {processo.situacao}
          </StatusBadge>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold text-ink">
          Adicionar atualização
        </h2>
        <AddHistoricoForm processoId={processo.id} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold text-ink">
          Histórico
        </h2>
        {!historico || historico.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nenhuma atualização registrada.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 border-l-2 border-slate pl-4">
            {historico.map((h) => (
              <li key={h.id}>
                <p className="text-xs text-ink-muted">
                  {h.criadoEm.toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                </p>
                <p className="text-sm text-ink">{h.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
