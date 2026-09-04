import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClienteForAdvogado } from "@/lib/clientes";
import { PageHeader } from "@/components/ui/PageHeader";
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Editar ${cliente.nome}`} />
      <EditarClienteForm cliente={cliente} />
    </div>
  );
}
