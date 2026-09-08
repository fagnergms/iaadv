import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import {
  buscarClientePorTelefone,
  confirmarCpf,
  obterConversaValida,
} from "./atendimento";

const clienteInput = {
  nome: "Maria Silva",
  telefone: "+5511999990000",
  cpf: "111.444.777-35",
};

describe("atendimento service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("busca cliente pelo telefone", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    const encontrado = await buscarClientePorTelefone(clienteInput.telefone);
    expect(encontrado?.id).toBe(cliente.id);
    expect(encontrado?.advogadoId).toBe(advogado.id);

    expect(await buscarClientePorTelefone("+5511999999999")).toBeNull();
  });

  it("confirmarCpf retorna cliente_nao_encontrado pra telefone nao cadastrado", async () => {
    const resultado = await confirmarCpf("+5511999999999", "7735");
    expect(resultado.status).toBe("cliente_nao_encontrado");
  });

  it("confirmarCpf confirma com os ultimos 4 digitos corretos e gera sessionToken", async () => {
    const advogado = await makeAdvogado();
    await createCliente(advogado.id, clienteInput);

    const resultado = await confirmarCpf(clienteInput.telefone, "7735");
    expect(resultado.status).toBe("confirmado");
    if (resultado.status === "confirmado") {
      expect(resultado.sessionToken).toHaveLength(64);

      const sessao = await obterConversaValida(resultado.sessionToken);
      expect(sessao?.cliente.id).toBe(resultado.clienteId);
    }
  });

  it("confirmarCpf rejeita digitos errados e conta tentativas", async () => {
    const advogado = await makeAdvogado();
    await createCliente(advogado.id, clienteInput);

    const r1 = await confirmarCpf(clienteInput.telefone, "0000");
    expect(r1).toEqual({ status: "cpf_invalido", tentativasRestantes: 2 });

    const r2 = await confirmarCpf(clienteInput.telefone, "0000");
    expect(r2).toEqual({ status: "cpf_invalido", tentativasRestantes: 1 });
  });

  it("bloqueia e cria escalonamento apos 3 tentativas erradas", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    await confirmarCpf(clienteInput.telefone, "0000");
    await confirmarCpf(clienteInput.telefone, "0000");
    const r3 = await confirmarCpf(clienteInput.telefone, "0000");
    expect(r3.status).toBe("bloqueado");

    const r4 = await confirmarCpf(clienteInput.telefone, "7735");
    expect(r4.status).toBe("bloqueado");

    const escalonamentos = await prisma.escalonamento.findMany({
      where: { clienteId: cliente.id },
    });
    expect(escalonamentos).toHaveLength(1);
    expect(escalonamentos[0].motivo).toBe("falha na verificação");
  });

  it("obterConversaValida retorna null pra token inexistente ou sessao expirada", async () => {
    expect(await obterConversaValida("token-que-nao-existe")).toBeNull();

    const advogado = await makeAdvogado();
    await createCliente(advogado.id, clienteInput);
    const confirmado = await confirmarCpf(clienteInput.telefone, "7735");
    if (confirmado.status !== "confirmado") throw new Error("setup falhou");

    await prisma.conversa.update({
      where: { telefone: clienteInput.telefone },
      data: { verificadoEm: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    expect(await obterConversaValida(confirmado.sessionToken)).toBeNull();
  });

  it("nao permite mais de 3 tentativas efetivas mesmo com falhas concorrentes (race no contador)", async () => {
    const advogado = await makeAdvogado();
    const cliente = await createCliente(advogado.id, clienteInput);

    // Dispara 5 tentativas erradas em paralelo, simulando requisições concorrentes
    // (ex.: um atacante script automatizando múltiplas abas). Um contador
    // read-then-write ingênuo permitiria "perder" incrementos e conceder mais
    // tentativas do que o limite de 3.
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => confirmarCpf(clienteInput.telefone, "0000"))
    );

    const bloqueados = resultados.filter((r) => r.status === "bloqueado");
    const invalidos = resultados.filter((r) => r.status === "cpf_invalido");
    // Com incremento atômico, cada tentativa que efetivamente consome o
    // contador recebe um valor sequencial único (1, 2, 3, ...) — nunca duas
    // requisições concorrentes "colidem" no mesmo valor. Logo, exatamente as
    // 2 tentativas que pegam os valores 1 e 2 veem cpf_invalido, e as demais
    // (a que cruza o limite em 3, mais qualquer uma que já leia o estado
    // bloqueado) veem bloqueado — sempre 2 e 3, com qualquer ordem de
    // execução das 5 chamadas concorrentes.
    expect(invalidos.length).toBe(2);
    expect(bloqueados.length).toBe(3);

    const conversa = await prisma.conversa.findUnique({
      where: { telefone: clienteInput.telefone },
    });
    // O contador nunca "perde" incrementos por causa de uma corrida: ele é
    // sempre >= 3 (o suficiente pra ter disparado o bloqueio) e <= 5 (não
    // pode passar do número de tentativas reais feitas).
    expect(conversa?.tentativasFalhas).toBeGreaterThanOrEqual(3);
    expect(conversa?.tentativasFalhas).toBeLessThanOrEqual(5);

    // Mesmo com 5 tentativas concorrentes cruzando o limite, exatamente um
    // escalonamento deve ser criado (sem duplicar no ponto de corte).
    const escalonamentos = await prisma.escalonamento.findMany({
      where: { clienteId: cliente.id },
    });
    expect(escalonamentos).toHaveLength(1);

    // Uma tentativa correta após o bloqueio concorrente continua bloqueada.
    const posBloqueio = await confirmarCpf(clienteInput.telefone, "7735");
    expect(posBloqueio.status).toBe("bloqueado");
  });
});
