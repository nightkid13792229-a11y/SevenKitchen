# 食谱相关页面 · 字段对照表（2026-10-17 · 第二版）

> **这份表解决一个问题：同一件事，我们到底有几个叫法。**
>
> 老板担心"重复字段，改一个忘一个"。
> **这份表把担心变成看得见的清单，并且回答了一个关键问题：规范名其实早就有了。**
>
> ⚠️ 只读代码 + 写文档，**没有改任何代码**。

---

## 一、先定基准：谁的名字算数

老板 2026-10-17 追问：
> "需要注意字段的命名是有统一规范的。"
> "是否需要看一下整个后端里面有没有已经存在的字段？免得又建一套新的字段。"
> "我们在优化字段的时候，是否也要看一眼 Web 前端的命名方式呢？"

**查完的结论：规范名早就存在，而且数据库与 Web 后台是一致的。**
**是小程序个别页面和交付接口那层自己起了别名。**

### 命名规范（`docs/DATABASE_NAMING_CONVENTIONS.md`）

| 层 | 写法 |
|---|---|
| Prisma / 接口 | **驼峰** `preparationMethod` |
| 数据库实际存储 | **蛇形** `preparation_method` |
| **单位** | **写进名字里**（`weightKg` / `ageMonths` / `dailyAmountG`） |

### 谁是一致的（基准）

| 层 | 制备方法 | 占比 |
|---|---|---|
| **数据库** `RecipeItem` 模型 | `preparationMethod` ✅ | `ratioPercent` ✅ |
| **Web 后台** `RecipeDesigner` | `preparationMethod` ✅ | `ratioPercent` ✅ |
| 交付接口（BFF） | **`preparation`** ❌ 改过名 | `ratioPercent` ✅ |
| 小程序·食谱详情页 | `preparationMethod` ✅ | **`ratio`** ❌ |
| 小程序·DIY 制作单 | `preparationMethod` ✅ | — |

**所以基准是「数据库 + Web 后台」，要改的是小程序和 BFF 那几处别名。**
**不是重新发明一套。**

> 我上一版草稿里提了 `netAmountG` 这类**新名字** —— 这正犯了老板提醒的错。
> 第二版已改为**优先用已有字段**，只有确实不存在时才新增。

---

## 二、★ 最危险：同一个名字，两个意思

> 这类比重复更糟 —— **它不会报错，只会算错**。

| 字段名 | A 处是什么意思 | B 处是什么意思 | 风险 |
|---|---|---|---|
| **`amount`** | `recipe-detail:359` —— **金额**（`displayReferencePrice.amount`） | `diy-sheet:1975` —— **用量**（克） | 🔴 一个是钱一个是重量 |
| **`ratio` / `ratioPercent`** | `recipe-detail`：`0.4`（小数） | 数据库/后台/交付：`40`（百分数） | 🔴 **差 100 倍** |
| **`netAmount` / `theoreticalAmount`** | `diy-sheet:815` —— `netAmountStr: formatNetAmount(totalTheoretical)` | 同一个页面另一个名字 | 🟠 同一个值两个名 |

**证据（原文，已核对）：**

```js
// recipe-detail/index.vue:359 —— amount 是钱
约¥{{ formatReferencePrice(displayReferencePrice.amount) }}/100g

// diy-sheet/index.vue:1975 —— amount 是量
const actualAmount = theoreticalAmount * (1 + lossRate)

// diy-sheet/index.vue:815 —— 同一个值，两个名字
netAmountStr: formatNetAmount(totalTheoretical, true)
```

---

## 三、老板的新决定：采购量**整条删掉**

> 老板 2026-10-17："不管是定制食谱的交付页，还是 DIY 的制作页，
> 我们都不再展示采购量，统一只展示净用量。"

**这不是"隐藏"，是删除。** 影响比想象的大：

| 删掉什么 | 连带删掉 |
|---|---|
| 采购量字段（`purchaseG` / `actualAmount` / `purchaseAmount`） | — |
| — | **损耗率计算**（`theoreticalAmount * (1 + lossRate)`） |
| — | **全局补剂损耗率**（`globalSupplementLossRate`） |
| — | **"建议采购合计"**、**"已按 7% 损耗留出余量"** 这类文案 |

**收益**：`diy-sheet` 里那套"前端算采购量"的逻辑**整块消失** ——
不需要"搬到后端"，直接不用了。这是本轮最干净的一刀。

---

## 四、重复：同一个东西，几种叫法

### 4.1 食材用量

