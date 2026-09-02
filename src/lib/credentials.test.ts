import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { resetDb, makeAdvogado } from "./testHelpers";
import { hashPassword } from "./password";
import { verifyCredentials, getAdvogadoAtivoById } from "./credentials";

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

describe("getAdvogadoAtivoById", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("retorna o advogado ativo com o isAdmin atual", async () => {
    const advogado = await makeAdvogado({ isAdmin: true });

    const result = await getAdvogadoAtivoById(advogado.id);
    expect(result?.id).toBe(advogado.id);
    expect(result?.isAdmin).toBe(true);
  });

  it("retorna null depois que o advogado é desativado", async () => {
    const advogado = await makeAdvogado({ ativo: true });
    expect(await getAdvogadoAtivoById(advogado.id)).not.toBeNull();

    await prisma.advogado.update({
      where: { id: advogado.id },
      data: { ativo: false },
    });

    expect(await getAdvogadoAtivoById(advogado.id)).toBeNull();
  });

  it("retorna null para um id inexistente", async () => {
    expect(await getAdvogadoAtivoById(crypto.randomUUID())).toBeNull();
  });
});
