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
| **为谁定制（狗名/品种/年龄/体重）** | —— | 🔴 **快照里没有**（唯一真缺的"数据"） |
| 卖点 + 一句话结论 | **`Recipe.sellingPoint`（模型有、后台可编辑、AI 能生成）** | 🟡 **快照没带** |
| 营养标准 | `nutrition.standard` | ✅ |
| 核心营养成分 | `nutrition.macros` + `energyDensityKcalPerKg` | ✅ |
| 食材 + 占比 | `recipe.items[].name` + `.ratioPercent` | ✅ |
| **额外补充的营养素 + 浓度** | `supplements[].perKgG` 有浓度；营养素名在**已有的 `supplementTargets[].label`** 里 | 🟡 **快照没带** |
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

## 三、老板两问之后：真正缺的，一个新增字段都没有

### 问 1：`nutrientLabel` 不能沿用已有的营养素字典吗？

**能，而且比字典更直接 —— 已有的 `supplementTargets` JSON 里就带营养素中文名。**

`RecipeItem.supplementTargets` 的元素形状（`recipe-designer.service.ts:5966`）：

```js
{
  fieldPath: string,        // 营养素标识
  label: string,            // ← 营养素中文名（"钙"）
  targetValuePerKg: number, // ← 每 kg 加多少
  unit: string,             // ← 单位（g / mg）
}
```

**所以 `nutrientLabel` 撤回。** 要做的是：交付快照的 `supplements[]`
把这个**已有的 JSON 原样透传**，第 1 页从 `label` 取名字。

| 现有 `SnapshotSupplement` | 要补什么 |
|---|---|
| `name`（**产品名**，如"鱼油"） | 保留 —— 第 2 页买的时候用 |
| `perKgG` | 保留 |
| `timing` / `brand` / `totalG` | 保留 |
| —— | **补 `supplementTargets`（已有 JSON，直接透传）** |

> 这不是"新增字段"，是"已有的字段没传下去"。

### 问 2：Web 后台的卖点用的是哪个字段？能复用吗？

**能，而且它就是 `Recipe.sellingPoint`。**

| 查什么 | 结果 |
|---|---|
| Web 后台表单 | `admin-web/src/views/Recipes/RecipeForm.vue:200` → `v-model="form.sellingPoint"` |
| placeholder | "**一句话**说明这款食谱的核心卖点（可选，**不超过 40 字**）" |
| 数据库 | `Recipe.sellingPoint String? @db.VarChar(120)` |
| **AI 生成** | 后台已经有「**AI 生成卖点与说明**」对话框，直接产出 `sellingPoint`（40 字）+ `description`（400 字）+ 推荐标签 |

**所以 `oneLineSummary` 也不需要新增 —— `sellingPoint` 本来就是"一句话"，而且已经有 AI 在生成它。**

### 🔴 顺带查出三件事（都是"有字段但没传值"）

查 `custom-recipe-delivery.service.ts:450` 交付时给 `nutrition` 传了什么：

```js
nutrition: {
  standard: input.recipe.nutritionStandard,
  energyDensityKcalPerKg: ...,
}
```

**只传了两项。** 所以：

| 字段 | 状态 | 后果 |
|---|---|---|
| `nutrition.macros` | **没传** → 永远是 null | 核心营养成分在交付页从来没显示过 |
| `nutrition.plainConclusion` | **没传**，而且**数据库里根本没有这个字段** | 「一句话营养结论」从来没显示过 |
| `recipe.sellingPoint` | **快照里没带** | 卖点在交付页从来没显示过 |

> 这也解释了为什么我第一次扒线上代码时看到第 1 页「营养」只有两项 ——
> 不是设计如此，是**没传值**。

**`plainConclusion` 怎么处理**：它数据库没有来源、交付从没显示过。
按老板"卖点和营养结论合成一句"的决定，**这一句就写进 `sellingPoint`**，
`plainConclusion` 从快照类型里删掉即可（避免以后有人以为它有用）。

---

## 四、真正要动的（共 5 项，全是"补传已有字段"或"删"）

| # | 动什么 | 性质 | 新增字段？ |
|---|---|---|---|
| 1 | 快照补 `dog` 一组（name / breedName / ageText / weightKg） | 补数据（名字用现有列名） | ❌ |
| 2 | `supplements[]` 透传 `supplementTargets` | 补传已有 JSON | ❌ |
| 3 | `nutrition` 补传 `macros` | 补传已有字段 | ❌ |
| 4 | `recipe` 补传 `sellingPoint` | 补传已有字段 | ❌ |
| 5 | 删采购量整条线（`purchaseG` / `totalPurchaseG` / `lossRate`） | 删 | ❌ |
| — | `plainConclusion` 从快照类型删除 | 删（它从来没有值） | ❌ |

**新增字段：0 个。**

---

## 五、我撤回的新增（全部 6 个）

| 我提的 | 结论 |
|---|---|
| `items[].kind` | ❌ 用现有 `ingredientType` |
| `items[].netAmountG` | ❌ 用现有 `shopping.lines[].netG` |
| `usage[]` 整组 | ❌ 快照是冻结的，没有也不该有 id |
| `referenceValues` | ❌ 饭量能算，不需要存 |
| `nutrientLabel` | ❌ 用已有 `supplementTargets[].label` |
| `oneLineSummary` | ❌ 用已有 `Recipe.sellingPoint` |

---

## 六、一句话总结

| 我一开始说的 | 实际情况 |
|---|---|
| 要新增一堆字段 | **一个都不用新增** |
| 交付页缺封面、卖点、营养素 | 封面 ✅ 有；卖点 ✅ 有（快照没带）；营养素名 ✅ 有（快照没带） |
| 工作量是"重构三个页面" | **补传 4 处已有字段 + 删 1 条线 + 抽共享组件** |

**真正的教训**：我这 5 轮提的每一个"新增字段"，后端都已经有了 ——
有的甚至已经在前端显示了好几年。问题从来不是"缺字段"，是**"字段没传到位"**。
