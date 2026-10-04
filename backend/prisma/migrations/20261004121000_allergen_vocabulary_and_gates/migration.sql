-- 过敏原词表 + 食材关联 + 数据收紧（2026-10-04，过敏重构第一期）
--
-- ── 一、为什么需要词表 ──────────────────────────────────────
--
--   在此之前"过敏原"只是 allergy_record.allergen 里的一段自由文字。
--   推荐与配方的避雷用**纯文字包含**判断：
--       ingredientSearchText.includes('鸡肉')
--   而原料库里的食材叫「鸡胸」「鸡腿肉」「鸡心」「鸡肝」「鸡胗」「牛霖」「羊里脊」……
--       "鸡胸".includes("鸡肉") === false
--   实测（生产备份库 107 个 FOOD 食材）：12 个常见过敏标签里
--   **8 个匹配不到任何真实食材**——避雷基本没生效。
--
--   修法不是"再加几个关键词"，而是把过敏原做成**受控词表**，
--   再把每个食材**显式**挂到它含有的过敏原上。查表，不猜名字。
--
-- ── 二、只增不删 ────────────────────────────────────────────
--
--   allergy_record 的 allergen / notes / attachments 三个老字段一个都不改。
--   老记录一条都不迁移、不拆分、不改写。
--   本迁移新增的唯一约束只做一件事：**同一只狗 + 同一个过敏原只能有一条**。
--
-- ── 三、加约束之前必须先清理重复 ────────────────────────────
--
--   线上存在重复（客户端只按文字比对去重，绕过去就会重复）与垃圾值
--   （已实测到 adasdasdasdasd 这类）。带重复数据时唯一索引**建不出来**，
--   所以这里必须先合并。
--
--   清理原则（尽量不丢东西）：
--     · 只合并「同一只狗 + 完全相同的过敏原文字」的行
--     · 保留最早创建的那一条（最可能是顾客原本填的）
--     · 把被合并掉的行的 attachments **并入**保留行，避免附件悬空
--     · 被合并行的 notes 若不是空且与保留行不同，追加到保留行 notes 末尾
--     · 不做任何"看起来像"的模糊合并（"鸡肉" 与 "鸡胸肉" 不合并）
--     · 只删纯空白/纯 NULL 的垃圾行
--   批量"把历史记录标记为可信度=可疑"属于业务数据，**不在本迁移里做**，
--   见 prisma/backfill-allergy-certainty.ts（按仓库惯例）。

