import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { hashPassword } from "./password";
import { advogadoSchema, type AdvogadoInput } from "./validation";

export class NaoAutorizadoError extends Error {
  constructor() {
    super("Apenas administradores podem gerenciar contas de advogados.");
    this.name = "NaoAutorizadoError";
  }
}

export class EmailDuplicadoError extends Error {
  constructor() {
    super("Já existe um advogado cadastrado com esse e-mail.");
    this.name = "EmailDuplicadoError";
  }
}

async function assertIsAdmin(actorId: string) {
  const actor = await prisma.advogado.findUnique({ where: { id: actorId } });
  if (!actor?.isAdmin || !actor.ativo) throw new NaoAutorizadoError();
}

export async function createAdvogado(actorId: string, input: AdvogadoInput) {
  await assertIsAdmin(actorId);
  const data = advogadoSchema.parse(input);
  const senhaHash = await hashPassword(data.senha);

  try {
    return await prisma.advogado.create({
      data: {
        nome: data.nome,
        email: data.email,
        senhaHash,
        isAdmin: data.isAdmin ?? false,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new EmailDuplicadoError();
    }
    throw err;
  }
}

export async function listAdvogados(actorId: string) {
  await assertIsAdmin(actorId);
  return prisma.advogado.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      email: true,
      isAdmin: true,
      ativo: true,
      criadoEm: true,
    },
  });
}

export async function setAdvogadoAtivo(
  actorId: string,
  advogadoId: string,
  ativo: boolean
) {
  await assertIsAdmin(actorId);
  return prisma.advogado.update({ where: { id: advogadoId }, data: { ativo } });
}
