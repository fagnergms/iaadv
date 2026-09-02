import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import { hashPassword } from "./password";
import { verifyCredentials } from "./credentials";

describe("verifyCredentials", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("retorna o advogado quando email e senha estão corretos", async () => {
    const senhaHash = await hashPassword("senha12345678");
    const advogado = await makeAdvogado({ email: "fulano@escritorio.com", senhaHash });

    const result = await verifyCredentials("fulano@escritorio.com", "senha12345678");
    expect(result?.id).toBe(advogado.id);
  });

  it("retorna null com senha errada", async () => {
    const senhaHash = await hashPassword("senha12345678");
    await makeAdvogado({ email: "fulano@escritorio.com", senhaHash });

    expect(await verifyCredentials("fulano@escritorio.com", "senha-errada")).toBeNull();
  });

  it("retorna null para email inexistente", async () => {
    expect(await verifyCredentials("ninguem@escritorio.com", "qualquer")).toBeNull();
  });

  it("retorna null para advogado inativo", async () => {
    const senhaHash = await hashPassword("senha12345678");
    await makeAdvogado({
      email: "inativo@escritorio.com",
      senhaHash,
      ativo: false,
    });

    expect(
      await verifyCredentials("inativo@escritorio.com", "senha12345678")
    ).toBeNull();
  });
});
