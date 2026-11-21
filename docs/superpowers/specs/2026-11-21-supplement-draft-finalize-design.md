# 补剂建档：AI 起草 + 草稿 + 最后一次写入

- 日期：2026-11-21
- 状态：设计待确认
- 范围：admin-web「AI 添加原料 → 补剂线」的新建补剂流程
- 不涉及：食材线、小程序端、已有补剂原料的日常编辑

## 0. 一句话

把补剂从“先写入、再去另一个页面配”改成“一张草稿一路填到底，AI 全填全判，人最后审一遍，确认后一次性写入，并逐项核验真的生效”。

## 1. 为什么改

现在的流程是两段式：

1. ① 建档页：传图/手填 → 三道门禁 → **正式写入原料库**；
2. ② 上架页：再配保质期、储存、油性、商城上架、DIY、采购、等价组。

两段式产生了一个绕不开的矛盾：

- 上架页要填的保质期、等价组、上架开关，只有“正式写入之后”才能生效；
- 但上架页本身又不负责写入；
- 于是出现“保质期填了但没保存 → 上架开关打不开”“等价组选了但没生效 → 替换功能用不了”；
- 人回到①想改，①已经因为“已写入”锁死；点“清除”又会变成可重复提交，最后撞“同名同规格已存在”。

同时，AI 读图的结果还有几个问题：

- AI 算出的“每 1 粒含量”被当成隐藏底稿，人改“每份含量”会被门禁判“对不上”，且没有清除入口；
- 清空某个营养素，旧的每粒值仍会写进档案；
- 重新读图会覆盖人工修改；
- 写入后表单还能改，但保存按钮永久变灰，改动不会被保存。

所以这次不是“给上架页加个草稿按钮”，而是把整条链路改成：

**AI 起草 → 草稿（可跨天、可放弃）→ 人最终审核 → 一次性写入 → 写入后逐项核验。**

## 2. 目标

1. **一张草稿走到底**：商品信息、营养档案、标签合规、上架配置、DIY、采购、等价组、默认目标，全部在同一张草稿里完成；在点“确认写入”之前，不产生任何正式原料记录。
2. **AI 填所有、判所有**：AI 负责填字段、做决定（上不上架、归不归组、开不开 DIY/采购、选哪个标签名/默认目标），并给出理由和依据；代码只做最终校验，不替 AI 做业务决定。
3. **人只做最后审核**：最后审核屏要能回答三件事：
   - 填全了吗（完整性）；
   - 每个格子最后会写到生产库的哪个字段（映射）；
   - 写入后每个开关/功能是不是真的生效（核验）。
4. **草稿可跨天、可放弃**：关掉页面第二天还能接着填；页面默认进草稿列表，不自动打开上一张；只有手动点“放弃”才清掉，不自动过期。
5. **一次写入、可回滚**：所有正式数据在一个事务里写；任何硬性校验不过就不写，草稿保留。
6. **写入后必须核验**：写入成功后逐项回读，确认字段、开关、功能都真的生效；核验不过不能只说“保存成功”。
7. **不静默**：AI 没填的、填错的、拿不到的，必须明确标出来；不允许“看起来成功、实际没生效”。

## 3. 非目标

- 不改食材线，也不改食材的草稿/核验体系。
- 不在本期做“已有补剂原料的上架配置迁移”；已有原料仍走现有上架清单/原料库。新流程只负责“新建补剂”。
- 不自动创建包材规则（袋/标签/干燥剂）；包材规则是否匹配作为“功能就绪检查”的一项，没匹配就提示并给入口。
- 不做多人协作/交接；草稿默认只对创建人可见。以后要多人再看。
- 不自动过期草稿；只支持手动放弃。
- 不做“AI 自动决定不建档/自动合并到已有原料”；遇到重复时提示已有记录，由人决定改名/改规格或去已有记录继续。
- 库存参数（安全库存/补货点/目标库存）不在本流程；采购开关不依赖它们，后续在库存/采购页设置。
- 价格历史/成本流水不在本流程；沿用现有补剂建档“只写当前价”的行为。

## 4. 用户流程

### 4.1 入口

`AI 添加原料 → 补剂类原料` 进入后，先看到**草稿列表**：

- 每行：草稿名（AI 起的名字或“未命名补剂”）、最后编辑时间、完成度（已填必填项/总必填项）、状态。
- 操作：继续、放弃。
- 右上角：新建补剂。
- 空状态：说明“没有未完成的草稿”，给“新建补剂”。

不自动打开上一张草稿；刷新页面也停在列表。

### 4.2 新建草稿

1. 新建后进入草稿编辑页。
2. 传正面图、标签图（可先传一张，先传哪张都行），贴商品链接/选品依据（可空）。
3. 点“让 AI 起草”（或首次满足条件后自动触发一次）。
   - **AI 完整起草需要：正面图 + 标签图**。标签图负责营养，正面图负责名称、规格、剂型；商品链接可选，用来补价格/品牌/DIY 链接。
   - 只有一张图时可以先存草稿、手填；AI 按钮提示补另一张图，不强行跑。
   - 不修改共享的 `read-label-images` 两张图契约；新编排层直接复用。
   - 起草中按钮转圈，草稿自动保存；关掉页面不会丢已保存内容。
4. AI 填完后，页面按区块展示：已填、没找到、AI 的判断和理由。
5. 人从任意区块开始核对/修改；所有修改自动存草稿。
6. 点“最终审核”进入审核屏；审核通过后“确认写入”。

### 4.3 草稿编辑页的区块

1. **商品与基本信息**
   - 原料名称、品牌、产品规格、采购渠道
   - 基准单位、展示单位、物理形态
   - 每份多少、采购单位、1 个采购单位 = 多少基准单位
   - 当前采购价、生产损耗率
   - 添加时机
2. **营养档案**
   - 每份含量（按营养素分组，可展开全部）
   - 每 1 个基准单位的折算预览
   - 默认目标营养素
   - 标签原文/读图原文
3. **标签与合规**
   - 标签分类（饲料原料/饲料添加剂）
   - 标签名称（目录规范名，带候选）
   - 标签分类标签（矿物质/维生素/…）
   - 目录匹配结果、规范名依据（只看名字，不判断适用性）
4. **上架与商城**
   - 是否上架（草稿意向）
   - 原厂保质期（月）
   - 储存条件
   - 内容物是否油性
   - 不上架原因（不上架时必选）
   - 参考售价/成本拆解（只读试算）
   - 数据体检问题（ERROR/WARN）
5. **DIY 推荐**
   - 是否用于 DIY
   - 购买平台、购买链接、商品图片
   - 从链接抓取/上传图片
6. **生产采购**
   - 是否用于生产/采购
   - 采购口径（采购单位、换算倍数、进货价）
   - 采购 SKU 提示（可选，不阻塞）
7. **等价组**
   - 归组/暂不归组
   - AI 推荐组及理由
   - 组状态、成员、组内排序
   - 加入已审核组会打回待审核的提示
8. **证据与来源**
   - 正面图、标签图、商品链接、标签原文
   - 选品依据（形态结论/比价/选中商品）
   - AI 决策日志：为什么上架/不上架、为什么归这个组、为什么选这个标签名/默认目标

