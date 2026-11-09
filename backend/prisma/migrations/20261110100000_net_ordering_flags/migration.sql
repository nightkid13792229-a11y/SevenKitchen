-- 日采净额与影子模式（D4，默认都关）
ALTER TABLE "global_config"
  ADD COLUMN "daily_net_ordering_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inventory_net_shadow_enabled" BOOLEAN NOT NULL DEFAULT false;
