# 南美对虾虾仁生产 Apply 执行清单

## 当前状态

- 生产包已生成、上传并执行成功。
- 生产只读对齐已通过：`5543a5b1ca65`。
- 生产执行前备份已生成并校验通过。
- 生产重复检查通过：未发现同款或同来源营养档案。

## 生产重复检查

- 执行前原料 ID 记录：0 条。
- 执行前同名 `FOOD` 记录：0 条。
- 执行前营养档案 ID 记录：0 条。
- 执行前 MEXT `10415` 营养档案：0 条。
- 执行前映射 ID 记录：0 条。
- 执行前生产库相似虾类原料：0 条。

## 生产包文件

目录：`south-american-shrimp-production-package`

- `manifest.json`
- `review-summary.md`
- `up.sql`
- `down.sql`
- `source-audit.json`
- `unit-audit.json`

生产机上传目录：`/tmp/sevenkitchen-standard-ingredient-import/south-american-shrimp-20260702-1617`

## 生产包内容摘要

- `up.sql`
  - 仅包含 3 条 `INSERT INTO`。
  - 新增 1 条 `ingredient`。
  - 新增 1 条 `nutrition_food`。
  - 新增 1 条 `nutrition_food_mapping`。
  - 不包含 `DROP`、`TRUNCATE`、`ALTER`、`UPDATE`、`DELETE`、`CREATE`。
- `down.sql`
  - 只按 ID 删除本次新增的 3 条记录。

## 文件校验值

```text
up.sql            2f7daa73e383aef55471d994e2e7add44a859f837955739a74fb39862fcce7f1
down.sql          e6622091a39cf820596bdf885256fa65466255303b24df9846ea21b4348ce8e0
manifest.json     1da574dd2c73bb696dd733f1c1a1d26f88f9679487923015ee50e2b4a10e13e4
review-summary.md f8936a6f7abf9e75156b9417b66de49f21465f7d3bbc3df1b968907688287c7d
source-audit.json 909160322ce84fbb750354ba1f5f5e297db96682faee24fc81fa306ba555998f
unit-audit.json   9dcb32abe2d281b911473f469d73ae8d731bf14b730d235de725452ce6fc095d
```

## 生产备份

- 备份文件：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-20260702-161706.dump`
- 备份清单：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-20260702-161706.dump.list`
- 备份 manifest：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-south-american-shrimp-20260702-161706.dump.manifest.json`
- 备份大小：`57276373` bytes。
- 备份 SHA256：`fae4c216dc02db482541fccdf07d9519a22a87d6820c740b53fe400f3fb0054c`。
- `pg_restore --list` 表数据条目数：`87`。

## 执行前确认

- [x] 用户已要求进入本地开发库和生产库。
- [x] 已确认当前生产库没有同款重复。
- [x] 已确认主名称为 `南美对虾虾仁`。
- [x] 已确认主营养来源为 MEXT `10415`。
- [x] 已确认本次生产包只新增 3 条相关记录。
- [x] 已确认执行前生产库备份已完成。
- [x] 已确认执行 `up.sql` 是生产写入动作。

## 安全边界

- 已执行 `up.sql`。
- 已写入 3 条生产业务数据：1 条原料、1 条营养档案、1 条主映射。
- 不做全库迁移或整库同步。
- 不创建采购 SKU。
