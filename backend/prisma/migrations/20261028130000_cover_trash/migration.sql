CREATE TABLE "cover_trash" (
    "id" TEXT NOT NULL,
    "source_url" VARCHAR(1000) NOT NULL,
    "trash_url" VARCHAR(1000) NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "moved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delete_after" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cover_trash_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cover_trash_delete_after_idx" ON "cover_trash"("delete_after");
