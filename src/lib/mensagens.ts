import { prisma } from "./db";

// `limite` e opcional pra manter os dois usos existentes atendidos por uma
// unica funcao: sem `limite` (ex.: renderizacao inicial da pagina em
// src/app/atendimento/page.tsx), devolve o historico completo da conversa,
// pra exibicao. Com `limite` (ex.: contexto passado pro Gemini em
// enviarMensagemAction), devolve so as `limite` mensagens mais recentes -
// sem isso, o historico completo cresceria a cada turno e seria reenviado
// por inteiro pro modelo a cada mensagem nova, custando cada vez mais caro e
// eventualmente estourando a janela de contexto do modelo (spec pede "as
// ultimas mensagens", nao o historico vitalicio inteiro).
export async function listarMensagens(conversaId: string, limite?: number) {
  if (limite === undefined) {
    return prisma.mensagemChat.findMany({
      where: { conversaId },
      orderBy: { criadoEm: "asc" },
    });
  }

  // Busca em ordem DESCENDENTE pra pegar as `limite` mensagens mais RECENTES
  // (um `take: limite` direto numa query ascendente pegaria as mais
  // ANTIGAS, o oposto do que se quer). Inverte de volta pra ordem
  // cronologica ascendente antes de devolver, ja que tanto a semantica da
  // camada de armazenamento quanto o shape `historico` esperado por
  // responderComIA sao cronologicos.
  const mensagens = await prisma.mensagemChat.findMany({
    where: { conversaId },
    orderBy: { criadoEm: "desc" },
    take: limite,
  });

  return mensagens.reverse();
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
