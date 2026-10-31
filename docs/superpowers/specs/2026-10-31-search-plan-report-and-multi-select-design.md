# 检索方案：可见汇报 + 候选表多选

日期：2026-10-31
状态：待评审

## 一、为什么要改

现在的检索方案卡只有一段文字概况（“CFCT 命中 15 条……”）和一组单选候选，人看到的是
**模型转述的结论**，看不到它到底用什么词查了哪些库，也没法自己判断漏没漏；而且只能选一条，
一个原料要生、熟两份档案时得反复确认。

## 二、已经定下的产品决定（老板原话）

1. 方案里要能看到**扩词方案**：用了哪些词、查了哪些库。
2. 方案里要能看到**检索结果报告**：每个库返回多少条。
3. 扩词方案和结果报告**合并成一个汇报板块**。
4. **覆盖率分子不包含值为 0 的营养素**。
5. 搜索与返回**不做代码层面的评估和过滤**，哪些词条进候选由模型判断；候选整理成表格：
   词条名称 / 来源库 / 状态 / 覆盖率 / 一句话入选原因，可直接勾选一条或多条。
6. 确认后进入下一流程：写入草稿（本期）；没有候选时走线上补充（后续）。

补充决定：

- 勾选多条 → **每条各写一份营养档案**，不合并、不缝合。
- **同一个原料允许有多份同状态档案**；删掉提交时“生熟各只能一份”的校验。
- 标签需要区分时带来源：`鸡蛋清（生 · CFCT）`、`鸡蛋清（生 · MEXT）`；只有一份时保持 `鸡蛋清（生）`。

## 三、目标 / 非目标

**目标**

- 方案卡的自述部分来自**系统记录的事实**，不是模型复述。
- 候选表行由模型决定，代码只补事实列（覆盖率）并校验记录存在。
- 一次确认可以写入多份档案，包括同状态多份。

**非目标（本期不做）**

- 线上补充检索（没有候选时）：保留入口提示，能力下一期接。
- 多来源“缝合”成一份档案：已确认改为各写一份，不做缝合。
- 配方端选择逻辑：现有下拉已经能列出全部档案并强制人工选，本期只改档案名。

## 四、方案

### 4.1 检索汇报由系统记录

`searchLibraries` 每执行一次，把这次调用写进草稿：

```ts
payload.searchReport: Array<{
  library: SearchPlanLibrary;
  terms: string[];
  total: number;
  at: string; // ISO
}>
```

- 只追加，不覆盖；同一库多轮（换词重查）会留下多条。
- `proposeSearchPlan` 汇总成“每库一行”：`terms` 取该库所有轮次的词并去重，
  `total` 取该库**最后一轮**的命中数，`rounds` 记录查了几轮。
- 模型不再需要在 findings 里复述数字；`findings` 只保留“你从中看到了什么”的判断。

### 4.2 检索工具：不评分、不排序、不截断相关性

- 删除 `MIN_MATCH_SCORE` 过滤与按分数排序；
- 查询仍是“库内名字包含任一词”（大小写不敏感）；
- 每库最多返回 **100** 条（只做人肉可读性/载荷保护，不做相关性判断），
  并给出 `total`（截断前）；超过 100 时提示“还有 N 条未列出，可换更具体的词”；
- 返回行精简为 `id / name / sourceType / sourceKey`，不再带 `filledFieldCount`；
- 是否进候选、选哪条，全部由模型决定。

### 4.3 覆盖率：0 值不计入分子

统一成一个函数（`computeRecordCoverage`），所有地方共用：

```
分子 = 营养字段目录中「有数值且 ≠ 0」的字段数
分母 = 营养字段目录字段总数
覆盖率 = round(分子 / 分母 × 1000) / 10   // 一位小数
```

使用点：`getRecord`、方案候选表补数、`selfCheck` 的覆盖率提示、提交时的审计展示。
完全没值的记录覆盖率为 0。

### 4.4 方案数据结构 v2

```ts
interface SearchPlanLibraryReport {
  library: SearchPlanLibrary;
  terms: string[];
  total: number;
  rounds: number;
}

interface SearchPlanCandidate {
  recordId: string;
  name: string;       // 来源库原名，不拼编号
  sourceType: string;
  state: string;      // 模型判断：生 / 熟 / 未标生熟 / 干 …
  coverage: number;   // 系统计算
  reason: string;     // 一句话入选原因
}

interface SearchPlanSelection {
  recordId: string;
  name: string;
  sourceType: string;
  state: string;
  coverage: number;
}

interface SearchPlan {
  status: 'PENDING' | 'APPROVED';
  keywords: SearchPlanKeyword[];
  libraries: SearchPlanLibrary[];
  libraryReports: SearchPlanLibraryReport[];
  candidates: SearchPlanCandidate[];   // 最多 12 行
  selections: SearchPlanSelection[];   // 确认后填
  findings: string;
  rationale: string;
  proposedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  editedByUser: boolean;
}
```

- 移除 `chosenRecordId / chosenRecordName`；旧草稿读取时按“缺字段 = 空”兼容。
- `proposeSearchPlan` 收到候选后，服务端逐条查记录：不存在或非 ACTIVE → 返回错误让模型改；
  存在则补 `coverage` 与规范化的 `sourceType`，`state` 保留模型给的值。

