import crypto from "crypto";
import { prisma } from "./db";

const SESSAO_VALIDADE_MS = 24 * 60 * 60 * 1000;
const PENDING_TOKEN_VALIDADE_MS = 10 * 60 * 1000;
const MAX_TENTATIVAS = 3;

export async function buscarClientePorTelefone(telefone: string) {
  return prisma.cliente.findUnique({
    where: { telefone },
    select: { id: true, nome: true, cpf: true, advogadoId: true },
  });
}

// Gera um token opaco e imprevisível (mesmo crypto.randomBytes(32) usado pro
// sessionToken abaixo) e o persiste em Conversa.pendingToken - nunca o
// telefone em si. Isso é o que torna o cookie pendente (setado por
// identificarTelefoneAction depois que Turnstile + o lookup por telefone já
// passaram) inútil pra quem não passou por essas duas checagens: um
// script/curl pode forjar um header `Cookie: atendimento_pending_telefone=
// <qualquer coisa>` à vontade (httpOnly só impede leitura via JS no
// navegador, não impede um cliente não-navegador de setar o valor que
// quiser), mas só um valor que bata com um pendingToken gravado nesta
// função - ou seja, gerado depois de uma passagem real por Turnstile - tem
// utilidade. Sem essa correspondência, obterTelefonePendente (abaixo) não
// resolve telefone nenhum. Não mexe em tentativasFalhas no branch de update
// (mesma disciplina do upsert em confirmarCpf) pra não resetar o contador de
// bloqueio só por reidentificar.
export async function iniciarConfirmacaoCpf(telefone: string): Promise<string> {
  const pendingToken = crypto.randomBytes(32).toString("hex");
  const pendingTokenExpiraEm = new Date(Date.now() + PENDING_TOKEN_VALIDADE_MS);

  await prisma.conversa.upsert({
    where: { telefone },
    create: {
      telefone,
      tentativasFalhas: 0,
      ultimaMensagemEm: new Date(),
      pendingToken,
      pendingTokenExpiraEm,
    },
    update: {
      ultimaMensagemEm: new Date(),
      pendingToken,
      pendingTokenExpiraEm,
    },
  });

  return pendingToken;
}

// Resolve telefone a partir do pendingToken opaco - nunca o contrário. Só
// retorna algo se existir uma Conversa cujo pendingToken bata exatamente com
// o valor recebido (gerado exclusivamente por iniciarConfirmacaoCpf) e ainda
// dentro da validade de 10 minutos. Token ausente/errado/expirado retorna
// null igual, sem distinguir qual dos três casos - quem chama trata todos
// como "sem confirmação pendente" e redireciona de volta pro início do
// fluxo.
export async function obterTelefonePendente(
  pendingToken: string
): Promise<string | null> {
  const conversa = await prisma.conversa.findUnique({ where: { pendingToken } });
  if (!conversa || !conversa.pendingTokenExpiraEm) return null;

  const tokenValido = Date.now() < conversa.pendingTokenExpiraEm.getTime();
  if (!tokenValido) return null;

  return conversa.telefone;
}

