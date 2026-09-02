"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createProcesso, updateProcesso, ClienteNaoEncontradoError } from "@/lib/processos";
import { addHistoricoStatus } from "@/lib/historico";

export async function createProcessoAction(
  clienteId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    const processo = await createProcesso(session.user.id, clienteId, {
      numeroProcesso: String(formData.get("numeroProcesso") ?? ""),
      descricao: String(formData.get("descricao") ?? ""),
      statusAtual: String(formData.get("statusAtual") ?? ""),
    });
    revalidatePath(`/clientes/${clienteId}`);
    redirect(`/processos/${processo.id}`);
  } catch (err) {
    if (err instanceof ClienteNaoEncontradoError) return { error: err.message };
    throw err;
  }
}

export async function updateProcessoAction(
  processoId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const situacao = formData.get("situacao") === "encerrado" ? "encerrado" : "ativo";
  const result = await updateProcesso(session.user.id, processoId, {
    numeroProcesso: String(formData.get("numeroProcesso") ?? ""),
    descricao: String(formData.get("descricao") ?? ""),
    situacao,
  });
  if (!result) return { error: "Processo não encontrado." };

  revalidatePath(`/processos/${processoId}`);
  redirect(`/processos/${processoId}`);
}

export async function addHistoricoAction(
  processoId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return { error: "Descreva a atualização de status." };

  await addHistoricoStatus(session.user.id, processoId, texto);
  revalidatePath(`/processos/${processoId}`);
  return {};
}
