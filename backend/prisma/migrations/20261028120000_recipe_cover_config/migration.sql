CREATE TABLE "recipe_cover_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "prompt_template" TEXT NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_cover_config_pkey" PRIMARY KEY ("id")
);
