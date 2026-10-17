# 食谱相关页面 · 字段对照表（2026-10-17）

> **这份表解决一个问题：同一件事，我们到底有几个叫法。**
>
> 背景：老板担心"定制食谱页面与 DIY、食谱详情页有太多重复字段，
> 以后想改，忘记改另外一边就很麻烦"。
>
> **这份表把"担心"变成"看得见的清单"。**
>
> ⚠️ 只读代码 + 写文档，**没有改任何代码**。
> 数据来源：`miniapp/src/pages/` 下四个页面，逐字段扒出来的。

---

## 一、先看四个页面各自的数据来源

| 页面 | 文件 | 总行 | 数据从哪来 |
|---|---|---|---|
| 食谱详情页 | `recipe-detail/index.vue` | 2494 | 食谱接口（公开/私密分享） |
| DIY 配置页 | `recipe-diy/index.vue` | 2092 | 食谱接口 + 选狗 + 备餐参数 |
| DIY 制作单 | `diy-sheet/index.vue` | 3367 | 配方接口 + **前端自己算用量** |
| 交付第 1 页 | `custom-recipe/delivery.vue` | 515 | **交付快照**（后端算好） |
| 交付第 2 页 | `custom-recipe/delivery-shopping.vue` | 549 | **交付快照**（后端算好） |

---

## 二、★ 最危险的一类：同一个名字，两个不同的意思

> 这类比"重复"更糟 —— 因为它**不会报错**，只会算错。

| 字段名 | 在 A 页是什么意思 | 在 B 页是什么意思 | 风险 |
|---|---|---|---|
| **`amount`** | `recipe-detail`：**金额**（参考价 `displayReferencePrice.amount`） | `diy-sheet`：**用量**（克数） | 🔴 高 —— 名字一样，一个是钱一个是重量 |
| **`ratio` / `ratioPercent`** | `recipe-detail`：`0.4`（小数） | `delivery`：`40`（百分数） | 🔴 高 —— 差 100 倍，用错就是灾难 |
| **`netAmount` / `theoreticalAmount`** | `diy-sheet` 第 815 行：<br />`netAmountStr: formatNetAmount(totalTheoretical)` | 同一个页面的另一个名字 | 🟠 中 —— **同一个值两个名字，本地就打架** |

**证据**：

```js
// recipe-detail/index.vue:359 —— amount 是钱
约¥{{ formatReferencePrice(displayReferencePrice.amount) }}/100g

// diy-sheet/index.vue:1975 —— amount 是量
const actualAmount = theoreticalAmount * (1 + lossRate)

// diy-sheet/index.vue:815 —— 同一个值，两个名字
netAmountStr: formatNetAmount(totalTheoretical, true),
```

---

## 三、重复：同一个东西，几种叫法

### 3.1 食材用量（★ 重灾区）

| 概念 | 食谱详情页 | DIY 制作单 | 交付第 2 页 |
|---|---|---|---|
| **净用量**（这次要用多少） | `item.amount` | `theoreticalAmount`<br />**`netAmount`（同一个值）** | `line.netG` |
| **采购量**（净用量 × 损耗） | — | `actualAmount` | `line.purchaseG` |
| 合计净重 | — | `totalFoodNetWeightG` | `totalNetG` |
| 合计采购重 | — | `foodItemsTotal.actualAmount` | `totalPurchaseG` |

**同一个"净用量"，三个页面三个名字**：`amount` / `theoreticalAmount`(=`netAmount`) / `netG`

### 3.2 食材本身的属性

| 概念 | 食谱详情页 | 交付第 1 页 | DIY 制作单 |
|---|---|---|---|
| 名称 | `item.name` | `item.name` | `item.name` ✅ 一致 |
| **制备方法** | `item.preparationMethod` | `item.preparation` | `item.preparationMethod` |
| **占比** | `item.ratio`（0.4） | `item.ratioPercent`（40） | ？ |
| 营养状态标签 | `item.nutritionStateLabel` | — | `item.nutritionStateLabel` ✅ |
| 排序 | `item.sortOrder` | — | — |

⚠️ **`preparationMethod` vs `preparation`** —— 同一个东西，两个名字。

### 3.3 补剂 / 营养素浓度

