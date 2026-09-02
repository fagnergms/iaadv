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
