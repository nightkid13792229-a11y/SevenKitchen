# 原料用量数据一致性验证报告

生成时间: 2026-01-11
验证人: Claude Code
验证范围: 食材类(FOOD) + 补剂类(SUPPLEMENT)

---

## 执行摘要

本次验证对从用户配置订单参数到采购环节的完整用量数据流进行了全面检查。验证结果显示：

- ✅ **后端计算逻辑正确**：100%的订单快照包含完整的amount和netAmount字段
- ✅ **数据库快照完整**：所有61个原料都包含netAmount字段，覆盖率100%
- ⚠️ **小程序显示部分符合**：食材类显示正确，补剂类需要修改
- ✅ **采购清单数据流正确**：采购清单正确使用amount字段（实际采购量）

---

## 一、验证结果总结

### 1.1 后端计算逻辑 ✅

**文件**: `backend/src/domain/pricing/pricing.service.ts`

**验证结果**:
- ✅ 正确计算两个字段：`amount`（实际采购量）和 `netAmount`（理论净用量）
- ✅ 食材类原料：`amount >= netAmount`（所有53个食材都满足）
- ✅ 补剂类原料：`amount = netAmount`（8个补剂都满足）
- ✅ 计算公式清晰正确

**示例数据**（订单 3a7137db）:
```
原料: 牛霖 (FOOD)
- amount (实际采购量): 1.126 kg
- netAmount (理论净用量): 1.000 kg
- 采购/净重比例: 1.126
- 计算公式: 净需求1.000kg ÷ 出成率0.95 × 损耗率1.07 = 毛需求1.126kg × 0.0800元/g = 90.07元
✅ 正确: 实际采购量 >= 理论净用量
```

---

### 1.2 数据库快照完整性 ✅

**文件**: `backend/src/domain/order/pricing-breakdown-snapshot.ts`

**统计数据**:
- 总订单数: 4
- 有ingredientDetails: 4 (100%)
- 总原料数: 61
- 含netAmount字段: 61 (100%)
- 缺少netAmount字段: 0

**结论**: ✅ 所有订单快照数据完整且一致

---

### 1.3 小程序订购页面 ⚠️

**文件**: `miniapp/src/pages/recipe-order/index.vue`

#### 食材类显示（第274行）✅

```vue
{{ Math.round((ingredient.netAmount ?? ingredient.amount) * 1000) }}{{ ingredient.displayUnit || ingredient.unit }}
```

- 使用字段: `netAmount` (优先)
- 显示内容: **理论净用量**（不含生产损耗、不含出肉率）
- **符合用户期望**: ✅

#### 补剂类显示（第293行）❌

```vue
{{ ingredient.amount.toFixed(1) }}{{ ingredient.displayUnit || ingredient.unit }}
```

- 使用字段: `amount`
- 显示内容: **实际采购量**（含损耗率）
- **符合用户期望**: ❌ 应该显示netAmount（理论用量）

#### 价格明细（第468行）✅

```vue
{{ item.amount.toFixed(3) }} {{ item.unit }}
```

- 使用字段: `amount`
- 显示内容: **实际采购量**
- **符合预期**: ✅ 价格计算应基于实际采购量

---

### 1.4 采购清单 ✅

**文件**: `backend/src/application/purchasing/purchasing.service.ts`

**验证结果**:
```typescript
existing.quantityNeeded += detail.amount || 0;  // 第107行
```

- 使用字段: `amount`
- 显示内容: **实际采购量**（含生产损耗率）
- **符合用户期望**: ✅ 采购需要考虑损耗率

**示例验证**:
```
原料: 鸡蛋
采购清单显示: 11.534 kg
来自 4 个订单:
- amount累加: 11.534
- netAmount累加: 7.546
✅ 采购清单使用 amount (实际采购量)
```

---

### 1.5 端到端数据流 ✅（除补剂显示外）

**流程验证**:

1. **用户配置参数** → 后端计算价格 ✅
   - 计算 `amount`（实际）+ `netAmount`（理论）
   - 两个值都正确计算

2. **后端保存订单快照** ✅
   - 保存完整的 `ingredientDetails`
   - 包含 `amount` 和 `netAmount` 字段

3. **小程序显示** → ⚠️
   - 食材类: 显示 `netAmount`（理论）✅
   - 补剂类: 显示 `amount`（实际）❌

4. **订单快照** ✅
   - 保存两个字段，数据完整

5. **采购清单** ✅
   - 使用 `amount`（实际采购量）
   - 数据累加正确

---

## 二、发现的问题

### 问题1: 补剂类显示字段错误 ❌

**位置**: `miniapp/src/pages/recipe-order/index.vue:293`

**当前代码**:
```vue
{{ ingredient.amount.toFixed(1) }}{{ ingredient.displayUnit || ingredient.unit }}
```

**问题**:
- 显示的是 `amount`（实际采购量，含损耗率）
- 用户期望显示 `netAmount`（理论用量，不含损耗率）
- **影响**: 用户看到的补剂用量偏大，不符合"理论用量"的定义

**应修改为**:
```vue
{{ (ingredient.netAmount ?? ingredient.amount).toFixed(1) }}{{ ingredient.displayUnit || ingredient.unit }}
```

**优先级**: **高**（影响用户体验和对用量的理解）

---

### 问题2: 类型定义缺少netAmount字段 ⚠️

**位置**: `backend/src/domain/order/pricing-breakdown-snapshot.ts:26-35`

**当前定义**:
```typescript
ingredientDetails?: Array<{
  ingredientId: string;
  name: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  amount: number;
  unit: string;
  cost: number;
  purchaseChannel?: string;
  productModel?: string;
}>
```

