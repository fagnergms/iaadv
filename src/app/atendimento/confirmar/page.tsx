import { redirect } from "next/navigation";
import { ConfirmarForm } from "./confirmar-form";

export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<{ telefone?: string }>;
}) {
  const { telefone } = await searchParams;
  if (!telefone) redirect("/atendimento");

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate bg-paper-raised p-8">
        <p className="font-serif text-lg font-semibold text-ink">Escritório</p>
        <h1 className="mt-1 mb-6 text-sm text-ink-muted">Confirmar identidade</h1>
        <ConfirmarForm telefone={telefone} />
      </div>
    </main>
  );
}