| 概念 | 食谱详情页 | DIY 制作单 | 交付第 1 页 |
|---|---|---|---|
| 营养素标识 | `nutrientTargetKey` | `nutrientTargetKey` ✅ | **无**（还没接） |
| 浓度值 | `nutrientTargetValue` | `nutrientTargetValue` ✅ | **无** |
| 多营养素 | `supplementTargets` | `supplementTargets` ✅ | **无** |

✅ **这两个页面是一致的** —— 这是唯一一处没打架的地方。
🔴 但**交付第 1 页完全没有接** —— 我在原型里画的「额外补充的营养素」在代码里还不存在。

### 3.4 食谱基本信息

| 概念 | 食谱详情页 | DIY 配置页 | 交付第 1 页 |
|---|---|---|---|
| 食谱名 | `recipe.name` | `recipe.name` ✅ | `content.recipe.name` |
| **封面图** | `coverImageUrl` | `recipe.coverImageUrl` | **无** |
| **卖点** | `sellingPoint` | `recipe.sellingPoint` | **无**（要合成 `oneLineSummary`） |
| 营养标准说明 | `nutritionStandardExplain` | `nutritionStandardExplain` ✅ | `content.nutrition.standard` |

⚠️ **`coverImageUrl` vs `recipe.coverImageUrl`** —— 一个平铺、一个嵌套。

### 3.5 喂食参数

| 概念 | DIY 配置页 | 交付第 1 页 | 交付第 2 页 |
|---|---|---|---|
| 每天多少 | ？ | `feeding.dailyIntakeG` | （应该在这页） |
| 每天几餐 | ？ | `feeding.mealsPerDay` | （应该在这页） |
| 每餐多少 | ？ | `feeding.perMealG` | （应该在这页） |
| 备餐天数 | `packageSpecG` 等 | `feeding.cycleDays` | （应该在这页） |

⚠️ **DIY 用"分装规格"（每袋多少克、几袋）来表达"做多少"**，
交付用"做几天"来表达 —— **这是两套不同的表达方式**，不是简单改名。

---

## 四、真正的差异（不该硬合并）

> 这些是**业务上就该不同**的，不是命名问题。

| 概念 | 交付 | DIY | 结论 |
|---|---|---|---|
| **采购量** | ❌ 不给（老板定的） | ✅ 给 | 保留差异，用参数控制 |
| **分装规格** | ❌ 不需要 | ✅ 每袋/袋数/多个规格 | 交付不做 |
| **能不能改配比** | ❌ 不能（营养师背书） | ✅ 能 | 权限不同，不该合 |
| **能不能改饭量** | ✅ 能 | ❌（在配置页改） | 保留差异 |
| **评价 / 收藏 / 分享** | ❌ | ❌ | 只有详情页有（965 行脚本的大头） |
| **商业参考价** | ❌ | ❌ | 只有详情页有 |

---

## 五、建议的统一字段清单

> 原则：**一个概念只留一个名字**；数值的**单位/精度写进名字里**，避免 0.4 和 40 混用。

### 5.1 食谱

| 建议字段 | 类型 | 说明 | 替换掉 |
|---|---|---|---|
| `recipe.id` | string | | |
| `recipe.name` | string | 食谱名 | 三个页面的 `name` |
| `recipe.coverUrl` | string? | 封面图 | `coverImageUrl` / `recipe.coverImageUrl` |
| `recipe.oneLineSummary` | string? | **卖点 + 一句话结论合成的整句** | `sellingPoint` + `plainConclusion` |
| `recipe.nutritionStandardText` | string | "符合 FEDIAF 2018" | `nutritionStandardExplain` / `nutrition.standard` |

### 5.2 食材 / 营养素（一个数组，用 `kind` 区分）

