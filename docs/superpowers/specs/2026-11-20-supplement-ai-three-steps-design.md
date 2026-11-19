# 补剂类原料 · AI 添加三步化设计与重构

- 日期：2026-11-20
- 提出：老板
- 状态：已评审（三项决定在对话中确认），进入实施
- 范围：`admin-web`「AI 添加原料」的**补剂线**，以及支撑它的后端服务
- 取代：`docs/superpowers/specs/2026-11-07-supplement-ingredient-ai-flow-design.md` 中
  **流程与界面**的部分；计量口径、字段归属、标签留档、目录只用于命名这些结论继续有效。
- 工位：`task/20261120-supplement-ai-3step`（`.worktrees/20261120-supplement-ai-3step`）

## 0. 一句话

补剂只做三件事，每件事一个动作、一个产出：

1. **定形态**：知识库读原文，给出「形态档位 + 结论 + 出处」；
2. **比价**：服务端把 iHerb 上这一档形态的 6～8 瓶，算成「每 1000 单位多少钱」，并给出推荐与理由；
3. **建档**：传正面图 + 标签图，把图上的字变成档案。

落地配置（上架 / DIY / 等价组 / 参考价）**保留**，作为写完之后的第 4 步。

## 1. 为什么改

### 1.1 今天是什么

| 位置 | 现在 | 谁在干 |
|---|---|---|
| 左栏 | 常驻聊天，模型自己决定调哪个工具、调几次 | 模型 |
| 中栏 | 商品链接 / 标签图地址 / 手抄标签原文 | 人 |
| 右栏 | 名称、品牌、规格、价格、每份几粒、四组营养素、合规四格 | 人 |
| 抽屉 | 「比一比候选」：形态好坏、人用/饲料级、价格、含量全靠人勾人填 | 人 |
| 底部 | 三道门禁 + 核验并写入 | 系统 |
| 写完 | 第 4 步落地配置（约 1,200 行）挂在同一页 | 人 |

### 1.2 三件事分别缺什么

- **形态推荐只有聊天文本**：知识库工具是通的，但没有结构化产出、没有出处落位、关掉页面就没了。
- **比价其实要人填**：搜索只回「链接 + 标题」，价格恒为空；每 1000mg 单价由前端拿手填的数算，无出处、不可回溯。Agent 一瓶要读两次网页，而一次对话只有 30 次工具调用、约 3 分钟——装不下 6 瓶比价。
- **图建档只认一张图且要先有链接**：正面图没有入口，证据表只有 `label_image_url`；识别只把字抄下来，结构化靠模型自由发挥；页面不存草稿。

### 1.3 老板定的三条

1. 三步**当天一气呵成**，不做跨天存档；
2. 比价**既给表、也给推荐商品和理由**；
3. 落地配置**很重要，功能必须保留**。

## 2. 目标与非目标

**目标**

- 一屏四步，一步一件事；前三步是主干，第 4 步写完才出现。
- 每个数字都能追到来源；算不出来就明说，不猜。
- 结论必须有原文支撑；没有原文的一律标「证据不足」，不许出现「推荐」。
- 交付时，贴一句「给狗补铜」能一路走到「已写入、待确认可用」。

**非目标**

- 不改食材线。
- 不改补剂计量口径（每份 ÷ 每份粒数，折算只在服务端）。
- 不做商品主数据、不做候选暂存、不做跨天恢复。
- 不做采购下单、比价下单。
- 不动配方编辑器、不动商城上架规则。
- 第 4 步的功能一个不少，只是不再和前三步挤同一屏。

## 3. 流程与界面

### 3.1 四步

```
① 定形态 ──▶ ② 比价 ──▶ ③ 建档 ──▶ ④ 上架（写完才亮）
```

顶部一条进度条，当前步整屏展开，已完成步收成一行摘要（可点回去改）。**不再有常驻聊天栏。**

### 3.2 每步的输入与产出

| 步 | 人给什么 | 系统给什么 | 人做什么 |
|---|---|---|---|
| ① 定形态 | 一句「给狗补铜」，或点选营养素 | 形态档位表（结论 / 理由 / 出处原句）+ 一条主结论 | 点「用这个档位」 |
| ② 比价 | 上一步的档位 | 6～8 瓶的价、规格、每份含量、每 1000 单位单价 + 推荐与理由 | 点「就买这瓶」 |
| ③ 建档 | 正面图 + 标签图 | 填好的档案（名称/品牌/规格/剂型/价格/每份几粒/营养素） | 核对 → 过门禁 → 写入 |
| ④ 上架 | — | 四段配置 | 逐段表态 |

