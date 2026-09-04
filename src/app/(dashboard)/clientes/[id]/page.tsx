import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClienteForAdvogado } from "@/lib/clientes";
import { listProcessosByCliente } from "@/lib/processos";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { buttonClass } from "@/components/ui/button-styles";

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const cliente = await getClienteForAdvogado(session!.user.id, id);
  if (!cliente) notFound();

  const processos = await listProcessosByCliente(session!.user.id, id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={cliente.nome}
        action={
          <Link
            href={`/clientes/${cliente.id}/editar`}
            className={buttonClass("secondary")}
          >
            Editar cliente
          </Link>
        }
      />

      <dl className="grid max-w-sm grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-muted">Telefone</dt>
        <dd className="text-ink">{cliente.telefone}</dd>
        <dt className="text-ink-muted">CPF</dt>
        <dd className="text-ink">{cliente.cpf}</dd>
      </dl>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-ink">
            Processos
          </h2>
          <Link
            href={`/clientes/${cliente.id}/processos/novo`}
            className={buttonClass("primary")}
          >
            Novo processo
          </Link>
        </div>

        {!processos || processos.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum processo cadastrado.</p>
        ) : (
          <ul className="divide-y divide-slate rounded-lg border border-slate bg-paper-raised">
            {processos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/processos/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-soft"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-ink">
                      {p.numeroProcesso}
                    </span>
                    <span className="text-sm text-ink-muted">
                      {p.statusAtual}
                    </span>
                  </span>
                  <StatusBadge tone={p.situacao === "ativo" ? "moss" : "slate"}>
                    {p.situacao}
                  </StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
