import { prisma } from "./db";
import { getProcessoForAdvogado } from "./processos";

export class ProcessoNaoEncontradoError extends Error {
  constructor() {
    super("Processo não encontrado para este advogado.");
    this.name = "ProcessoNaoEncontradoError";
  }
}

export async function addHistoricoStatus(
  advogadoId: string,
  processoId: string,
  texto: string
) {
  const processo = await getProcessoForAdvogado(advogadoId, processoId);
  if (!processo) throw new ProcessoNaoEncontradoError();

  return prisma.$transaction(async (tx) => {
    const entrada = await tx.historicoStatus.create({
      data: { processoId, texto },
    });
    await tx.processo.update({
      where: { id: processoId },
      data: { statusAtual: texto },
    });
    return entrada;
  });
}

export async function listHistoricoForProcesso(advogadoId: string, processoId: string) {
  const processo = await getProcessoForAdvogado(advogadoId, processoId);
  if (!processo) return null;

  return prisma.historicoStatus.findMany({
    where: { processoId },
    orderBy: { criadoEm: "desc" },
  });
}
