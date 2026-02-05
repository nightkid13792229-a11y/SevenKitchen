-- AddIsCommonToDogBreed
-- 添加 is_common 字段到 dog_breed 表

-- 添加字段
ALTER TABLE "dog_breed" ADD COLUMN "is_common" BOOLEAN NOT NULL DEFAULT false;

-- 添加索引
CREATE INDEX "dog_breed_is_common_idx" ON "dog_breed"("is_common");

-- 标记常见品种为 isCommon = true
UPDATE "dog_breed" SET "is_common" = true WHERE "name" IN (
  '拉布拉多', '泰迪', '贵宾犬(小型)', '贵宾犬(标准)', '金毛',
  '比熊', '哈士奇', '德牧', '边牧', '柯基',
  '萨摩耶', '法国斗牛犬', '吉娃娃', '博美', '雪纳瑞(小型)',
  '约克夏', '马尔济斯', '腊肠犬', '阿拉斯加', '杜宾'
);
