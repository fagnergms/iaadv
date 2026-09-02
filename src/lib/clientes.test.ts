import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import {
  createCliente,
  listClientesByAdvogado,
  getClienteForAdvogado,
  updateCliente,
  TelefoneDuplicadoError,
} from "./clientes";

const validInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

describe("clientes service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cria um cliente vinculado ao advogado", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, validInput);
    expect(cliente.nome).toBe("Maria Silva");
    expect(cliente.advogadoId).toBe(advogado.id);
  });

  it("rejeita telefone duplicado entre advogados diferentes", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    await createCliente(advogadoA.id, validInput);

    await expect(
      createCliente(advogadoB.id, { ...validInput, nome: "Outro Nome" })
    ).rejects.toBeInstanceOf(TelefoneDuplicadoError);
  });

  it("lista apenas os clientes do advogado logado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    await createCliente(advogadoA.id, validInput);
    await createCliente(advogadoB.id, {
      ...validInput,
      telefone: "+5511999990001",
    });

    const clientesA = await listClientesByAdvogado(advogadoA.id);
    expect(clientesA).toHaveLength(1);
    expect(clientesA[0].advogadoId).toBe(advogadoA.id);
  });

  it("não permite um advogado acessar cliente de outro", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, validInput);

    expect(await getClienteForAdvogado(advogadoB.id, cliente.id)).toBeNull();
  });

  it("não permite um advogado editar cliente de outro", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, validInput);

    const result = await updateCliente(advogadoB.id, cliente.id, {
      ...validInput,
      nome: "Nome Alterado",
    });
    expect(result).toBeNull();
  });
});
