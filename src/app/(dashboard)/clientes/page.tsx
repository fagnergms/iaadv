import Link from "next/link";
import { auth } from "@/lib/auth";
import { listClientesByAdvogado } from "@/lib/clientes";

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
    <div>
      <h1>Clientes</h1>
      <Link href="/clientes/novo">Novo cliente</Link>
      <form method="get">
        <label>
          Buscar por nome
          <input type="search" name="q" defaultValue={busca ?? ""} />
        </label>
        <button type="submit">Buscar</button>
      </form>
      <ul>
        {clientes.map((c) => (
          <li key={c.id}>
            <Link href={`/clientes/${c.id}`}>{c.nome}</Link> — {c.telefone}
          </li>
        ))}
      </ul>
      {clientes.length === 0 && <p>Nenhum cliente encontrado.</p>}
    </div>
  );
}
