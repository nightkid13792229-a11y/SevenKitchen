# 数据库命名规范与 Prisma 映射规则

> **唯一真源：`backend/prisma/schema.prisma`。**
> 本文只讲“命名规则 + 怎么验证”；具体字段不要手抄，直接查 schema 或真实库。
> 最后核对：2026-11-03（当时 schema 有 151 个 model）。

---

## 0. 一句话规则

Prisma 的 model 用 **PascalCase**、字段用 **camelCase**；数据库的表 / 列用 **snake_case**；
两者靠 schema 里的 `@@map` / `@map` **显式绑定**。

**不要假设 Prisma 会自动把 `currentWeightKg` 转成 `current_weight_kg`** ——
本项目是逐字段写了 `@map` 才这样的。schema 里没写 `@map` 的字段，数据库列名就是字段名本身。

---

## 1. 映射机制

### 表名：`@@map`

```prisma
model DogBreed {
  id String @id @default(uuid()) @map("id")
  // ...

  @@map("dog_breed")
}
```

- 代码里用 `prisma.dogBreed`
- 原生 SQL 里用 `dog_breed`

### 列名：`@map`

```prisma
model Dog {
  birthday        DateTime @map("birthday")
  currentWeightKg Float    @map("current_weight_kg")
  createdAt       DateTime @default(now()) @map("created_at")
}
```

- Prisma Client 里用 `dog.currentWeightKg`
- 原生 SQL 里用 `current_weight_kg`

### 关系字段不是数据库列

`Dog.allergyRecords AllergyRecord[]` 这类关系字段只存在于 Prisma Client，
数据库里没有 `allergy_records` 这一列。写原生 SQL 时不要把它当列名。

### 保留字要加双引号

`order`、`user` 等是 PostgreSQL 保留字，表名/列名出现在原生 SQL 里要加双引号：

```sql
SELECT * FROM "order" LIMIT 1;   -- ✅
-- SELECT * FROM order LIMIT 1;  -- ❌ 语法错误
```

---

## 2. 命名约定

| 对象 | 约定 | 示例 |
|---|---|---|
| Prisma model | PascalCase | `DogBreed`、`VaccineRecord` |
| 数据库表 | snake_case，以 `@@map` 为准 | `dog_breed`、`vaccine_record` |
| Prisma 字段 | camelCase | `currentWeightKg`、`sizeCategory` |
| 数据库列 | snake_case，以 `@map` 为准 | `current_weight_kg`、`size_category` |
| 主键 | 以 schema 为准（多数 UUID 字符串） | `id` / `id` |
| 时间字段 | `createdAt` / `updatedAt` | `created_at` / `updated_at` |

补充：

- 表名不强制单复数；以 schema 里的 `@@map` 为准（例如 `order`、`dog`、`dog_breed` 混用是历史现状）。
- 主键以 schema 为准：多数是 UUID 字符串，也有 `date_key` 这类业务键。
- 金额字段优先用 `Decimal`；营养值沿用 schema 现有类型，不要为了省事改类型。
- 枚举值、索引、唯一键、外键名都以 schema 为准，不要凭经验猜。

---

## 3. 写 SQL 前的强制验证流程

### 步骤 1：先看 schema

```bash
cd backend
grep -n "model Dog " -A 80 prisma/schema.prisma
```

或者在编辑器里打开 `backend/prisma/schema.prisma`，搜 model / 字段名。

### 步骤 2：校验 schema 本身

```bash
cd backend
npx prisma validate
```

### 步骤 3：看真实库（二选一）

**方式 A：Prisma Studio（推荐，最直观）**

```bash
cd backend
npx prisma studio
```

**方式 B：psql（需要本机有 psql）**

```bash
cd backend
# DATABASE_URL 从 backend/.env 读取；不要把值打印出来
set -a; source .env; set +a
psql "$DATABASE_URL" -c '\d "order"'
psql "$DATABASE_URL" -c '\d dog'
```

### 步骤 4：确认列名后再写查询

```sql
-- 确认过 schema / \d 之后再写
SELECT size_category, average_adult_weight_kg
FROM dog_breed;
```

### 步骤 5：不确定就在只读环境抽样

```sql
SELECT birthday, current_weight_kg FROM dog LIMIT 1;
```

---

## 4. 常见错误（都是实际踩过的）

