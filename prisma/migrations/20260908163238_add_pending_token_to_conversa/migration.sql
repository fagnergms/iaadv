-- AlterTable
ALTER TABLE "conversas" ADD COLUMN     "pending_token" TEXT,
ADD COLUMN     "pending_token_expira_em" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "conversas_pending_token_key" ON "conversas"("pending_token");