### 4.5 方案卡

上半部分：**检索汇报**

- 每库一行：`库名 | 用了哪些词（标签） | 命中 N 条 | 查了 N 轮`；
- 0 条命中的库也列出，并标“0 条”；
- 下面是原来的可编辑搜索词与目标库（保留，便于人改）。

下半部分：**候选表**

| 勾选 | 词条名称 | 来源库 | 状态 | 覆盖率 | 入选原因 |
|---|---|---|---|---|---|

- 行来自 `plan.candidates`，默认全不勾（人自己选）；
- 覆盖率显示为百分比；
- 确认按钮在“至少勾一条”时可用；勾 0 条时提示“没有可写档案”。

### 4.6 确认之后

`POST drafts/:id/search-plan/confirm` 入参改为 `selectedRecordIds: string[]`
（仍可同时改 `keywords` / `libraries`）。

- 服务端校验每个 id 都在 `plan.candidates` 里，且记录仍是 ACTIVE；
- 写 `selections`、`status = APPROVED`；
- 前端自动续跑，给模型的消息固定为：

```
检索方案已确认，请按方案写草稿：把以下 N 条来源记录各写成一份营养档案，
每条只用它自己的来源记录，profileIndex 从 0 递增：
1) 鸡蛋清（CFCT，生，覆盖率 60%）
2) 鸡蛋清（MEXT，生，覆盖率 78.3%）
写完调用 selfCheck。
```

- 模型用 `writeNutrition` 逐份写入；第一份用 `profileIndex = 0`，
  第二份用 `profileIndex = 1`（工具已支持“下标 == 档案数”时新建一份）。

### 4.7 同状态多档案与标签

- **提交校验**：删除 `ingredient-creation-commit.service.ts` 里
  “生熟状态 X 只能有一份营养档案”的 `seenStates` 校验；
- **正式档案名**：`buildNutritionFoodData` 里按该原料的状态分组，
  同状态只有一份时 `原料名（生）`，多份时 `原料名（生 · CFCT）`；
- **草稿档案标签**：`draftReview` 生成的 `stateLabel` 在检测到同状态多份时
  追加来源，保证两个「生」标签可区分；
- 配方端不需要改：下拉本来就列出全部档案并强制人工选，名字区分开即可。

### 4.8 没有候选时（后续）

本期只做提示：候选表为空时显示“没有可选档案，可继续查词或走线上补充”。
线上补充检索下一期接。

## 五、接口与数据变更

| 位置 | 变更 |
|---|---|
| `search-plan.ts` | 新结构：`libraryReports`、候选带 `coverage/reason`、`selections`；移除 chosen* |
| `confirm-search-plan.dto.ts` | `selectedRecordIds: string[]`（必填，≥1） |
| `ingredient-search-plan.service.ts` | 校验 id ∈ candidates；写 selections |
| `ingredient-creation-tools.service.ts` | `proposeSearchPlan` 收 `libraryReports`（系统覆盖）、候选补 coverage；`searchLibraries` 去评分/截断，写 `searchReport` |
| `ingredient-creation-candidate.service.ts` | 去 `MIN_MATCH_SCORE`；`computeRecordCoverage` 统一；0 不计入 |
| `ingredient-creation-commit.service.ts` | 删除同状态唯一校验；档案名按需带来源 |
| `admin-web/ai-agent` | 方案卡：汇报块 + 候选表多选；确认传 ids；草稿标签带来源 |

## 六、风险与取舍

- **不筛不排**后，宽泛词（“牛肉”）可能一次返回上百条，模型上下文变重。
  用“每库最多 100 条 + 总数提示”兜底；如果实际仍过重，再降到 50。
- **候选表行由模型挑**：模型可能漏掉好记录。兜底是汇报块列出每库总数，
  人能看到“某库 15 条但表里只有 1 条”，从而要求重查。
- **状态由模型写**：可能写错。正式写入时状态仍由来源记录推导（工具现有行为），
  表格里的状态只用于人判断；两者不一致时以写入日志为准。
- **同状态多档案**：正式库会出现两份「生」档案，配方端靠名字区分；
  如果后续发现容易选错，再考虑在配方下拉里单独显示来源列。

## 七、测试

- 覆盖率：0 不计入；全 0 记录 = 0%；边界（一位小数）。
- 检索工具：无评分过滤、100 条上限与 total、宽泛词不报错。
- 方案：`libraryReports` 由系统记录生成；候选补 coverage；非法 id 拒绝。
- 确认：多选落 `selections`；选 0 条拒绝；自动续跑文案带全部选中项。
- 提交：同状态两份可提交；档案名带来源；单份不带来源。
- 前端：汇报块渲染、表格多选、确认按钮禁用逻辑、标签去重。

## 八、上线与验证

1. 后端 + 前端同批上线；
2. 跑一次「添加鸡蛋清」，检查：汇报块每库词与命中数、候选表列齐全、勾两条生档案、
   草稿出现两个「生」标签且带来源、提交后正式档案名带来源；
3. 回归：单档案流程（只勾一条）不变。
