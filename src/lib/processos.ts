import { prisma } from "./db";
import { getClienteForAdvogado } from "./clientes";

export class ClienteNaoEncontradoError extends Error {
  constructor() {
    super("Cliente não encontrado para este advogado.");
    this.name = "ClienteNaoEncontradoError";
  }
}

export interface ProcessoInput {
  numeroProcesso: string;
  descricao: string;
  statusAtual: string;
}

export async function createProcesso(
  advogadoId: string,
  clienteId: string,
  input: ProcessoInput
) {
  const cliente = await getClienteForAdvogado(advogadoId, clienteId);
  if (!cliente) throw new ClienteNaoEncontradoError();

  return prisma.processo.create({
    data: {
      clienteId,
      advogadoId,
      numeroProcesso: input.numeroProcesso,
      descricao: input.descricao,
      statusAtual: input.statusAtual,
    },
  });
}

export async function listProcessosByCliente(advogadoId: string, clienteId: string) {
  const cliente = await getClienteForAdvogado(advogadoId, clienteId);
  if (!cliente) return null;

  return prisma.processo.findMany({
    where: { clienteId },
    orderBy: { criadoEm: "desc" },
  });
}

export async function getProcessoForAdvogado(advogadoId: string, processoId: string) {
  return prisma.processo.findFirst({ where: { id: processoId, advogadoId } });
}

export async function updateProcesso(
  advogadoId: string,
  processoId: string,
  input: Partial<ProcessoInput> & { situacao?: "ativo" | "encerrado" }
) {
  const existing = await getProcessoForAdvogado(advogadoId, processoId);
  if (!existing) return null;

  return prisma.processo.update({ where: { id: processoId }, data: input });
}