### 3.3 状态与刷新

三步共享一个 `SupplementFlowState`（纯数据，可单测）：`step`、`nutrientKey`、`formAdvice`、`chosenFormLevel`、`comparison`、`chosenOffer`、`archiveDraft`。

- 存在组件内存 + `sessionStorage` 快照（键 `supplement-flow-v2`），刷新不丢、关标签页即清。
- 确认的是「当天一气呵成」，所以**不做服务端草稿**。

### 3.4 第 4 步

沿用现有 `LaunchConfigStep.vue` 与它依赖的接口，**一行不改**，只把它从「三栏之外的一行」改成第 4 步的独立屏；写入成功后才可进入。

## 4. 第 1 步：形态建议

### 4.1 输入

`nutrientKey`（取自 `supplementNutrients` 的规范字段，如 `minerals.copper`）、展示名、可选的一句补充（「我家狗肝铜高」）。

### 4.2 检索路径（固定管线，不是自由 Agent）

1. 用营养素英文名 + 形态词组装 2～3 条查询（如 `copper absorption`、`copper oxide source`、`chelated trace minerals`），走 `kb_find`；
2. 取命中最高的 3～5 页，走 `kb_read`（不取页图，预算 6000 token）；
3. 把「读过的页 + 原文」交给模型，要求**只输出 JSON**；
4. 服务端校验后再交给前端。

### 4.3 输出结构

```ts
type FormLevel = 'ORGANIC_CHELATE' | 'INORGANIC_SALT' | 'OXIDE' | 'OTHER'
type FormVerdict = 'RECOMMENDED' | 'ACCEPTABLE' | 'AVOID' | 'NO_EVIDENCE'

interface Citation { documentId: string; documentName: string; page: number; quote: string }

interface FormOption {
  level: FormLevel
  labelZh: string          // 有机络合（氨基酸络合 / 蛋白盐）
  examples: string[]       // 目录里的通用名或常见盐名，可空
  verdict: FormVerdict
  reason: string           // 一句话，不含数字结论以外的推测
  citations: Citation[]
}

interface FormAdvice {
  nutrientKey: string
  nutrientLabel: string
  options: FormOption[]
  recommendedLevel: FormLevel | null
  recommendationReason: string
  gaps: string[]           // 知识库没覆盖到的部分，逐条写清楚
}
```

### 4.4 硬规则：没有引用就没有结论

`enforceCitationRule(advice, readPages)`：

1. 丢掉 `documentId#page` 不在 `readPages` 里的引用（防编页码）；
2. 任何一条 `verdict` 不是 `NO_EVIDENCE` 却没有引用 → 降级为 `NO_EVIDENCE`，`reason` 前加「知识库没查到直接依据：」；
3. `recommendedLevel` 指向的档位若被降级 → `recommendedLevel = null`，`recommendationReason = '这一档没有原文支撑，请你判断'`；
4. 氧化物/氧化铁这类硬排除若命中已知原文，`verdict` 强制 `AVOID` 并附出处。

这条规则是纯函数、可单测，也是「基于知识库」这句话唯一能被验证的地方。

### 4.5 档位词表

| 档位 | 中文 | 典型 |
|---|---|---|
| `ORGANIC_CHELATE` | 有机络合 | 氨基酸络合、蛋白盐、甘氨酸盐 |
| `INORGANIC_SALT` | 无机盐 | 硫酸盐、葡萄糖酸盐、柠檬酸盐 |
| `OXIDE` | 氧化物 | 氧化铜、氧化锌、氧化铁 |
| `OTHER` | 其它/复合 | 多矿物质复合、螯合工艺但未标明 |

**只到档位，不到具体盐名。** 知识库实测：`copper` 578 段、`copper oxide` 13 段、`organic mineral` 29 段，但 `bisglycinate` 与 `proteinate` 各 0 段。点具体盐名等于让它编。

## 5. 第 2 步：比价

### 5.1 输入

`nutrientKey` + `formLevel` + 搜索关键词（默认由档位词表生成，可改）。

