"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  createAdvogado,
  setAdvogadoAtivo,
  NaoAutorizadoError,
  EmailDuplicadoError,
} from "@/lib/advogados";

function isValidationError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "issues" in err;
}

export async function createAdvogadoAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    await createAdvogado(session.user.id, {
      nome: String(formData.get("nome") ?? ""),
      email: String(formData.get("email") ?? ""),
      senha: String(formData.get("senha") ?? ""),
      isAdmin: formData.get("isAdmin") === "on",
    });
    revalidatePath("/admin/advogados");
    redirect("/admin/advogados");
  } catch (err) {
    if (err instanceof NaoAutorizadoError) return { error: err.message };
    if (err instanceof EmailDuplicadoError) return { error: err.message };
    if (isValidationError(err)) {
      return { error: "Dados inválidos. Confira nome, e-mail e senha (mín. 8 caracteres)." };
    }
    throw err;
  }
}

export async function toggleAdvogadoAtivoAction(advogadoId: string, ativo: boolean) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await setAdvogadoAtivo(session.user.id, advogadoId, ativo);
  revalidatePath("/admin/advogados");
}
