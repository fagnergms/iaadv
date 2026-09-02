import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "./db";
import { resetDb, makeAdvogado } from "./testHelpers";

describe("test database", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("starts empty after reset", async () => {
    expect(await prisma.advogado.count()).toBe(0);
  });

  it("makeAdvogado creates a usable row", async () => {
    const advogado = await makeAdvogado({ nome: "Fulano" });
    expect(advogado.nome).toBe("Fulano");
    expect(await prisma.advogado.count()).toBe(1);
  });
});
