import { describe, it, expect } from "vitest";
import { interpretarRespostaIA } from "./ia";

describe("interpretarRespostaIA", () => {
  it("retorna a resposta normal quando nao ha tag de escalonamento", () => {
    const resultado = interpretarRespostaIA(
      "Seu processo esta aguardando julgamento do recurso."
    );
    expect(resultado).toEqual({
      texto: "Seu processo esta aguardando julgamento do recurso.",
      precisaEscalar: false,
      motivoEscalonamento: null,
    });
  });

  it("detecta a tag [ESCALAR] e extrai o motivo", () => {
    const resultado = interpretarRespostaIA(
      "Nao encontrei essa informacao.\n[ESCALAR] pergunta fora do escopo"
    );
    expect(resultado.precisaEscalar).toBe(true);
    expect(resultado.motivoEscalonamento).toBe("pergunta fora do escopo");
    expect(resultado.texto).toBe("Nao encontrei essa informacao.");
  });

  it("usa um motivo padrao se a tag nao tiver texto depois", () => {
    const resultado = interpretarRespostaIA("Vou verificar.\n[ESCALAR]");
    expect(resultado.precisaEscalar).toBe(true);
    expect(resultado.motivoEscalonamento).toBe("fora do escopo");
  });

  it("usa uma mensagem padrao se o texto ficar vazio apos remover a tag", () => {
    const resultado = interpretarRespostaIA("[ESCALAR] pedido de humano");
    expect(resultado.texto).toBe("Vou encaminhar sua mensagem para um advogado.");
  });
});
