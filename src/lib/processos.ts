import { prisma } from "./db";
import { getClienteForAdvogado } from "./clientes";
import { processoSchema, type ProcessoInput } from "./validation";

export class ClienteNaoEncontradoError extends Error {
  constructor() {
    super("Cliente não encontrado para este advogado.");
    this.name = "ClienteNaoEncontradoError";
  }
}

export type { ProcessoInput };

const processoUpdateSchema = processoSchema.partial();

export async function createProcesso(
  advogadoId: string,
  clienteId: string,
  input: ProcessoInput
) {
  const data = processoSchema.parse(input);
  const cliente = await getClienteForAdvogado(advogadoId, clienteId);
  if (!cliente) throw new ClienteNaoEncontradoError();

  return prisma.processo.create({
    data: {
      clienteId,
      advogadoId,
      numeroProcesso: data.numeroProcesso,
      descricao: data.descricao,
      statusAtual: data.statusAtual,
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
  const { situacao, ...campos } = input;
  // Só valida os campos realmente enviados: uma atualização apenas de
  // `situacao` é legítima e não deve exigir os demais campos.
  const data = processoUpdateSchema.parse(campos);

  const existing = await getProcessoForAdvogado(advogadoId, processoId);
  if (!existing) return null;

  return prisma.processo.update({
    where: { id: processoId },
    data: { ...data, ...(situacao ? { situacao } : {}) },
  });
}
