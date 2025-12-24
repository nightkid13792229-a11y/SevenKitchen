-- Add custom_breed_name field to Dog table
-- For storing user-specified breed name for mixed breed dogs
ALTER TABLE "dog" ADD COLUMN "custom_breed_name" VARCHAR(100);

-- Add comment
COMMENT ON COLUMN "dog"."custom_breed_name" IS '用户自定义品种名称（混血犬使用）';
