import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeAdvogado } from "./testHelpers";
import { verifyPassword } from "./password";
import {
  createAdvogado,
  listAdvogados,
  setAdvogadoAtivo,
  NaoAutorizadoError,
  EmailDuplicadoError,
} from "./advogados";

describe("advogados (admin) service", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("admin consegue criar um novo advogado com senha com hash", async () => {
    const admin = await makeAdvogado({ isAdmin: true });

    const novo = await createAdvogado(admin.id, {
      nome: "Dr. Fulano",
      email: "fulano@escritorio.com",
      senha: "senha1234",
    });

    expect(novo.senhaHash).not.toBe("senha1234");
    expect(await verifyPassword("senha1234", novo.senhaHash)).toBe(true);
  });

  it("não-admin não consegue criar advogado", async () => {
    const naoAdmin = await makeAdvogado({ isAdmin: false });

    await expect(
      createAdvogado(naoAdmin.id, {
        nome: "Dr. Fulano",
        email: "fulano@escritorio.com",
        senha: "senha1234",
      })
    ).rejects.toBeInstanceOf(NaoAutorizadoError);
  });

  it("rejeita e-mail já cadastrado com EmailDuplicadoError", async () => {
    const admin = await makeAdvogado({ isAdmin: true });
    const input = {
      nome: "Dr. Fulano",
      email: "fulano@escritorio.com",
      senha: "senha1234",
    };
    await createAdvogado(admin.id, input);

    await expect(
      createAdvogado(admin.id, { ...input, nome: "Outro Nome" })
    ).rejects.toBeInstanceOf(EmailDuplicadoError);
  });

  it("admin desativado perde os poderes de admin", async () => {
    const adminInativo = await makeAdvogado({ isAdmin: true, ativo: false });

    await expect(
      createAdvogado(adminInativo.id, {
        nome: "Dr. Fulano",
        email: "fulano@escritorio.com",
        senha: "senha1234",
      })
    ).rejects.toBeInstanceOf(NaoAutorizadoError);
    await expect(listAdvogados(adminInativo.id)).rejects.toBeInstanceOf(
      NaoAutorizadoError
    );
  });

  it("não-admin não consegue listar advogados", async () => {
    const naoAdmin = await makeAdvogado({ isAdmin: false });
    await expect(listAdvogados(naoAdmin.id)).rejects.toBeInstanceOf(NaoAutorizadoError);
  });

  it("listAdvogados não expõe o hash da senha", async () => {
    const admin = await makeAdvogado({ isAdmin: true });
    const lista = await listAdvogados(admin.id);
    expect(lista[0]).not.toHaveProperty("senhaHash");
  });

  it("admin consegue desativar um advogado", async () => {
    const admin = await makeAdvogado({ isAdmin: true });
    const outro = await makeAdvogado({ ativo: true });

    const atualizado = await setAdvogadoAtivo(admin.id, outro.id, false);
    expect(atualizado.ativo).toBe(false);
  });
});
