-- 平台选项字典（2026-10-16）· 食谱定制重构 批次 1.3
--
-- ## 这次加这两张表要解决什么
--
-- 老板原话：「尽量把所有的字段、算法等解耦出来」「前端只负责渲染」。
--
-- 具体病灶：**同一个状态码的中文在三个端各写一份** ——
--   · 小程序 `utils/custom-recipe-order.ts`（5 条文案 + 5 条样式）
--   · 后台 `constants/customRecipeOrder.ts`（5 条）
--   · 成品订单线还有自己的一份
-- 加一个枚举要改六处。2026-10-04 加「已取消」时就漏了两处半，
-- 顾客在订单列表里看到的是英文 `CANCELLED`。
--
-- 做法：把「码 → 展示元数据」收成**数据**，由后端统一下发，前端零映射。
-- 本次实测清点的存量：状态映射 15 处 / 目标映射 16 处（见四条红线守卫的清单）。
--
-- ## 两个来源（platform_option_set.source_type）
--
--   · `ENUM` —— 选项由代码里的 Prisma 枚举定义。后台只能改标签/色调/排序/启用，
--     **不能增删**：代码里有 if-else 依赖这些值（比如「已付款才能取消」）。
--   · `DATA` —— 选项纯粹是数据（定制目标、活动量档位、售后类型…）。
--     代码不做判断，后台可以自由增删改。
--
-- `enum_name` 存代码里的枚举名，供**启动时自动同步**用：
-- Prisma 生成的客户端会在运行时导出枚举对象（实测：
-- `export const CustomRecipeStatus = { PENDING_PAYMENT: 'PENDING_PAYMENT', … }`），
-- 所以服务启动时可以遍历它并 upsert 进本表 ——
-- 「加了枚举忘了加文案」从此不可能发生（漏了会自动补一行 + 启动日志 warn）。
--
-- ## 命名
--
-- 遵循 docs/DATABASE_NAMING_CONVENTIONS.md：Prisma 用 camelCase，
-- 库内存 snake_case（本文件即库里真实形态）。
--
-- 本次只加表，**不改任何既有表**，因此不影响现有功能；回滚只需 drop 这两张表。

-- CreateTable：选项集（一组可选项的容器）
CREATE TABLE "platform_option_set" (
    "code" VARCHAR(48) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(200),
    "source_type" VARCHAR(8) NOT NULL DEFAULT 'DATA',
    "enum_name" VARCHAR(48),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_option_set_pkey" PRIMARY KEY ("code")
);

-- CreateTable：选项项
CREATE TABLE "platform_option_item" (
    "id" TEXT NOT NULL,
    "set_id" VARCHAR(48) NOT NULL,
    "code" VARCHAR(48) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "description" VARCHAR(200),
    -- 色彩**档位**（neutral / info / progress / success / warning / danger），
    -- 不是颜色值：前端把档位映射到自己的样式类，换配色不用改数据库。
    "tone" VARCHAR(16),
    "icon" VARCHAR(32),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    -- 下线选项置 false，不物理删除 —— 免得历史数据里的码找不到对应行
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    -- 业务附加参数（例如活动量的系数）。前端不解释，只透传。
    "extra" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_option_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex：按「选项集 + 是否启用 + 排序」取用（下发时的主查询）
CREATE INDEX "platform_option_item_set_id_enabled_sort_order_idx" ON "platform_option_item"("set_id", "enabled", "sort_order");

-- CreateIndex：同一个选项集内码唯一
CREATE UNIQUE INDEX "platform_option_item_set_id_code_key" ON "platform_option_item"("set_id", "code");

-- AddForeignKey：删掉选项集时一并删掉它的项
ALTER TABLE "platform_option_item" ADD CONSTRAINT "platform_option_item_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "platform_option_set"("code") ON DELETE CASCADE ON UPDATE CASCADE;