| 错误写法 | 正确写法 | 说明 |
|---|---|---|
| `Dog.birthDate` / `birth_date` | `Dog.birthday` / `birthday` | 本项目 Dog 的生日字段叫 `birthday`，没有 `birthDate` |
| `Dog.weightKg` / `weight_kg` | `Dog.currentWeightKg` / `current_weight_kg` | `weightKg` 在别的模型（体重记录）里存在，Dog 本体用 `currentWeightKg` |
| `sizeCategory` 直接写进 SQL | `size_category` | Prisma 字段名和数据库列名不是一回事 |
| 把 `allergyRecords` 当列名 | 查 `allergy_record` 表 | 关系字段不是数据库列 |
| `SELECT * FROM order` | `SELECT * FROM "order"` | `order` 是保留字，要加双引号 |

> `DogBreed` 还有 `aliases` / `isCommon` / `bcsScoreMap` 等字段，
> 分别映射到 `aliases` / `is_common` / `bcs_score_map`。这类字段不要靠旧文档背，直接查 schema。

---

## 5. 新板块表名示例（不是完整清单）

| 领域 | Prisma model | 数据库表 |
|---|---|---|
| 犬只档案 | `Dog` | `dog` |
| 犬种 | `DogBreed` | `dog_breed` |
| 疫苗 | `VaccineRecord` | `vaccine_record` |
| 疫苗决策 | `VaccineDecision` | `vaccine_decision` |
| 过敏 | `AllergyRecord` | `allergy_record` |
| 过敏报告 | `AllergyReport` | `allergy_report` |
| 采购 SKU | `ProcurementSku` | `procurement_sku` |
| 补剂订单 | `SupplementOrder` | `supplement_order` |
| 知识库引用锚点 | `KnowledgeCitationAnchor` | `knowledge_citation_anchor` |

截至 2026-11-03，schema 共 151 个 model；上表只是跨板块的定位示例，
完整清单以 `backend/prisma/schema.prisma` 为准。

---

## 6. 写代码 vs 写 SQL

### Prisma Client（TypeScript）

```ts
await prisma.dog.findMany({
  select: {
    name: true,
    birthday: true,
    currentWeightKg: true,
  },
});
```

- 用 camelCase 字段名
- 关系字段可以直接 `include` / `select`
- 不要手写表名/列名

### 原生 SQL

```sql
SELECT name, birthday, current_weight_kg
FROM dog;
```

- 用 snake_case 列名
- 关系要自己 JOIN
- 保留字加双引号
- 改结构仍然必须走 Prisma migration，不能直接 `ALTER TABLE`

---

## 7. AI / DSH 开发者约束

1. **先读 `AGENTS.md` 和本文，再读 `backend/prisma/schema.prisma`。**
2. **禁止“想象”字段名**：不确定就查 schema、`npx prisma studio` 或 `\d`。
3. **文档与 schema 冲突时，以 schema 为准**，并顺手修文档。
4. TypeScript 里用 Prisma Client（camelCase）；直接写 PostgreSQL SQL 时用 snake_case。
5. 新增/重命名字段必须走 Prisma migration；迁移后同步更新本文的“规则/示例”，不要维护逐字段清单。

### 检查清单

- [ ] 是否打开了 `backend/prisma/schema.prisma` 确认字段名？
- [ ] SQL 里用的列名是否与 `@map` / `\d` 一致？
- [ ] 是否误把关系字段当成数据库列？
- [ ] 表名是保留字时，是否加了双引号？
- [ ] 改结构是否走了 Prisma migration？

---

## 8. 维护规则

- **本文不再维护逐字段清单**：字段会变，清单一定会过期。
- 只维护：命名规则、映射机制、验证流程、常见坑、跨板块表名示例。
- 新增大板块时，在“新板块表名示例”补 1–2 行即可，不要复制整张 schema。
- 每次修正错误字段后，在更新记录里写清楚“改了什么”，方便追溯。

---

## 9. 更新记录

| 日期 | 版本 | 更新内容 | 作者 |
|---|---|---|---|
| 2026-11-03 | 2.0 | 以 schema 为准重写：修正 `birthDate` → `birthday`、Dog 表 `weightKg` → `currentWeightKg`；补新板块表名示例；删掉易过期的逐字段表；改为 DSH/AGENTS.md 约束 | DSH |
| 2025-12-24 | 1.0 | 创建文档，明确 Prisma 与 PostgreSQL 命名映射规则 | Claude Code |

---

**记住：字段名以 `backend/prisma/schema.prisma` 为准，不以任何文档为准。**
