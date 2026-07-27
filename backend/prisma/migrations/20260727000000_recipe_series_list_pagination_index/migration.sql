CREATE INDEX IF NOT EXISTS "recipe_series_created_by_status_business_status_updated_at_idx"
  ON "recipe_series"("created_by", "status", "business_status", "updated_at" DESC);
