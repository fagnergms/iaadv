import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { resetDb, makeAdvogado } from "./testHelpers";
import { createCliente } from "./clientes";
import { listarMensagens, adicionarMensagem } from "./mensagens";

describe("mensagens service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("adiciona e lista mensagens em ordem cronologica", async () => {
    const advogado = await makeAdvogado();
    await createCliente(advogado.id, {
      nome: "Maria Silva",
      telefone: "+5511999990000",
      cpf: "111.444.777-35",
    });
    const conversa = await prisma.conversa.create({
      data: { telefone: "+5511999990000", ultimaMensagemEm: new Date() },
    });

    await adicionarMensagem(conversa.id, "cliente", "oi, como esta meu processo?");
    await adicionarMensagem(conversa.id, "bot", "vou verificar pra voce");

    const mensagens = await listarMensagens(conversa.id);
    expect(mensagens).toHaveLength(2);
    expect(mensagens[0].texto).toBe("oi, como esta meu processo?");
    expect(mensagens[0].remetente).toBe("cliente");
    expect(mensagens[1].remetente).toBe("bot");
  });

  it("nao mistura mensagens de conversas diferentes", async () => {
    const advogado = await makeAdvogado();
    await createCliente(advogado.id, {
      nome: "Maria Silva",
      telefone: "+5511999990000",
      cpf: "111.444.777-35",
    });
    await createCliente(advogado.id, {
      nome: "Joao Souza",
      telefone: "+5511999990001",
      cpf: "111.444.777-35".replace("35", "35"),
    });
    const conversaA = await prisma.conversa.create({
      data: { telefone: "+5511999990000", ultimaMensagemEm: new Date() },
    });
    const conversaB = await prisma.conversa.create({
      data: { telefone: "+5511999990001", ultimaMensagemEm: new Date() },
    });

    await adicionarMensagem(conversaA.id, "cliente", "mensagem A");
    await adicionarMensagem(conversaB.id, "cliente", "mensagem B");

    expect(await listarMensagens(conversaA.id)).toHaveLength(1);
    expect(await listarMensagens(conversaB.id)).toHaveLength(1);
  });
});
