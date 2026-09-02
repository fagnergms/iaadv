import { describe, it, expect } from "vitest";
import { isValidCPF, isValidE164, clienteSchema, advogadoSchema } from "./validation";

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
