-- AlterTable
ALTER TABLE "order" ADD COLUMN "order_no" VARCHAR(20);

-- CreateTable
CREATE TABLE "order_sequence" (
    "date_key" VARCHAR(8) NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_sequence_pkey" PRIMARY KEY ("date_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_order_no_key" ON "order"("order_no");
