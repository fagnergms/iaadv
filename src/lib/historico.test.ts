import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import { createProcesso } from "./processos";
import {
  addHistoricoStatus,
  listHistoricoForProcesso,
  ProcessoNaoEncontradoError,
} from "./historico";

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

describe("historico service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("adiciona uma entrada e atualiza o status_atual do processo", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);
    const processo = await createProcesso(advogado.id, cliente.id, processoInput);

    const entrada = await addHistoricoStatus(
      advogado.id,
      processo.id,
      "Audiência marcada para 10/10"
    );
    expect(entrada.texto).toBe("Audiência marcada para 10/10");

    const historico = await listHistoricoForProcesso(advogado.id, processo.id);
    expect(historico).toHaveLength(1);
  });

  it("rejeita adicionar histórico em processo de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    const processo = await createProcesso(advogadoA.id, cliente.id, processoInput);

    await expect(
      addHistoricoStatus(advogadoB.id, processo.id, "Tentativa indevida")
    ).rejects.toBeInstanceOf(ProcessoNaoEncontradoError);
  });

  it("não permite listar histórico de processo de outro advogado", async () => {
    const advogadoA = await makeAdvogado();
    const advogadoB = await makeAdvogado();
    const cliente = await createCliente(advogadoA.id, clienteInput);
    const processo = await createProcesso(advogadoA.id, cliente.id, processoInput);

    expect(await listHistoricoForProcesso(advogadoB.id, processo.id)).toBeNull();
  });
});
