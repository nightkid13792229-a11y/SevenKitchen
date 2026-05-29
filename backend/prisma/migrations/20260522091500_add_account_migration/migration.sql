CREATE TYPE "AccountMigrationStatus" AS ENUM (
    'PENDING',
    'PHONE_VERIFIED',
    'CONFIRMED',
    'EXPIRED',
    'CANCELLED'
);

CREATE TABLE "account_migration" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(80) NOT NULL,
    "source_user_id" TEXT NOT NULL,
    "verified_user_id" TEXT,
    "target_user_id" TEXT,
    "phone" VARCHAR(20),
    "status" "AccountMigrationStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "account_migration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_migration_token_key" ON "account_migration"("token");
CREATE INDEX "account_migration_source_user_id_status_idx" ON "account_migration"("source_user_id", "status");
CREATE INDEX "account_migration_verified_user_id_idx" ON "account_migration"("verified_user_id");
CREATE INDEX "account_migration_target_user_id_idx" ON "account_migration"("target_user_id");
CREATE INDEX "account_migration_expires_at_idx" ON "account_migration"("expires_at");
