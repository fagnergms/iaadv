"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  buscarClientePorTelefone,
  confirmarCpf,
  obterConversaValida,
  iniciarConfirmacaoCpf,
  obterTelefonePendente,
  invalidarConfirmacaoPendente,
} from "@/lib/atendimento";
import { listarMensagens, adicionarMensagem } from "@/lib/mensagens";
import { responderComIA } from "@/lib/ia";
import { verificarTurnstile } from "@/lib/turnstile";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "atendimento_session";
const PENDING_COOKIE_NAME = "atendimento_pending_telefone";

export async function identificarTelefoneAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const telefone = String(formData.get("telefone") ?? "").trim();
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");

  // Turnstile e verificado no servidor antes de qualquer outra coisa -
  // inclusive antes do lookup por telefone. Um widget so-cliente e
  // trivialmente contornavel por quem faz POST direto pra esta action sem
  // carregar o JS da pagina; validar aqui garante que nenhum lookup no
  // banco roda pra uma requisicao que nao passou pelo desafio.
  let turnstileOk: boolean;
  try {
    turnstileOk = await verificarTurnstile(turnstileToken);
  } catch {
    // verificarTurnstile faz um fetch pro endpoint de siteverify da
    // Cloudflare - instabilidade de rede ou uma indisponibilidade momentanea
    // do lado deles nao pode derrubar a Server Action inteira com uma
    // excecao nao tratada. Trata como falha de verificacao (fail-closed: sem
    // confirmar o desafio, nao ha lookup por telefone), com a mesma mensagem
    // nao-tecnica do caso de token invalido.
    return {
      error: "Não foi possível confirmar que você não é um robô. Tente novamente.",
    };
  }
  if (!turnstileOk) {
    return {
      error: "Não foi possível confirmar que você não é um robô. Tente novamente.",
    };
  }

  const cliente = await buscarClientePorTelefone(telefone);
  if (!cliente) {
    return {
      error: "Não encontramos seu cadastro em nosso sistema. Entre em contato com o escritório.",
    };
  }

  // O cookie NUNCA guarda o telefone em si - guarda um token opaco e
  // imprevisivel (crypto.randomBytes(32), gerado e persistido server-side
  // por iniciarConfirmacaoCpf, mesma tecnica do sessionToken abaixo). Isso
  // importa porque httpOnly so impede leitura via JS no navegador; um
  // cliente nao-navegador (curl, script) pode perfeitamente forjar um
  // header `Cookie: atendimento_pending_telefone=<qualquer valor>` num POST
  // direto pro endpoint da Server Action, sem nunca ter carregado a pagina
  // nem passado pelo Turnstile. Se o cookie guardasse o telefone puro, esse
  // POST forjado bastaria pra confirmarCpfAction aceitar qualquer telefone
  // escolhido a dedo. Guardando um token que so tem correspondencia no
  // banco quando gerado por uma passagem real por Turnstile + lookup (aqui
  // embaixo), um cookie forjado com um valor arbitrario nao resolve
  // telefone nenhum em confirmarCpfAction (obterTelefonePendente retorna
  // null pra qualquer token que nao bata com um gerado por esta funcao) -
  // o efeito pratico e o mesmo do sessionToken real: o valor sozinho, sem o
  // registro correspondente no servidor, e inutil. Setado so aqui, depois
  // que Turnstile e o lookup por telefone ja passaram os dois. httpOnly
  // bloqueia leitura via JS; secure (em producao) evita trafego em claro
  // fora de HTTPS; sameSite=lax segue o mesmo padrao do cookie de sessao;
  // path restrito a /atendimento porque nao serve pra nada fora dessas
  // rotas; maxAge curto (10 min, mesma validade do token no banco) limita a
  // janela caso o cookie vaze de outra forma.
  const pendingToken = await iniciarConfirmacaoCpf(telefone);

  const cookieStore = await cookies();
  cookieStore.set(PENDING_COOKIE_NAME, pendingToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/atendimento",
  });

  redirect("/atendimento/confirmar");
}

