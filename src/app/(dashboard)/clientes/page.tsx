import Link from "next/link";
import { auth } from "@/lib/auth";
import { listClientesByAdvogado } from "@/lib/clientes";

export default async function ClientesPage() {
  const session = await auth();
  const clientes = await listClientesByAdvogado(session!.user.id);

  return (
    <div>
      <h1>Clientes</h1>
      <Link href="/clientes/novo">Novo cliente</Link>
      <ul>
        {clientes.map((c) => (
          <li key={c.id}>
            <Link href={`/clientes/${c.id}`}>{c.nome}</Link> — {c.telefone}
          </li>
        ))}
      </ul>
    </div>
  );
}
