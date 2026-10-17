# 交付物现有字段全清单（2026-10-17 · 反向做法）

> **老板 2026-10-17 的方法**：
> "我不再设计字段，而是把现有所有相关字段列全，你从里面挑哪个不够用，我再补。"
>
> **于是这份文档不再写"我建议新增什么"，而是先回答：已经有了什么。**
>
> 结论先说：**两页需要的字段，98% 已经存在。真正缺的只有 2 样。**

---

## 一、交付快照的完整结构（后端已实现）

> 位置：`backend/src/domain/custom-recipe/custom-recipe.delivery.ts`
>
> 这是一份**冻结快照** —— 交付那一刻把值复制下来，之后食谱怎么改都不影响已交付内容。

```
DeliveryContentSnapshot
├── schemaVersion           快照结构版本（旧快照能按老版本渲染）
│
├── recipe
│   ├── recipeId            ✅ 营养报告入口要用它
│   ├── name                ✅ 食谱名
│   ├── coverImageUrl       ✅ 封面图
│   ├── internalId
│   └── items[]             ✅ 原料清单
│       ├── name            ✅ 原料名
│       ├── preparation     ✅ 制备方法
│       ├── ratioPercent    ✅ 占比（0–100）
│       ├── weightG         ✅ 示例重量
│       ├── ingredientType  ✅ 三值（FOOD / SUPPLEMENT / PACKAGING）← 今天刚补
│       └── isSupplement    ⚠️ 布尔（会被 PACKAGING 骗，已被上面取代）
│
├── feeding                 ✅ 喂食参数（后端算好）
│   ├── dailyIntakeG        ✅ 每天多少克
│   ├── mealsPerDay         ✅ 每天几餐
│   ├── perMealG            ✅ 每餐多少克
│   └── cycleDays           ✅ 做几天
│
├── nutrition               ✅ 营养口径
│   ├── standard            ✅ "符合 FEDIAF 2018"
│   ├── energyDensityKcalPerKg ✅ 能量密度
│   ├── macros              ✅ 蛋白/脂肪/灰分/水分/纤维/碳水
│   └── plainConclusion     ✅ 一句话营养结论
│
├── shopping                ✅ 用量清单
│   ├── totalNetG           ✅ 合计净重
│   ├── totalPurchaseG      ❌ 要删（老板：不展示采购量）
│   ├── lossRate            ❌ 要删（随采购量一起去掉）
│   └── lines[]
│       ├── name            ✅ 食材名
│       ├── netG            ✅ **净用量（这就是我先前想"新增"的那个）**
│       ├── purchaseG       ❌ 要删
│       └── recommendedProductId ✅ 推荐商品（补剂购买用）
│
├── supplements[]           ✅ 应该额外补的东西
│   ├── name                ⚠️ **这是产品名（如"鱼油"），不是营养素名**
│   ├── perKgG              ✅ 每 kg 食材加多少克
│   ├── totalG
│   ├── brand
│   └── timing              ✅ 什么时候加
│
├── steps[]                 ✅ 制作步骤
├── storage                 ✅ 储存方式
└── generatedAt
```

---

## 二、对照需求：哪些字段够用

### 第 1 页「专属食谱」

| 需求 | 用哪个现有字段 | 状态 |
|---|---|---|
| 封面 | `recipe.coverImageUrl` | ✅ **有**（我之前说"缺"是错的） |
| 食谱名 | `recipe.name` | ✅ |
| **为谁定制（狗名/品种/年龄/体重）** | —— | 🔴 **快照里没有** |
| 卖点 + 一句话结论 | `Recipe.sellingPoint`（模型有）+ `nutrition.plainConclusion` | 🟡 **模型有，快照没带** |
| 营养标准 | `nutrition.standard` | ✅ |
| 核心营养成分 | `nutrition.macros` + `energyDensityKcalPerKg` | ✅ |
| 食材 + 占比 | `recipe.items[].name` + `.ratioPercent` | ✅ |
| **额外补充的营养素 + 浓度** | `supplements[].perKgG` 有浓度，但 `name` 是**产品名** | 🔴 **缺营养素名** |
| 完整营养报告入口 | `recipe.recipeId` | ✅ |

### 第 2 页「采购与制作」

| 需求 | 用哪个现有字段 | 状态 |
|---|---|---|
| 每天怎么喂 | `feeding.dailyIntakeG` / `mealsPerDay` / `perMealG` | ✅ |
| 这次做多少 | `feeding.cycleDays` + `shopping.totalNetG` | ✅ |
| **每种食材净用量** | `shopping.lines[].netG` | ✅ **已有，后端算好** |
| 补剂用量与购买 | `supplements[]` + `shopping.lines[].recommendedProductId` | ✅ |
| 制作步骤 | `steps[]` | ✅ |
| 怎么存 | `storage` | ✅ |
| 长图二维码 | 前端生成，不需要字段 | ✅ |

