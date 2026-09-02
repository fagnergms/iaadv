import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProcessoForAdvogado } from "@/lib/processos";
import { listHistoricoForProcesso } from "@/lib/historico";
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
    <div>
      <h1>{processo.numeroProcesso}</h1>
      <p>{processo.descricao}</p>
      <p>
        Status atual: {processo.statusAtual} ({processo.situacao})
      </p>

      <h2>Adicionar atualização</h2>
      <AddHistoricoForm processoId={processo.id} />

      <h2>Histórico</h2>
      <ul>
        {historico?.map((h) => (
          <li key={h.id}>
            {h.criadoEm.toLocaleString("pt-BR")} — {h.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