### 5.2 取数（服务端，一次请求出表）

1. `searchCandidates(keyword)` 拿最多 8 条 iHerb 链接；
2. 逐条并行（并发 3，单条 20 秒超时，整表 75 秒硬上限）：
   - 抓 `cn.iherb.com` 商品页 → 价格、标题；
   - 从搜索缓存取标签正文 → `parseSupplementLabel` → 每份含量、每份粒数；
3. 标题 → 品牌 / 规格 / 每瓶粒数（沿用现有 `extractBrandFromTitle`、`extractProductModelFromTitle`）；
4. 结果进内存缓存（30 分钟，按 URL），重试不重复抓。

**单瓶失败不影响整表**：失败的行保留，标「没读出来」和原因。

### 5.3 单价口径

| 营养素类别 | 按什么算 | 单位 |
|---|---|---|
| 矿物质 | 元素量（标签上的 elemental amount） | 每 1000 mg |
| 鱼油 / Omega-3 | EPA + DHA 合计 | 每 1000 mg |
| 脂溶性/水溶性维生素 | 标签标示量 | 每 1000 mg 或每 1000 IU |
| 益生菌 | 每份活菌数 | 每 10 亿 CFU |
| 其它 | 标签标示量 | 每 1000 mg |

口径必须写在表头：**「按元素量算，不是按化合物总量」**。表里同时给「每瓶份数」「每份价」，方便核对。

公式（只在一处实现，纯函数）：

```
每份价   = 瓶价 ÷ (每瓶粒数 ÷ 每份粒数)
每 1000  = 每份价 ÷ 每份有效含量 × 1000
```

### 5.4 算不出

以下任一缺失 → `unitPrice = null`，`missing` 写明缺哪一格：价格 / 每瓶粒数 / 每份粒数 / 每份含量。

**算不出不是「贵」**：不参与排序，排在能算的后面，标签用灰色「算不出」，不淘汰。

### 5.5 排序与推荐

1. 先按档位：与第 1 步选定档位一致的排前面（不一致的标「形态不同档」）；
2. 同档内按每 1000 单位单价升序；
3. **推荐 = 同档里能算出单价的最便宜那瓶**（规则给出，可复核）；
4. 推荐理由 = 模板拼装（单价、价差、规格、形态档位）+ 第 1 步里这个档位的那条原文结论。**理由里不出现表里没有的数字。**

### 5.6 缓存与超时

- 缓存 30 分钟；同一关键词 5 分钟内重复请求直接回缓存；
- 超时先回已有行（`partial: true`），前端提示「还有 N 瓶没读完」。

## 6. 第 3 步：图变档案

### 6.1 两张图

- **正面图**：品牌、产品名、规格（120 粒）、剂型。
- **标签图**：Serving Size 行 + 成分表。

两张都走现有上传接口 `uploadIngredientDiyImage`，拿到 URL 后一起提交。

### 6.2 视觉只做一件事：抄字

两次调用（正面、标签各一次），提示词不同：

- 正面：只抄印刷文字（品牌、名称、规格、剂型），不要判断；
- 标签：原样抄 Serving Size 与成分表每一行，保留数字、单位、百分号，看不清标 `?`。

**不让模型输出档案字段。** 模型一旦开始"理解"，就会把 120 µg 写成 120 mg。

### 6.3 代码负责映射与折算

1. 标签文本 → `parseSupplementLabel`（已有，带单测）→ `{ fieldPath, value, unit, rawName }`；
2. 单位对齐档案标准单位（`µg → mg` 等），对不上就留空并提示（沿用 `patchFromPreview`）；
3. 正面文本 → 品牌（沿用已知品牌表）、规格、剂型 → `physicalForm` / `unitDisplayLabel`；
4. 名称去掉剂型词（沿用 `findSupplementFormWord`）；
5. 每份 ÷ 每份粒数 = 每粒，仍然只由服务端在写入时算（口径不变）。

### 6.4 门禁

三道门禁原样保留：折算闭合、单位闭合、成本算得出。新增一条**不做门禁**的提示：两张图是否都传了（缺图只提示，不拦写入）。

### 6.5 写入

调现有 `POST /admin/ingredient-creation/supplements`，payload 增加两项：

- `evidence.frontImageUrl`
- `selection`：第 1 步的档位结论 + 引用 + 第 2 步选中那瓶的价与单价（写进证据快照）

