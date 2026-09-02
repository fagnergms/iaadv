"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createCliente, updateCliente, TelefoneDuplicadoError } from "@/lib/clientes";

function isValidationError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "issues" in err;
}

export async function createClienteAction(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    const cliente = await createCliente(session.user.id, {
      nome: String(formData.get("nome") ?? ""),
      telefone: String(formData.get("telefone") ?? ""),
      cpf: String(formData.get("cpf") ?? ""),
    });
    revalidatePath("/clientes");
    redirect(`/clientes/${cliente.id}`);
  } catch (err) {
    if (err instanceof TelefoneDuplicadoError) return { error: err.message };
    if (isValidationError(err)) {
      return { error: "Dados inválidos. Confira nome, telefone e CPF." };
    }
    throw err;
  }
}

export async function updateClienteAction(
  clienteId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  try {
    const result = await updateCliente(session.user.id, clienteId, {
      nome: String(formData.get("nome") ?? ""),
      telefone: String(formData.get("telefone") ?? ""),
      cpf: String(formData.get("cpf") ?? ""),
    });
    if (!result) return { error: "Cliente não encontrado." };

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${clienteId}`);
    redirect(`/clientes/${clienteId}`);
  } catch (err) {
    if (err instanceof TelefoneDuplicadoError) return { error: err.message };
    if (isValidationError(err)) {
      return { error: "Dados inválidos. Confira nome, telefone e CPF." };
    }
    throw err;
  }
}
