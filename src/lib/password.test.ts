import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("senha-super-secreta");
    expect(hash).not.toBe("senha-super-secreta");
    expect(await verifyPassword("senha-super-secreta", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("senha-correta");
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
  });
});
