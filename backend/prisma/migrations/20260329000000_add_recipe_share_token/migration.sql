-- CreateTable
CREATE TABLE "recipe_share_token" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "recipe_share_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipe_share_token_token_key" ON "recipe_share_token"("token");

-- CreateIndex
CREATE INDEX "recipe_share_token_recipe_id_idx" ON "recipe_share_token"("recipe_id");

-- CreateIndex
CREATE INDEX "recipe_share_token_expires_at_idx" ON "recipe_share_token"("expires_at");

-- AddForeignKey
ALTER TABLE "recipe_share_token" ADD CONSTRAINT "recipe_share_token_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
