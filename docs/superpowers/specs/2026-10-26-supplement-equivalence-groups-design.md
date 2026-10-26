# 补剂原料等价组（P2）设计

> 日期：2026-10-26
> 状态：业务口径已确认，待实施
> 关联：`docs/superpowers/specs/2026-10-24-custom-recipe-delivery-redesign-design.md`（D4/D8）、`docs/superpowers/plans/2026-10-24-custom-recipe-delivery-program.md`（P2）、`docs/superpowers/plans/2026-10-25-page-audit-backlog.md`

## 1. 目标

把“可以互相替代的补剂原料”从每道食谱里搬出来，改成原料层的一套分组：

1. 后台一次维护、全库复用；
2. 食谱设计器能看到某条补剂属于哪组、同组还能换什么；
3. DIY 制作单按“组 + 可售状态”生成候选项；
4. 顾客只选“换哪个原料”，**用量和价格全部由后端算**；
5. 订单/交付快照能追溯：目标成分、被选原料、浓度、换算用量、组与审核状态。

本设计取代逐食谱配置“替代补剂”的旧机制。旧表在验收通过后删除。

## 2. 已确认的业务口径

| # | 口径 | 结论 |
|---|---|---|
| 1 | 场景 | 两个都要：顾客 DIY 换品牌/规格；我们采购/分装缺货换同营养原料。采购侧第二期接，数据结构一次到位 |
| 2 | 分组维度 | **营养素 × 形态/来源**。钙分“矿物盐/骨源”，锌分“有机盐/螯合”，碘分“天然/盐类”；同组可换，跨组不换 |
| 3 | 物理形态/计量单位 | 允许粉/片/胶囊同组，只要**有效成分单位一致**；换算后各按自己的单位显示（g/片/粒），界面标形态 |
| 4 | 审核 | 管理员（老板）签字。后台记录审核人、日期、依据；未签字不上线 |
| 5 | 覆盖范围 | 35 种补剂原料全部归组；未来品类（关节/益生菌等）通过“自定义有效成分”支持，不改代码 |
| 6 | 用量权威 | **后端唯一算**。新版本客户端只提交“这条补剂选了哪个原料”，不提交用量 |
| 7 | 旧机制 | **先兜底、后迁移、再删除**。2026-10-26 部署前线上核对：`recipe_supplement_alternative` 不是 0，而是 **261 条**。新候选在“没有可用组”时继续读旧配置兜底；261 条逐条处理完（人工归组/确认不再需要）后才删表 |
| 8 | 采购/缺货建议 | 第二期；本期只做“可替代候选”的解析能力 |
| 9 | 小程序发布 | 只上传体验版，正式版不动；真实顾客暂时看不到新候选 |

### 2.1 非目标

- 不按名称/品牌自动合并原料。
- 不自动修改顾客订单、不自动改采购单。
- 不做主食材替换。
- 不把自定义成分纳入 FEDIAF/NRC 营养达标评估。
- 不做顾客自带/自购补剂（无法分装、无浓度档案）。
- 液体补剂不进入顾客候选（不能分装）。

## 3. 不变量

1. 一个原料最多归属一个组（`Ingredient.equivalenceGroupId` 单值）。
2. 一个组只有一个目标营养素 key + 单位。
3. 只有 `APPROVED` + `isActive` + 总开关 `equivalenceEnabled` 打开时，组才参与替换。
4. 跨组不换；组内成员按 `equivalencePriority` 排序，第一个是“参考原料”。
5. 候选必须对**该食谱行的每一个目标**都算得出浓度；缺一个就不作为候选（防少补）。
6. 顾客侧候选必须 `diyEnabled && supplementRetailEnabled`，且非液体、展示单位与基准单位 1:1。
7. 新版本下单不提交用量；`amount` 由服务端按配方、批次总重、被选原料浓度计算。
8. 已审核组被修改（成员/营养素/单位）时自动退回 `DRAFT`，必须重新审核。
9. 每次组变更写审计记录，不允许静默改。

## 4. 数据模型

### 4.1 新增表