每个字段旁边显示来源：AI 读图 / AI 读商品页 / 目录 / 业务规则 / 人改过。AI 拿不到的字段显示“AI 没找到，请补”，不猜。

### 4.4 最终审核屏

审核屏不是再放一遍表单，而是四块：

1. **完整性**
   - 必填项清单：已填/缺失。
   - AI 没填的项单独列出，可点“让 AI 再查一次”或手动补。
2. **最终写入会做什么**
   - 会新建哪些记录：原料、营养档案、映射、标签证据、标签关联、等价组关系。
   - 每个字段会写到哪：原料表字段 / 营养档案字段 / properties 键 / 关联表。
   - 哪些开关会被打开：上架、DIY、采购。
3. **最终校验**
   - 阻断项（必须改）：红色，不能写入。
   - 提醒项（可接受）：黄色，需勾选“我知道了”才能写入。
   - AI 决策及理由：上架/不上架、归组/不归组、DIY/采购、标签名、默认目标。
4. **写入后核验清单**
   - 写入成功后要逐项核验的内容（见第 9 节），让人知道“不是点完就算”。

- 等价组段：如果选了已审核组，显示“加入会把组打回待审核”，并给一个默认勾选的“本次一并审核通过”；取消勾选时提示“组会留在待审核，缺货替换暂不生效”。
- 按钮：`确认写入`（有阻断项时禁用）。旁边：`保存并离开`、`放弃草稿`。

### 4.5 写入中 / 写入后

- 写入中：遮罩 + 步骤（校验 → 写原料 → 写营养 → 写证据/标签 → 归组 → 回读核验）。
- 成功：显示核验清单，每项“期望/实际/通过”；给“去原料库”“去上架清单”“去配方设计器”入口。
- 失败：
  - 校验失败：留在审核屏，标出失败项；草稿不变。
  - 写入失败/回滚：留在审核屏，提示“没有写入任何正式数据”，草稿保留。
  - 写入成功但功能核验失败：明确显示“数据已写入，但以下功能未生效”，给出修复/重试入口；不能只说“成功”。

### 4.6 放弃草稿

- 草稿列表/编辑页都可以“放弃”。
- 二次确认，说明“只删除草稿，不影响正式原料库”。
- 放弃后从列表消失；不自动恢复。
- 软删除（status=DISCARDED）保留审计，但列表不显示。

## 5. 数据模型

### 5.1 新表 `SupplementCreationDraft`

```prisma
enum SupplementCreationDraftStatus {
  DRAFT
  FINALIZED
  DISCARDED
}

model SupplementCreationDraft {
  id                      String   @id @default(uuid())
  createdBy               String   @map("created_by")
  status                  SupplementCreationDraftStatus @default(DRAFT)
  /// 草稿结构版本，便于以后迁移
  schemaVersion           Int      @default(1) @map("schema_version")
  /// 列表显示名：AI 起的名字 / 原料名 / 未命名补剂
  name                    String   @default("") @db.VarChar(200)
  /// 整张草稿：字段 + 决策 + 人改记录 + 已确认的提醒
  payload                 Json
  /// 最近一次 AI 起草的原始结果：值、来源、置信度、理由、缺失项
  aiSnapshot              Json?    @map("ai_snapshot")
  /// 人改过的字段路径；AI 重跑时这些不被静默覆盖
  manualFields            String[] @default([]) @map("manual_fields")
  /// 写入后核验报告
  verification            Json?
  finalizedIngredientId   String?  @map("finalized_ingredient_id")
  finalizedNutritionFoodId String? @map("finalized_nutrition_food_id")
  finalizedEvidenceId     String?  @map("finalized_evidence_id")
  finalizedAt             DateTime? @map("finalized_at")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt @map("updated_at")

  @@index([createdBy, status, updatedAt])
  @@index([status, updatedAt])
  @@map("supplement_creation_draft")
}
```

说明：

- 不复用 `ingredient_creation_draft`：那是食材线的站点式草稿，`type/step` 语义不同；混用会让食材草稿服务多一堆补剂分支。
- 不把草稿写进 `ingredient` 表：草稿阶段必须“零正式原料记录”，否则又回到现在的两段式。
- `payload` 用 JSON，字段多但结构稳定；`schemaVersion` 处理以后字段增删。
- `manualFields` 记录人改过哪些路径；AI 重跑时只补没改过的字段，改过的给 diff 让人选。
- `aiSnapshot` 与 `payload` 分开：审核时能看“AI 原来提了什么、人改了什么”，写入时也能落审计。

### 5.2 payload 结构（TypeScript 形状）

```ts
interface SupplementDraftPayload {
  basic: {
    name: string
    brand: string
    productModel: string
    purchaseChannel: string
    baseUnit: 'PCS' | 'G' | 'ML'
    unitDisplayLabel: string
    physicalForm: 'POWDER' | 'TABLET' | 'CAPSULE' | 'LIQUID' | null
    servingUnitsPerDose: number | null
    purchaseUnit: string
    purchaseToBaseRatio: number | null
    currentPricePerPurchaseUnit: number | null
    productionLossRate: number
    addTiming: string
  }
  nutrition: {
    servingNutrients: Record<string, number>
    defaultTargetFields: string[]
    labelText: string
  }
  label: {
    labelCategory: 'FEED_MATERIAL' | 'FEED_ADDITIVE' | null
    labelNames: string[]
    tagNames: string[]
    labelNameSource: string
  }
  retail: {
    enabled: boolean
    shelfLifeMonths: number | null
    /** 开盖后保质期（天）；标签写了才填 */
    openedShelfLifeDays: number | null
    storageCondition: string
    isOilBased: boolean
    noSaleReason: string | null
  }
  diy: {
    enabled: boolean
    platform: string
    linkUrl: string
    imageUrl: string
  }
  procurement: {
    enabled: boolean
  }
  equivalence: {
    /** groupId / __SKIP__ / null（还没选） */
    groupId: string | null
    priority: number | null
    /** 加入已审核组时，是否在本次最终写入里一并重新审核通过；默认 true（人可在审核屏取消） */
    reapproveGroup: boolean
  }
  evidence: {
    frontImageUrl: string
    labelImageUrl: string
    productUrl: string
    selectionNote: string
  }
  review: {
    /** 人已确认的提醒项：code + 关键参数哈希 */
    acknowledgedWarnings: Array<{ code: string; paramsHash: string }>
  }
}
```

### 5.3 写入审计

最终写入时，复用 `IngredientCreationAudit`：

- `draftId`：草稿 id
- `ingredientId`：新建原料 id
- `nutritionFoodIds`：营养档案 id
- `proposals`：`aiSnapshot`（AI 原提案）；其中 `aiSnapshot.proposedDecisions` 保留 AI 原始决定，`aiSnapshot.decisions` 是合并后实际生效的决定，两者都要留，避免“生效值”覆盖“AI 当初提了什么”
- `changes`：`manualFields` + 人改后的值（只存改过的路径，避免整份重复）
- `committedBy` / `committedAt`

这样以后回看能回答“AI 当初怎么判的、人改了什么”。

## 6. AI 起草合同

### 6.1 输入