// Invalida o pendingToken depois que ele já cumpriu seu papel (virou uma
// sessão verificada de verdade, com sessionToken). Não é estritamente
// necessário pra segurança - o token já expira sozinho em 10 minutos, e
// tentar reusá-lo só levaria de volta pro mesmo fluxo de confirmarCpf com o
// mesmo telefone - mas evita deixar um token válido "sobrando" depois que a
// sessão real já existe.
export async function invalidarConfirmacaoPendente(telefone: string): Promise<void> {
  await prisma.conversa.update({
    where: { telefone },
    data: { pendingToken: null, pendingTokenExpiraEm: null },
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
  // Antes de emitir o token, verifica se esta linha de Conversa esta sendo
  // REVINCULADA a um cliente diferente do que ela tinha antes - o caso de um
  // telefone liberado (editado no cadastro do dono antigo) e depois
  // registrado pra um cliente novo. Usa o clienteId ja lido em
  // `conversaAtual`, no topo da funcao: aquele read aconteceu antes de
  // qualquer verificacao de CPF, entao ainda nao serve pra decidir se o CPF
  // confere (nunca decidimos apagar nada so por causa dele) - serve só pra
  // saber quem era o dono da linha ANTES desta tentativa, e o id da propria
  // linha (conversaAtual.id) não muda entre esse read e o write abaixo, já
  // que o id é imutável após criado. Reusar esse read em vez de ler de novo
  // aqui NÃO reabre o TOCTOU do lockout corrigido nos rounds anteriores:
  // aquele bug era sobre decidir se o write de sucesso podia commitar com
  // base num tentativasFalhas desatualizado; aqui a decisão de bloquear
  // continua inteiramente no updateMany condicional abaixo, e o delete do
  // histórico só roda se aquele update realmente afetar a linha - nunca
  // especulativamente antes disso.
  const clienteAnteriorId = conversaAtual.clienteId;
  const revinculandoParaOutroCliente =
    clienteAnteriorId !== null && clienteAnteriorId !== cliente.id;

  const sessionToken = crypto.randomBytes(32).toString("hex");

  // O write de confirmação e o delete do histórico anterior (quando a linha
  // está sendo revinculada) precisam commitar juntos ou nenhum dos dois -
  // por isso os dois vivem na mesma transação. Sem isso haveria uma janela
  // em que ou (a) o cliente novo já tem sessionToken válido mas ainda
  // enxergaria o histórico do cliente antigo (write comita, delete falha),
  // ou (b) o histórico de outro cliente seria apagado sem que nenhuma sessão
  // nova tivesse sido de fato emitida (delete comita, write falha). O delete
  // só roda DENTRO da transação e SÓ SE `atualizacao.count > 0` - ou seja,
  // só depois que o guard `tentativasFalhas < MAX_TENTATIVAS` realmente
  // passou neste commit exato -, nunca de forma especulativa antes de saber
  // se a confirmação foi aceita: um chute que colidisse com um bloqueio
  // concorrente (ver teste do lote acima) não deve apagar o histórico do
  // dono anterior sem confirmar ninguém.
  const resultado = await prisma.$transaction(async (tx) => {
    const atualizacao = await tx.conversa.updateMany({
      where: { telefone, tentativasFalhas: { lt: MAX_TENTATIVAS } },
      data: {
        verificadoEm: new Date(),
        tentativasFalhas: 0,
        ultimaMensagemEm: new Date(),
        sessionToken,
        // clienteId e gravado no MESMO write atomico que emite o sessionToken
        // (nunca um update separado depois) - a sessao nasce ja amarrada ao
        // cliente que passou pela verificacao de CPF neste exato momento.
        // Antes disso, obterConversaValida resolvia o cliente relendo
        // Cliente.telefone a cada chamada, o que quebra silenciosamente se um
        // advogado editar o telefone do cliente depois (updateCliente em
        // src/lib/clientes.ts) - e pior, se aquele telefone antigo for
        // realocado pra OUTRO cliente enquanto a sessao de 24h ainda esta
        // valida, o token antigo passaria a resolver os dados juridicos do
        // cliente errado. Amarrar a sessao ao clienteId (imutavel apos
        // confirmado) em vez do telefone (mutavel) elimina os dois problemas.
        clienteId: cliente.id,
      },
    });

    if (atualizacao.count > 0 && revinculandoParaOutroCliente) {
      // Conversa é única por telefone, então o histórico antigo
      // (MensagemChat.conversaId aponta pra esta mesma linha) pertence ao
      // cliente que tinha esse número antes - nunca pode ficar visível pro
      // novo dono do número: nem em tela (listarMensagens, renderizado em
      // src/app/atendimento/page.tsx) nem no contexto enviado pro Gemini
      // (enviarMensagemAction lê o histórico pelo mesmo conversaId). Uma
      // troca de telefone é uma ação administrativa rotineira (updateCliente)
      // - não devia bastar pra vazar a conversa jurídica de um cliente pro
      // próximo que receber o número.
      await tx.mensagemChat.deleteMany({
        where: { conversaId: conversaAtual.id },
      });
    }

    return atualizacao;
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

  // Resolve o cliente pelo clienteId gravado atomicamente com o
  // sessionToken em confirmarCpf - nunca mais por conversa.telefone (que e
  // mutavel: um advogado pode reeditar o telefone cadastrado do cliente via
  // updateCliente a qualquer momento). Resolver por telefone permitiria uma
  // sessao ja emitida "seguir" o numero antigo se ele fosse reatribuido a
  // outro cliente dentro da janela de 24h da sessao, vazando dados juridicos
  // do cliente errado pra quem ainda segura o token antigo. clienteId nulo
  // (conversa confirmada antes desta migracao, ou algum estado inconsistente
  // nao esperado) e tratado como sessao invalida, igual a qualquer outro
  // caso de sessao sem cliente resolvivel.
  if (!conversa.clienteId) return null;

  const cliente = await prisma.cliente.findUnique({
    where: { id: conversa.clienteId },
    select: { id: true, nome: true, advogadoId: true },
  });
  if (!cliente) return null;

  return { conversa, cliente };
}