```prisma
enum SupplementEquivalenceStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  DISABLED
}

model SupplementEquivalenceGroup {
  id              String   @id @default(uuid())
  code            String   @unique @db.VarChar(64)
  name            String   @db.VarChar(100)
  /// 标准营养素用 fieldPath（如 minerals.calcium）；自定义成分为 custom:<规范化名称>
  nutrientKey     String   @map("nutrient_key") @db.VarChar(100)
  nutrientLabel   String   @map("nutrient_label") @db.VarChar(50)
  nutrientUnit    String   @map("nutrient_unit") @db.VarChar(20)
  /// 形态/来源（矿物盐、骨源、螯合、天然…），人读+筛选，不做硬限制
  formCategory    String?  @map("form_category") @db.VarChar(50)
  description     String?
  rationale       String?
  /// 依据：URL 或可点开的文献条目
  evidenceUrls    Json?    @map("evidence_urls")
  status          SupplementEquivalenceStatus @default(DRAFT)
  reviewedBy      String?  @map("reviewed_by") @db.VarChar(100)
  reviewedAt      DateTime? @map("reviewed_at")
  reviewNote      String?  @map("review_note")
  isActive        Boolean  @default(true) @map("is_active")
  sortOrder       Int      @default(0) @map("sort_order")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  ingredients     Ingredient[]
  auditLogs       SupplementEquivalenceGroupAudit[]

  @@index([nutrientKey])
  @@index([status])
  @@index([isActive])
  @@map("supplement_equivalence_group")
}

model SupplementEquivalenceGroupAudit {
  id           String   @id @default(uuid())
  groupId      String   @map("group_id")
  action       String   @db.VarChar(30)
  changes      Json?
  operatorId   String?  @map("operator_id")
  operatorName String?  @map("operator_name") @db.VarChar(100)
  createdAt    DateTime @default(now()) @map("created_at")
  group        SupplementEquivalenceGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@index([groupId, createdAt])
  @@map("supplement_equivalence_group_audit")
}
```

### 4.2 改现有表（全部可空/有默认值，不动老数据）

| 表 | 字段 | 说明 |
|---|---|---|
| `ingredient` | `equivalence_group_id` (String?, index, onDelete SetNull) | 所属组 |
| `ingredient` | `equivalence_priority` (Int, default 0) | 组内顺序；0 优先，第一个=参考原料 |
| `diy_sheet` | `supplement_selections` (Json?) | 顾客选择存档：recipeItemId/ingredientId/amount/unit/浓度/来源 |
| `supplement_shop_config` | `equivalence_enabled` (Boolean, default false) | 总开关 |
| `supplement_order_item` | `recipe_item_id` (String?) | 对应的食谱行 |
| `supplement_order_item` | `source_ingredient_id` (String?) | 食谱原原料 |
| `supplement_order_item` | `dosage_snapshot` (Json?) | 目标/浓度/服务端算量/提交量/来源/组 |

`recipe_supplement_alternative` 本期保留，验收通过后删除。

### 4.3 迁移

一次 migration，名称 `20261026_supplement_equivalence_group`。只加表/列/索引，不 backfill。

## 5. 浓度与用量解析

新增 `backend/src/application/supplement-shop/supplement-dosage.service.ts`（纯计算，不依赖 Prisma）。

### 5.1 浓度来源顺序

1. `nutritionProfile`（v2）：标准字段按 `meta.rawBasisType` 折算；派生字段用领域目录的 `getNutritionProfileFieldValue`（支持 `derived.epaDha` 求和、`derived.caP` 比值）；
2. `nutritionProfile.items[]`（旧格式）：按 `nutrientCode/nutrientName` 匹配，按 `basisType` 折算；
3. `properties.active_nutrients`：键可为 fieldPath / label / 旧中文 key，值即浓度；
4. `nutritionProfile.customItems[]`：自定义成分，按规范化名称匹配，按条目自身 `rawBasisType`（缺省用 profile 的）折算。

### 5.2 基准折算

| rawBasisType | 折算 |
|---|---|
| `PER_100_G` / `PER_100_ML` | value ÷ 100 |
| `PER_1_G` / `PER_1_ML` | value |
| `PER_SERVING` | value（每 1 份/粒/片） |

不认识的显式 basis → 视为缺失（与小程序现有 `hasUnsupportedExplicitRawBasisType` 一致）。

### 5.3 单位归一

`μg/ug/mcg/µg → μg`；`IU/iu → IU`；`mg/MG → mg`；`g/G → g`；`ml/mL → mL`。其他单位只做大小写/空格归一，不做系数换算（`亿CFU` 与 `CFU` 不自动换算）。

### 5.4 公式

```text
kg = 批次总重g / 1000
某目标需要量 = 目标值(每kg) × kg
该原料某目标用量 = 需要量 ÷ 浓度
总用量 = max(各目标用量)      // 满足全部目标
```