- 正面图、标签图（URL，两者都要）
- 商品链接（可选；用于补价格/品牌/DIY 链接/主图）
- 选品依据（可选，人从 DSH 选品 Skill 粘过来）
- 当前草稿（重跑时）
- 允许值：营养字段目录、单位、物理形态、添加时机、标签词表、不上架原因、平台
- 目录：饲料添加剂目录、饲料原料目录（**都只用来查规范名，不判断适用性**）
- 业务规则：补剂商城配置、等价组列表/推荐、包材匹配规则、价格试算
- 当前草稿里人改过的字段（manualFields）

### 6.2 输出

```ts
interface SupplementAiDraft {
  fields: Record<string, {
    value: unknown
    source: 'LABEL' | 'FRONT' | 'LINK' | 'CATALOG' | 'RULE' | 'INFERENCE'
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    reason: string
  }>
  decisions: {
    /** AI 是否建议建档；false 只展示理由，不自动丢弃草稿 */
    recommendCreate: { value: boolean; reason: string }
    retail: { enabled: boolean; reason: string }
    noSaleReason: string | null
    diy: { enabled: boolean; linkUrl: string; imageUrl: string; reason: string }
    procurement: { enabled: boolean; reason: string }
    equivalence: { groupId: string | null; reason: string }
    labelNames: string[]
    defaultTargetFields: string[]
    tagNames: string[]
    addTiming: string | null
  }
  missing: Array<{ fieldPath: string; reason: string; suggestion?: string }>
  warnings: Array<{ code: string; message: string; fieldPath?: string }>
}
```

### 6.3 规则

1. **不编数据**：标签/正面/商品页都没有的，返回 `null` + `missing`，不猜。可以给“建议值”，但要标 `INFERENCE`/`LOW`，不能当成已读到。
2. **先原文，后推断**：标签/正面原文优先；商品链接次之；目录/业务规则再次；最后才是推断。
3. **决定必须带理由**：上架/不上架、归组/不归组、DIY/采购、标签名、默认目标，每个都要有一句人能看懂的理由。
4. **不覆盖人改**：重跑时，`manualFields` 里的字段不直接改；如果 AI 新结果不同，进 diff 让人选。
5. **可重跑**：每次 AI 起草生成 `aiRunId`，存 `aiSnapshot`；失败可重试，不影响已有草稿。
6. **只做建议，不落库**：AI 起草只写草稿，不创建 `ingredient`/`nutrition_food`/证据/标签/组关系。
7. **同一草稿同时只跑一次 AI**：草稿级锁/`aiRunId`；并发调用返回 409“正在起草”。AI 写回时用最新的 `updatedAt` 合并，不能把期间人改的内容冲掉。
8. **自动保存与 AI 写回不打架**：保存用 `expectedUpdatedAt` 乐观锁；AI 写回前重新读草稿，按 `manualFields` 跳过人改字段。

### 6.4 实现建议

分三步，不要一个超大模型调用：

1. **读图/读链接**：复用现有 `SupplementLabelIntakeService` + `SupplementLinkPreviewService`，拿到标签原文、每份量、营养素、正面字段、商品页价格/品牌/规格/主图。
2. **补全字段**：用规则 + 目录 + 配置补：单位、每份量、采购倍数、标签名、默认目标、保质期/储存/油性、DIY 链接/图片、采购开关。
3. **做决定**：单独一次“决策”调用，把草稿字段 + 目录 + 配置 + 等价组候选给模型，输出上架/不上架、归组/不归组、DIY/采购、标签名、默认目标，以及理由。

这样每一步都能单独测、单独重试；出错时知道是哪一步。

**草稿阶段没有 `ingredient` 行，不能直接复用“按 ingredientId 查”的推荐/体检接口。** 需要把两块逻辑抽成纯函数：

- 等价组推荐：输入 `{ name, baseUnit, unitDisplayLabel, nutritionProfile, properties }`，输出候选组 + 理由；已有原料仍走原 `recommend(ingredientId)`。
- 上架体检：把 `SupplementCatalogService` 里的规则抽成 `evaluateSupplementDraftIssues(draft)`，输入草稿值，输出 ERROR/WARN；写入后再用现有 catalog 复核。
- 包材匹配：输入 `physicalForm/unit/amount`，输出匹配到的规则；没有匹配返回空。

这样“写入前校验”和“写入后核验”用的是同一套规则，不会出现两套口径。

## 7. 校验与门禁

### 7.1 原则

- **AI 做决定，代码做硬校验**：代码不替 AI 决定“上不上架/归不归组”，只判断“这个决定能不能落地”。
- **阻断项 vs 提醒项**：
  - 阻断项：数据会错、功能一定用不了、合规不允许；必须改，不能写入。
  - 提醒项：能写入，但某功能不生效/有风险；必须勾选“我知道了”才能写入。
- **不做静默修正**：不能因为“上架开关开了但缺保质期”就偷偷把开关关掉；要明确告诉人“上架被阻断，因为缺保质期”。
- **一次写入**：所有阻断项清零才允许写入。

### 7.2 校验清单

