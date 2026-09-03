import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import {
  listEscalonamentosPendentes,
  resolverEscalonamento,
} from "./escalonamentos";

const clienteInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

async function makeEscalonamento(
  advogadoId: string,
  clienteId: string,
  overrides: Partial<{
    telefone: string;
    mensagemCliente: string;
    motivo: string | null;
    resolvidoEm: Date | null;
  }> = {}
) {
  return prisma.escalonamento.create({
    data: {
      advogadoId,
      clienteId,
      telefone: overrides.telefone ?? "+5511999990000",
      mensagemCliente: overrides.mensagemCliente ?? "Preciso falar com alguém",
      motivo: overrides.motivo ?? "fora do escopo",
      resolvidoEm: overrides.resolvidoEm ?? null,
    },
  });
}

describe("escalonamentos service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lista apenas escalonamentos pendentes do advogado logado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const clienteA = await createCliente(advogadoA.id, clienteInput);

    const pendente = await makeEscalonamento(advogadoA.id, clienteA.id);
    await makeEscalonamento(advogadoA.id, clienteA.id, {
      resolvidoEm: new Date(),
    });

    const lista = await listEscalonamentosPendentes(advogadoA.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe(pendente.id);

    const listaB = await listEscalonamentosPendentes(advogadoB.id);
    expect(listaB).toHaveLength(0);
  });

  it("resolve um escalonamento e marca resolvido_em", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);
    const escalonamento = await makeEscalonamento(advogado.id, cliente.id);

    const resolvido = await resolverEscalonamento(advogado.id, escalonamento.id);
    expect(resolvido?.resolvidoEm).not.toBeNull();
  });

  it("não permite resolver escalonamento de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    const escalonamento = await makeEscalonamento(advogadoA.id, cliente.id);

    const result = await resolverEscalonamento(advogadoB.id, escalonamento.id);
    expect(result).toBeNull();
  });
});
