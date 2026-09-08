import crypto from "crypto";
import { prisma } from "./db";

const SESSAO_VALIDADE_MS = 24 * 60 * 60 * 1000;
const MAX_TENTATIVAS = 3;

export async function buscarClientePorTelefone(telefone: string) {
  return prisma.cliente.findUnique({
    where: { telefone },
    select: { id: true, nome: true, cpf: true, advogadoId: true },
  });
}

export type ResultadoConfirmacaoCpf =
  | { status: "confirmado"; sessionToken: string; conversaId: string; clienteId: string }
  | { status: "cpf_invalido"; tentativasRestantes: number }
  | { status: "bloqueado" }
  | { status: "cliente_nao_encontrado" };

export async function confirmarCpf(
  telefone: string,
  ultimosDigitos: string
): Promise<ResultadoConfirmacaoCpf> {
  const cliente = await buscarClientePorTelefone(telefone);
  if (!cliente) return { status: "cliente_nao_encontrado" };

  // Garante que a linha de conversa exista sem tocar em tentativasFalhas —
  // o INSERT ... ON CONFLICT do Postgres é atômico, então não há corrida na
  // criação em si. O valor de tentativasFalhas retornado aqui é só uma leitura
  // "de melhor esforço" pra decidir se já está bloqueado; a decisão final de
  // cada tentativa vem sempre do incremento atômico abaixo, nunca deste read.
  const conversaAtual = await prisma.conversa.upsert({
    where: { telefone },
    create: { telefone, tentativasFalhas: 0, ultimaMensagemEm: new Date() },
    update: { ultimaMensagemEm: new Date() },
  });

  if (conversaAtual.tentativasFalhas >= MAX_TENTATIVAS) {
    return { status: "bloqueado" };
  }

  const digitosEsperados = cliente.cpf.replace(/\D/g, "").slice(-4);
  const digitosRecebidos = ultimosDigitos.replace(/\D/g, "").slice(-4);
  const confirmou =
    digitosRecebidos.length === 4 && digitosRecebidos === digitosEsperados;

  if (!confirmou) {
    // Incremento atômico no banco (UPDATE ... SET tentativas_falhas =
    // tentativas_falhas + 1): duas tentativas erradas concorrentes nunca
    // recebem o mesmo "número de tentativa", porque o Postgres serializa
    // UPDATEs na mesma linha. Isso evita que uma corrida (ler 1, escrever 2
    // duas vezes) deixe passar mais de 3 tentativas reais.
    const atualizada = await prisma.conversa.update({
      where: { telefone },
      data: {
        tentativasFalhas: { increment: 1 },
        ultimaMensagemEm: new Date(),
      },
    });
    const novasTentativas = atualizada.tentativasFalhas;

    // Cria o escalonamento só na requisição que efetivamente cruzou o limite
    // (o valor pós-incremento é exatamente MAX_TENTATIVAS). Como o incremento
    // é atômico, no máximo uma requisição pode observar esse valor exato,
    // então nunca duplicamos o escalonamento mesmo sob concorrência.
    if (novasTentativas === MAX_TENTATIVAS) {
      await prisma.escalonamento.create({
        data: {
          clienteId: cliente.id,
          advogadoId: cliente.advogadoId,
          telefone,
          mensagemCliente: "(verificação de identidade no chat web)",
          motivo: "falha na verificação",
        },
      });
    }

    if (novasTentativas >= MAX_TENTATIVAS) {
      return { status: "bloqueado" };
    }

    return {
      status: "cpf_invalido",
      tentativasRestantes: MAX_TENTATIVAS - novasTentativas,
    };
  }

  // O acerto também precisa de um write condicional, pelo mesmo motivo do
  // incremento acima: o `conversaAtual` lido no topo da função pode estar
  // desatualizado quando chegamos aqui (ex.: um lote de tentativas erradas
  // concorrentes pode ter cruzado o limite depois daquele read, mas antes
  // deste write). Sem uma condição aqui, um acerto cujo "chute" fazia parte
  // de um brute-force paralelo destravaria a conta mesmo já bloqueada — um
  // write incondicional resetaria tentativasFalhas e emitiria um
  // sessionToken válido, anulando o limite de 3 tentativas. Por isso o
  // reset+token só é gravado se, no momento exato deste UPDATE, a linha
  // ainda estiver com tentativasFalhas < MAX_TENTATIVAS (mesma serialização
  // por linha do Postgres que torna o incremento acima atômico).
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const resultado = await prisma.conversa.updateMany({
    where: { telefone, tentativasFalhas: { lt: MAX_TENTATIVAS } },
    data: {
      verificadoEm: new Date(),
      tentativasFalhas: 0,
      ultimaMensagemEm: new Date(),
      sessionToken,
    },
  });

  if (resultado.count === 0) {
    // Alguém já bloqueou a conta entre o read do topo e este write.
    return { status: "bloqueado" };
  }

  const conversa = await prisma.conversa.findUniqueOrThrow({ where: { telefone } });

  return {
    status: "confirmado",
    sessionToken,
    conversaId: conversa.id,
    clienteId: cliente.id,
  };
}

export async function obterConversaValida(sessionToken: string) {
  const conversa = await prisma.conversa.findUnique({ where: { sessionToken } });
  if (!conversa || !conversa.verificadoEm) return null;

  const sessaoValida =
    Date.now() - conversa.verificadoEm.getTime() < SESSAO_VALIDADE_MS;
  if (!sessaoValida) return null;

  const cliente = await prisma.cliente.findUnique({
    where: { telefone: conversa.telefone },
    select: { id: true, nome: true, advogadoId: true },
  });
  if (!cliente) return null;

  return { conversa, cliente };
}
