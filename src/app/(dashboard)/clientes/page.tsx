import Link from "next/link";
import { auth } from "@/lib/auth";
import { listClientesByAdvogado } from "@/lib/clientes";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/Field";
import { buttonClass } from "@/components/ui/button-styles";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const busca = Array.isArray(q) ? q[0] : q;
  const session = await auth();
  const clientes = await listClientesByAdvogado(session!.user.id, busca);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        action={
          <Link href="/clientes/novo" className={buttonClass("primary")}>
            Novo cliente
          </Link>
        }
      />

      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={busca ?? ""}
          placeholder="Buscar por nome"
          className={`${inputClass} max-w-xs`}
        />
        <button type="submit" className={buttonClass("secondary")}>
          Buscar
        </button>
      </form>

      {clientes.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum cliente encontrado.</p>
      ) : (
        <ul className="divide-y divide-slate rounded-lg border border-slate bg-paper-raised">
          {clientes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clientes/${c.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-slate-soft"
              >
                <span className="font-medium text-ink">{c.nome}</span>
                <span className="text-sm text-ink-muted">{c.telefone}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
