import { auth } from "@/lib/auth";
import { listEscalonamentosPendentes } from "@/lib/escalonamentos";
import { resolverEscalonamentoAction } from "@/app/actions/escalonamentos";

export default async function AtendimentosPage() {
  const session = await auth();
  const escalonamentos = await listEscalonamentosPendentes(session!.user.id);

  return (
    <div>
      <h1>Atendimentos pendentes</h1>
      {escalonamentos.length === 0 && <p>Nenhum atendimento pendente.</p>}
      <ul>
        {escalonamentos.map((e) => (
          <li key={e.id}>
            <p>Telefone: {e.telefone}</p>
            <p>Mensagem: {e.mensagemCliente}</p>
            {e.motivo && <p>Motivo: {e.motivo}</p>}
            <p>{e.criadoEm.toLocaleString("pt-BR")}</p>
            <form
              action={async () => {
                "use server";
                await resolverEscalonamentoAction(e.id);
              }}
            >
              <button type="submit">Marcar como resolvido</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
