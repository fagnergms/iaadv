import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProcessoForAdvogado } from "@/lib/processos";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditarProcessoForm } from "./form";

export default async function EditarProcessoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const processo = await getProcessoForAdvogado(session!.user.id, id);
  if (!processo) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Editar ${processo.numeroProcesso}`} />
      <EditarProcessoForm processo={processo} />
    </div>
  );
}
