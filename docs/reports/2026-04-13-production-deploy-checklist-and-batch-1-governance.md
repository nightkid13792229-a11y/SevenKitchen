# 2026-04-13 生产部署前清单与第一批生产治理名单

## 目标

在不直接手改旧生产结构的前提下，先让生产环境承接当前分支的“标准原料 / DIY SKU / 采购 SKU”解耦模型，然后按最小风险顺序启动第一批生产数据治理。

## 当前判断

- 生产库还停留在旧结构，尚未承接本分支已经完成的 schema、管理端和员工端链路改造。
- 本地分支已经完成了解耦主线的大部分代码与手测，但当前工作区仍有未提交的营养数据弹窗交互优化改动。
- 因此，生产推进的正确顺序应是：
  1. 先固化部署版本
  2. 先部署新结构
  3. 先跑生产回填
  4. 再开始人工治理生产数据

## 当前部署基线

- 当前候选分支：`codex/ingredient-sku-decoupling`
- 当前候选部署基线 commit：`28dee9b79a69ec8b30fda83467f14d6515d59fed`
- 本次基线已包含的关键提交：
  - `9335134 feat: refactor ingredient sku domain and nutrition entry`
  - `28dee9b feat: polish ingredient nutrition workflow and rollout docs`
- 明确不纳入部署版本的本地临时材料：
  - `.superpowers/`
  - `docs/handoff/`

## 2026-04-14 远端生产只读核查结果

本节结论来自对远端服务器 `1.14.3.2` 的只读 SSH 检查与只读 SQL 查询，未执行任何写入。

### 远端代码状态

- 远端部署目录：`/opt/sevenkitchen/SevenKitchen/backend`
- 当前分支：`main`
- 当前 HEAD：`a7ab1d7edec87e820d009684e07c2b094e8a7e8a`
- 最近提交：
  - `a7ab1d7 fix(admin-order): include address in detail response`
  - `bde48e7 Merge pull request #9 from nightkid13792229-a11y/codex/recipe-preparation-method-refactor`
  - `5514902 fix: stabilize recipe editor validation`

### 远端 migration 结论

- 远端执行 `bash scripts/check_migration_history.sh` 通过，表示：
  - 已应用 migration 的校验和与远端当前代码中的 migration 文件一致
- 但这**不代表**远端已经承接当前本地分支的 2026-04-11 解耦 migration
- 进一步只读 SQL 查询确认：
  - `ingredient.nutrition_profile = false`
  - `procurement_sku` 扩展字段（以 `supplier_name` 为代表）= `false`
  - `inventory_ledger_entry.procurement_sku_id = false`
  - `_prisma_migrations` 中未发现 `20260411%` 相关 migration

### 远端生产数据现状复核

- `procurement_sku` 总数：`1`
- `recommended_product` 总数：`1`

因此可以确认：

- 远端生产环境当前**仍未承接**本分支的原料解耦结构
- 2026-04-12 的只读审计结论依然有效
- 下一步仍然应该是：
  1. 先部署当前候选版本
  2. 再执行生产 migration
  3. 再执行生产回填
  4. 再开始人工治理

## 一、生产部署前清单

### A. 版本冻结

- [ ] 确认本次生产部署是否包含“最新营养数据弹窗交互优化”
- [ ] 将当前工作区未提交改动整理并提交到明确 commit
- [ ] 记录部署基线 commit SHA，避免生产回填时无法对应代码版本
- [ ] 明确本次部署范围：
  - [ ] backend migration
  - [ ] backend service / controller
  - [ ] admin-web 原料管理页
  - [ ] miniapp 员工端采购 / 库存页

### B. 后端与数据库准备

- [ ] 在生产环境预先核对 Prisma migration 状态，确认没有历史 failed migration 残留
- [ ] 准备生产库备份或可回滚快照
- [ ] 确认以下解耦相关 migration 已包含在本次发布版本中：
  - [ ] `20260411150000_add_ingredient_nutrition_profile`
  - [ ] `20260411153000_extend_procurement_sku_domain_fields`
  - [ ] `20260411173000_add_procurement_sku_to_inventory_ledger`
  - [ ] `20260411183000_add_procurement_sku_to_inventory_operations`
- [ ] 确认生产环境可执行 Prisma migration 与 backfill 脚本

建议的生产执行入口：

- migration：
  - `cd backend && npx prisma migrate deploy`
- nutrition profile 回填 dry-run：
  - `cd backend && npm run backfill:ingredient-nutrition-profile-v2`
- nutrition profile 回填 apply：
  - `cd backend && npm run backfill:ingredient-nutrition-profile-v2:apply`
- procurement SKU 默认值回填 dry-run：
  - `cd backend && npm run backfill:procurement-sku-defaults`
- procurement SKU 默认值回填 apply：
  - `cd backend && npm run backfill:procurement-sku-defaults:apply`
- backend 构建校验：
  - `cd backend && npm run build`

### C. 管理后台准备

- [ ] 发布包含以下能力的 admin-web 版本：
  - [ ] 标准原料基础信息与采购信息分离
  - [ ] DIY SKU 独立维护
  - [ ] 采购 SKU 独立维护
  - [ ] 营养数据独立入口
- [ ] 验证生产管理后台原料列表页能正常显示：
  - [ ] `营养数据` 按钮
  - [ ] `DIY SKU` 维护区
  - [ ] `采购 SKU` 维护区

建议的发布前校验：

- `cd admin-web && npm run build`

### D. 员工端准备

- [ ] 发布包含 procurement SKU 优先消费逻辑的 miniapp 版本
- [ ] 验证生产员工端以下页面可正常读取采购 SKU 信息：
  - [ ] 补货采购单页
  - [ ] 盘点创建页
  - [ ] 库存流水 / 盘点记录页

