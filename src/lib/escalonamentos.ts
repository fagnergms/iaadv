import { prisma } from "./db";

export async function listEscalonamentosPendentes(advogadoId: string) {
  return prisma.escalonamento.findMany({
    where: { advogadoId, resolvidoEm: null },
    orderBy: { criadoEm: "asc" },
  });
}

export async function resolverEscalonamento(
  advogadoId: string,
  escalonamentoId: string
) {
  const existing = await prisma.escalonamento.findFirst({
    where: { id: escalonamentoId, advogadoId },
  });
  if (!existing) return null;

  return prisma.escalonamento.update({
    where: { id: escalonamentoId },
    data: { resolvidoEm: new Date() },
  });
}