| 类别 | 校验 | 级别 | 说明 |
|---|---|---|---|
| 名称 | 名称必填、≤200 字 | 阻断 | 空名称不能建档 |
| 名称 | 名称结尾带剂型词（胶囊/片/粉剂…） | 提醒 | 建议只写物质名；可确认后继续 |
| 基本 | 品牌/规格/渠道长度 | 阻断 | 按现有 DTO 限制 |
| 单位 | 物理形态 → 基准单位一致：粉=G、液体=ML、胶囊/片=PCS | 阻断 | 手填/ AI 都要过 |
| 单位 | 展示单位与基准单位 1:1（粒/片/胶囊/平勺 ↔ PCS；g ↔ G；ml ↔ ML） | 阻断 | 复用上架页 `isSupplementUnitOneToOne`，但该函数当前不认“胶囊”，需扩展别名并回归上架/报价/下单/预占/分装 |
| 单位 | “份” | 阻断/提醒 | “份”不是 1:1 单位，补剂展示单位不应提供；旧数据兼容，但新草稿不允许选 |
| 单位 | PCS 的每份量必须是正整数 | 阻断 | 胶囊不能 1.5 粒 |
| 单位 | 粉/液体每份量 > 0，可小数 | 阻断 | 0.9 g / 2.5 ml |
| 营养 | 至少一个营养素 > 0 | 阻断 | 全 0 等于没营养 |
| 营养 | 营养素字段必须在目录内 | 阻断 | 不允许自造字段 |
| 营养 | 营养素值 ≥ 0、有限数 | 阻断 | 空/负/NaN 拒绝 |
| 营养 | 每粒值 = 每份 ÷ 每份量（服务端算） | 阻断 | 不再接收客户端每粒值 |
| 营养 | 默认目标至少 1 个，且来自有值的营养素 | 阻断 | 空目标不能建档 |
| 采购 | 采购单位必填 | 阻断 | |
| 采购 | 换算倍数 > 0 | 阻断 | |
| 采购 | 采购价 > 0 | 阻断 | 无法计价 |
| 采购 | 生产损耗率 1–2 | 阻断 | |
| 标签 | 标签分类必选 | 阻断 | 合规字段 |
| 标签 | 标签名称至少 1 个 | 阻断 | |
| 标签 | 标签名称在目录内 | 提醒 | 完全一致/规范化后一致 → 通过；找不到 → 列候选，人确认后可用；**不判断适用性** |
| 标签 | 目录候选 | 提醒 | 只把“完全相同/规范化后相同”算候选；子串匹配只作建议，不能因为“有几百条子串”就判阻断 |
| 标签 | 添加时机必须是允许值 | 阻断 | |
| 上架 | 上架=开 时，保质期必填 | 阻断 | |
| 上架 | 上架=开 时，物理形态不能是液体 | 阻断 | 液体暂不支持分装 |
| 上架 | 上架=开 时，不能有 ERROR 体检项 | 阻断 | 复用 catalog issues |
| 上架 | 上架=关 时，不上架原因必选 | 阻断 | 四选一 |
| 上架 | 储存条件 | 提醒 | 影响标签印刷，不挡上架 |
| 上架 | 开盖后保质期（天） | 提醒 | 选填；标签写了就填，生产落点 `ingredient.opened_shelf_life_days` |
| 上架 | 商城总开关关闭 | 提醒 | 写入后顾客看不到，需去设置开 |
| DIY | DIY=开 时，购买链接必填且平台合法 | 阻断 | 没链接等于入口死路 |
| DIY | DIY=开 时，商品图片 | 提醒 | 影响制作单弹窗展示 |
| 采购 | 采购=开 时，采购单位/倍数/价格齐全 | 阻断 | 已在上面校验 |
| 采购 | 采购 SKU 未建 | 提醒 | 可用原料档案兜底，采购页会提示 |
| 等价组 | 选了组：组存在、active、是补剂组 | 阻断 | |
| 等价组 | 组未审核/只有 1 个成员 | 提醒 | 已归组但不参与替换 |
| 等价组 | 加入已审核组会把组打回 DRAFT | 提醒 | 审核屏默认勾选“本次一并审核通过”；取消则留在 DRAFT，替换暂不生效 |
| 等价组 | 还没选组 | 阻断 | 必须明确选一个组，或明确选“暂不归组”；不能沉默 |
| 等价组 | 暂不归组 | 提醒 | 缺货时无法替换 |
| 等价组 | 选了组但目标营养素浓度缺失/单位不一致 | 提醒 | 已归组但暂不参与替换；审核屏要能提前看到，不能等写入后才发现 |
| 等价组 | 等价组总开关关闭 | 提醒 | 功能不生效 |
| 配方 | 营养档案写入后必须 VERIFIED + 主映射 | 阻断 | 写入时保证 |
| 配方 | 默认目标写入后必须非空 | 阻断 | 写入时保证 |
| 证据 | 正面图/标签图 | 提醒 | 建议留档；没有也能手填，但事后无法回查。AI 完整起草要求两张都在 |
| 重复 | 同名+同品牌+同规格已存在 | 阻断 | 提示已有记录；改名/改规格或去已有记录 |
| 包材 | 没有匹配的袋型规则 | 提醒 | 写入后分装汇总会标红；给包材页入口 |

### 7.3 提醒项的确认

- 审核屏黄色提醒项必须逐条勾选“我知道了”，写入 `review.acknowledgedWarnings`。
- 阻断项不提供“仍然写入”；只能改数据或改开关意向。
- 若 AI 决定“上架=开”但硬校验不过，审核屏应显示“AI 想上架，但被 X 阻断”，并提供“让 AI 改成不上架/去补 X”两个动作；不能静默改。
- 提醒项 code 只允许来自 §7.2 的固定表；AI 的 warnings 只能引用固定 code，AI 自己造的 warning 只展示、不参与 finalize 门禁。
- 提醒项的确认要带“关键参数”（例如等价组 id、DIY 平台），存 `{ code, paramsHash }`，不能只记一个 code；改动会影响该提醒的字段后，对应确认自动失效，避免“确认了旧的、新的没看”。
- AI 重跑后清空所有提醒确认，重新逐条确认。

## 8. 最终写入

### 8.1 接口

`POST /api/v1/admin/ingredient-creation/supplement-drafts/:id/finalize`

- 入参：`{ expectedUpdatedAt?: string }`（可选乐观锁）
- 出参：

```ts
{
  ingredientId: string
  nutritionFoodId: string
  evidenceId: string
  verification: SupplementWriteVerification
}
```

### 8.2 前置校验

1. 草稿存在、属于当前用户、status=DRAFT。
2. **重复建档预检先做**：同名+同品牌+同规格已存在 → 409，带已有 `ingredientId`/名称，不写。`validate` 里的 `DUPLICATE_INGREDIENT` 阻断项只给审核页展示，不能把它变成 400。
3. 重跑 `validate`：除重复项外的阻断项为 0；提醒项都已在 `acknowledgedWarnings`。
4. 计算派生值：每粒值、单位成本、营养档案、默认目标、组优先级。
5. 校验组、标签、DIY、采购、上架依赖。

### 8.3 事务

实现上把现有 `SupplementIngredientService.create` 拆成 `buildCreateData()` + `createInTransaction(tx, input)`：旧 `POST /supplements` 继续用同一个事务内函数，新 `finalize` 也用同一个，避免两套建档逻辑分叉。新的 `SupplementDraftService` 负责草稿 CRUD，`SupplementFinalizeService` 负责校验、事务编排和核验。

一个 Prisma `$transaction` 内：

1. **原料** `ingredient.create`
   - `type=SUPPLEMENT`
   - 基本字段：name/brand/productModel/purchaseChannel/baseUnit/unitDisplayLabel/physicalForm/purchaseUnit/purchaseToBaseRatio/currentPricePerPurchaseUnit/diyEnabled/procurementEnabled/shelfLifeMonths/storageCondition/isOilBased/supplementRetailEnabled/equivalenceGroupId/equivalencePriority
   - `nutritionProfile`：由服务端按每份值折算后的完整档案
     - **基准口径按 baseUnit 写**：
       - PCS → `PER_SERVING`（按 1 个单位记，`servingUnitLabel` 写粒/片/胶囊；`PER_1_PCS` 不是领域支持的 raw basis，recipe-designer 读路径会当成缺失）
       - G → `PER_1_G`
       - ML → `PER_1_ML`
     - 现有 `buildProfile` 统一写 `PER_SERVING`；粉/液体在补剂浓度解析里会因为没有 `servingWeightG` 被判定 `MISSING_SERVING_WEIGHT`，等价组/用量都可能用不了。这次 G/ML 改为 `PER_1_G`/`PER_1_ML`，PCS 保留 `PER_SERVING`（按 1 个单位记）。
   - `properties`：
     - `category_type: 'OTHER'`
     - `openedShelfLifeDays` 有值就写（可选）
   - 上架=开时 `no_sale_reason` 必须为 null；上架=关时必须有值（写入前校验）
     - DIY 关闭时保留 `purchase_link`/`image_url`（方便以后打开），只把 `diy_enabled` 写 false
     - `display_unit` / `serving_unit_label`：展示单位
     - `serving_units_per_dose`
     - `add_timing`
     - `production_loss_rate`
     - `label_category` / `label_names` / `label_name_source`
     - `tags`
     - `no_sale_reason`（不上架时）
     - `purchase_link` / `image_url`（DIY）