| 概念 | 食谱详情页 | DIY 制作单 | 交付第 2 页 | **规范名** |
|---|---|---|---|---|
| **净用量** | `amount` ❌ | `theoreticalAmount` / `netAmount` ❌ | `netG` ❌ | **需新增**（见 5.3） |
| ~~采购量~~ | — | ~~`actualAmount`~~ | ~~`purchaseG`~~ | **❌ 删掉** |
| 合计净重 | — | `totalFoodNetWeightG` | `totalNetG` | **需新增** |

**"净用量"这个词，三个页面三个名字，制作单内部还有两个。**

> ⚠️ 数据库 `RecipeItem` 里**没有**"用量"字段 —— 因为用量是**算出来的**（占比 × 总重）。
> 所以"净用量"确实要新增字段，但**它属于交付快照 / 渲染契约，不是 `RecipeItem` 表**。

### 4.2 食材属性（这几项规范名已存在）

| 概念 | 食谱详情页 | 交付接口 | **规范名（已存在）** |
|---|---|---|---|
| 制备方法 | `preparationMethod` ✅ | **`preparation`** ❌ | **`preparationMethod`** |
| 占比 | **`ratio`**（0.4）❌ | `ratioPercent` ✅ | **`ratioPercent`**（0–100） |
| 营养状态标签 | `nutritionStateLabel` ✅ | — | `nutritionStateLabel` |
| 排序 | `sortOrder` ✅ | — | `sortOrder` |

**要改的只有 2 处**：详情页的 `ratio` → `ratioPercent`；交付接口的 `preparation` → `preparationMethod`。

### 4.3 补剂 / 营养素（这块本来就是对的）

| 概念 | 食谱详情页 | DIY 制作单 | 数据库 `RecipeItem` |
|---|---|---|---|
| 营养素标识 | `nutrientTargetKey` | `nutrientTargetKey` | `nutrientTargetKey` ✅ |
| 浓度值 | `nutrientTargetValue` | `nutrientTargetValue` | `nutrientTargetValue` ✅ |
| 多营养素 | `supplementTargets` | `supplementTargets` | `supplementTargets` ✅ |

✅ **三个地方完全一致 —— 这是整份对照表里唯一没打架的一块。**

🔴 但**交付第 1 页完全没接这些** —— 我在原型里画的「额外补充的营养素」在代码里还不存在。

### 4.4 食谱基本信息

| 概念 | 食谱详情页 | DIY 配置页 | 交付第 1 页 | **规范名** |
|---|---|---|---|---|
| 食谱名 | `recipe.name` | `recipe.name` | `content.recipe.name` | `name` ✅ |
| 封面图 | `coverImageUrl` | `recipe.coverImageUrl` | **无** | **`coverImageUrl`**（统一平铺） |
| 卖点 | `sellingPoint` | `recipe.sellingPoint` | **无** | **`oneLineSummary`**（合成，需新增） |
| 营养标准 | `nutritionStandardExplain` | `nutritionStandardExplain` | `nutrition.standard` | **`nutritionStandardExplain`** |

### 4.5 喂食参数

| 概念 | 交付第 1 页 | 数据库/其它 |
|---|---|---|
| 每天多少 | `dailyIntakeG` | 无 |
| 每天几餐 | `mealsPerDay` | `dog.mealsPerDay` ✅ |
| 每餐多少 | `perMealG` | 无（前端算） |
| 做几天 | `cycleDays` | 无 |

> 这组没有历史包袱（只有交付页在用），可以直接按规范定。
> **`perMealG` 现在是"每天 ÷ 餐数"，这个除法也不该在前端做。**

---

## 五、最终字段清单

> 原则：**能用已有的就用已有的**；新增的必须带单位。

### 5.1 食谱（新增 1 个）

| 字段 | 状态 | 说明 |
|---|---|---|
| `name` | ✅ 已有 | |
| `coverImageUrl` | ✅ 已有 | 统一平铺，不用 `recipe.coverImageUrl` |
| `nutritionStandardExplain` | ✅ 已有 | |
| **`oneLineSummary`** | 🆕 **新增** | 卖点 + 一句话结论合成的整句，取代 `sellingPoint` + `plainConclusion` |

### 5.2 食材 / 营养素（全部用已有名）