export async function confirmarCpfAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const cookieStore = await cookies();

  // O cookie guarda um token opaco, nunca o telefone (ver comentario em
  // identificarTelefoneAction). telefone so e resolvido aqui atraves de
  // obterTelefonePendente, que so devolve algo se o token bater com um
  // registro gravado no servidor por uma passagem real por Turnstile +
  // lookup - nunca confiando no valor cru do cookie (que um cliente
  // nao-navegador poderia forjar livremente, ja que httpOnly so bloqueia
  // leitura via JS, nao a escrita de um header Cookie arbitrario por quem
  // nao e um navegador). Token ausente, invalido ou expirado: mesmo
  // redirecionamento de volta pro inicio do fluxo, sem distinguir qual dos
  // tres casos pro cliente.
  const pendingToken = cookieStore.get(PENDING_COOKIE_NAME)?.value;
  if (!pendingToken) redirect("/atendimento");

  const telefone = await obterTelefonePendente(pendingToken);
  if (!telefone) redirect("/atendimento");

  const cpf = String(formData.get("cpf") ?? "");
  const resultado = await confirmarCpf(telefone, cpf);

  if (resultado.status === "cliente_nao_encontrado") {
    return { error: "Não encontramos seu cadastro em nosso sistema." };
  }
  if (resultado.status === "bloqueado") {
    return {
      error: "Não conseguimos confirmar sua identidade. Um advogado vai entrar em contato.",
    };
  }
  if (resultado.status === "cpf_invalido") {
    return {
      error: `Não conferiu. Tentativas restantes: ${resultado.tentativasRestantes}.`,
    };
  }

  // O cookie de sessao so e setado aqui, depois de confirmarCpf ja ter
  // retornado "confirmado" com um sessionToken real gerado no servidor
  // (crypto.randomBytes em src/lib/atendimento.ts) - nunca antes/
  // especulativamente. httpOnly bloqueia leitura via JS no navegador
  // (mitiga XSS lendo o token); secure (em producao) evita o cookie
  // trafegar em texto claro fora de HTTPS; sameSite=lax segue a
  // especificacao do plano. O pendingToken (cookie + registro no banco) e
  // invalidado aqui porque ja cumpriu seu papel (virou sessao verificada) -
  // nao precisa mais existir, e nao ha motivo pra deixar um token ainda
  // valido "sobrando" depois que a sessao real ja foi emitida.
  await invalidarConfirmacaoPendente(telefone);
  cookieStore.delete(PENDING_COOKIE_NAME);
  cookieStore.set(COOKIE_NAME, resultado.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  });

  redirect("/atendimento");
}

export async function enviarMensagemAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionToken) redirect("/atendimento");

  // clienteId/advogadoId usados nesta action inteira vem exclusivamente
  // desta resolucao server-side via cookie httpOnly + obterConversaValida
  // (Task 2) - nunca de um parametro de formData/clienteId vindo do
  // cliente. `sessao` nunca e devolvido inteiro pro cliente (ver `return`
  // abaixo): so os campos minimos (texto das mensagens, nome) chegam na UI
  // via revalidatePath + refetch no Server Component, nunca sessionToken,
  // telefone ou cpf.
  const sessao = await obterConversaValida(sessionToken);
  if (!sessao) redirect("/atendimento");

  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return { error: "Digite uma mensagem." };

  // A mensagem do cliente e persistida antes de qualquer chamada externa
  // (Gemini). Isso garante que o texto que o usuario digitou nunca se perde
  // silenciosamente: mesmo que a IA falhe logo em seguida (ver catch
  // abaixo), a mensagem do cliente ja esta gravada e visivel no historico -
  // nao depende de a chamada externa ter sucesso.
  await adicionarMensagem(sessao.conversa.id, "cliente", texto);

  const historicoAnterior = await listarMensagens(sessao.conversa.id);

  let resposta;
  try {
    resposta = await responderComIA(
      sessao.cliente.id,
      historicoAnterior.map((m) => ({ remetente: m.remetente, texto: m.texto })),
      texto
    );
  } catch {
    // Gemini pode falhar por motivos fora do nosso controle (limite de 15
    // RPM do tier gratuito, instabilidade de rede, bloqueio por filtro de
    // seguranca, etc.). Sem este catch, a excecao suberia sem tratamento e a
    // Server Action inteira falharia - a mensagem do cliente ja gravada
    // acima ficaria "pendurada" sem nenhuma resposta visivel, e o form no
    // cliente perderia o texto digitado (useEffect de reset em chat.tsx).
    // Gravamos uma mensagem de fallback do bot pra manter a conversa
    // coerente (o cliente ve que a mensagem chegou, so nao foi possivel
    // processar ainda) e retornamos um erro nao-tecnico em portugues, no
    // mesmo padrao das demais mensagens de erro deste arquivo.
    await adicionarMensagem(
      sessao.conversa.id,
      "bot",
      "Não consegui processar sua mensagem agora, tente novamente em instantes."
    );
    revalidatePath("/atendimento");
    return {
      error: "Não consegui processar sua mensagem agora, tente novamente em instantes.",
    };
  }

  await adicionarMensagem(sessao.conversa.id, "bot", resposta.texto);

  if (resposta.precisaEscalar) {
    await prisma.escalonamento.create({
      data: {
        clienteId: sessao.cliente.id,
        // advogadoId vem do Cliente resolvido na sessao verificada - mesma
        // regra de todo outro ponto de criacao de Escalonamento neste
        // projeto (ver src/lib/escalonamentos.ts e o bloqueio por tentativas
        // em src/lib/atendimento.ts), nunca um valor separado/confiavel-por-
        // input.
        advogadoId: sessao.cliente.advogadoId,
        telefone: sessao.conversa.telefone,
        mensagemCliente: texto,
        motivo: resposta.motivoEscalonamento,
      },
    });
  }

  revalidatePath("/atendimento");
  return {};
}
