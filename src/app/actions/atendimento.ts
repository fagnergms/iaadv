"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  buscarClientePorTelefone,
  confirmarCpf,
  obterConversaValida,
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
  const turnstileOk = await verificarTurnstile(turnstileToken);
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

  // O telefone so fica disponivel pra confirmarCpfAction atraves deste
  // cookie httpOnly de curta duracao - nunca via query string (vazaria em
  // log de acesso/proxy reverso, ex. Coolify/nginx, alem de ficar no
  // historico do navegador) e nunca como argumento vindo do client
  // (bind/formData) que confirmarCpfAction simplesmente confiasse. Setado
  // so aqui, depois que Turnstile e o lookup por telefone ja passaram os
  // dois - igual a disciplina do cookie de sessao logo abaixo. httpOnly
  // bloqueia leitura via JS; secure (em producao) evita trafego em claro
  // fora de HTTPS; sameSite=lax segue o mesmo padrao do cookie de sessao;
  // path restrito a /atendimento porque nao serve pra nada fora dessas
  // rotas; maxAge curto (10 min) limita a janela caso o cookie vaze de
  // outra forma. Como confirmarCpfAction le o telefone exclusivamente
  // deste cookie (nunca de um parametro vindo do client), nao ha como
  // invocar a Server Action de confirmacao - nem via POST direto pro
  // endpoint da action, sem nunca ter passado pela pagina - com um
  // telefone escolhido a dedo: sem ter passado por aqui (Turnstile +
  // lookup OK), nao existe cookie, logo nao ha telefone nenhum pra tentar.
  const cookieStore = await cookies();
  cookieStore.set(PENDING_COOKIE_NAME, telefone, {
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

  // telefone vem exclusivamente do cookie httpOnly setado por
  // identificarTelefoneAction (ver comentario la) - nunca de um bind/prop
  // vindo do client. Sem o cookie, nao houve identificacao valida (com
  // Turnstile) nesta sessao de navegador; redireciona de volta pro inicio
  // do fluxo em vez de aceitar qualquer telefone que a requisicao alegue.
  const telefone = cookieStore.get(PENDING_COOKIE_NAME)?.value;
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
  // especificacao do plano. O cookie pendente de telefone e removido aqui
  // porque ja cumpriu seu papel (virou sessao verificada) - nao precisa
  // mais existir.
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

  await adicionarMensagem(sessao.conversa.id, "cliente", texto);

  const historicoAnterior = await listarMensagens(sessao.conversa.id);
  const resposta = await responderComIA(
    sessao.cliente.id,
    historicoAnterior.map((m) => ({ remetente: m.remetente, texto: m.texto })),
    texto
  );

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