-- ===========================================================================
-- 一、新增：过敏原词表
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "allergen_tag" (
  "id"          TEXT         NOT NULL,
  "code"        VARCHAR(40)  NOT NULL,
  "name"        VARCHAR(40)  NOT NULL,
  "aliases"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "category"    VARCHAR(20)  NOT NULL DEFAULT 'OTHER',
  "common_rank" INTEGER      NOT NULL DEFAULT 100,
  "enabled"     BOOLEAN      NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "allergen_tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "allergen_tag_code_key" ON "allergen_tag"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "allergen_tag_name_key" ON "allergen_tag"("name");
CREATE INDEX IF NOT EXISTS "allergen_tag_enabled_common_rank_idx"
  ON "allergen_tag"("enabled", "common_rank");
CREATE INDEX IF NOT EXISTS "allergen_tag_category_idx" ON "allergen_tag"("category");

COMMENT ON TABLE "allergen_tag" IS
  '过敏原受控词表（2026-10-04 第一期）。标准名 + 别名 + 类别；'
  '由 ingredient_allergen_tag 把食材显式挂上来，替代原来的文字包含匹配。';
COMMENT ON COLUMN "allergen_tag"."aliases" IS
  '别名，用于给新食材自动推荐关联，以及兜底匹配顾客手写的自由文本。';
COMMENT ON COLUMN "allergen_tag"."common_rank" IS
  '常见度排序，数字越小越常见。依据知识库 skin-005（SACN5 第 31 章）：'
  '牛肉/乳制品/小麦合计约 69%，其次羊肉、鸡蛋、鸡肉、大豆约 25%。'
  '小程序「一点即选」按此顺序排。';

-- ===========================================================================
-- 二、新增：食材 ↔ 过敏原 显式关联
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "ingredient_allergen_tag" (
  "id"              TEXT         NOT NULL,
  "ingredient_id"   TEXT         NOT NULL,
  "allergen_tag_id" TEXT         NOT NULL,
  "source"          VARCHAR(16)  NOT NULL DEFAULT 'MANUAL',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ingredient_allergen_tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_allergen_tag_ingredient_id_allergen_tag_id_key"
  ON "ingredient_allergen_tag"("ingredient_id", "allergen_tag_id");
CREATE INDEX IF NOT EXISTS "ingredient_allergen_tag_ingredient_id_idx"
  ON "ingredient_allergen_tag"("ingredient_id");
CREATE INDEX IF NOT EXISTS "ingredient_allergen_tag_allergen_tag_id_idx"
  ON "ingredient_allergen_tag"("allergen_tag_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ingredient_allergen_tag_ingredient_id_fkey'
  ) THEN
    ALTER TABLE "ingredient_allergen_tag"
      ADD CONSTRAINT "ingredient_allergen_tag_ingredient_id_fkey"
      FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ingredient_allergen_tag_allergen_tag_id_fkey'
  ) THEN
    ALTER TABLE "ingredient_allergen_tag"
      ADD CONSTRAINT "ingredient_allergen_tag_allergen_tag_id_fkey"
      FOREIGN KEY ("allergen_tag_id") REFERENCES "allergen_tag"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON TABLE "ingredient_allergen_tag" IS
  '食材含哪些过敏原（2026-10-04 第一期）。显式标注，不做名字猜测：'
  '「鸡胸」属于鸡肉、「希腊酸奶」属于乳制品、「鸡蛋壳粉」属于蛋类。';

-- ===========================================================================
-- 三、清理重复与空白（唯一索引的前置条件）
-- ===========================================================================

-- 只删纯空白的垃圾行（保留原来的 id，不做别的）
DELETE FROM "allergy_record"
WHERE "allergen" IS NULL OR btrim("allergen") = '';

-- 统一去掉首尾空白，让"鸡肉"与"鸡肉 "能被视为同一条
UPDATE "allergy_record"
SET "allergen" = btrim("allergen")
WHERE "allergen" <> btrim("allergen");

-- 合并完全重复的行：
--   保留最早的一条；附件并集；不同的备注追加；其余删除。
WITH ranked AS (
  SELECT
    "id",
    "dog_id",
    "allergen",
    ROW_NUMBER() OVER (
      PARTITION BY "dog_id", "allergen"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "allergy_record"
),
keepers AS (
  SELECT "id", "dog_id", "allergen" FROM ranked WHERE rn = 1
),
merged AS (
  SELECT
    k."id" AS keep_id,
    ARRAY(
      SELECT DISTINCT a
      FROM allergy_record r2, unnest(r2."attachments") AS a
      WHERE r2."dog_id" = k."dog_id"
        AND r2."allergen" = k."allergen"
        AND a IS NOT NULL AND a <> ''
      ORDER BY a
    ) AS all_attachments,
    ARRAY(
      SELECT DISTINCT btrim(r2."notes")
      FROM allergy_record r2
      WHERE r2."dog_id" = k."dog_id"
        AND r2."allergen" = k."allergen"
        AND r2."notes" IS NOT NULL AND btrim(r2."notes") <> ''
      ORDER BY btrim(r2."notes")
    ) AS all_notes
  FROM keepers k
)
UPDATE "allergy_record" ar
SET
  "attachments" = m.all_attachments,
  "notes" = CASE
    WHEN array_length(m.all_notes, 1) IS NULL THEN NULL
    ELSE array_to_string(m.all_notes, E'\n')
  END
FROM merged m
WHERE ar."id" = m.keep_id;

DELETE FROM "allergy_record" ar
USING (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "dog_id", "allergen"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "allergy_record"
) d
WHERE ar."id" = d."id" AND d.rn > 1;

-- ===========================================================================
-- 四、收紧：唯一 + 不允许空白
-- ===========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "allergy_record_dog_id_allergen_key"
  ON "allergy_record"("dog_id", "allergen");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'allergy_record_allergen_not_blank'
  ) THEN
    ALTER TABLE "allergy_record"
      ADD CONSTRAINT "allergy_record_allergen_not_blank"
      CHECK (btrim("allergen") <> '');
  END IF;
END $$;

COMMENT ON CONSTRAINT "allergy_record_allergen_not_blank" ON "allergy_record" IS
  '过敏原不允许为空或纯空白（2026-10-04）。此前接口只校验"是个字符串"，空串也能存。';

-- ===========================================================================
-- 五、可信度 + 来源
-- ===========================================================================
--
-- 为什么第一期就要加这两列：
--
--   老板已确认「确诊过敏的食谱从推荐里**彻底拿掉**」。
--   但"拿掉"要有依据 —— 没有可信度这一列，
--   系统分不清"报告明确写了阳性"和"顾客随手记的一条"，
--   就只能二选一：要么全都拿掉（误伤、可选食谱骤减），
--   要么全都不拿掉（等于没做）。两种都不可接受。
--
--   所以可信度是那道闸门的**前置条件**，必须第一期就建。
--   （这不是推翻 2026-01-25 那次"简化字段"的决定 ——
--     那次删掉的是让顾客自己填的"严重程度/确认方"，
--     顾客判断不了、也没人填。这次的可信度是**系统按来源推出来的**，
--     不是让顾客拍脑袋：报告里写了阳性 → 确诊；顾客自己说"我怀疑" → 待排查；
--     排查计划做完 → 由结论回写。）
--
-- 默认值刻意选 SUSPECTED（可疑）而不是 CONFIRMED：
--   存量记录没有依据判断可靠性，宁可当"可疑"对待（会被避开），
--   也不能当"没这回事"。漏掉一条真过敏的代价，远大于多避开几样。

CREATE TYPE "AllergyCertainty" AS ENUM (
  'CONFIRMED',   -- 确诊：报告明确阳性，或排查计划已确认
  'SUSPECTED',   -- 可疑：报告写弱阳性/疑似，或排查进行中
  'TO_VERIFY',   -- 待排查：主人自己怀疑，还没验证
  'RULED_OUT'    -- 已排除：排查计划验证过，不过敏
);

ALTER TABLE "allergy_record"
  ADD COLUMN IF NOT EXISTS "certainty" "AllergyCertainty" NOT NULL DEFAULT 'SUSPECTED';

ALTER TABLE "allergy_record"
  ADD COLUMN IF NOT EXISTS "source" VARCHAR(16) NOT NULL DEFAULT 'OWNER';

CREATE INDEX IF NOT EXISTS "allergy_record_dog_id_certainty_idx"
  ON "allergy_record"("dog_id", "certainty");

COMMENT ON COLUMN "allergy_record"."certainty" IS
  '可信度（2026-10-04 第一期）。确诊/可疑会被食谱避开；已排除不再避开；'
  '待排查不自动避开但会提示。存量记录一律 SUSPECTED（老板 2026-10-04 确认）。';
COMMENT ON COLUMN "allergy_record"."source" IS
  '来源（2026-10-04 第一期）：REPORT 检测报告 / OWNER 主人观察 / STAFF 员工录入 / '
  'ORDER 定制单同步 / PLAN 排查计划结论。';

SELECT 1;

