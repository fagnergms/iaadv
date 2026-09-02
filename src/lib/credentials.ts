import { prisma } from "./db";
import { verifyPassword } from "./password";

export async function verifyCredentials(email: string, password: string) {
  const advogado = await prisma.advogado.findUnique({ where: { email } });
  if (!advogado || !advogado.ativo) return null;

  const valid = await verifyPassword(password, advogado.senhaHash);
  if (!valid) return null;

  return {
    id: advogado.id,
    nome: advogado.nome,
    email: advogado.email,
    isAdmin: advogado.isAdmin,
  };
}

/**
 * Re-reads an advogado by id, returning null when the account no longer exists
 * or was deactivated. Used on every request to revoke live sessions as soon as
 * an admin flips `ativo`, instead of waiting for the JWT to expire.
 */
export async function getAdvogadoAtivoById(id: string) {
  const advogado = await prisma.advogado.findUnique({ where: { id } });
  if (!advogado || !advogado.ativo) return null;

  return {
    id: advogado.id,
    nome: advogado.nome,
    email: advogado.email,
    isAdmin: advogado.isAdmin,
  };
}
