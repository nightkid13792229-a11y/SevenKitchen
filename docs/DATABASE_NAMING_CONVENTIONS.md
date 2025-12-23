# 数据库命名规范与Prisma映射规则

## ⚠️ 重要约束：禁止"想象"字段名

**在执行任何SQL查询前，必须先查看实际表结构，不得猜测列名！**

---

## 1. Prisma Schema vs PostgreSQL 实际存储

### 命名映射规则

Prisma使用**驼峰命名（camelCase）**，但PostgreSQL实际存储时转换为**蛇形命名（snake_case）**。

| Prisma Schema定义 | PostgreSQL实际存储 | 示例 |
|------------------|------------------|------|
| `sizeCategory` | `size_category` | ENUM类型字段 |
| `averageAdultWeightKg` | `average_adult_weight_kg` | Float字段 |
| `adultAgeMonths` | `adult_age_months` | Int字段 |
| `seniorAgeYears` | `senior_age_years` | Int字段 |
| `growthCurveType` | `growth_curve_type` | ENUM类型字段 |
| `createdAt` | `created_at` | DateTime字段 |
| `updatedAt` | `updated_at` | DateTime字段 |

### 表名映射

| Prisma定义 | PostgreSQL实际存储 |
|-----------|------------------|
| `DogBreed` | `dog_breed` |
| `OrderItem` | `order_item` |
| `OrderStatusHistory` | `order_status_history` |
| `InventoryLedgerEntry` | `inventory_ledger_entry` |
| `ProductionBatch` | `production_batch` |
| `PackagingUnit` | `packaging_unit` |

---

## 2. SQL查询规范

### ❌ 错误示例（直接使用Prisma定义）

```sql
-- 错误：列名不存在
SELECT "sizeCategory", "averageAdultWeightKg" FROM dog_breed;

-- 错误原因：PostgreSQL中实际列名是 size_category, average_adult_weight_kg
```

### ✅ 正确示例（使用蛇形命名）

```sql
-- 正确：使用PostgreSQL实际列名
SELECT size_category, average_adult_weight_kg FROM dog_breed;
```

---

## 3. 强制验证流程

### 在执行任何SQL查询前，必须：

#### 步骤1：查看实际表结构

```bash
# 方法1：使用 \d 命令
sudo -u postgres psql -d sevenkitchen -c "\d dog_breed"

# 方法2：查询 information_schema
sudo -u postgres psql -d sevenkitchen -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'dog_breed';"

# 方法3：使用 SELECT * 快速查看
sudo -u postgres psql -d sevenkitchen -c "SELECT * FROM dog_breed LIMIT 1;"
```

#### 步骤2：确认列名后再写查询

```bash
# 确认列名后执行
sudo -u postgres psql -d sevenkitchen -c "SELECT confirmed_column_name FROM table_name;"
```

---

## 4. Prisma查询 vs 原生SQL查询

### Prisma Client查询（使用驼峰）

```typescript
// TypeScript中使用Prisma Client
await prisma.dogBreed.findMany({
  select: {
    name: true,
    sizeCategory: true,
    averageAdultWeightKg: true,
  }
});
```

### 原生SQL查询（使用蛇形）

```sql
-- 直接连接PostgreSQL时必须使用蛇形命名
SELECT name, size_category, average_adult_weight_kg
FROM dog_breed;
```

---

## 5. 快速参考表

### dog_breed 表结构

| Prisma定义 | PostgreSQL实际存储 | 数据类型 |
|-----------|------------------|---------|
| `id` | `id` | UUID |
| `name` | `name` | VARCHAR |
| `sizeCategory` | `size_category` | ENUM |
| `growthCurveType` | `growth_curve_type` | ENUM |
| `adultAgeMonths` | `adult_age_months` | INTEGER |
| `seniorAgeYears` | `senior_age_years` | INTEGER |
| `averageAdultWeightKg` | `average_adult_weight_kg` | DOUBLE PRECISION |
| `createdAt` | `created_at` | TIMESTAMP |
| `updatedAt` | `updated_at` | TIMESTAMP |

### dog 表结构（部分）

| Prisma定义 | PostgreSQL实际存储 | 数据类型 |
|-----------|------------------|---------|
| `id` | `id` | UUID |
| `name` | `name` | VARCHAR |
| `breedId` | `breed_id` | UUID |
| `sizeClassOverride` | `size_class_override` | ENUM |
| `birthDate` | `birth_date` | DATE |
| `weightKg` | `weight_kg` | FLOAT |
| `gender` | `gender` | ENUM |
| `isNeutered` | `is_neutered` | BOOLEAN |
| `createdAt` | `created_at` | TIMESTAMP |
| `updatedAt` | `updated_at` | TIMESTAMP |

---

## 6. 违反规则的后果

### ❌ 错误示例

```bash
$ sudo -u postgres psql -d sevenkitchen -c 'SELECT "sizeCategory" FROM dog_breed;'
ERROR:  column "sizeCategory" does not exist
```

### ✅ 正确示例

```bash
$ sudo -u postgres psql -d sevenkitchen -c 'SELECT size_category FROM dog_breed;'
 size_category
---------------
 SMALL
 MEDIUM
 LARGE
 GIANT
```

---

## 7. AI开发者约束（针对Cursor/Claude Code）

### 强制要求：

1. **禁止猜测字段名**：在写SQL前必须先查看表结构
2. **使用 `\d table_name` 验证**：这是最快的验证方式
3. **遵循蛇形命名**：原生SQL查询必须使用蛇形命名
4. **区分环境**：
   - TypeScript代码中使用Prisma Client → 驼峰命名
   - 直接执行PostgreSQL SQL → 蛇形命名

### 检查清单：

- [ ] 是否查看了实际表结构（`\d table_name`）？
- [ ] SQL中使用的列名是否与PostgreSQL实际存储一致？
- [ ] 是否使用了蛇形命名（不是Prisma的驼峰命名）？
- [ ] 如果不确定，是否先执行了 `SELECT * FROM table LIMIT 1;` 验证？

---

## 8. 更新记录

| 日期 | 版本 | 更新内容 | 作者 |
|------|------|---------|------|
| 2025-12-24 | 1.0 | 创建文档，明确Prisma与PostgreSQL命名映射规则 | Claude Code |

---

**本文档必须在任何数据库操作前阅读！**
