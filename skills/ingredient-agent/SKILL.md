---
name: ingredient-agent
description: Use when the "AI 添加原料" agent runs in SevenKitchen admin — it explains how to chain the atomic ingredient-creation tools (searchNames / searchLocalLibraries / summarizeByKeyword / getRecord / writeNutrition / writeIngredient / runCheck / askUser / finish) and when to ask the user instead of guessing.
---

# AI 添加原料 · 对话式作业指引

## Purpose

这份 skill 是「AI 添加原料」Agent 的作业手册。工具只提供**原子能力**，
不替你做流程判断；先查什么、什么时候汇总、什么时候问人、先写哪份档案，
都由你按这份指引自己决定。

目标：把一份**草稿**填到人可以审核的程度——原料卡 + 生 / 熟营养档案 + 终检结果。
正式原料、正式营养档案、提交、确认可用都不在你的权限内。

## 工具（只有这 9 个）

| 工具 | 能力 | 不会做什么 |
| --- | --- | --- |
| `searchNames(keyword, limit=3000)` | 按关键词列出本地库真实命中的词条名：`total / keywords / names[{id,name,sourceType}]` | 不判断生熟 / 做法 / 部位，不返回营养值，不替你收窄 |
| `searchLocalLibraries(terms[])` | 按 5 个语种分组原样检索全部 7 个本地库（CFCT / TFDA / USDA / CNF / NZFCD / MEXT / KO_RDA），每组返回所有命中，不去重、不排序、不限量 | 不合并同名、不判断哪些命中是同一个食物 |
| `summarizeByKeyword(keyword, groupHint?)` | 服务端按关键词取全量名字（≤3000）并做一次 AI 汇总：`total / byState / byMethod / byCutGroup / examples / irrelevantExamples / keywords` | 不接收名字清单、不返回名字清单，不逐条判断，不写草稿 |
| `getRecord(id)` | 读某条来源记录里真实存在的营养值与生熟状态 | 不推算、不补 0 |
| `writeNutrition(profileIndex?, entries[])` | 把营养值写进草稿的某份档案 | 没有 `sourceRecordId` 的值一律不写 |
| `writeIngredient(fields)` | 改草稿里的原料卡字段 | 不覆盖人工审核改过的字段 |
| `runCheck()` | 跑服务端终检，返回拦死 / 可例外 / 提醒 | 不写库 |
| `askUser(question, options)` | 向用户提问并结束本轮 | 不再检查「有没有先收窄」 |
| `finish(summary?)` | 结束本轮，给出结论 | 不写库 |

`summarizeByKeyword` 的请求由服务端自己拼：服务端按 `keyword` 取全量名字，
把名字放进**模型输入**，模型只回汇总数字。你**不要把名字列表抄进工具参数**
（线上把 1,600 条名字抄进参数，JSON 被截断，统计只覆盖了几十条）。
同一 `keyword` + 同一批名字 24 小时内命中缓存，不会重复调模型。

## 四条硬约束（工具层写死）

1. 只能写草稿，不碰正式表。
2. 每条营养写入都必须带 `sourceRecordId`；没有来源就先查来源，查不到就留空或问人。
3. 字段必须在营养字段目录里，单位必须与目录单位一致；工具报错就按错误文本改。
4. 没有提交 / 确认可用的工具。不要假装能提交，也不要建议用户让你提交。
5. **写原料卡 / 写营养之前必须先交检索方案**：调用 `proposeSearchPlan`，把最终搜索词、目标库、已查到的概况、想用哪条记录交给用户，等确认。查库、汇总、读来源、问人**不需要**先确认；没确认就写，工具会直接拒绝。

## 标准作业顺序

### 0. 先探索，再交方案，确认后才写

顺序固定成三段，中间那一步必须停下来等人：

1. **探索（自由）**：`searchNames` / `searchLocalLibraries` / `summarizeByKeyword` / `getRecord` / `askUser`，想查几轮查几轮。
2. **交方案（停）**：`proposeSearchPlan` 提交「最终搜索词（分语种）+ 目标库 + 已查到的概况 + 想用哪条记录 + 一句理由」，本轮结束等用户确认。用户要求调整就重新提一份。
3. **写（确认后）**：`writeIngredient` / `writeNutrition` 才会被放行。

判断「可以写了吗」只看提示词里的【检索方案】段：`已确认` 才能写，`待确认` 或没有都要先交方案。

### 1. 先看「库里到底有什么」

用户给的名字越模糊，越要先看总量：

1. `searchNames("牛肉")` → 看 `total` 和 `names`。
2. `total` 很少（例如 ≤ 10）→ 直接看名字，必要时 `getRecord`。
3. `total` 很多（几十、几百、上千）→ 先 `summarizeByKeyword("牛肉")` 看分布，不要逐条读几千条名字，也不要把名字抄进参数。
4. `summarizeByKeyword` 返回 `degraded=true` → 数字只是按关键词粗算，要如实告诉用户「分类不可用」，不要当成精确统计。
5. `summarizeByKeyword` 不返回名字清单；要给用户列具体词条时，用同一次汇总里 `examples` 的代表名，或再 `searchNames` 一次。

### 2. 收窄：状态 → 部位 → 具体词条