2. **营养档案** `nutrition_food.create`
   - `category=SUPPLEMENT`
   - `dataSource=MANUAL`
   - `externalId=SUPPLEMENT-MANUAL:<ingredientId>`
   - `nutritionData=profile`
   - `defaultSupplementTargets`
   - `status=VERIFIED`、`verifiedBy`、`verifiedAt`
   - 名称按“原料名（品牌 · 规格）”生成
   - 若存在同名无主孤儿档案：复用/更新（沿用现有逻辑）
3. **主映射** `nutrition_food_mapping.create`：`isPrimary=true`、`yieldRate=1`
4. **标签证据** `supplement_label_evidence.create`
   - `ingredientId` / `nutritionFoodId`
   - `productUrl` / `productName`
   - `servingUnitsPerDose`
   - `frontImageUrl` / `labelImageUrl` / `labelText`
   - `selectionSnapshot`：选品依据 + AI 决策日志（可选）
   - `conversionSnapshot`：每份值 + 每粒值 + 展示单位
5. **标签关联**：`ingredient_tag` 查/建 + `ingredient_tag_assignment` 建
6. **等价组**
   - 未选/暂不归组：不改
   - 选组：写 `equivalenceGroupId` + `equivalencePriority`
   - 如果组是 APPROVED：把组状态改回 DRAFT（与现有 `assign` 行为一致），写审计 `MEMBER_ADD`
   - 如果 `equivalence.reapproveGroup` 为 true（默认）：在同一事务里把组改回 APPROVED，写 `reviewedBy/reviewedAt` + 审计 `STATUS_CHANGE`；为 false 则留在 DRAFT，审核屏明确提示“替换暂不生效”
   - 归组前复用现有 `assertProductionLimit`；要一并审核通过时，复用 `buildApprovalErrors`，不满足审核条件就不允许“一并通过”
   - 未指定组内排序时，排在组末（现有 `nextPriorities` 的 max+1 口径）
   - 审计写 `supplement_equivalence_group_audit`
7. **草稿状态**：`status=FINALIZED`、`finalizedIngredientId`、`finalizedNutritionFoodId`、`finalizedEvidenceId`、`finalizedAt`
8. **写入审计**：`ingredient_creation_audit.create`（`proposals=aiSnapshot`、`changes=manualFields+值`）
9. **事务内回读校验**（见第 9 节）：读回 ingredient/nutrition/mapping/evidence/tags/group，逐项对比；不一致直接抛错，整个事务回滚。

### 8.4 事务后功能核验

事务提交后，再跑“功能就绪”检查（这些依赖其他服务的查询）：

- 上架清单里能查到，`supplementRetailEnabled` 与草稿一致，`issues` 无 ERROR，`readyToSell` 符合预期。
- 配方设计器的补剂候选里能查到（营养档案 VERIFIED + 主映射 + 默认目标）。
- DIY：`supplement-plan` 能返回购买链接/图片；`diyEnabled` 与草稿一致。
- 采购：采购需求里能查到这条原料（`procurementEnabled` 与价格/单位可用）。
- 等价组：组状态/成员/优先级符合草稿；若本应参与替换，`resolveConcentration` 不是 UNIT_MISMATCH。
- 包材：能匹配到袋型规则；没有则标提醒，不改变“数据已写入”的结论。
- 重复：没有第二条同名同规格。

核验报告写入草稿 `verification` 并返回。

功能核验失败时，草稿已经是 FINALIZED；给一个 `POST /:id/reverify` 只重跑功能核验、不再写数据，修复外部配置（如包材规则）后可以重新出报告。

### 8.5 失败语义

- 前置校验失败：400 + 结构化 blockers/warnings；不写任何数据；草稿不变。
- 事务内回读不一致：回滚；返回“未写入任何正式数据”；草稿保留；记日志。
- 事务提交成功但功能核验失败：返回 200 + `verification`，但 `verification.ok=false`；页面显示“数据已写入，以下功能未生效”，不显示“全部成功”；给修复入口。
- 重复：409 + 已有记录；草稿保留。
- 幂等：草稿已 FINALIZED 时，重复调用直接返回已有 ids + verification，不再写第二套。

## 9. 写入后核验

### 9.1 直接字段（事务内回读）

逐项对比草稿与库：

- 原料：name/brand/productModel/purchaseChannel/baseUnit/unitDisplayLabel/physicalForm/purchaseUnit/purchaseToBaseRatio/currentPricePerPurchaseUnit/diyEnabled/procurementEnabled/shelfLifeMonths/openedShelfLifeDays/storageCondition/isOilBased/supplementRetailEnabled/equivalenceGroupId/equivalencePriority
- properties：add_timing、production_loss_rate、label_category、label_names、label_name_source、tags、serving_units_per_dose、display_unit、no_sale_reason、purchase_link、image_url
- 营养档案：status VERIFIED、category SUPPLEMENT、defaultSupplementTargets、主映射、yieldRate；每个营养素值要**同时**核验 `nutrition_food.nutrition_data`（配方设计器读的）和 `ingredient.nutrition_profile`（浓度/等价组读的），任一处缺失或写错都算失败
- 证据：productUrl/frontImageUrl/labelImageUrl/labelText/servingUnitsPerDose/conversionSnapshot
- 标签关联：标签名集合
- 等价组：groupId/priority/组状态
- 草稿：status FINALIZED、ids

### 9.2 功能（事务后）

| 功能 | 核验 |
|---|---|
| 商城上架 | catalog item 存在；`supplementRetailEnabled` 符合；`issues` 无 ERROR；`readyToSell` 符合 |
| 配方可选 | 营养档案 VERIFIED + 主映射 + 默认目标；配方设计器补剂候选查询能查到 |
| DIY 推荐 | `diyEnabled` 符合；`properties.purchase_link.url` 存在（如果开）；`supplement-plan` 返回推荐商品 |
| 生产采购 | `procurementEnabled` 符合；采购需求查询能查到；采购单位/倍数/价格可用 |
| 等价替换 | 组存在/active；如应参与替换：组 APPROVED、成员 ≥2、目标营养素浓度解析 OK；否则明确“已归组但暂不参与替换” |
| 浓度解析 | `SupplementDosageService.resolveConcentration` 对草稿的目标营养素返回 OK（粉/液体重点验 `PER_1_G`/`PER_1_ML` 口径） |
| 分装 | 包材规则能匹配；不能匹配则提醒 + 包材页入口 |
| 无重复 | 同名同品牌同规格只有一条 |

### 9.3 报告形状

```ts
interface SupplementWriteVerification {
  ok: boolean
  checkedAt: string
  fields: Array<{
    key: string
    label: string
    expected: unknown
    actual: unknown
    ok: boolean
    /** 生产落点，如 ingredient.shelf_life_months / properties.add_timing */
    target: string
  }>
  features: Array<{
    code: 'RETAIL' | 'RECIPE' | 'DIY' | 'PROCUREMENT' | 'EQUIVALENCE' | 'PACKAGING' | 'DUPLICATE'
    label: string
    ok: boolean
    detail: string
    action?: { label: string; path: string }
  }>
}
```

## 10. 页面与交互

