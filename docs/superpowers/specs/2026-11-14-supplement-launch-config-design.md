# 补剂建档「落地配置」集中化 · 设计方案

- 日期：2026-11-14
- 模块：`admin-web`（AI 添加原料 / 补剂 → 商品 / 原料档案）、`backend`（ingredient-creation、supplement-shop）
- 状态：**待老板确认**（确认后才进入实现）
- 前置文档：`docs/superpowers/specs/2026-11-07-supplement-ingredient-ai-flow-design.md`（补剂 AI 建档流程，下称「前稿」）
- 配套实施计划：`docs/superpowers/plans/2026-11-14-supplement-launch-config-plan.md`

## 0. 一句话

把「商城上架、等价组、DIY 推荐、生产采购」四类配置从**四个页面**收进补剂建档的**最后一步**，用 AI 预填能查证的字段，并在收尾时当场给出「这条补剂能不能被买、能不能被替换」的结论。

## 1. 为什么做

### 1.1 现状：一条补剂要跨四个页面才配齐

| 要配的东西 | 现在在哪 | 建档时写不写 |
|---|---|---|
| 基本信息、品牌、规格、采购价、单位、形态、营养 | 补剂工作台（AI 添加原料 → 补剂） | ✅ 写 |
| **用于 DIY 推荐**开关、购买链接、产品图片 | 原料档案编辑弹窗 | ❌ 不写（工作台里看不到这个开关） |
| **用于采购/生产**开关 | 同上 | ❌ 不写（同样看不到） |
| **商城上架**开关、物理形态、原厂保质期、储存条件、内容物油性 | 补剂 → 商品 → 上架清单（行内逐项） | ❌ 不写 |
| **等价组** | 补剂 → 商品 → 等价组（建组 → 加成员 → 提交审核 → 通过） | ❌ 不写 |

四类配置分属四个页面、四套操作，任何一处漏掉，补剂都会「半残」。

### 1.2 两个必须写进设计前提的更正（2026-11-14 核实）

> 前一版口头方案里我写错了两点，这里作为设计前提固定下来，避免后来人再按错的理解实现。

**（1）补剂是单层产品，没有 SKU 层级。**

- 前端能力表写明：补剂 `supportsChildSkus: false` / `usesSingleLayerProductFields: true`，只有食材是父子 SKU（`admin-web/src/utils/ingredientTypeCapabilities.ts`）。
- 生产数据：`procurement_sku` 共 319 条，**全部挂在食材（119 条）上，补剂 0 条**。
- 结论：**不要给补剂加采购商品层**。补剂的价格、采购单位、换算倍数、渠道全部挂在 `Ingredient` 自己身上。

**（2）商城上架不要求主图。**

- 上架的硬门槛只有 5 条 ERROR：无进货价、缺形态、液体不支持、展示单位与基准单位不是 1:1、缺原厂保质期。
- 储存条件是 **WARN**，不阻断；等价组相关问题全部是 WARN。
- 图片（`properties.image_url`）只在「用于 DIY 推荐」打开后才出现，文案写明「用于小程序 DIY 制作单推荐弹窗展示」，**非必填**；补剂商城链路不涉及图片。
- 结论：**不要给上架加图片要求**，也不要把图片当上架前置。

### 1.3 数据证据（2026-11-14 生产库）

最近新建的 3 条补剂（2026-10）：

| 补剂 | DIY | 采购 | 上架 | 等价组 | 保质期 | 储存条件 |
|---|---|---|---|---|---|---|
| 藻油 | 关 | 关 | 关 | 草稿组 | 缺 | 缺 |
| 磷酸氢钙 | 关 | 关 | 关 | 已审核 | 缺 | 缺 |
| 维生素D3滴剂 | 开 | 开 | 关 | 已审核 | 缺 | 缺 |

三条都没上架、都缺保质期；其中两条连 DIY 与采购都是关的。建档流程里**没有任何一步提醒**要补这些。

### 1.4 为什么不是「再加一个表单」

如果第 4 步自己重写一套字段和校验，就会出现第二套规则，两套必然分叉（本项目已经因为「同一口径两处实现」踩过坑）。所以第 4 步的硬约束是：**只搬字段、只调现有接口、复用同一份校验**。

## 2. 目标 / 非目标

### 目标

