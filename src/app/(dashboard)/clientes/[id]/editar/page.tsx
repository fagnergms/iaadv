import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClienteForAdvogado } from "@/lib/clientes";
import { EditarClienteForm } from "./form";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const cliente = await getClienteForAdvogado(session!.user.id, id);
  if (!cliente) notFound();

  return <EditarClienteForm cliente={cliente} />;
}