**问题**:
- 类型定义中缺少 `netAmount` 字段
- 实际数据中包含该字段，但TypeScript类型未定义
- **影响**: 代码类型不完整，可能导致类型检查问题

**应添加**:
```typescript
netAmount?: number;  // 理论净用量（不含损耗）
```

**优先级**: **中**（代码规范性，不影响运行）

---

## 三、修复建议

### 修复1: 更新小程序补剂类显示 🔧

**文件**: `miniapp/src/pages/recipe-order/index.vue`

**修改位置**: 第293行

**修改前**:
```vue
{{ ingredient.amount.toFixed(1) }}{{ ingredient.displayUnit || ingredient.unit }}
```

**修改后**:
```vue
{{ (ingredient.netAmount ?? ingredient.amount).toFixed(1) }}{{ ingredient.displayUnit || ingredient.unit }}
```

**理由**:
- 与食材类保持一致
- 符合用户期望：显示理论用量（不含损耗率）
- 提供更准确的用量信息给用户

---

### 修复2: 更新类型定义 🔧

**文件**: `backend/src/domain/order/pricing-breakdown-snapshot.ts`

**修改位置**: 第26-35行

**添加字段**:
```typescript
ingredientDetails?: Array<{
  ingredientId: string;
  name: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  amount: number;
  netAmount?: number;  // 净需求（不含损耗）
  unit: string;
  cost: number;
  purchaseChannel?: string;
  productModel?: string;
}>
```

**理由**:
- 与实际数据结构一致
- 提供完整的类型定义
- 便于IDE自动补全和类型检查

---

## 四、总结

### 符合期望的部分 ✅

1. ✅ **后端计算逻辑正确**
   - 正确计算 `amount`（实际采购量）和 `netAmount`（理论净用量）
   - 所有食材类满足 `amount >= netAmount`
   - 计算公式清晰准确

2. ✅ **数据库快照完整**
   - 100%的订单包含完整的ingredientDetails
   - 100%的原料包含netAmount字段
   - 数据一致性良好

3. ✅ **采购清单数据流正确**
   - 正确使用 `amount` 字段（实际采购量）
   - 数据累加逻辑正确
   - 符合采购业务需求

4. ✅ **食材类小程序显示正确**
   - 使用 `netAmount`（理论净用量）
   - 符合用户期望

### 需要修复的部分 ❌

1. ❌ **补剂类小程序显示**
   - 应该使用 `netAmount`（理论用量）
   - 当前使用 `amount`（实际采购量）
   - **优先级**: 高

2. ⚠️ **类型定义不完整**
   - 需要添加 `netAmount` 字段
   - **优先级**: 中

### 数据流验证结论

| 环节 | 当前状态 | 是否符合期望 |
|------|---------|-------------|
| 后端计算 | amount（实际）+ netAmount（理论） | ✅ |
| 订单快照 | 保存两个字段 | ✅ |
| 小程序食材类 | 显示 netAmount | ✅ |
| 小程序补剂类 | 显示 amount | ❌ |
| 采购清单 | 使用 amount | ✅ |

### 优先级建议

1. **高优先级**: 修复补剂类显示字段
   - 影响用户体验
   - 使数据流保持一致

2. **中优先级**: 更新类型定义
   - 代码规范性
   - 避免潜在的类型问题

---

## 五、验证脚本

### 创建的验证脚本

1. `backend/verify-pricing-calculation.js` - 后端计算逻辑验证
2. `backend/verify-snapshot-integrity.js` - 数据库快照完整性验证
3. `miniapp/verify-ingredient-display.js` - 前端显示字段验证
4. `backend/verify-purchasing-data-flow.js` - 采购清单数据流验证

### 创建的SQL查询

1. `backend/sql/check-ingredient-amounts.sql` - 订单快照数据提取
2. `backend/sql/check-all-snapshot-amounts.sql` - 批量检查所有订单

### 使用方法

```bash
# 运行所有验证脚本
cd /Users/zhaochen/Documents/SevenKitchen/backend
node verify-pricing-calculation.js
node verify-snapshot-integrity.js
node verify-purchasing-data-flow.js

cd /Users/zhaochen/Documents/SevenKitchen/miniapp
node verify-ingredient-display.js
```

---

## 附录

### A. 验证环境

- 数据库: PostgreSQL (Prisma ORM)
- 后端: Node.js + TypeScript + NestJS
- 前端: 微信小程序 (Vue)
- 验证时间: 2026-01-11
- 订单样本: 4个PAID订单
- 原料样本: 61个（53个食材 + 8个补剂）

### B. 关键文件路径

**后端核心**:
- `backend/src/domain/pricing/pricing.service.ts`
- `backend/src/domain/order/pricing-breakdown-snapshot.ts`
- `backend/src/application/purchasing/purchasing.service.ts`

**前端核心**:
- `miniapp/src/pages/recipe-order/index.vue`
- `miniapp/src/pages/staff-purchasing/detail.vue`

### C. 业务规则回顾

**理论用量定义**:
- 公式: 理论用量 = 订单总量 × 原料比例
- 特点: 不考虑任何损耗率、不考虑出肉率

**各环节期望**:
| 环节 | 期望用量 | 说明 |
|------|---------|------|
| 小程序订购页 | **理论用量** | 不含损耗 |
| 后端订单数据 | **理论用量** | 不含损耗 |
| 订单快照 | **理论用量** | 不含损耗 |
| 采购清单 | **实际用量** | 含损耗率 |