写入后仍是「待验证」，仍要人点「确认可用」。

## 7. 数据与接口

### 7.1 数据

`supplement_label_evidence` 增加两列（都可空，一次 migration）：

| 列 | 类型 | 用途 |
|---|---|---|
| `front_image_url` | `VarChar(500)?` | 商品正面图 |
| `selection_snapshot` | `Json?` | 形态结论 + 引用 + 比价表 + 选中那瓶 |

不建新表：当天一气呵成，没有跨天记录的需求。

### 7.2 新增接口

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| POST | `/api/v1/admin/ingredient-supplement-agent/form-advice` | `nutrientKey, nutrientLabel, question?` | `FormAdvice` |
| POST | `/api/v1/admin/ingredient-supplement-agent/compare` | `nutrientKey, formLevel, keyword?, limit?` | `ComparisonView` |
| POST | `/api/v1/admin/ingredient-supplement-agent/read-label-images` | `frontImageUrl, labelImageUrl, productUrl?` | `LabelIntakeResult` |

单独一支控制器 `supplement-agent.controller.ts`，与现有 `supplement-chat.controller.ts` 并列。

### 7.3 复用

- 抓取：`SupplementLinkPreviewService`（fetch / search / 标签缓存 / 价格）
- 标签解析：`parseSupplementLabel`、`extractServingUnits`
- 标题抽取：`extractBrandFromTitle`、`extractProductModelFromTitle`
- 知识库：`KnowledgeGatewayService` + `executeKnowledgeTool`
- 视觉：`SupplementLabelVisionService`（改造成可传不同提示词）
- 写入：`SupplementIngredientService`
- 前端：`supplementFormState`、`supplementGates`、`supplementNutrients`、`LaunchConfigStep`

## 8. 删除与保留

**删除（第 4 阶段做，等新流程跑通一批真实补剂）**

- `SupplementCompare.vue` + `compareCandidates.ts` + 两个 spec（人工比价与三层淘汰）
- 中栏「那瓶东西」三件套（链接 / 图片地址 / 手抄原文）作为主界面
- `SupplementChat.vue` 作为常驻栏
- `SupplementAgentService` 的自由工具循环（若「问一句」不做）
- 淘宝 / 京东抓取（只留 iHerb + 手填兜底）

**保留**

- 三道门禁、标签留档、待验证清单、「确认可用」
- 第 4 步全部能力
- 食材线一切

## 9. 灰度与验收

- URL 加 `?v=2` 开新流程，旧页面留一版；跑通 10 条真实补剂后删旧的。
- 验收口径：
  1. 「给狗补铜」→ 出形态表，每条结论都能点开原文；
  2. 同一步里若知识库没覆盖，页面明写「证据不足」，且不出现「推荐」二字；
  3. 比价表 8 瓶里至少 6 瓶算得出「每 1000mg 单价」，从点击到出表 ≤ 90 秒；
  4. 算不出的行明确写出缺哪一格；
  5. 两张图能填出：名称、品牌、规格、剂型、每份几粒、至少 3 个营养素；
  6. 写入后是「待验证」，点「确认可用」才进配方；
  7. 写入后能回查正面图、标签图、形态依据、选中那瓶的价格。

## 10. 风险

| 风险 | 表现 | 应对 |
|---|---|---|
| iHerb 抓取不稳 | 价格读不到、标签在图里 | 「算不出」当常态；单瓶失败不影响整表；提示换链接 |
| 知识库到档位为止 | 具体盐名无原文 | 只给档位；`gaps` 明写没覆盖 |
| 复合配方比不了 | 一瓶十几种营养素 | 标「复合配方，不参与单价排序」 |
| 页面刷新丢状态 | 三步白填 | sessionStorage 快照 + 每步可回退 |
| 一步做太大 | 上线即不可用 | 四阶段，每阶段单独可验；比价先做技术验证 |

## 11. 留给 builder 的决定

- 三步组件的拆分与命名（建议 `steps/` 目录四个文件）。
- 形态表里原文的展示方式（内联引用还是点开抽屉）。
- 比价表的列顺序与「算不出」的视觉。
- 缓存实现（内存 Map 即可，不必上 Redis）。
- 视觉提示词的具体措辞（但要守住「只抄字」）。
- sessionStorage 快照的字段裁剪。
