import Link from "next/link";
import { auth } from "@/lib/auth";
import { listAdvogados } from "@/lib/advogados";
import { toggleAdvogadoAtivoAction } from "@/app/actions/advogados";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { buttonClass } from "@/components/ui/button-styles";

export default async function AdvogadosPage() {
  const session = await auth();
  const advogados = await listAdvogados(session!.user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Advogados"
        action={
          <Link
            href="/admin/advogados/novo"
            className={buttonClass("primary")}
          >
            Novo advogado
          </Link>
        }
      />

      <ul className="divide-y divide-slate rounded-lg border border-slate bg-paper-raised">
        {advogados.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <span className="flex flex-col">
              <span className="font-medium text-ink">{a.nome}</span>
              <span className="text-sm text-ink-muted">{a.email}</span>
            </span>
            <div className="flex items-center gap-3">
              <StatusBadge tone={a.ativo ? "moss" : "brick"}>
                {a.ativo ? "ativo" : "inativo"}
              </StatusBadge>
              <form
                action={async () => {
                  "use server";
                  await toggleAdvogadoAtivoAction(a.id, !a.ativo);
                }}
              >
                <button
                  type="submit"
                  className={buttonClass(a.ativo ? "danger" : "secondary")}
                >
                  {a.ativo ? "Desativar" : "Ativar"}
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
