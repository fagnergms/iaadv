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

  redirect(`/atendimento/confirmar?telefone=${encodeURIComponent(telefone)}`);
}

export async function confirmarCpfAction(
  telefone: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
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

  // O cookie so e setado aqui, depois de confirmarCpf ja ter retornado
  // "confirmado" com um sessionToken real gerado no servidor (crypto.
  // randomBytes em src/lib/atendimento.ts) - nunca antes/especulativamente.
  // httpOnly bloqueia leitura via JS no navegador (mitiga XSS lendo o
  // token); secure (em producao) evita o cookie trafegar em texto claro
  // fora de HTTPS; sameSite=lax segue a especificacao do plano.
  const cookieStore = await cookies();
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
