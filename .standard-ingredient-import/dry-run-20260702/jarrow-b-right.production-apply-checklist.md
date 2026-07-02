# Jarrow Formulas B-Right 生产执行前清单

## 当前状态

- 生产包已生成，并已执行到生产数据库。
- 生产只读连接已验证可用。
- 本地/生产 DB 对齐已通过：`5543a5b1ca65`。
- 生产包范围：只新增 1 条 `ingredient` 记录。
- 不包含采购 SKU、营养库映射、标签分配或全库迁移。
- 生产执行前备份已生成并校验通过。
- 生产新增 ID：`814a9199-f944-4c8f-b651-61f6e4eea765`。

## 生产重复检查

- 精确同款记录：0 条。
- 同品牌 B-Right 相似记录：0 条。
- 生产库中存在的相似 B 族补剂：
  - `NOW FOODS` / `B族维生素胶囊` / `50mgB族维生素/粒，100粒/瓶`
- 结论：未发现 Jarrow Formulas B-Right 同款重复。

## 生产包文件

目录：`jarrow-b-right-production-package`

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
  - 新增 ID：`814a9199-f944-4c8f-b651-61f6e4eea765`
- `down.sql`
  - 仅包含 1 条按 ID 删除该记录的 `DELETE FROM ingredient`

## 文件校验值

```text
up.sql            7dcdac5cd265749e625a4b2208e9119439263a498bf36729f9da780df1df34f3
down.sql          507f56410031b68f08c7f3e9e60c554c7462a9c494b2010bf8beccebd95f2218
manifest.json     a194d41d90093637ffff45e28212f4601a59fcea56d10cfa25ae8b8dee12c139
review-summary.md d572bd11754a256f1fe40ca55db37007d119c3b423a15c923d70c24840849c55
source-audit.json b9fc39ff0a26bbafdad82fde0c16f8a0f475bfd817735c40de804cfafffb7dbf
unit-audit.json   5142e49a8dd1ee87dc92b192138597395f5dec22732a22e27a66070d2422ee43
```

## 生产备份

- 备份文件：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-jarrow-b-right-20260702-124615.dump`
- 备份清单：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-jarrow-b-right-20260702-124615.dump.list`
- 备份 manifest：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-jarrow-b-right-20260702-124615.dump.manifest.json`
- 备份大小：`57145281` bytes
- 备份 SHA256：`b0284e4ce39ef82ec18782b168a8699f6b9f7e469ba48c321a8eb8dd42d83558`
- `pg_restore --list` 表条目数：`175`
- 备份后复查：生产库中 Jarrow Formulas B-Right 精确同款仍为 `0` 条。

## 执行前确认

- [x] 已确认当前生产库没有同款重复。
- [x] 已确认这款补剂主名称为 `Jarrow Formulas B-Right B族维生素复合胶囊`。
- [x] 已确认营养标签信息无误。
- [x] 已确认本次生产包只新增 1 条补剂原料。
- [x] 已确认执行前需要生产库备份或快照。
- [x] 已确认执行 `up.sql` 是生产写入动作，需要单独明确确认。

## 安全边界

- 已执行 `up.sql`。
- 已写入 1 条生产业务数据：`ingredient`。
- 未写入采购 SKU、营养库映射、标签分配或全库迁移。
