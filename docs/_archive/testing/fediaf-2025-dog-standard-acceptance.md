# FEDIAF 2025 犬标准入库验收流程

本文档用于在开发库、测试库或预生产库中验收 FEDIAF 2025 犬标准是否已经正确迁移、导入和可审核。

## 前置条件

1. 数据库 migration 历史必须和当前代码目录一致。
2. 后端依赖已安装，且 `backend/node_modules` 可用。
3. 如使用非默认数据库，先设置 `DATABASE_URL`。

默认数据库地址为：

```bash
postgresql://postgres:postgres@localhost:5432/sevenkitchen
```

## 执行步骤

在项目根目录执行：

```bash
cd backend
npx prisma migrate status
npx prisma migrate deploy
npm run seed:fediaf-2025-dog-standard
npm run audit:fediaf-2025-dog-standard
```

如果 `migrate status` 提示数据库已有代码目录中不存在的 migration，不要直接执行 `migrate deploy`。先确认缺失 migration 是否需要恢复到 `backend/prisma/migrations`，或者换一个 migration 历史干净的测试库。

## 机器验收标准

`npm run audit:fediaf-2025-dog-standard` 通过时应显示 `PASS`，并校验以下内容：

- 标准版本存在：`FEDIAF_2025_DOG`
- 营养素定义数量：`46`
- 标准条目数量：`1341`
- 来源表数量：
  - `III-3a`: `225`
  - `III-3b`: `225`
  - `III-3c`: `225`
  - `VII-17a`: `264`
  - `VII-17b`: `132`
  - `VII-17c`: `135`
  - `VII-17d`: `135`
- 来源类型数量：
  - `CORE_RECOMMENDATION`: `675`
  - `ANNEX_7_8`: `666`
- 来源页码与来源类型符合设计范围。
- 高风险抽查项符合 seed 数据：
  - 钙，晚期生长，VII-17b，每 1000 kcal ME
  - 钙磷比，成年犬 MER 95，VII-17d，每 1000 kcal ME
  - 维生素 D，成年犬 MER 95，VII-17d，每 1000 kcal ME
  - 碘，成年犬 MER 110，VII-17c，每 1000 kcal ME
  - EPA+DHA，成年犬 MER 95，VII-17d，每 1000 kcal ME

## 后台页面验收

机器验收通过后，启动后台并打开：

```text
/nutrition-standards/fediaf-2025-dog
```

页面应能看到：

- 标准名称：`FEDIAF 2025 犬营养标准`
- 标准值列表可按来源表、生命周期、营养分类、审核状态筛选。
- 标准值只读，不能直接编辑。
- 审核标记可设为未审核、已审核、有疑问、需修正。

## 常见失败

### 缺少 nutrition_standard_version 表

说明 migration 尚未应用。先执行：

```bash
cd backend
npx prisma migrate deploy
```

### migration 历史分叉

如果 `migrate status` 提示数据库中存在代码目录没有的 migration，例如本地库当前出现过的 `202605110001_add_nutrition_governance`，不要强行继续。应先恢复缺失 migration 文件，或使用干净测试库重新跑迁移。

### 审计数量不匹配

重新执行 seed：

```bash
cd backend
npm run seed:fediaf-2025-dog-standard
npm run audit:fediaf-2025-dog-standard
```

如果仍不匹配，说明结构化 seed 数据或数据库记录被改动，应先回到管理端审核页面核对来源表和关键营养素，再决定是否修正 seed。