| 建议字段 | 类型 | 说明 |
|---|---|---|
| `items[].kind` | `FOOD` 或 `SUPPLEMENT` | **用它替代现在的 `isSupplement` / `ingredientType` 两套判断** |
| `items[].name` | string | |
| `items[].preparationMethod` | string? | 制备方法（统一这个名字） |
| `items[].ratioPercent` | number | **占比，0–100 的百分数**（统一用百分数，避免 0.4/40 混用） |
| `items[].sortOrder` | number | |
| `items[].nutritionStateLabel` | string? | "生"/"熟"这类标签 |
| `items[].nutrientCode` | string? | 仅 SUPPLEMENT：营养素字典码（如 `calcium`） |
| `items[].nutrientLabel` | string? | 仅 SUPPLEMENT：营养素中文名（**取字典，不许自己编**） |
| `items[].amountPerKgFoodG` | number? | 仅 SUPPLEMENT：每 kg 食材加多少克 |

### 5.3 用量（后端算好，前端不算）

| 建议字段 | 类型 | 说明 | 替换掉 |
|---|---|---|---|
| `usage[].name` | string | 食材名 | |
| `usage[].netAmountG` | number | **净用量（克）** | `amount` / `theoreticalAmount` / `netAmount` / `netG` |
| `usage[].purchaseAmountG` | number? | 采购量（仅 DIY 场景给） | `actualAmount` / `purchaseG` |
| `usageTotal.netAmountG` | number | 合计净重 | `totalFoodNetWeightG` / `totalNetG` |
| `usageTotal.purchaseAmountG` | number? | 合计采购重 | `totalPurchaseG` |

### 5.4 喂食参数

| 建议字段 | 类型 | 说明 |
|---|---|---|
| `feeding.dailyAmountG` | number | 每天多少克（**统一叫 dailyAmountG，不再叫 dailyIntakeG**） |
| `feeding.mealsPerDay` | number | 每天几餐 |
| `feeding.perMealAmountG` | number | 每餐多少克（**后端算好，前端不做除法**） |
| `feeding.cycleDays` | number | 做几天 |
| `feeding.referenceValues` | object | **营养师给的原始值**（顾客改过之后仍能查回来） |

> `perMealAmountG` 现在是由「每天 ÷ 餐数」得来的 —— **这个除法也不该在前端做**。

### 5.5 金额（跟用量彻底分开）

| 建议字段 | 类型 | 说明 |
|---|---|---|
| `price.referenceAmountPer100g` | number? | 参考价（**`amount` 这个词只用来表示钱，且必须带 `price` 前缀**） |

---

## 六、改完之后，"改一个字段要改几处"

| 场景 | 现在 | 之后 |
|---|---|---|
| 改"净用量"的名字 | **3 个页面**（还有 DIY 内部 2 个名字） | **1 处**（后端 DTO） |
| 改"占比"的单位 | 2 处（`ratio` / `ratioPercent`），且容易差 100 倍 | 1 处 |
| 改"制备方法"的名字 | 2 处 | 1 处 |
| 加一个营养素 | 2 处（详情页 + 制作单），交付页还得另加 | 1 处 |
| 改"卖点"文案逻辑 | 3 处（详情页/DIY/交付，且交付要拼两段） | 1 处 |

---

## 七、发现的两个额外问题

### 1. `diy-sheet` 在前端算采购量

```js
// diy-sheet/index.vue:1975
const actualAmount = theoreticalAmount * (1 + lossRate)
```

这违反"所有计算交给后端"。而且**损耗率取的是"全局配置"** ——
意味着所有食材共用一个损耗率，这跟老板定的"不同食材损耗差很多"是矛盾的。

### 2. 交付第 1 页缺三样东西

- `coverUrl`（封面）
- `oneLineSummary`（卖点）
- `items[].nutrientCode / amountPerKgFoodG`（营养素）

这三样要等后端在交付快照里补上，前端才能画。

---

## 八、下一步

| 步 | 做什么 | 产出 | 改代码吗 |
|---|---|---|---|
| **1（本表）** | 字段对照 | 本文 | ❌ |
| **2** | **老板确认统一字段清单**（第五节） | 确认版 | ❌ |
| **3** | 后端定义统一 DTO，按新字段出数 | 接口文档 | 前后端都要动 |
| **4** | 前端抽共享组件（封面/食材表/营养素表/步骤/储存） | 组件 | ✅ |
| **5** | 把 DIY 的前端计算搬到后端 | — | ✅ |
| **6** | 页面变薄 → 再谈合并 | — | ✅ |

**第 2 步只需要你点头或改意见，不动代码。**
