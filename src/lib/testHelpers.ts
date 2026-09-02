import { prisma } from "./db";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "historico_status", "processos", "clientes", "advogados" RESTART IDENTITY CASCADE'
  );
}

export async function makeAdvogado(
  overrides: Partial<{
    nome: string;
    email: string;
    isAdmin: boolean;
    ativo: boolean;
    senhaHash: string;
  }> = {}
) {
  return prisma.advogado.create({
    data: {
      nome: overrides.nome ?? "Advogado Teste",
      email: overrides.email ?? `advogado-${crypto.randomUUID()}@teste.com`,
      senhaHash: overrides.senhaHash ?? "hash-fake-para-teste",
      isAdmin: overrides.isAdmin ?? false,
      ativo: overrides.ativo ?? true,
    },
  });
}
