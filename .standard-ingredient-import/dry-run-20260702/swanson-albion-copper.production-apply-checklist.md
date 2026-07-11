# Swanson Albion 铜生产执行清单

## 当前状态

- 生产包已生成，并已执行到生产数据库。
- 生产只读连接已验证可用。
- 本地/生产 DB 对齐已通过：`5543a5b1ca65`。
- 生产包范围：只新增 1 条 `ingredient` 记录。
- 不包含采购 SKU、营养库映射、标签分配或全库迁移。
- 生产执行前备份已生成并校验通过。
- 生产新增 ID：`69cf7ec3-e39c-4367-8994-46db8e6a9946`。

## 生产重复检查

- 执行前精确同款记录：0 条。
- 执行前同品牌 Swanson 铜补剂记录：0 条。
- 生产库中存在的相似铜补剂：
  - `NOW FOODS` / `双甘氨酸铜片` / `3mg铜/片，120片/瓶`
- 结论：未发现 Swanson Albion Copper 同款重复。

## 生产包文件

目录：`swanson-albion-copper-production-package`

- `manifest.json`
- `review-summary.md`
- `up.sql`
- `down.sql`
- `source-audit.json`
- `unit-audit.json`

## 生产包内容摘要

- `manifest.json`
  - `wholeDatabaseMigration = false`
  - `ingredientType = SUPPLEMENT`
  - `recordCounts.ingredient = 1`
  - `recordCounts.procurement_sku = 0`
  - `recordCounts.nutrition_food = 0`
  - `recordCounts.nutrition_food_mapping = 0`
- `up.sql`
  - 仅包含 1 条 `INSERT INTO ingredient`
  - 新增 ID：`69cf7ec3-e39c-4367-8994-46db8e6a9946`
- `down.sql`
  - 仅包含 1 条按 ID 删除该记录的 `DELETE FROM ingredient`

## 文件校验值

```text
up.sql            5144eec933556eaa0bd0cf86b75cde63f2652d61ef9ce98beaa2349bf040d617
down.sql          d04d75ef2b83177d90ae3965f3e4128508550fa2e6775f08c33b76d0aae16ce8
manifest.json     b8c82148060439a8d54959824fd7411a8eb7f33bc4c8f85eed856bfecf0f457b
review-summary.md 0ce04b425a94f8af2d270137177d238c6af7ed6f5c3cf304558c4f73163144b7
source-audit.json b9fc39ff0a26bbafdad82fde0c16f8a0f475bfd817735c40de804cfafffb7dbf
unit-audit.json   5142e49a8dd1ee87dc92b192138597395f5dec22732a22e27a66070d2422ee43
```

## 生产备份

- 备份文件：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-swanson-albion-copper-20260702-134925.dump`
- 备份清单：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-swanson-albion-copper-20260702-134925.dump.list`
- 备份 manifest：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-swanson-albion-copper-20260702-134925.dump.manifest.json`
- 备份大小：`57199539` bytes
- 备份 SHA256：`0b10bb2e7cb9f298fc867f1931f872d28088d57d33ed750202d41692334d00d9`
- `pg_restore --list` 表条目数：`175`
- 备份后复查：生产库中 Swanson Albion Copper 精确同款仍为 `0` 条。

## 执行前确认

- [x] 已确认当前生产库没有同款重复。
- [x] 已确认这款补剂主名称为 `Swanson Albion 铜 2mg 片`。
- [x] 已确认标签核心信息来自用户提供的包装图和 Supplement Facts 图片。
- [x] 已确认标签显示每片含铜 `2 mg`，每日值 `222%`。
- [x] 已确认本次生产包只新增 1 条补剂原料。
- [x] 已确认执行前需要生产库备份或快照。
- [x] 已确认执行 `up.sql` 是生产写入动作，需要单独明确确认。

## 安全边界

- 已执行 `up.sql`。
- 已写入 1 条生产业务数据：`ingredient`。
- 未写入采购 SKU、营养库映射、标签分配或全库迁移。
