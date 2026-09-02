import { describe, it, expect } from "vitest";
import {
  isValidCPF,
  isValidE164,
  clienteSchema,
  advogadoSchema,
  processoSchema,
} from "./validation";

describe("isValidCPF", () => {
  it("accepts a valid CPF", () => {
    expect(isValidCPF("111.444.777-35")).toBe(true);
  });

  it("rejects a CPF with all repeated digits", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
  });

  it("rejects a CPF with a wrong check digit", () => {
    expect(isValidCPF("111.444.777-36")).toBe(false);
  });
});

describe("isValidE164", () => {
  it("accepts a valid E.164 phone", () => {
    expect(isValidE164("+5511999990000")).toBe(true);
  });

  it("rejects a phone without country code", () => {
    expect(isValidE164("11999990000")).toBe(false);
  });
});

describe("clienteSchema", () => {
  it("accepts valid input", () => {
    const result = clienteSchema.safeParse({
      nome: "Maria Silva",
      telefone: "+5511999990000",
      cpf: "111.444.777-35",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const result = clienteSchema.safeParse({
      nome: "",
      telefone: "+5511999990000",
      cpf: "111.444.777-35",
    });
    expect(result.success).toBe(false);
  });

  it("normalizes a punctuated CPF to 11 digits", () => {
    const result = clienteSchema.parse({
      nome: "Maria Silva",
      telefone: "+5511999990000",
      cpf: " 111.444.777-35 ",
    });
    expect(result.cpf).toBe("11144477735");
  });

  it("still rejects an invalid CPF before normalizing", () => {
    const result = clienteSchema.safeParse({
      nome: "Maria Silva",
      telefone: "+5511999990000",
      cpf: "111.444.777-36",
    });
    expect(result.success).toBe(false);
  });
});

describe("processoSchema", () => {
  it("accepts valid input", () => {
    const result = processoSchema.safeParse({
      numeroProcesso: "0001234-56.2026.8.26.0100",
      descricao: "Ação de cobrança",
      statusAtual: "Aguardando distribuição",
    });
    expect(result.success).toBe(true);
  });

  it("rejects whitespace-only fields", () => {
    const result = processoSchema.safeParse({
      numeroProcesso: "   ",
      descricao: "   ",
      statusAtual: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("trims the stored values", () => {
    const result = processoSchema.parse({
      numeroProcesso: "  0001234-56.2026.8.26.0100  ",
      descricao: "  Ação de cobrança  ",
      statusAtual: "  Aguardando distribuição  ",
    });
    expect(result.numeroProcesso).toBe("0001234-56.2026.8.26.0100");
    expect(result.descricao).toBe("Ação de cobrança");
  });
});

describe("advogadoSchema", () => {
  it("accepts valid input", () => {
    const result = advogadoSchema.safeParse({
      nome: "Dr. Fulano",
      email: "fulano@escritorio.com",
      senha: "senha1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a short password", () => {
    const result = advogadoSchema.safeParse({
      nome: "Dr. Fulano",
      email: "fulano@escritorio.com",
      senha: "123",
    });
    expect(result.success).toBe(false);
  });
});