### 10.1 草稿列表

- 表格式/卡片式均可；建议表格，字段：名称、最后编辑、完成度、状态、操作。
- 完成度按“必填项已填/总必填项”算；不把提醒项算进去。
- 操作：继续、放弃。
- 新建按钮固定右上。
- 空状态：一句“还没有草稿”，一个“新建补剂”。

### 10.2 编辑页

- 顶部：
  - 返回草稿列表
  - 草稿名（可改）
  - 保存状态（保存中/已保存/保存失败）
  - “让 AI 起草/重填”
  - “最终审核”
- 左侧区块导航（8 个区块），右侧表单。
- 每个区块标题旁：完成度（已填/必填）、AI 没找到的项数。
- 字段行：
  - 标签 + 值 + 来源徽标（AI 读图/目录/规则/人改）
  - 缺失：红字“AI 没找到，请补”
  - 人改过：小标记“人改”
  - 有 AI 理由：问号/“看理由”
  - `LOW` 置信度：橙色标记，审核屏排在前面；它是“重点看”，不是硬阻断
- 底部固定：保存状态 + “最终审核” + “放弃草稿”。

### 10.3 AI 重填

- 仅重填未被人改过的字段；人改过的字段进入 diff。
- 决定（上架/归组/DIY/采购/标签名/默认目标）也进 diff，不能只 diff 普通字段。
- diff 弹窗：字段、AI 旧值、AI 新值、人选“采用新值/保留我的”。
- 重填不删除草稿里的其他内容。
- 重填失败：保留原草稿；提示失败原因；可重试。

### 10.4 最终审核

- 顶部三个状态卡：完整性、硬校验、功能就绪。
- “完整性”：必填项清单；缺失项可点跳转。
- “硬校验”：阻断项列表；每项“去改”。
- “提醒”：每条一个勾选；全部勾选后才能写入。
- “AI 决策”：每个决定一行：决定、理由、依据；可改。
- “写入后会写什么”：字段 → 生产落点表（只读）。
- 底部：`确认写入`（阻断项为 0 且提醒已确认才可点）。

### 10.5 写入成功

- 顶部“已写入并核验通过”或“已写入，但以下功能未生效”。
- 核验表：字段/功能、期望、实际、通过/不通过。
- 按钮：去原料库、去上架清单、去配方设计器、再建一条。
- 不通过项：给“去修复”的入口；修复后可在原料库/上架清单继续，不需要重跑整张草稿。