1. **一次走完**：四类配置在同一屏可见、可改，不用再去三个页面。
2. **缺失可发现**：建档收尾就跑一次「数据体检」，当场告诉你缺什么、能不能买。
3. **AI 只填能查证的**：链接、品牌、规格、营养、价格、保质期建议、等价组推荐；业务决定（卖不卖、归哪个组）由人点头。
4. **规则零改动**：上架门槛、候选资格、下单校验、定价规则全部不变。

### 非目标

- 不给补剂加 SKU 层 / 子商品。
- 不要求商城主图，不改商城页面与制作单交互。
- 不自动上架、不自动通过等价组审核。
- 不改补剂定价、分装、发货规则。

### 反面目标（做成了也算失败）

- 第 4 步变成「又一个要填的表」，比现在更慢。
- AI 建议直接写库、不可撤销。
- 第 4 步成为写入的硬前置，导致建档失败率上升。

## 3. 现状事实（实现依据）

### 3.1 四类配置的真实作用

| 配置 | 字段 | 谁在读它 | 语义 |
|---|---|---|---|
| DIY 推荐 | `ingredient.diyEnabled` | `supplement-candidate.service.ts`（候选资格：不 true 直接排除）；上架清单「可生产」标记 | 「能不能进制作单候选」 |
| 生产采购 | `ingredient.procurementEnabled` | `order.service.ts`（`canUseForProcurement`：下单时在补剂备选里挑**生产实际用哪条原料**） | 「生产用哪条原料」，**不是「能不能买」** |
| 商城上架 | `ingredient.supplementRetailEnabled` | `supplement-candidate.service.ts`（候选资格）、上架清单、下单校验 | 「能不能作为可购买商品」 |
| 等价组 | `ingredient.equivalenceGroupId` | `supplement-candidate.service.ts`（组内候选）、上架清单提醒 | 「缺货时能不能换同营养的其他原料」 |

补充：食材的 `diyEnabled` 目前没有消费方（只有补剂候选会读），所以第 4 步只对补剂做。

### 3.2 上架门槛（`supplement-catalog.service.ts`）

| 级别 | 代码 | 含义 |
|---|---|---|
| ERROR | `NO_PRICE` | 进货价为 0 |
| ERROR | `FORM_MISSING` | 未填物理形态 |
| ERROR | `LIQUID_UNSUPPORTED` | 液体补剂不支持分装 |
| ERROR | `UNIT_INCOMPATIBLE` | 展示单位与基准单位不是 1:1 |
| ERROR | `SHELF_LIFE_MISSING` | 缺原厂保质期 |
| WARN | `STORAGE_MISSING` | 缺储存条件（标签无法印刷） |
| WARN | `UNIT_INCONSISTENT` | `properties.display_unit` 与 `unit_display_label` 不一致 |
| WARN | `DUPLICATE_NAME` | 同名档案多条 |
| WARN | `EQUIVALENCE_UNGROUPED` | 未归等价组 |
| WARN | `EQUIVALENCE_GROUP_NOT_APPROVED` | 组未审核 |
| WARN | `EQUIVALENCE_GROUP_SINGLETON` | 组仅 1 个成员 |
| WARN | `EQUIVALENCE_NUTRIENT_MISSING` / `UNIT_MISMATCH` | 组要求的营养素浓度缺失/单位不符 |

**只有 ERROR 阻断上架。**

### 3.3 字段在哪一层（实现时不要找错地方）

- `Ingredient`：品牌、规格、采购渠道、展示单位、形态、采购单位、换算倍数、进货价、**原厂保质期**、**储存条件**、**内容物油性**、`diyEnabled`、`procurementEnabled`、`supplementRetailEnabled`、`equivalenceGroupId`。
- `Ingredient.properties`（JSON）：`display_unit`、`add_timing`、`production_loss_rate`、**`purchase_link`**、**`image_url`**、标签三项。
- **原厂保质期 / 储存条件 / 内容物油性目前只能在「上架清单」行内编辑**——原料编辑表单里没有这三个字段。

### 3.4 建档流程与门禁

