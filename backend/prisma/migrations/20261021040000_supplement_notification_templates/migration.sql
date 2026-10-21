ALTER TABLE "supplement_shop_config"
  ADD COLUMN IF NOT EXISTS "wechat_template_scheduled" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "wechat_template_shipped" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "wechat_template_delay" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "wechat_template_aftersale" VARCHAR(100);
