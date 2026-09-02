import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const nome = process.env.SEED_ADMIN_NOME ?? "Administrador";

  if (!email || !password) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD antes de rodar o seed."
    );
  }

  const existing = await prisma.advogado.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} já existe, nada a fazer.`);
    return;
  }

  const senhaHash = await hashPassword(password);
  await prisma.advogado.create({
    data: { nome, email, senhaHash, isAdmin: true, ativo: true },
  });

  console.log(`Admin ${email} criado com sucesso.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
