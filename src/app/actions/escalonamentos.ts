"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolverEscalonamento } from "@/lib/escalonamentos";

export async function resolverEscalonamentoAction(escalonamentoId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  await resolverEscalonamento(session.user.id, escalonamentoId);
  revalidatePath("/atendimentos");
}