---

## 三、真正缺的，只有 2 样

### 缺口 1：狗狗信息

快照里**完全没有**狗的名字、品种、年龄、体重。

而第 1 页的封面要把这些叠上去（老板定的）。

**要补什么**：一个 `dog` 对象，字段**全部取自现有的 `dog` 表**，不新造名字：

| 用什么 | 来自 |
|---|---|
| 狗名 | `dog.name` |
| 品种名 | `dogBreed.name`（经 `dog.breedId` 关联） |
| 年龄 | `dog.birthday` 推算（或前端传，但**后端算更好**） |
| 体重 | `dog.currentWeightKg` |

> **建议**：不要新造 `dogName` / `dogBreed` 这类字段，
> 直接给 `dog: { name, breedName, ageText, weightKg }` 一组 —— 名字全部沿用现有列名。

### 缺口 2：营养素名称

`supplements[].name` 现在是**原料名**（"鱼油"），不是**营养素名**（"EPA + DHA"）。

而第 1 页要展示的是"额外补充的**营养素**"（老板 2026-10-17 明确要求）。

**要补什么**：`supplements[]` 上补一个 `nutrientLabel`，
值取 `nutrition_nutrient_definition.name`（`RecipeItem.nutrientTargetKey` 关联过去）。

| 现有 | 补之后 |
|---|---|
| `name: "鱼油"` | `name: "鱼油"`（产品，第 2 页买的时候用）<br />**`nutrientLabel: "EPA + DHA"`**（营养素，第 1 页展示用） |

> ⚠️ 这一条也**不是新造概念** —— `nutrientTargetKey` 和字典表都在。

---

## 四、要删的（老板 2026-10-17 定）

| 字段 / 逻辑 | 在哪 | 删了之后 |
|---|---|---|
| `shopping.lines[].purchaseG` | 快照 | — |
| `shopping.totalPurchaseG` | 快照 | — |
| `shopping.lossRate` | 快照 | — |
| `actualAmount = theoreticalAmount * (1 + lossRate)` | `diy-sheet` 前端 | **整段消失** |
| `globalSupplementLossRate` | `diy-sheet` 前端 | **整段消失** |
| "建议采购合计"、"已按 7% 损耗留出余量" | 两页文案 | **删掉** |

**收益：`diy-sheet` 里"前端算采购量"那一整块不用搬后端了 —— 直接不用了。**

---

## 五、我要撤回的三个"新增"

| 我原来提的 | 结论 |
|---|---|
| `items[].kind` | ❌ **撤回**。用现有的 `ingredientType`（已经在用了） |
| `items[].netAmountG` | ❌ **撤回**。用现有的 `shopping.lines[].netG`（后端算好的） |
| `usage[]` 整组 | ❌ **撤回**。没有这个数组，也没有 `ingredientId`（快照是冻结的，不该有 id） |
| `referenceValues` | ❌ **撤回**（上一轮） |

**我提的 5 个新增里，撤回了 4 个。**

---

## 六、剩下真正要动的（共 4 项）

| # | 动什么 | 性质 |
|---|---|---|
| 1 | 快照补 `dog` 一组 | **补数据**（字段名全用现有的） |
| 2 | `supplements[]` 补 `nutrientLabel` | **补数据**（来自已有字典） |
| 3 | 删采购量整条线（含 `lossRate`） | **删** |
| 4 | `oneLineSummary` 要不要新增 | ⚠️ **待老板定，见下** |

### 第 4 项要老板定

`Recipe.sellingPoint`（`VarChar(120)`）**已经存在**，`nutrition.plainConclusion` 也存在。

老板定过"卖点和一句话结论合成一句"。那有两种做法：

| 方案 | 做法 | 代价 |
|---|---|---|
| **A** | **不新增字段**：把合成后的整句写进 `sellingPoint`，`plainConclusion` 停用 | 零迁移，但 `sellingPoint` 这名字就不再只是"卖点"了 |
| **B** | **新增** `oneLineSummary`，两个旧字段废弃 | 语义更准，但要迁移旧数据 |

> 按"能用已有的就用已有的"，**我倾向 A**。
> 但 `sellingPoint` 这个名字确实会变得名不副实 —— 这一条你定。

---

## 七、一句话总结

| 我一开始说的 | 实际情况 |
|---|---|
| 要新增一堆字段 | **两页要的东西 98% 已经存在** |
| 交付页缺封面、卖点、营养素 | 封面 ✅ 有；卖点模型有（快照没带）；营养素名确实缺 |
| 工作量是"重构三个页面" | **补 2 样数据 + 删 1 条线 + 抽共享组件** |