## 11. 接口

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/admin/ingredient-creation/supplement-drafts` | 我的草稿列表（DRAFT，按 updatedAt 倒序） |
| POST | `/admin/ingredient-creation/supplement-drafts` | 新建草稿 |
| GET | `/admin/ingredient-creation/supplement-drafts/:id` | 读草稿 |
| PATCH | `/admin/ingredient-creation/supplement-drafts/:id` | 自动保存（payload/name/manualFields） |
| DELETE | `/admin/ingredient-creation/supplement-drafts/:id` | 放弃（软删） |
| POST | `/admin/ingredient-creation/supplement-drafts/:id/ai-fill` | AI 起草/重填 |
| POST | `/admin/ingredient-creation/supplement-drafts/:id/validate` | 最终校验预览 |
| POST | `/admin/ingredient-creation/supplement-drafts/:id/finalize` | 一次性写入 + 核验 |
| GET | `/admin/ingredient-creation/supplement-drafts/:id/verification` | 重新读核验报告 |
| POST | `/admin/ingredient-creation/supplement-drafts/:id/reverify` | 只重跑功能核验（不写数据） |
| POST | `/admin/ingredient-creation/supplement-drafts/:id/recommend-groups` | 草稿态等价组推荐（无 ingredientId，按草稿营养/单位/形态算） |

复用现有接口：

- 图片上传：`ingredientApi.uploadIngredientDiyImage`
- 商品链接预览：`ingredientCreationApi.previewSupplementLink`
- 目录/推荐：`supplementEquivalenceApi.listGroups/recommend`
- 配置：`supplementShopApi.getConfig`
- 试算：`supplementShopApi.quotePreview`
- 营养字段目录：`supplementNutrientGroups`

权限：沿用 `AuthGuard + AdminGuard`；草稿按 `createdBy` 过滤，不能读别人的草稿。

## 12. 字段覆盖矩阵

> 这张表是“完整性 + 映射 + 核验”的唯一清单。实现时每个字段都要有：AI 能否填、是否必填、生产落点、校验、写入后核验。

### 12.1 原料基本

| 字段 | AI | 必填 | 生产落点 | 校验/备注 |
|---|---|---|---|---|
| 原料名称 | 是 | 是 | `ingredient.name` | 非空、≤200；剂型词提醒 |
| 品牌 | 是 | 否 | `ingredient.brand` | ≤100 |
| 产品规格 | 是 | 否 | `ingredient.product_model` | ≤100 |
| 采购渠道 | 是 | 否 | `ingredient.purchase_channel` | ≤200 |
| 基准单位 | 是 | 是 | `ingredient.base_unit` | PCS/G/ML；与剂型一致 |
| 展示单位 | 是 | 是 | `ingredient.unit_display_label` | 与基准单位 1:1；“胶囊”要加入 PCS 别名，“份”不作为展示单位 |
| 物理形态 | 是 | 是 | `ingredient.physical_form` | 粉/片/胶囊/液体 |
| 每份多少 | 是 | 是 | `ingredient.properties.serving_units_per_dose` | PCS 正整数；粉/液体 >0 小数 |
| 采购单位 | 是 | 是 | `ingredient.purchase_unit` | 非空 |
| 换算倍数 | 是 | 是 | `ingredient.purchase_to_base_ratio` | >0 |
| 当前采购价 | 是 | 是 | `ingredient.current_price_per_purchase_unit` | >0 |
| 生产损耗率 | 是/默认 1.05 | 是 | `ingredient.properties.production_loss_rate` | 1–2 |
| 开盖后保质期（天） | 是 | 否 | `ingredient.opened_shelf_life_days` | 标签写了才填 |
| 添加时机 | 是 | 是 | `ingredient.properties.add_timing` | 允许值 |

### 12.2 营养

| 字段 | AI | 必填 | 生产落点 | 校验/备注 |
|---|---|---|---|---|
| 每份含量 | 是 | 至少 1 项 >0 | `ingredient.nutrition_profile` + `nutrition_food.nutrition_data` | 字段在目录；≥0；服务端折每粒 |
| 每份多少 | 是 | 是 | `ingredient.properties.serving_units_per_dose` + `supplement_label_evidence.serving_units_per_dose` | **证据表当前是 Int，必须改成 Float/Decimal**，否则粉 0.9 g / 液 2.5 ml 写不进去 |
| 基准口径 | 服务端 | 是 | `ingredient.nutrition_profile.meta.rawBasisType` | PCS→PER_SERVING（按 1 个单位记）、G→PER_1_G、ML→PER_1_ML；不要统一 PER_SERVING |
| 每粒值 | 否（服务端算） | — | 同上 | 每份 ÷ 每份量；不接收客户端值 |
| 默认目标营养素 | 是 | 是 | `nutrition_food.default_supplement_targets` | ≥1；来自有值营养素 |
| 标签原文 | 是 | 否 | `supplement_label_evidence.label_text` | 证据留档 |

### 12.3 标签/合规

| 字段 | AI | 必填 | 生产落点 | 校验/备注 |
|---|---|---|---|---|
| 标签分类 | 是 | 是 | `ingredient.properties.label_category` | FEED_MATERIAL/FEED_ADDITIVE |
| 标签名称 | 是 | 是 | `ingredient.properties.label_names` | 两本目录只用来查规范名；不判断适用性 |
| 标签名称依据 | 是 | 否 | `ingredient.properties.label_name_source` | 说明 |
| 标签分类标签 | 是 | 是 | `ingredient.properties.tags` + `ingredient_tag_assignment` | 允许词表 |

### 12.4 上架/商城

| 字段 | AI | 必填 | 生产落点 | 校验/备注 |
|---|---|---|---|---|
| 是否上架 | 是 | 是 | `ingredient.supplement_retail_enabled` | 上架=开时保质期/形态/单位/价格/无 ERROR |
| 原厂保质期 | 是 | 上架=开时是 | `ingredient.shelf_life_months` | >0 |
| 储存条件 | 是 | 提醒 | `ingredient.storage_condition` | ≤200 |
| 开盖后保质期（天） | 是 | 提醒 | `ingredient.opened_shelf_life_days` | 标签写了才填 |
| 内容物油性 | 是 | 是 | `ingredient.is_oil_based` | 布尔 |
| 不上架原因 | 是 | 上架=关时是 | `ingredient.properties.no_sale_reason` | 四选一 |
| 商城总开关 | 配置 | — | `supplement_shop_config.enabled` | 提醒 |
| 等价组总开关 | 配置 | — | `supplement_shop_config.equivalence_enabled` | 提醒 |

### 12.5 DIY

| 字段 | AI | 必填 | 生产落点 | 校验/备注 |
|---|---|---|---|---|
| 是否用于 DIY | 是 | 是 | `ingredient.diy_enabled` | 布尔 |
| 购买平台 | 是 | DIY=开时是 | `ingredient.properties.purchase_link.platform` | 允许值 |
| 购买链接 | 是 | DIY=开时是 | `ingredient.properties.purchase_link.url` | 非空 |
| 商品图片 | 是 | 提醒 | `ingredient.properties.image_url` | 可空 |
| 推荐商品 | 否 | — | `recommended_product`（仅 FOOD） | 补剂不适用；DIY 用 properties 兜底 |

### 12.6 采购/生产

| 字段 | AI | 必填 | 生产落点 | 校验/备注 |
|---|---|---|---|---|
| 是否用于生产/采购 | 是 | 是 | `ingredient.procurement_enabled` | 布尔 |
| 采购单位/倍数/价格 | 是 | 采购=开时是 | 同 12.1 | 采购需求可用 |
| 采购 SKU | 可建议 | 提醒 | `procurement_sku` | 可选；没有也能用原料档案 |

### 12.7 等价组

| 字段 | AI | 必填 | 生产落点 | 校验/备注 |
|---|---|---|---|---|
| 归组/暂不归组 | 是 | 是 | `ingredient.equivalence_group_id` | `__SKIP__` 显式表态 |
| 组内优先级 | 是 | 否 | `ingredient.equivalence_priority` | 0 最前 |
| 组状态 | 查 | — | `supplement_equivalence_group.status` | 参与替换需 APPROVED |
| 加入已审核组的处理 | 决定 | — | 组状态 + 审计 | 默认打回 DRAFT，随后默认一并审核通过；可取消 |
| 组审计 | — | — | `supplement_equivalence_group_audit` | MEMBER_ADD / STATUS_CHANGE |

### 12.8 证据/审计

| 字段 | AI | 必填 | 生产落点 | 校验/备注 |
|---|---|---|---|---|
| 正面图 | 是 | 提醒 | `supplement_label_evidence.front_image_url` | 留档 |
| 标签图 | 是 | 提醒 | `supplement_label_evidence.label_image_url` | 留档 |
| 商品链接 | 是 | 否 | `supplement_label_evidence.product_url` | ≤500 |
| 选品依据 | 人/DSH | 否 | `supplement_label_evidence.selection_snapshot` | 原样存 |
| 折算快照 | 服务端 | 是 | `supplement_label_evidence.conversion_snapshot` | 每份/每粒/单位 |
| AI 提案/人改 | — | 是 | `ingredient_creation_audit` | proposals/changes |

### 12.9 功能就绪

| 功能 | 依赖 | 核验 |
|---|---|---|
| 商城上架 | 上架开关 + 保质期 + 形态 + 单位 + 价格 + 无 ERROR | catalog item / readyToSell |
| 配方可选 | 营养档案 VERIFIED + 主映射 + 默认目标 | 配方设计器补剂候选 |
| DIY 推荐 | diyEnabled + purchase_link.url | supplement-plan 推荐商品 |
| 生产采购 | procurementEnabled + 采购字段 | 采购需求 |
| 等价替换 | groupId + APPROVED + 成员≥2 + 浓度可解析 | 组详情/浓度解析 |
| 分装 | 包材规则匹配 | packing summary |

## 13. 迁移与兼容

- 新增 `supplement_creation_draft` 表和枚举。
- **必须改 `supplement_label_evidence.serving_units_per_dose` 的类型**：当前 schema 是 `Int`，而粉/液体每份是 0.9 g / 2.5 ml。写入 `0.9` 时 Prisma 会拒绝或截断，导致粉/液体建档在证据那一步失败。改成 `Float` 或 `Decimal(10,4)`，配 migration 和测试；旧的整数数据不受影响。
- 同一条迁移要覆盖旧 `POST /supplements` 路径：它现在也把 0.9 写进这个 Int 列；不修的话，旧接口对粉/液体同样是坏的。
- 旧 Web 页面（两段式）保留一个版本，用开关控制：
  - 后端 env `SUPPLEMENT_DRAFT_FLOW=true`、admin-web 构建变量 `VITE_SUPPLEMENT_DRAFT_FLOW=true` 时新页面走草稿；
  - 两边同值，默认关；验证通过后再开；关闭时回旧流程。
- 旧的 `sessionStorage` 快照 `supplement-flow-v4` 不再使用；上线时清掉即可（不影响正式数据）。
- 旧的 `POST /supplements` 保留，供旧客户端/回滚；新流程只调 `finalize`。
- 已有补剂原料不迁移；仍用现有上架清单/原料库。
- 不在本期做数据回填。

## 14. 测试

### 14.1 后端

- 草稿 CRUD：创建/读取/保存/列表过滤/放弃/权限。
- AI 起草：字段解析、单位换算、缺失项、决策理由、重跑不覆盖人改。
- 校验：每条阻断/提醒；PCS 整数；单位 1:1；目录规范名；重复；组状态；DIY/采购依赖。
- 最终写入：
  - 成功：所有表写入 + 回读一致 + 草稿 FINALIZED + 审计。
  - 事务失败：无半成品，草稿保留。
  - 重复：409，不写。
  - 幂等：重复 finalize 不建第二套。
  - 组：加入 APPROVED 组打回 DRAFT + 审计；`reapproveGroup` 时同事务审核通过。
- 核验：字段/功能报告；人为制造不一致时 `ok=false`。
- 回归：旧 `POST /supplements` 仍可用。

### 14.2 前端

- 草稿列表：空状态/继续/放弃/不自动打开。
- 编辑页：AI 填、缺失标记、人改标记、自动保存、重跑 diff。
- 最终审核：阻断项禁写、提醒项勾选、字段映射、决策日志。
- 写入：成功/失败/功能未生效三种状态。
- 组件测试建议引入 `@vue/test-utils` + `jsdom`（当前 admin-web 只有纯逻辑测试）。
- E2E/手工：按第 15 节清单走一遍。

### 14.3 必测场景

1. AI 填了每粒值后，人改每份值 → 不被拦；保存后档案用新值。
2. 清空某营养素 → 提交载荷不含它；档案不含旧值。
3. 重新读图/重跑 AI → 人改过的字段不被覆盖；给 diff。
4. 写入后返回 → 不再显示“待验证”；显示真实核验。
5. 放弃草稿 → 列表消失；正式库无记录。
6. 重复建档 → 409 + 已有记录；草稿保留。
7. 上架=开但缺保质期 → 阻断；补后通过；写入后开关真的开。
8. 等价组加入已审核组 → 打回 DRAFT；选择一并审核 → APPROVED；核验通过。
9. DIY=开但没链接 → 阻断；补链接后写入；supplement-plan 能返回。
10. 采购=开但没价格 → 阻断；补后写入；采购需求能查到。
11. 包材无匹配 → 提醒；写入成功但功能核验标提醒。
12. 写入失败（模拟事务异常）→ 无正式记录；草稿还在。
13. 粉剂每份 0.9 g / 液体 2.5 ml → 证据表能写入并读回 0.9/2.5（不是 0/1）；营养档案基准是 PER_1_G/PER_1_ML；浓度解析 OK。

## 15. 上线前手工验收清单

- [ ] 草稿列表不自动打开上一张。
- [ ] 新建 → AI 起草 → 8 个区块都有内容/缺失标记。
- [ ] 人改一个字段 → 显示“人改” → 刷新后还在。
- [ ] AI 重跑 → 人改字段不被覆盖。
- [ ] 最终审核：完整性、硬校验、提醒、决策理由、字段映射都能看到。
- [ ] 有阻断项时“确认写入”不可点。
- [ ] 提醒项未勾选时不可写入。
- [ ] 写入成功：核验表全部通过；原料库/上架清单/配方设计器能查到。
- [ ] 写入后：上架/DIY/采购/等价组开关与草稿一致。
- [ ] 写入后：如果没有包材规则，能看到提醒和入口。
- [ ] 放弃草稿：列表消失、正式库无记录。
- [ ] 刷新/关页/第二天：草稿还在，能继续。
- [ ] 重复建档：有明确提示和已有记录入口。

## 16. 风险与待拍板

### 16.1 已做的调用（可推翻）

1. 草稿存服务端、按创建人私有；不复用食材草稿表。
2. 放弃 = 软删除（列表不可见），保留审计。
3. 最终写入一个事务；直接字段事务内回读，功能核验事务后。
4. AI 拿不到的数据不猜，标缺失；不因为“AI 做主”就编数据。
5. 上架/DIY/采购开关是草稿意向；依赖不齐时阻断，不静默关。
6. 加入已审核等价组默认打回 DRAFT；最终审核默认勾选“本次一并审核通过”，可取消。
7. 本期只做新建补剂；已有补剂仍走现有页面。
8. 包材规则不自动创建；只做匹配检查和提醒。
9. 写入前校验和写入后核验共用同一套纯函数；草稿阶段不依赖 `ingredientId`。
10. 必须改证据表的 `serving_units_per_dose` 类型，否则粉/液体每份小数写不进去。
11. 营养档案的 `rawBasisType` 按 baseUnit 写（PCS/G/ML），不要统一 `PER_SERVING`；否则粉/液体浓度解析会失败。
12. `isSupplementUnitOneToOne` 增加“胶囊”别名；“份”不作为补剂展示单位；同步回归上架/报价/下单/预占/分装。
13. 提醒项 code 固定来自 §7.2；AI 只能引用，不能自造；AI 重跑清空已确认。
14. 目录只查规范名，不看适用性/dogAllowed；AI 和 finalize 都不拿它做门禁或提醒。
15. 提醒项确认带关键参数；字段改动会让对应确认失效。
16. 功能核验失败时提供 `reverify`，不再重复写入。

### 16.2 关键产品决定（已确认）

1. **目录适用性**：目录只用来查“名字是否规范”，**完全不考虑是否允许用于犬/适用范围**。`dogAllowed`/`scope` 字段保留但不用；AI 和 finalize 都不拿它做门禁或提醒。
   - 背景：454 条里只有 107 条明确写“犬/狗”，347 条没写；这不代表禁用。若硬拦，牛磺酸、维生素A/D3/E、硫酸锌等常用原料都会加不进去。
2. **AI 建议“不建档”**：允许 AI 在草稿里给出“不建议建档”的结论和理由，但**不自动丢弃草稿**；由人决定放弃或继续。这样既让 AI 做主，又保留最后审核权。
3. **等价组一并审核通过**：允许最终写入时一并审核通过；审核屏默认勾选，可取消；写审计。
4. **已有补剂原料**：本期不做迁移；已有原料仍走现有上架清单/原料库；下一期再评估。

## 17. 分期

### 第 1 期（必须）

- 草稿表 + 列表 + 编辑页 + 自动保存 + 放弃
- AI 起草（复用现有读图/链接 + 决策调用）
- 最终校验 + 最终审核屏 + 一次性写入 + 直接字段回读
- 功能核验（上架/配方/DIY/采购/等价组）
- 旧流程开关回滚

### 第 2 期（可后置）

- 包材匹配提醒/入口
- AI 重跑 diff 的细化（逐字段选择）
- 草稿审计查看页
- 已有补剂迁移

## 18. 附：现有代码定位

- 旧建档页：`admin-web/src/views/Ingredients/ai-agent/supplement/steps/ArchiveStep.vue`
- 旧上架页：`admin-web/src/views/Ingredients/ai-agent/supplement/LaunchConfigStep.vue`
- 旧流程壳：`SupplementFlow.vue` / `supplementFlowState.ts`
- 旧门禁：`supplementGates.ts` / `supplementFormState.ts`
- 后端建档：`backend/src/application/ingredient-creation/supplement-ingredient.service.ts`
- 读图/解析：`supplement-label-intake.service.ts` / `supplement-label-parser.ts` / `supplement-label-analysis.ts`
- 上架体检：`backend/src/application/supplement-shop/supplement-catalog.service.ts`
- 等价组：`supplement-equivalence.service.ts`
- DIY：`supplement-plan.service.ts`（properties.purchase_link/image_url）
- 采购：`purchasing.service.ts`（原料字段兜底 + ProcurementSku 可选）
- 包材：`supplement-packaging.service.ts`
- 表结构：`backend/prisma/schema.prisma`（Ingredient / NutritionFood / SupplementEquivalenceGroup / SupplementLabelEvidence / SupplementPackagingRule）