- 补剂工作台：填写 → 3 道写入门禁（每份→每粒折算、单位闭合、成本可算）→ 写入（事务落原料 + 营养档案 + 证据）→ 营养档案「待验证」→ 「确认可用」后配方才能选到。
- 创建接口 `CreateSupplementIngredientDto` 有：名称/品牌/规格/渠道/展示单位/形态/采购单位/换算/价格/添加时机/损耗率/`diyEnabled`/`procurementEnabled`/标签三项/每份粒数/每份营养/证据。
- **没有**：`supplementRetailEnabled` / `equivalenceGroupId` / `shelfLifeMonths` / `storageCondition` / `isOilBased` / `purchase_link` / `image_url`。

### 3.5 AI 现有能力（字段级，别过度承诺）

| 能力 | 实际输出 | 能否用于落地配置 |
|---|---|---|
| 补剂 Agent 工具 | `search_products`（**只搜 iHerb**）、`fetch_product`（商品名 / 每份粒数 / 营养素 / 人民币价 / 标签原文）、`lookup_feed_catalog`、`write_draft`、`ask_user` | 基本信息可以；**不返回图片、不返回品牌/规格** |
| Agent 草稿可写字段 | 15 个（名称/品牌/规格/渠道/单位/形态/每份粒数/采购单位/换算/价格/损耗率/标签三项/标签原文） | **不含**四类配置 |
| 截图识别采购商品 | 名称 / 品牌 / 规格 / 渠道 / 采购单位 / 件数 / 净含量 / 规格链 / 规格原文 | 采购侧可用；**无图片、无营养**；有每日配额 |
| 上架建议 | 形态建议、按品牌保质期建议、油性建议、储存条件默认值 | ✅ 直接可用 |
| 等价组 | 有「未归组列表」与「批量归组」接口 | **没有「按营养素推荐组」**，需新建 |

## 4. 设计

### 4.1 位置与进入条件

补剂工作台新增**第 4 步「落地配置」**：

- 只在「核验并写入」**成功后**展开（写入前没有任何 `ingredientId`，归组、上架都无从谈起）。
- 与「确认可用」解耦：落地配置随时可改，不影响营养档案的验证状态。
- 入口同时保留在原位（上架清单 / 等价组页面照旧可用），第 4 步是**新增的集中入口**，不是替代品——避免把两条路都弄坏。

### 4.2 四段结构

一屏四段（可折叠，默认全展开），每段右上角显示状态徽标（已配置 / 待配置 / 不参与）。

**A 段 · 商品档案（上架）**

| 字段 | 控件 | 校验 | AI |
|---|---|---|---|
| 物理形态 | 下拉（粉/片/胶囊/液体） | 必填；液体直接判定不可上架 | 按单位推断建议 |
| 原厂保质期（月） | 数字 | 上架的 ERROR 项 | 按品牌建议 |
| 储存条件 | 文本 | WARN，不阻断 | 默认值「避光、密封、阴凉干燥处保存」 |
| 内容物油性 | 开关 | 影响分装标签效期 | 按名称建议 |
| **上架** | 开关 | 开 → 必须无 ERROR | 只给「建议上架/不建议」+ 理由，不自动开 |

**B 段 · DIY 推荐**

| 字段 | 控件 | 说明 |
|---|---|---|
| 用于 DIY 推荐 | 开关 | 关 → 段内其余字段隐藏（与现有表单行为一致） |
| 购买链接（平台 + 链接） | 平台下拉 + 文本 | 写 `properties.purchase_link` |
| 产品图片 | 上传 / AI 抓取 | 写 `properties.image_url`，**仅用于制作单弹窗展示**，非必填 |
| 添加时机 / 损耗率 | 已有字段 | 沿用工作台输入，不在本段重复 |

**C 段 · 生产采购**

| 字段 | 控件 | 说明 |
|---|---|---|
| 用于采购/生产 | 开关 | 决定下单时能否作为「生产采购原料」被选中 |
| 采购单位 / 换算倍数 / 进货价 | 已有字段 | 只读回显 + 允许改（改动走原料更新接口） |

**D 段 · 等价组**

| 字段 | 控件 | 说明 |
|---|---|---|
| 推荐组 | 只读建议 | 按营养素 + 形态匹配已有组，显示：组状态、成员数、单位是否一致 |
| 选择 | 加入推荐组 / 选其他组 / 暂不归组 | 暂不归组要勾确认 |
| 组内排序 | 数字（仅加入后） | 决定制作单里默认显示哪个 |

> 组必须「已审核 + 至少 2 个成员 + 组成员浓度可算」才会真正生效；草稿组即使加入也不参与替换，本段要直说。

### 4.3 必答与默认

