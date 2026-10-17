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

## 五、老板四问（2026-10-17）—— 其中三问推翻了我的建议

> 老板追问的四个问题，查完代码后 **有三个我原来写错了**。
> 这一节把错在哪、正确是什么，逐条记清楚。

### 问 1：`items[].kind` 怎么判断食材还是补剂？之前怎么判断的？

**之前就有判断，而且比我想的更细。**

数据库 `Ingredient.type` 是枚举 `IngredientType`，**有三个值**：

```
FOOD | SUPPLEMENT | PACKAGING
```

后端交付接口把它压成了**布尔**：

```js
// custom-recipe-delivery.service.ts:413
isSupplement: item.ingredient?.type === 'SUPPLEMENT'
```

**问题：布尔只有两种状态，`PACKAGING`（包材）被归进了"非补剂"，也就是"食材"。**

🔴 **这是个真 bug**：如果食谱里含包材，交付页会把它当食材列出来。
（食谱详情页是对的 —— 它有单独的「其他物料」区块。）

**所以 `kind` 不是"新的判断方式"，而是"把枚举原样传下去，不压缩成布尔"**：

| 现在 | 改后 |
|---|---|
| `isSupplement: true/false` | `kind` 取 `FOOD` / `SUPPLEMENT` / `PACKAGING` 三值之一 |
| 两个状态，包材丢失 | **三个状态，跟数据库一致** |

### 问 2：`usage[].name` 和 `items[].name` 有什么区别？

**没有区别 —— 这是我设计冗余了。**

`usage` 本来就是"每个食材用了多少"，它是 `items` 的**派生数据**。
再带一份 `name`，等于把名字存两遍 —— **正是老板担心的"改一个忘一个"**。

**修正**：

| 原来（错） | 改成 |
|---|---|
| `usage[].name` + `usage[].netAmountG` | **`usage[].ingredientId` + `usage[].netAmountG`** |

名字从 `items` 里按 `ingredientId` 取，**不重复存**。

### 问 3：喂食参数为什么定全新字段？之前没有吗？

**有，而且已经是一个能用的接口了。** 这是我最该查到却没查的一条。

后端已有：

```
POST /dogs/:id/calc-for-recipe   →  按食谱能量密度算饭量
```

返回：

```js
// backend/src/application/dog/dog.service.ts:802-811
{
  dailyIntakeG: number,      // 每天多少克
  perMealIntakeG: number,    // 每餐多少克（后端已算好）
  mealsPerDay: number,       // 每天几餐
}
```

**`dailyIntakeG` 还是成品订购的规范字段**（`order.service.ts` 里就在用）。

🔴 我上一版提的 `feeding.dailyAmountG` / `feeding.perMealAmountG` **是给已有字段改名** ——
第二次犯同一个错。

🔴 我上一版还说"`perMealG` 是前端除法算的" —— **也不对，后端算好的**。

**修正**：直接用现有名字。

| 原来（错） | 改成（已存在） |
|---|---|
| `feeding.dailyAmountG` | **`dailyIntakeG`** |
| `feeding.perMealAmountG` | **`perMealIntakeG`** |
| `feeding.mealsPerDay` | `mealsPerDay` ✅（这个本来就对） |
| `feeding.cycleDays` | `cycleDays`（交付页已在用） |

**只有一个是真的要新增**：`referenceValues`（营养师给的原始值，顾客改过之后还能查回来）。

### 问 4：金额为什么按每 100g 命名？

**因为我把"展示口径"写进了字段名 —— 不应该。**

后端已有的价格字段是**按采购单位**的：

```
referencePricePerPurchaseUnit    // 参考价 / 采购单位
```

而「每 100g」是**前端展示时换算出来的**：

```js
// recipe-detail/index.vue:757-762
if (entry && Number.isFinite(entry.pricePer100g)) {
  return { amount: entry.pricePer100g, isMin: false }
}
if (Number.isFinite(data.minPricePer100g)) { ... }
```

**所以**：

| 原来（错） | 改成 |
|---|---|
| `price.referenceAmountPer100g` | 后端用 **`referencePricePerPurchaseUnit`**（已有）<br />前端展示要 100g 就本地换算，**不给它单独起一个后端字段** |

> 换个说法：**字段名描述"数据是什么"，不描述"屏幕上怎么显示"。**
> 「每 100g」是显示逻辑，改个文案就可能变成「每 kg」。

---

## 六、最终字段清单（**已按四问修正**）

> 原则：**能用已有的就用已有的**；新增的必须带单位、且不重复存已有信息。

### 6.1 食谱

