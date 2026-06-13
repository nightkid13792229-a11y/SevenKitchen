ALTER TABLE "diy_sheet"
  ADD COLUMN IF NOT EXISTS "package_plan" JSONB;
