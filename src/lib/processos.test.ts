import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import {
  createProcesso,
  listProcessosByCliente,
  getProcessoForAdvogado,
  updateProcesso,
  ClienteNaoEncontradoError,
} from "./processos";

const clienteInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

const processoInput = {
  numeroProcesso: "0001234-56.2026.8.26.0100",
  descricao: "Ação de cobrança",
  statusAtual: "Aguardando distribuição",
};

describe("processos service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cria um processo vinculado ao cliente e ao advogado", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    const processo = await createProcesso(advogado.id, cliente.id, processoInput);
    expect(processo.clienteId).toBe(cliente.id);
    expect(processo.advogadoId).toBe(advogado.id);
    expect(processo.situacao).toBe("ativo");
  });

  it("rejeita criar processo em cliente de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);

    await expect(
      createProcesso(advogadoB.id, cliente.id, processoInput)
    ).rejects.toBeInstanceOf(ClienteNaoEncontradoError);
  });

  it("lista processos apenas para o advogado dono do cliente", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    await createProcesso(advogadoA.id, cliente.id, processoInput);

    expect(await listProcessosByCliente(advogadoA.id, cliente.id)).toHaveLength(1);
    expect(await listProcessosByCliente(advogadoB.id, cliente.id)).toBeNull();
  });

  it("não permite acessar ou editar processo de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    const processo = await createProcesso(advogadoA.id, cliente.id, processoInput);

    expect(await getProcessoForAdvogado(advogadoB.id, processo.id)).toBeNull();
    expect(
      await updateProcesso(advogadoB.id, processo.id, { situacao: "encerrado" })
    ).toBeNull();
  });

  it("atualiza a situação do processo", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);
    const processo = await createProcesso(advogado.id, cliente.id, processoInput);

    const updated = await updateProcesso(advogado.id, processo.id, {
      situacao: "encerrado",
    });
    expect(updated?.situacao).toBe("encerrado");
  });
});