| 字段 | 状态 | 说明 |
|---|---|---|
| `name` | ✅ 已有 | |
| `coverImageUrl` | ✅ 已有 | 统一平铺，不用 `recipe.coverImageUrl` |
| `nutritionStandardExplain` | ✅ 已有 | |
| **`oneLineSummary`** | 🆕 **新增** | 卖点 + 一句话结论合成的整句，取代 `sellingPoint` + `plainConclusion` |

### 6.2 食材 / 营养素（全部用已有名，只有 kind 是新的）

| 字段 | 状态 | 说明 |
|---|---|---|
| **`items[].kind`** | 🆕 **新增** | `FOOD` / `SUPPLEMENT` / **`PACKAGING`**（三值，跟数据库枚举一致）<br />取代丢失包材的布尔 `isSupplement` |
| `items[].name` | ✅ 已有 | |
| `items[].preparationMethod` | ✅ 已有 | ⚠️ 交付接口现在叫 `preparation`，要改回来 |
| `items[].ratioPercent` | ✅ 已有 | ⚠️ 详情页现在叫 `ratio`，要改 |
| `items[].sortOrder` | ✅ 已有 | |
| `items[].nutritionStateLabel` | ✅ 已有 | |
| `items[].nutrientTargetKey` | ✅ 已有 | 营养素字典码 |
| `items[].nutrientTargetValue` | ✅ 已有 | 每 kg 食材加多少 |

### 6.3 用量（新增一组，但**不重复存名字**）

| 字段 | 状态 | 说明 |
|---|---|---|
| **`usage[].ingredientId`** | 🆕 | **关联到 `items`，不再单独存 name** |
| **`usage[].netAmountG`** | 🆕 | **净用量（克）** —— 唯一要展示的量 |
| `usageTotal.netAmountG` | 🆕 | 合计净重 |
| ~~`purchaseAmountG`~~ | ❌ **不建** | 老板 2026-10-17：采购量整条删掉 |

### 6.4 喂食参数（**全部用已有名，只新增一个**）

| 字段 | 状态 | 说明 |
|---|---|---|
| `dailyIntakeG` | ✅ 已有 | 每天多少克（`calc-for-recipe` 就返回这个） |
| `mealsPerDay` | ✅ 已有 | 每天几餐 |
| `perMealIntakeG` | ✅ 已有 | 每餐多少克 —— **后端算好，前端不做除法** |
| `cycleDays` | ✅ 已有 | 做几天（交付页在用） |
| **`referenceValues`** | 🆕 **新增** | 营养师给的原始值（顾客改过后仍能查回来） |

### 6.5 金额（**不按展示单位命名**）

| 字段 | 状态 | 说明 |
|---|---|---|
| `referencePricePerPurchaseUnit` | ✅ 已有 | 参考价 / 采购单位 |
| ~~`referenceAmountPer100g`~~ | ❌ **不建** | 「每 100g」是前端展示换算，不是后端字段 |

## 七、改动清单：只改 5 处 + 3 个新增

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

## 八、"改一个字段要改几处"

| 场景 | 现在 | 之后 |
|---|---|---|
| 改"净用量"名字 | 3 个页面（制作单内部还有 2 个名） | **1 处（后端契约）** |
| 改"占比"单位 | 2 处，且容易差 100 倍 | **1 处（数据库）** |
| 改"制备方法"名 | 3 处（BFF 还改过名） | **1 处（数据库）** |
| 加一个营养素 | 详情页 + 制作单（交付还得另加） | **1 处** |
| 改"卖点"文案逻辑 | 3 处（交付要拼两段） | **1 处** |
| 改"损耗率" | 4 处计算 + 全局配置 | **0 处（整条删掉）** |

---

## 九、顺带发现

### 1. 交付接口 BFF 在改名字

```js
// custom-recipe-delivery.service.ts:408
preparation: item.preparationMethod ?? null    // 数据库叫 preparationMethod，这里改叫 preparation
```

**BFF 应该透传，而不是改名。** 改名会让"同一件事两个名字"从这一层开始扩散。

### 2. 交付第 1 页缺 3 样

`coverImageUrl`（封面）、`oneLineSummary`（卖点）、`nutrientTarget*`（营养素浓度）—— 代码里都还没有。

---

## 十、下一步

| 步 | 做什么 | 改代码吗 |
|---|---|---|
| **1** | 字段对照表 ✅ **本文** | ❌ |
| **2** | **老板确认第五节字段清单 + 第三节"删采购量"** | ❌ |
| 3 | 同步到需求文档（2.4 节），并把"不给采购量"扩展到 DIY | ❌ |
| 4 | 后端按新契约出数 | ✅ |
| 5 | 前端改那 5 处 + 抽共享组件 | ✅ |
| 6 | 页面变薄 → 再谈合并 | ✅ |
