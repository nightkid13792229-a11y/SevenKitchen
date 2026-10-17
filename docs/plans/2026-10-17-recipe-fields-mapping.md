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

### 问 1：`ingredientType` 怎么判断食材还是补剂？之前怎么判断的？

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

**所以不是要造新字段 —— `ingredientType` 这个名字代码里早就有**（`recipe-designer.service.ts:7026` 在返回、详情页在用）。
缺的只是**交付快照里没带它**。要做的两件事：① 用原料那边的名字 `ingredientType`；② 把值复制进快照。

| 现在 | 改后 |
|---|---|
| `isSupplement: true/false` | `ingredientType` 取 `FOOD` / `SUPPLEMENT` / `PACKAGING` 三值之一 |
| 两个状态，包材丢失 | **三个状态，跟数据库一致** |

### 问 2：`usage[].name` 和 `items[].name` 有什么区别？

**没有区别 —— 这是我设计冗余了。**

`usage` 本来就是"每个食材用了多少"，它是 `items` 的**派生数据**。
再带一份 `name`，等于把名字存两遍 —— **正是老板担心的"改一个忘一个"**。

**修正（一开始想用 `ingredientId` 关联，但又错了 —— 见 6.3）**：

| 原来（错） | 改成 |
|---|---|
| 另开 `usage[]` 数组存 name + netAmountG | **不另开数组，直接在 `items[].netAmountG`** |

`items` 本来就是这份交付的原料清单，用量是它自己的属性，
挂在同一条记录上就没有"两份名字"的问题了。

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

**而且一个都不用新增** —— 连我原以为要加的 `referenceValues` 也不需要（见 6.4 的追问）。

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

### 6.2 食材 / 营养素（**全部用已有名，一个都不新造**）

| 字段 | 状态 | 说明 |
|---|---|---|
| **`items[].ingredientType`** | ✅ **已有名字，需补进快照** | `FOOD` / `SUPPLEMENT` / **`PACKAGING`**（三值，跟数据库 `Ingredient.type` 一致）<br />取代丢失包材的布尔 `isSupplement` |
| `items[].name` | ✅ 已有 | |
| `items[].preparationMethod` | ✅ 已有 | ⚠️ 交付接口现在叫 `preparation`，要改回来 |
| `items[].ratioPercent` | ✅ 已有 | ⚠️ 详情页现在叫 `ratio`，要改 |
| `items[].sortOrder` | ✅ 已有 | |
| `items[].nutritionStateLabel` | ✅ 已有 | |
| `items[].nutrientTargetKey` | ✅ 已有 | 营养素字典码 |
| `items[].nutrientTargetValue` | ✅ 已有 | 每 kg 食材加多少 |

### 6.3 用量（**不另开数组，直接挂在 `items` 上**）

**老板 2026-10-17 追问后修正**：

> "原料的分类字段不能直接去调用原料的分类字段吗？为什么还要用枚举呢？"
> "原料在后端不是已经被分成了食材、补充剂和包材三类吗？"

查下来：`SnapshotRecipeItem` 里**没有 `ingredientId`** ——
它是纯冻结副本（只有 name / preparation / ratioPercent / weightG 这些**值**）。

所以：

| 原来（错） | 改成 | 为什么 |
|---|---|---|
| 新开一个 `usage[]` 数组，用 `ingredientId` 关联 | **直接在 `items[].netAmountG`** | 快照里没有 id、**也不该有** —— 有了 id 就会有人去查活数据，快照就不冻结了 |

| 字段 | 状态 | 说明 |
|---|---|---|
| **`items[].netAmountG`** | 🆕 | **净用量（克）** —— 唯一要展示的量 |
| `usageTotal.netAmountG` | 🆕 | 合计净重 |
| ~~`usage[].ingredientId`~~ | ❌ **不建** | 快照里没有 id |
| ~~`purchaseAmountG`~~ | ❌ **不建** | 老板 2026-10-17：采购量整条删掉 |

### 6.4 喂食参数（**全部用已有名，一个都不新增**）

| 字段 | 状态 | 说明 |
|---|---|---|
| `dailyIntakeG` | ✅ 已有 | 每天多少克（`calc-for-recipe` 就返回这个） |
| `mealsPerDay` | ✅ 已有 | 每天几餐 |
| `perMealIntakeG` | ✅ 已有 | 每餐多少克 —— **后端算好，前端不做除法** |
| `cycleDays` | ✅ 已有 | 做几天（交付页在用） |
| ~~`referenceValues`~~ | ❌ **删除**（老板 2026-10-17） | 见下 |

#### 为什么 `referenceValues` 也不需要（老板 2026-10-17 追问）

> 老板："因为后端有一套完整的狗狗的热量计算方式。热量如果也能计算出来，
> 再加上食谱本身也有热量密度的字段和值，那饭量不是就可以直接算出来了吗？
> 还需要营养师手动的去录入或者计算这个值吗？"

**不需要。他说的完全成立。** 查证如下：

**交付页现在的算法**（`custom-recipe-delivery.service.ts:535-546`）：

```js
dailyIntakeG = dog.cachedTargetFoodKcal / 食谱能量密度
perMealG     = dailyIntakeG / mealsPerDay
```

**两个输入都已经有了：**

| 输入 | 存在哪 | 怎么来的 |
|---|---|---|
| 目标热量 `cachedTargetFoodKcal` | 狗狗档案（缓存字段） | 由体重、**体况评分**、活动量、生命阶段、绝育、零食、**进行中的减重计划**算出 |
| 食谱能量密度 `energyDensityKcalPerKg` | 食谱记录 | 营养师录食谱时就有 |

**所以饭量是纯计算结果，营养师不用手填。**

**连"原始值"也不用存** —— 因为它**随时可以重新算出来**：

| 想显示什么 | 怎么拿 |
|---|---|
| "参考值 320 克/天" | 用当前档案再调一次计算，**不需要存快照** |
| 顾客改成了 280 | 记在 `dailyIntakeGOverride`（或类似）即可 |

> 而且"实时算"比"存快照"更好：**狗胖了，参考值本来就该跟着变**。
> 存了快照反而会给出一个过期的建议。

**⚠️ 唯一的前提**：`cachedTargetFoodKcal` 必须跟着狗的数据更新。
查了，已经有这个机制（`dog.service.ts:485`
"Recalculates cachedTargetFoodKcal if relevant fields changed"）。

**⚠️ 但有一个产品问题要定**：如果营养师觉得算出来的量不合适，**他有没有权力改？**

现在**没有入口**。两种做法：

| 方案 | 做法 | 结果 |
|---|---|---|
| **A（推荐）** | 不改交付值；营养师要调，就去**改档案里的目标热量** | 只有一个事实来源 |
| B | 给营养师一个"覆盖"字段 | 又多一个"两个值谁算数"的问题 |

> 推荐 A 的理由：如果允许在交付时覆盖，那"这单的饭量"和"档案的饭量"
> 就会不一样，下次重新交付又按档案算 —— **顾客会发现数字跳来跳去**。

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

**真正新增的只有 2 个**：`oneLineSummary`、`items[].netAmountG`。
`ingredientType` 是**已有名字**（详情页与食谱接口都在用），只是快照里缺、要补。
喂食参数**一个都不新增**，全部沿用已有字段。

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