- 四段都要求**明确表态**：参与 / 不参与，不允许沉默。
- 默认值沿用现状：DIY 开、采购开、上架关——但默认值必须**显式显示**，不能再"看不见地打开"。
- 「不上架」必须选原因：`自制原料` / `散装采购` / `暂无稳定货源` / `待定`。

### 4.4 保存与校验顺序

一次「保存落地配置」按固定顺序调三个域：

1. `PATCH /admin/supplement-shop/catalog/:id` —— 形态 / 保质期 / 储存 / 油性 / 上架
2. `PATCH` 原料 —— `diyEnabled` / `procurementEnabled` / `properties.purchase_link` / `properties.image_url`
   - ⚠️ **`properties` 是整块替换，不是深合并**：必须先取回现有 properties，合并后再提交，
     否则会清掉 `add_timing`、`production_loss_rate`、标签三项、`display_unit`。
3. `POST /admin/supplement-equivalence/assign`（或 `groups/:id/members`）—— 归组

**不做跨域大事务**（三个域各自持久化，回滚语义不同）。任一步失败：
- 该段标红并保留用户输入；
- 后续段不自动跳过（可继续保存其余段）；
- 汇总一条「N 项未保存」。

**上架校验以后端为准**：前端先跑同一套规则做即时提示，后端 PATCH 时再判一次；后端拒绝时把 issues 原样回显。

### 4.5 落地结论卡

保存后立刻用 `GET /admin/supplement-shop/catalog` 取该行 `issues`，给出三档结论：

| 结论 | 判定 | 文案示例 |
|---|---|---|
| ✅ 能买 | 已上架 + 无 ERROR | 「顾客可在制作单里购买这条补剂」 |
| ⚠️ 能买但缺展示 | 已上架 + 无 ERROR + 无购买链接 | 「详情里没有『去购买』」 |
| ❌ 不能买 | 未上架，或存在 ERROR | 逐条列出 ERROR + 「去补」 |

### 4.6 制作单预览

B 段底部放一张静态预览卡：按当前配置模拟顾客制作单上这一行长什么样——
- 未上架：显示「仅生产，不可购买」；
- 已上架且无候选问题：显示「查看商品 〉」/「换一个」；
- 无购买链接：只显示品牌规格文字。

预览只做展示，不参与业务计算。

## 5. 接口与数据

### 5.1 复用（不新增）

| 用途 | 接口 |
|---|---|
| 读体检结果 + 建议值 | `GET /admin/supplement-shop/catalog` |
| 改档案字段与上架 | `PATCH /admin/supplement-shop/catalog/:id` |
| 批量按建议预填 | `POST /admin/supplement-shop/catalog/apply-suggestions` |
| 改 DIY / 采购 / 链接 / 图片 | 现有原料更新接口 |
| 未归组列表 / 归组 | `GET /admin/supplement-equivalence/ungrouped`、`POST /assign` |
| 建组 / 加成员 / 审核 | `POST /admin/supplement-equivalence/groups` 等 |
| 售价试算（可选） | `POST /admin/supplement-shop/quote-preview` |

### 5.2 新增（P2 起）

| 能力 | 形态 | 说明 |
|---|---|---|
| 商品页抓主图 | `fetch_product` 返回 `imageUrl`（og:image） | 唯一可靠的「AI 补图」来源 |
| 商品页拆品牌/规格 | `fetch_product` 返回 `brand` / `productModel` | 现在只返回商品名 |
| 推荐等价组 | `GET /admin/supplement-equivalence/recommend?ingredientId=` | 按 `nutrientKey` + 浓度匹配；返回组状态/成员数/单位一致性 |
| 单条体检 | `GET /admin/supplement-shop/catalog/:id` | 减少整表拉取（可选） |

## 6. 字段归属（更新前稿 §6）

