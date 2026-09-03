-- CreateTable
CREATE TABLE "conversas" (
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "verificado_em" TIMESTAMP(3),
    "tentativas_falhas" INTEGER NOT NULL DEFAULT 0,
    "ultima_mensagem_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalonamentos" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "advogado_id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "mensagem_cliente" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvido_em" TIMESTAMP(3),

    CONSTRAINT "escalonamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversas_telefone_key" ON "conversas"("telefone");

-- AddForeignKey
ALTER TABLE "escalonamentos" ADD CONSTRAINT "escalonamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalonamentos" ADD CONSTRAINT "escalonamentos_advogado_id_fkey" FOREIGN KEY ("advogado_id") REFERENCES "advogados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
