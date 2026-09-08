-- CreateEnum
CREATE TYPE "RemetenteMensagem" AS ENUM ('cliente', 'bot');

-- AlterTable
ALTER TABLE "conversas" ADD COLUMN     "session_token" TEXT;

-- CreateTable
CREATE TABLE "mensagens_chat" (
    "id" TEXT NOT NULL,
    "conversa_id" TEXT NOT NULL,
    "remetente" "RemetenteMensagem" NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_chat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversas_session_token_key" ON "conversas"("session_token");

-- AddForeignKey
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