| 字段 | 谁填 | 依据 | 必答 |
|---|---|---|---|
| 名称/品牌/规格/渠道/单位/形态/每份营养/价格 | AI | 商品页/标签 | 是 |
| 添加时机、标签分类 | 人 | — | 是 |
| 损耗率 | 默认 1.05 | 全局 | 否 |
| **DIY 推荐开关** | 人（AI 给建议） | 是否用于制作单 | 是 |
| **购买链接** | AI（链接）/ 人（口令） | 商品页 | 建议填 |
| **产品图片** | AI 抓 / 人传 | 商品页 og:image | 否（非必填） |
| **生产采购开关** | 人 | 是否用于生产 | 是 |
| **上架开关** | 人 | 业务决定 | 是 |
| **原厂保质期** | AI 建议 / 人确认 | 品牌默认值 | 上架时必填 |
| **储存条件** | AI 默认 / 人确认 | 形态 | 上架时建议填 |
| **内容物油性** | AI 建议 / 人确认 | 名称 | 否 |
| **等价组** | 人（AI 推荐） | 营养素 | 是（可选「暂不归组」） |

## 7. 门禁升级

| 门禁 | 时机 | 阻断什么 |
|---|---|---|
| 3 道写入门禁（折算/单位/成本） | 写入前 | **不动**，仍然阻断写入 |
| 落地表态 | 写入后 | 不阻断写入；未表态时结论卡显示「配置未完成」 |
| 上架门槛（5 条 ERROR） | 上架时 | 阻断上架（后端已有的规则） |

## 8. 异常与降级

| 情况 | 处理 |
|---|---|
| AI 抓图失败（反爬/站点不支持） | 保留手动上传；提示「这个站点抓不到图，请手动上传」 |
| 商品页抓不到品牌/规格 | 留空，标「AI 没读到」，不猜 |
| 推荐组失败 | 退化为「手动选组 / 暂不归组」 |
| 某一段保存失败 | 该段红框 + 输入保留 + 汇总提示 |
| 组加入成功但组未审核 | 明确提示「已归组，但组未审核，不参与替换」 |
| 上架请求被后端拒绝（存在 ERROR） | 回显后端 issues 原文 |

## 9. 与现有代码的对应关系

| 现状 | 文件 |
|---|---|
| 补剂工作台（3 道门禁、写入、确认可用） | `admin-web/src/views/Ingredients/ai-agent/supplement/SupplementWorkbench.vue`、`supplementGates.ts`、`supplementFormState.ts` |
| 原料编辑（DIY/采购开关、链接、图片） | `admin-web/src/views/Ingredients/IngredientForm.vue` |
| 上架清单（形态/保质期/储存/油性/上架/体检） | `admin-web/src/views/SupplementShop/Catalog.vue` |
| 等价组（建组/成员/审核） | `admin-web/src/views/SupplementShop/EquivalenceGroups.vue` |
| 体检规则 | `backend/src/application/supplement-shop/supplement-catalog.service.ts` |
| 候选资格 | `backend/src/application/supplement-shop/supplement-candidate.service.ts` |
| 生产采购口径 | `backend/src/application/order/order.service.ts` |
| 创建接口与 DTO | `backend/src/interfaces/dto/ingredient-creation/create-supplement-ingredient.dto.ts` |
| AI 能力 | `backend/src/application/ingredient-creation/supplement-tools.ts`、`supplement-link-preview.service.ts`、`domain/ingredient/supplement-draft-patch.ts` |
| 截图识别采购商品 | `backend/src/application/purchasing/procurement-sku-draft.service.ts` |

## 10. 验收口径

1. 新建一条补剂 → 第 4 步能看到四段、四个开关的当前值（不再有"看不见的默认值"）。
2. 上架开关打开但缺保质期 → 当场标红并说明原因；补上后可保存。
3. 选「暂不归组」→ 保存成功，结论卡提示「未归组：缺货无法替换」。
4. 选「加入已审核组」→ 制作单预览立即变化（能换/不能换）。
5. 上架成功 → 结论卡显示「能买」；制作单预览显示「查看商品 〉」。
6. 全部保存后，上架清单与等价组页面看到的结果与第 4 步一致（同一份数据、同一套规则）。
7. 不做任何配置时，结论卡明确写「未上架 + 未归组」，不再静默。

## 11. 待拍板

1. **落地配置是否阻断写入？** 建议不阻断（写入完成后才展开），只阻断「上架」。
2. **「暂不上架」的原因枚举**：用文中的 4 个，还是自由填写？
3. **第 4 步是放在工作台内，还是独立页面（带 `?ingredientId=`）？** 建议放工作台内，减少一次跳转。
4. **售价预览是否要**？P1 可以省，P2 再用 `quote-preview` 做。
5. **AI 抓图失败率可接受范围**：建议先只支持 iHerb，淘宝/京东标「需实测」。
