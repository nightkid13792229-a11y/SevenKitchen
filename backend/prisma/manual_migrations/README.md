# Manual migrations

Apply:
psql "$DATABASE_URL" -f <sql-file>

- 20251219_add_order_completed_at.sql: adds order.completed_at
- 20261114_fix_insoluble_fiber_and_taurine_targets.sql:
  · 定制食谱「Foxy定制 · 十字花科全谷物三文鱼鸡肉」纤维素粉的补剂目标
    由「膳食纤维（总）」改为「不可溶性纤维」
  · 设计稿「小米山药猪肉」3 条牛磺酸目标 370 g/kg → 0.37 g/kg（原值放大 1000 倍）
