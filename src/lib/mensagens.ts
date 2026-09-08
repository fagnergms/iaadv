import { prisma } from "./db";

export async function listarMensagens(conversaId: string) {
  return prisma.mensagemChat.findMany({
    where: { conversaId },
    orderBy: { criadoEm: "asc" },
  });
}

export async function adicionarMensagem(
  conversaId: string,
  remetente: "cliente" | "bot",
  texto: string
) {
  return prisma.mensagemChat.create({
    data: { conversaId, remetente, texto },
  });
}