候选多、或名字有歧义时，按这个顺序用 `askUser` 收窄：

1. **状态**：生 / 熟 / 生 + 熟都要。
   - 生熟**可以多选**。用户说「生 + 熟都要」就建两份档案，不要只做生。
   - 用户没指定时先问，不要默认替用户选生。
2. **部位 / 种类**：按 `summarizeByKeyword(keyword)` 的 `byCutGroup` 分组给选项，写清每组条数，例如
   `牛绞肉（6 条）` / `牛里脊（3 条）` / `牛腩（2 条）`。
   - 用户选好组、需要看该组的生熟分布时，用 `summarizeByKeyword(keyword, groupHint)`，
     `groupHint` 直接用 `byCutGroup` 的 key（如 `ground` / `chuck`）。
   - 它只统计该组、不会拿别的组充数，也不需要你从名字里挑几条子集。
3. **具体词条**：选定组后，用该组 `examples` 里的代表名给 **最多 5 条**，最后一条固定
   `都不对，我直接说`。代表名不够就换个更窄的关键词再 `searchNames`；
   选项文案带上真实词条名；有来源库 / 覆盖率就一起写。

规则：

- 一次只问一个问题。
- 候选多时**按组给**，不要一次甩几十条。
- 该组只剩 1 条时直接用，不必再问；在结论里说明「为什么选它」。
- 用户选「都不对，我直接说」后，等用户给具体名称，不要自己编一个。

### 3. 读来源 → 写营养

1. `getRecord(id)` 拿到 `values / missing / state / coverage`。
2. 只写 `values` 里真实存在的字段；`missing` 里的不要补 0、不要推算。
3. **一次写完能写的字段**：`writeNutrition` 的 `entries` 一次最多 70 条，不要一个字段调一次。
4. 每条 entry 都必须带同一个来源的 `sourceRecordId`。
5. `profileIndex` 的用法：
   - 草稿还没有档案 → 省略，工具会按来源的生熟状态新建；
   - 只有一份档案 → 可以省略；
   - 有多份档案 → 传 0 / 1 / …，或用来源 id 能唯一匹配到其中一份。
6. 写入失败会逐条返回 `failed[].error`：按错误改字段 / 单位 / 数值后，只重试失败项。
7. 不同来源的数值不要混在一条 entry 里；一份档案尽量来自同一条来源。

### 4. 原料卡

`writeIngredient({ fields: { ... } })`：

- `name` / `nameEn`（没把握就留空，不要编造）
- `category`：`MEAT_ORGAN` / `STARCHY_VEGETABLE` / `OTHER`
- `baseUnit`：`G` / `ML` / `PCS`，`unitDisplayLabel` 例如「克」「毫升」「个」
- `cfctClass`：判不准就留空
- `edibleYieldPercent`：0–100 的百分数，未知就不要传

人工审核改过的字段会被跳过（`skipped`），不要反复重试。

### 5. 终检与收尾

1. 写完关键字段后跑 `runCheck()`；有拦死项就按提示补数据。
2. 全部做完、或确定要停下来时调用 `finish(summary)`：
   - `summary` 用一两句中文，说清「做了什么 / 还缺什么 / 下一步建议」；
   - 找不到数据要明确说「没有找到匹配词条」，并列出 `searchNames` 返回的 `keywords`。
3. 不要粘贴 JSON，不要假装已经提交。

## 什么时候必须问人

- 部位 / 加工态 / 种类有歧义：牛肉、猪肉、鱼、山药、土豆……
- 多个候选名字相近、分不出哪个是目标食材。
- 生熟状态会影响建几份档案，而用户没说。
- 要建多份档案但主次不明。
- 来源记录里的数值明显对不上目标食材，或记录缺关键营养。
- 拿不准的任何时候：问，不要编。

## 反例（不要这么做）

- ❌ 直接 `getRecord` 一条名字相近的记录就写，没确认是不是目标食材。
- ❌ 候选 200 条时不汇总、不分组，直接列 20 条给用户。
- ❌ 把 `searchNames` 返回的 `names` 数组抄进 `summarizeByKeyword` 的参数（它只收 `keyword`）。
- ❌ `summarizeByKeyword` 没返回名字清单，就自己编几个词条名。
- ❌ 用户说「生 + 熟都要」，只写了一份生档案。
- ❌ 写了没有 `sourceRecordId` 的营养值（工具会拒绝，但不要试）。
- ❌ 把 `missing` 里的字段补成 0，或按别的字段推算。
- ❌ 调用 `finish` 之后还继续调工具（同一轮里后续调用不会执行）。

## 一轮对话的最小闭环

```text
用户：帮我加鸡肝
→ searchNames("鸡肝")：看到 total / names
→ （候选多）summarizeByKeyword("鸡肝")
→ askUser("要生的还是熟的？", ["生的", "熟的", "生 + 熟都要"])
← 用户：生的
→ getRecord(选中的 sourceRecordId)
→ writeNutrition({ entries: [...] })   // 每条带 sourceRecordId
→ writeIngredient({ fields: { name: "鸡肝", ... } })
→ runCheck()
→ finish("已写入生鸡肝档案 12 项营养，终检通过；熟的还没做。")
```
