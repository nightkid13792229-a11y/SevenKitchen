ALTER TABLE "order_recipe_design" ADD COLUMN "staged_content_revision" INTEGER;

UPDATE "order_recipe_design" d
SET "staged_content_revision" = r."content_revision"
FROM "design_recipe" r
WHERE r."id" = d."design_draft_id" AND d."status" = 'READY';