| 字段 | 状态 | 说明 |
|---|---|---|
| `items[].kind` | 🆕 新增 | `FOOD` / `SUPPLEMENT`，取代 `isSupplement` + `ingredientType` 两套判断 |
| `items[].name` | ✅ 已有 | |
| `items[].preparationMethod` | ✅ 已有 | ⚠️ 交付接口现在叫 `preparation`，要改回来 |
| `items[].ratioPercent` | ✅ 已有 | ⚠️ 详情页现在叫 `ratio`，要改 |
| `items[].sortOrder` | ✅ 已有 | |
| `items[].nutritionStateLabel` | ✅ 已有 | |
| `items[].nutrientTargetKey` | ✅ 已有 | 营养素字典码 |
| `items[].nutrientTargetValue` | ✅ 已有 | 每 kg 食材加多少 |

### 5.3 用量（新增，放渲染契约不放 `RecipeItem` 表）

| 字段 | 状态 | 说明 |
|---|---|---|
| `usage[].name` | 🆕 | 食材名 |
| **`usage[].netAmountG`** | 🆕 | **净用量（克）** —— 唯一要展示的量 |
| `usageTotal.netAmountG` | 🆕 | 合计净重 |
| ~~`purchaseAmountG`~~ | ❌ **不建** | 老板 2026-10-17：采购量整条删掉 |

> 只有"净用量"这一个量。**没有采购量、没有损耗率、没有合计采购重。**

### 5.4 喂食参数（全新，按规范定）

| 字段 | 说明 |
|---|---|
| `feeding.dailyAmountG` | 每天多少克（统一叫这个，不要 `dailyIntakeG`） |
| `feeding.mealsPerDay` | 每天几餐 |
| **`feeding.perMealAmountG`** | 每餐多少克 —— **后端算好**，前端不做除法 |
| `feeding.cycleDays` | 做几天 |
| `feeding.referenceValues` | **营养师给的原始值**（顾客改过之后仍能查回来） |

### 5.5 金额（跟用量彻底分开）

| 字段 | 说明 |
|---|---|
| `price.referenceAmountPer100g` | 参考价。**`amount` 这个词只表示钱，且必须带 `price.` 前缀** |

---

## 六、改动清单：只改 5 处 + 3 个新增

> 不是"重构三个页面"，是**改 5 个地方**。这是这份表最有价值的结论。

| # | 改什么 | 在哪 | 影响 |
|---|---|---|---|
| 1 | `ratio` → `ratioPercent` | 详情页 | 1 个文件 |
| 2 | `preparation` → `preparationMethod` | 交付接口 BFF | 1 个文件 |
| 3 | `netG` → `netAmountG` | 交付第 2 页 | 1 个文件 |
| 4 | `theoreticalAmount` / `netAmount` → `netAmountG` | DIY 制作单 | 1 个文件 |
| 5 | **删掉采购量整条线** | DIY 制作单 + 交付第 2 页 | 2 个文件（**净减少代码**） |

**3 个新增**：`oneLineSummary`、`items[].kind`、`feeding.*`（全新一组）。

---

## 七、"改一个字段要改几处"

| 场景 | 现在 | 之后 |
|---|---|---|
| 改"净用量"名字 | 3 个页面（制作单内部还有 2 个名） | **1 处（后端契约）** |
| 改"占比"单位 | 2 处，且容易差 100 倍 | **1 处（数据库）** |
| 改"制备方法"名 | 3 处（BFF 还改过名） | **1 处（数据库）** |
| 加一个营养素 | 详情页 + 制作单（交付还得另加） | **1 处** |
| 改"卖点"文案逻辑 | 3 处（交付要拼两段） | **1 处** |
| 改"损耗率" | 4 处计算 + 全局配置 | **0 处（整条删掉）** |

---

## 八、顺带发现

### 1. 交付接口 BFF 在改名字

```js
// custom-recipe-delivery.service.ts:408
preparation: item.preparationMethod ?? null    // 数据库叫 preparationMethod，这里改叫 preparation
```

**BFF 应该透传，而不是改名。** 改名会让"同一件事两个名字"从这一层开始扩散。

### 2. 交付第 1 页缺 3 样

`coverImageUrl`（封面）、`oneLineSummary`（卖点）、`nutrientTarget*`（营养素浓度）—— 代码里都还没有。

---

## 九、下一步

| 步 | 做什么 | 改代码吗 |
|---|---|---|
| **1** | 字段对照表 ✅ **本文** | ❌ |
| **2** | **老板确认第五节字段清单 + 第三节"删采购量"** | ❌ |
| 3 | 同步到需求文档（2.4 节），并把"不给采购量"扩展到 DIY | ❌ |
| 4 | 后端按新契约出数 | ✅ |
| 5 | 前端改那 5 处 + 抽共享组件 | ✅ |
| 6 | 页面变薄 → 再谈合并 | ✅ |