- 顾客侧不乘损耗；采购/备料才乘（第二期）。
- 多目标取 max；任一目标缺浓度 → `MISSING_CONCENTRATION`，`amount: null`；候选直接排除。
- 无目标 → `NO_TARGETS`；服务端用 `recipeItem.ratioPercent × 批次总重 / 100` 兜底（固定比例补剂），
  没有 ratio 就 400。**新路径任何情况下都不接受客户端 amount。**
- 单位不一致 → `UNIT_MISMATCH`，候选排除。
- `PER_SERVING` 且库存按克记：有 `meta.servingWeightG` 就换算成“每克”；没有就拒绝（不猜密度/份重）。

### 5.5 输出

```ts
interface SupplementDosageResult {
  status: 'OK' | 'NO_TARGETS' | 'MISSING_CONCENTRATION' | 'UNIT_MISMATCH';
  amount: number | null;
  unit: string;
  targets: Array<{ fieldPath: string; label: string; unit: string; targetValuePerKg: number }>;
  concentrations: Array<{ fieldPath: string; value: number; unit: string }>;
  missingFieldPaths: string[];
}
```

## 6. 候选解析

新增 `backend/src/application/supplement-shop/supplement-candidate.service.ts`。

### 6.1 规则

1. 读取食谱行、原原料、该行 `supplementTargets`、组（若有）。
2. 组可用（`equivalenceEnabled` + `APPROVED` + `isActive` + 成员数 ≥ 2）→ 候选 = 组成员；
   没有可用组 → **先回退到旧逐食谱替代**（`RECIPE_ALTERNATIVE`，2026-10-26 线上仍有 261 条）；
   旧配置也没有 → 候选 = 原原料（`DEFAULT_ONLY`）。
3. 顾客侧过滤：`diyEnabled`、`supplementRetailEnabled`、非 `LIQUID`、展示单位与基准单位 1:1、`dosage.status === 'OK'`。
4. 组成员按 `equivalencePriority`、`name` 排序；原原料标 `isDefault`。
5. 原原料不可售但组内有可售成员时，默认选中第一个可售成员；一个可售都没有时返回原原料 + `unavailableReason`，前端显示“暂时买不到，找 Seven爸爸”。
6. 返回每个候选的 `dosage`，以及整条补剂的 `defaultIngredient.dosage`（原原料，即使不可售，用于制作单展示）。

### 6.2 响应

```ts
interface SupplementCandidateItem {
  recipeItemId: string;
  sourceIngredientId: string;
  source: 'EQUIVALENCE_GROUP' | 'DEFAULT_ONLY';
  group: { id: string; code: string; name: string; status: string } | null;
  defaultIngredient: {
    ingredientId: string; name: string; displayUnit: string;
    physicalForm: string | null; diyEnabled: boolean; supplementRetailEnabled: boolean;
    dosage: SupplementDosageResult;
  };
  candidates: Array<{
    ingredientId: string; name: string; brand: string | null; productModel: string | null;
    purchaseChannel: string | null; purchaseLink: unknown; imageUrl: string | null;
    physicalForm: string | null; displayUnit: string;
    isDefault: boolean; selectable: boolean; unavailableReason: string | null;
    dosage: SupplementDosageResult;
  }>;
  unavailableReason: string | null;
}
```

## 7. 接口

### 7.1 顾客侧

`GET /api/v1/recipes/:id/supplement-candidates`

Query：`totalWeightG`（必填，>0）、`diySheetId?`、`orderId?`、`shareToken?`。
- 复用 `recipes.controller.ts` 的 `getAccessibleRecipe` 权限逻辑；声明在 `@Get(':id')` 之前。
- 若给 `diySheetId`：校验归属，优先用制作单的 `packagePlan`/`dailyIntakeG×cycleDays` 算批次总重（`weightSource: DIY_SHEET`）；否则用 query 的 `totalWeightG`（`weightSource: QUERY`）。
- 总开关关闭时返回 `source: DEFAULT_ONLY` + 原原料。

### 7.2 报价/下单

`SupplementQuoteRequestDto` 增加可选 `diySheetId`；`SupplementQuoteLineDto` 增加可选 `recipeItemId`，`amount` 改为可选。

