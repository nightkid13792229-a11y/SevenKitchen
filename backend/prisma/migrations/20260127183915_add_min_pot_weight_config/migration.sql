-- AlterTable
DO $$
BEGIN
    IF to_regclass('public.global_config') IS NOT NULL THEN
        ALTER TABLE "global_config"
            ADD COLUMN IF NOT EXISTS "min_pot_weight_g" INTEGER NOT NULL DEFAULT 2000;
    END IF;
END $$;