建议的发布前校验：

- `cd miniapp && npm run build:mp-weixin`

### E. 生产回填执行

- [ ] 先执行 `旧字段 -> 默认采购 SKU` 的 dry-run
- [ ] 输出 dry-run 结果并人工确认：
  - [ ] 将创建多少默认采购 SKU
  - [ ] 将更新多少已有采购 SKU
  - [ ] 哪些记录存在歧义需人工处理
- [ ] dry-run 通过后执行 apply
- [ ] apply 后复核幂等性：再次 dry-run 应为 `create/update = 0`

### F. 生产冒烟验收

- [ ] 后台编辑一条食材原料，确认采购信息只落在采购 SKU
- [ ] 后台编辑一条补剂原料，确认 DIY SKU 与营养数据入口正常
- [ ] 小程序员工端验证 `猪里脊` 能在补货页与盘点页显示采购 SKU
- [ ] 小程序员工端验证 `泡沫箱` 作为包材能在补货 / 盘点链路正常显示
- [ ] 检查采购入库、盘点、手工调整生成的库存流水是否带 `procurementSkuId`

## 二、第一批生产治理规则

第一批只做两类事情：

1. 补“已进入食谱但没有采购 SKU”的在用原料
2. 为后续合并做准备，但本批不直接处理争议型合并

### 本批明确不做

- 不直接合并 `鱼油`、`骨粉`
- 不直接处理包材重命名
- 不直接大规模补 DIY SKU
- 不清理闲置原料

## 三、第一批生产治理名单：补采购 SKU

### A. 食材类优先补录

以下原料已进入食谱但没有采购 SKU，应优先补一条“默认采购 SKU”：

1. `食用盐`（食谱引用 28）
2. `小麦胚芽油`（21）
3. `鸡蛋`（21）
4. `三文鱼`（16）
5. `生蚝`（16）
6. `燕麦`（15）
7. `牛肝`（15）
8. `胡萝卜`（14）
9. `南瓜`（12）
10. `糙米`（12）
11. `红薯`（12）
12. `猪里脊`（11）
13. `生葵花籽仁`（11）
14. `猪肝`（9）
15. `青花鱼`（9）

### B. 补剂类优先补录

以下补剂已进入食谱但没有采购 SKU，应与食材第一批同步补录：

1. `海藻粉`（食谱引用 30）
2. `鸡蛋壳粉`（20）
3. `葡萄糖酸锌`（15）
4. `胆碱`（9）
5. `碳酸钙`（7）
6. `双甘氨酸铜片`（5）
7. `洋车前子壳粉`（4）
8. `牛磺酸`（4）
9. `维生素D`（4）
10. `维生素E`（4）
11. `骨粉`（4）

### C. 每条采购 SKU 最低补录要求

第一批补录时，每条默认采购 SKU 至少补齐以下字段：

- [ ] 采购 SKU 名称
- [ ] 所属标准原料
- [ ] 品牌 / 供应商
- [ ] 渠道
- [ ] 商品规格
- [ ] 采购单位
- [ ] 换算倍数（采购单位 -> 标准原料单位）
- [ ] 当前采购价
- [ ] 是否默认采购 SKU
- [ ] 是否启用

如已知库存策略，再补：

- [ ] 安全库存
- [ ] 补货点
- [ ] 目标库存

## 四、第一批治理中的重复项处理策略

第一批不直接做全量合并，但以下 4 组要先做“主原料确认”，否则补采购 SKU 时会越补越乱：

### 高置信度优先确认

- `鸡蛋` × 3
- `猪里脊` × 3
- `牛霖` × 2
- `土豆` × 2

### 第一批处理方式

- [ ] 先确认这 4 组中哪一条保留为“主标准原料”
- [ ] 本批先把采购 SKU 补到主标准原料下面
- [ ] 非主标准原料先暂停继续新增采购信息
- [ ] 等第二批再正式执行合并与历史引用迁移

## 五、DIY SKU 的批次安排

第一批不要求所有在用补剂立刻补 DIY SKU，但需要提前识别缺口。

当前已进入食谱但没有 DIY 推荐商品的补剂包括：

- 海藻粉
- 鸡蛋壳粉
- 葡萄糖酸锌
- 胆碱
- 碳酸钙
- 双甘氨酸铜片
- 洋车前子壳粉
- 牛磺酸
- 维生素D
- 维生素E
- 骨粉
- 海带粉
- 营养酵母
- 鱼油（两条）
- B族维生素
- 双甘氨酸亚铁
- 甘氨酸锰
- 菊粉

建议：

- 若小程序端近期仍需要用户购买引导，则把上述补剂列为“第一批之后的紧接批次”
- 若短期内先保证生产采购链路，则 DIY SKU 可以排在采购 SKU 之后

## 六、建议执行顺序

1. 先整理并提交当前未提交改动，形成生产候选版本
2. 先部署生产 schema、backend、admin-web、miniapp
3. 先执行生产 dry-run 与 apply 回填
4. 先补第一批在用原料的默认采购 SKU
5. 再确认 `鸡蛋 / 猪里脊 / 牛霖 / 土豆` 四组主标准原料
6. 再开启第二批重复项合并

## 七、通过标准

满足以下条件，可视为“生产已具备进入人工治理”的前置条件：

- 生产后台可独立维护标准原料、DIY SKU、采购 SKU
- 生产已完成 `旧字段 -> 默认采购 SKU` 回填
- 高优先级在用原料开始拥有默认采购 SKU
- 员工端补货 / 盘点页面可以稳定读取采购 SKU 信息
- 没有继续把新增采购信息写回标准原料旧字段
