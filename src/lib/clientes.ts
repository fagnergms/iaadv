import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { clienteSchema, type ClienteInput } from "./validation";

export class TelefoneDuplicadoError extends Error {
  constructor() {
    super("Já existe um cliente cadastrado com esse telefone.");
    this.name = "TelefoneDuplicadoError";
  }
}

export async function createCliente(advogadoId: string, input: ClienteInput) {
  const data = clienteSchema.parse(input);
  try {
    return await prisma.cliente.create({ data: { ...data, advogadoId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new TelefoneDuplicadoError();
    }
    throw err;
  }
}

export async function listClientesByAdvogado(
  advogadoId: string,
  searchNome?: string
) {
  const nome = searchNome?.trim();

  return prisma.cliente.findMany({
    where: {
      advogadoId,
      ...(nome ? { nome: { contains: nome, mode: "insensitive" as const } } : {}),
    },
    orderBy: { nome: "asc" },
  });
}

export async function getClienteForAdvogado(advogadoId: string, clienteId: string) {
  return prisma.cliente.findFirst({ where: { id: clienteId, advogadoId } });
}

export async function updateCliente(
  advogadoId: string,
  clienteId: string,
  input: ClienteInput
) {
  const data = clienteSchema.parse(input);
  const existing = await getClienteForAdvogado(advogadoId, clienteId);
  if (!existing) return null;

  try {
    return await prisma.cliente.update({ where: { id: clienteId }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new TelefoneDuplicadoError();
    }
    throw err;
  }
}
