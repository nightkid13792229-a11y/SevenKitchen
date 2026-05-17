-- AlterTable
DO $$
BEGIN
    IF to_regclass('public.global_config') IS NOT NULL THEN
        ALTER TABLE "global_config"
            ADD COLUMN IF NOT EXISTS "home_header_bg_image_url" TEXT;
    END IF;
END $$;
