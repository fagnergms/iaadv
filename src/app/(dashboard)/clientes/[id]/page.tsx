import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getClienteForAdvogado } from "@/lib/clientes";
import { listProcessosByCliente } from "@/lib/processos";

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const cliente = await getClienteForAdvogado(session!.user.id, id);
  if (!cliente) notFound();

  const processos = await listProcessosByCliente(session!.user.id, id);

  return (
    <div>
      <h1>{cliente.nome}</h1>
      <p>Telefone: {cliente.telefone}</p>
      <p>CPF: {cliente.cpf}</p>
      <Link href={`/clientes/${cliente.id}/editar`}>Editar cliente</Link>

      <h2>Processos</h2>
      <Link href={`/clientes/${cliente.id}/processos/novo`}>Novo processo</Link>
      <ul>
        {processos?.map((p) => (
          <li key={p.id}>
            <Link href={`/processos/${p.id}`}>{p.numeroProcesso}</Link> —{" "}
            {p.statusAtual} ({p.situacao})
          </li>
        ))}
      </ul>
    </div>
  );
}
