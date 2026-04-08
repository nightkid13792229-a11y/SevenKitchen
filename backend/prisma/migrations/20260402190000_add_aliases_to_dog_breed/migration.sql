-- AddAliasesToDogBreed
-- 为 dog_breed 增加 aliases 字段，用于维护品种别名搜索

ALTER TABLE "dog_breed"
ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