- 所有行都带 `recipeItemId` → 新路径：要求 `diySheetId`，服务端解析食谱行 + 被选原料，算出 `amount`；忽略客户端 `amount`。
- 所有行都不带 → 旧路径：保持现状（`amount > 0`）。
- 混用 → 400。
- 新路径必须复核资格：提交的 `ingredientId` 只能是该食谱行的原原料、该行所属组的
  `APPROVED + isActive` 成员，或旧逐食谱替代里的成员；总开关关闭、组停用、成员不可售/浓度不齐 → 400
  `该补剂已调整，请刷新制作单`。不允许客户端把任意补剂塞进某一行。
- 新旧路径都按 `SupplementOrderItem`（每个 ingredient 一行）落库：同一 ingredient 的多行金额合并，
  但 `dosageSnapshot.lines[]` 保留每一行（recipeItemId/sourceIngredientId/目标/浓度/算量）。
  单值列 `recipe_item_id`/`source_ingredient_id` 存第一行，仅作展示/检索。
- `buildQuote` 是报价和下单共用入口，改在这里，两条路径都生效。
- 新路径的报价返回 `requestedAmount = 服务端算量`；下单落 `SupplementOrderItem.requestedAmount`。
- 旧路径不改行为；若请求带 `diySheetId`，可顺手重算并写入 `dosage_snapshot` 做诊断，但**不改单、不拦单**。

### 7.3 后台

