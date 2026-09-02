import Link from "next/link";
import { auth } from "@/lib/auth";
import { listAdvogados } from "@/lib/advogados";
import { toggleAdvogadoAtivoAction } from "@/app/actions/advogados";

export default async function AdvogadosPage() {
  const session = await auth();
  const advogados = await listAdvogados(session!.user.id);

  return (
    <div>
      <h1>Advogados</h1>
      <Link href="/admin/advogados/novo">Novo advogado</Link>
      <ul>
        {advogados.map((a) => (
          <li key={a.id}>
            {a.nome} — {a.email} — {a.ativo ? "ativo" : "inativo"}
            <form
              action={async () => {
                "use server";
                await toggleAdvogadoAtivoAction(a.id, !a.ativo);
              }}
            >
              <button type="submit">{a.ativo ? "Desativar" : "Ativar"}</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