统一前缀 `/api/v1/admin/supplement-equivalence`；读/写 `AuthGuard + StaffGuard`，审核动作 `AdminGuard`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/groups` | 列表：状态/营养素/关键词/分页 |
| POST | `/groups` | 建组 |
| GET | `/groups/:id` | 详情（成员、浓度校验、审计） |
| PATCH | `/groups/:id` | 改基本信息/依据 |
| POST | `/groups/:id/submit` | `StaffGuard`；`DRAFT → PENDING_REVIEW` |
| POST | `/groups/:id/review` | `AdminGuard`；`{status: APPROVED/DRAFT/DISABLED, reviewNote}` |
| POST | `/groups/:id/members` | `{ingredientIds}` 追加成员 |
| DELETE | `/groups/:id/members/:ingredientId` | 移除成员 |
| DELETE | `/groups/:id` | 仅空组可删 |
| GET | `/ungrouped` | 未归组补剂原料 |
| POST | `/assign` | `{ingredientIds, groupId}` 批量归组 |
| GET | `/summary` | 组数/待审/未归组/单成员组 |

状态机：`DRAFT → PENDING_REVIEW → APPROVED → DISABLED → DRAFT`。`PENDING_REVIEW` 可退回 `DRAFT`。已审核组任何修改自动回 `DRAFT` 并清空审核字段。

审核通过校验：
- 至少 1 个成员；
- `evidenceUrls` 至少 1 条；
- 每个成员都能算出组营养素浓度，且单位一致；
- 组 `nutrientKey/nutrientUnit` 非空。

## 8. 后台页面

新增 `admin-web/src/views/SupplementShop/EquivalenceGroups.vue`（列表 + 详情抽屉）+ `admin-web/src/api/supplementEquivalence.ts`。

- 菜单：补剂商城 → **补剂等价组**（`/supplement-shop/equivalence-groups`）。
- 列表：组名/编码、营养素（label+unit）、形态、状态、成员数、被多少食谱引用、更新时间、操作。
- 顶部统计：已通过/待审核/草稿/未归组/单成员组。
- 详情抽屉：
  - 基本信息（营养素标准/自定义、编码、名称、形态、描述、依据）；
  - 成员表（名称/品牌/规格/形态/单位/组营养素浓度/是否可售/优先级/移除）；
  - 审核区（提交/通过/驳回/停用/启用 + 审核说明）；
  - 变更记录。
- 「未分组原料」页签：列表 + 勾选 + 批量归组 + 导出 CSV（给审核单）。
- 原料档案 `IngredientForm.vue`：补剂显示“等价组”下拉（组名 + 状态）。
- 补剂上架清单 `Catalog.vue`：体检增加 `EQUIVALENCE_UNGROUPED`、`EQUIVALENCE_GROUP_NOT_APPROVED`、`EQUIVALENCE_GROUP_SINGLETON`、`EQUIVALENCE_NUTRIENT_MISSING`、`EQUIVALENCE_UNIT_MISMATCH`，全部 `WARN`，不阻断上架；后两个同时让该成员不参与替换。
- 补剂商城设置：增加“启用等价组候选”开关。
- 食谱表单 `RecipeForm.vue`：旧“替代补剂”字段标为“旧机制（停用）”，只读/隐藏；验收后删除。

## 9. 小程序

### 9.1 数据流

1. 加载食谱 + 价格预览 + 狗狗；
2. 自动保存制作单，拿到 `diySheetId`；
3. 调 `GET /recipes/:id/supplement-candidates?diySheetId=...`，后端算好每条补剂的候选与用量；
4. 补剂表用服务端 `dosage.amount/unit` 展示；
5. 顾客在“换一个”里选原料 → 更新选中项 → 保存 `supplementSelections`；
6. 购买补剂时，草稿行只带 `recipeItemId + ingredientId` + 展示字段；不带 `amount`；
7. 补剂下单页把行原样传给报价，显示报价返回的 `requestedAmount`。

### 9.2 状态

- 候选 0 个：不显示“换一个”；仅生产用补剂显示“仅生产，不可购买”。
- 候选 ≥2：显示“换一个”；弹窗列出品牌/规格/形态/换算后用量。
- 组内无可售成员：显示“暂时买不到，找 Seven爸爸”，客服入口可达。
- 总开关关闭 / 组未审核：只显示原原料，行为与今天一致。

### 9.3 存档

`DIYSheet.supplementSelections` 结构：

```json
[{
  "recipeItemId": "...",
  "ingredientId": "...",
  "amount": 16.44,
  "unit": "g",
  "source": "EQUIVALENCE_GROUP",
  "groupCode": "CALCIUM_MINERAL_SALT",
  "concentrations": [{"fieldPath": "minerals.calcium", "value": 400, "unit": "mg"}]
}]
```

保存时写入；页面加载时从最新未冻结的同食谱+同狗制作单恢复（`GET /user/diy-sheets` 列表筛选），找不到就用默认。
制作单一旦被首次补剂订单冻结：`supplementSelections` 不再更新（也不参与 `sameFrozenContent` 比较，
避免每次访问 fork 新单）；此后以订单快照为准，页面提示“已下单，按订单记录”。

## 10. 订单与快照

- 新路径：`SupplementOrderItem.requestedAmount` = 服务端算量；`recipeItemId`、`sourceIngredientId`、`dosageSnapshot` 落库。
- `dosageSnapshot` 是 `{ totalWeightG, weightSource, lines: [...] }`，`lines` 可以有多条（同一 ingredient 在食谱里出现多行）。
- 版本锚定：`DIYSheet.recipeVersion` 在创建/更新制作单时写入客户端当前版本；报价/下单优先用这个版本，
  没写才用最新版；提交的 `recipeItemId` 必须属于该版本，否则 400 `食谱已更新，请刷新制作单`。
- `dosageSnapshot`：

```json
{
  "totalWeightG": 3000,
  "weightSource": "DIY_SHEET",
  "lines": [{
    "recipeItemId": "...",
    "sourceIngredientId": "...",
    "selectionSource": "EQUIVALENCE_GROUP",
    "group": {"id":"...","code":"...","name":"...","status":"APPROVED"},
    "targets": [{"fieldPath":"minerals.calcium","label":"钙","unit":"mg","targetValuePerKg":2192}],
    "concentrations": [{"fieldPath":"minerals.calcium","value":400,"unit":"mg"}],
    "calculatedAmount": 16.44,
    "submittedAmount": null,
    "unit": "g"
  }]
}
```

- 旧路径：`submittedAmount` = 客户端提交量；若能解析制作单，写 `calculatedAmount` 做诊断，但不改单、不拦单。
- `SupplementSnapshotService.freezeForOrder` 的 `supplementLines` 增加 `dosageSnapshot`，交付/制作单能看到“按什么浓度算的”。
- 支付金额与报价一致：新路径报价和下单都用同一个 `buildQuote`，不会出现两个金额。

## 11. 自定义有效成分

- 原料档案已支持 `customItems`（名称/单位/数值/基准），本期接到目标与换算。
- 两处档案的分工：**设计器目标校验**用 `NutritionFood.nutritionData`（和现有评估口径一致）；
  **实际换算/下单**用 `Ingredient.nutritionProfile`。同一条自定义成分必须两边都有；
  只有一边有 → 设计器能选但下单算不出，或反过来。后台体检把“组要求但原料档案缺浓度”标出来。
- 组：`nutrientKey = custom:<规范化名称>`，`nutrientLabel/Unit` 由后台填。
- 食谱目标：`fieldPath = custom:<规范化名称>`；`SupplementTargetService` 校验该原料 profile 的 `customItems` 有同名项且值 > 0、单位一致。
- 设计器目标弹窗：候选列表追加该原料的 `customItems`。
- 营养评估忽略 `custom:*`，不影响 FEDIAF/NRC 达标。
- 规范化：`label.trim().replace(/\s+/g,'').toLowerCase()`；改名会导致匹配失败，由后台体检提示。

## 12. 审核流程（管理员签字）

1. 我准备：35 种原料清单、分组草案（逐组依据，只引 NRC/FEDIAF/AAFCO/EFSA/同行评审/兽医营养教材）、一页纸审核单。
2. 管理员逐组确认：通过 / 改成员 / 拆组 / 合并 / 暂缓。
3. 我在后台建组、归组、提交审核；管理员点“通过”，系统记录 `reviewedBy = 当前管理员`、`reviewedAt`、`reviewNote`、依据。
4. 只有 `APPROVED` 的组参与替换；未签的保持草稿。
5. 已审核组被改 → 自动回草稿，需重新签。

## 13. 旧机制删除（验收通过后）

1. 线上只读确认 `recipe_supplement_alternative` 的条数。**2026-10-26 实测为 261 条，不是 0**；
   先导出清单（食谱/原原料/替代原料/是否仍在用），交管理员逐条决定“归组 / 保留为一次性例外 / 删除”；
   **禁止按名称自动迁移**；261 条全部处理并有记录后才删表；
2. migration 删除该表；
3. 删除 Prisma model/relations；
4. 删除 `recipe.service`、`recipe-designer.service`、`custom-recipe-delivery.service`、`order.service`、`ingredient-batch-replace.service`、`prisma-recipe.repository` 中的 `supplementAlternatives` 读写；
5. 删除后台 `RecipeForm.vue` 的“替代补剂”字段；
6. 删除小程序 `buildSupplementCandidateOptions` 及测试中旧候选逻辑；
7. 全量测试 + 构建 + 部署。

历史交付快照是 JSON 副本，不依赖该表。

## 14. 分期与验收

### 14.1 本期

数据/后台 → 后端解析/订单 → 小程序 → 联调 → 测试 → 部署 → 体验版。

验收：

1. 建“钙·矿物盐”组（碳酸钙/柠檬酸钙/蛋壳粉），审核通过，打开总开关。
2. 用碳酸钙的食谱，把鸡蛋壳粉设为不可售 → 制作单落到同组可售原料，用量按浓度重算；恢复后回到原原料。
3. 骨粉不出现（跨组）。
4. 组内全不可售 → “暂时买不到，找 Seven爸爸”。
5. 顾客选 B → 下单原料是 B，用量是服务端按 B 的浓度算的唯一数字；快照能查到目标/浓度/组/算量。
6. 未归组或组未审核的补剂，行为与今天一致。
7. 自定义成分（如氨糖）能建组、能设目标、能换算。
8. 后端/小程序测试、后台构建通过（既有 designer-bridge 1 个失败不算回归）。

### 14.2 第二期

- 采购/分装缺货建议（只建议，不自动改单）。
- 严格拦截/价格一致性收紧（如需要）。
- 交付页补充“推荐原料 + 浓度”（如运营需要）。

## 15. 风险与对策

| 风险 | 对策 |
|---|---|
| 分组划错 | 管理员逐组签字；组可停用；跨组不换；未审核不参与 |
| 浓度缺失/单位不一致 | 候选直接排除；后台体检；组审核校验 |
| 老版本小程序 | 旧路径完全不动；新路径只由新版本调用 |
| 页面停留导致配方变化 | 下单时 `buildQuote` 重算；金额与报价同源 |
| 自定义成分改名 | 体检提示“浓度缺失”；组退回草稿 |
| 性能 | 35 种原料/十余组；候选接口按食谱一次查询，无 N+1 |
| 删除旧表误伤 | 删前只读确认 0 条；历史快照是 JSON 副本 |

## 16. 实现顺序

1. migration + Prisma 模型；
2. dosage service（纯函数 + 单测）；
3. equivalence service（CRUD/审核/审计/归组 + 单测）；
4. candidate service（组优先/过滤/回退 + 单测）；
5. admin controller + 后台页面；
6. 顾客 candidates 接口 + 小程序；
7. 报价/下单改造 + 快照 + 单测；
8. 全量测试/构建/部署；
9. 归组 + 审核 + 验收；
10. 删除旧机制。
