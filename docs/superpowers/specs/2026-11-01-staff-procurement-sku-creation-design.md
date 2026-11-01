# 采购管理：员工在小程序里新增采购商品（含 AI 读商品截图）

- 日期：2026-11-01
- 提出：老板
- 状态：待确认

## 1. 问题

采购清单里的每道标准原料下面挂着若干「采购商品」（= 采购 SKU，例如「沃集鲜 糙米 1kg / 沃尔玛 / 14.99 元」）。
员工在「添加采购记录」弹窗里只能**从已有列表里选**，选不了就必须跳到电脑后台让管理员加。

而现实是：山姆、沃尔玛、盒马的货**经常换品**（旧品下架、临时找替代品），
员工在店里/在 App 下单时手上就有新商品，却记不了这一笔 —— 只能先停下来找管理员。

老板原话的要求：
1. 员工在「添加采购记录」弹窗里能直接新增采购商品；
2. **不需要**新增标准原料（原料还是原来那道，只是换了商品）；
3. 加完当场生效、所有人都能选，不用审批；
4. 管理员在电脑后台能看到"员工历史添加的采购商品"，并能编辑、删除；
5. **账目准确优先**：净含量/换算必须准，宁可让员工多填一个空，也不准瞎猜；
6. 因为采购都在商超 App 上完成，员工手上有商品详情页截图 —— 希望 AI 读图自动填。

## 2. 目标 / 非目标

**目标**

- 员工在小程序「添加采购记录」弹窗里，能新增一个采购商品并立刻用它记这一笔。
- 新增时可直接上传**商品详情页截图**，AI 读出名称、品牌、净含量、单价、采购单位，员工核对后保存。
- 读不出来的必填项标红，**不允许提交**（不猜、不留空）。
- 新采购商品挂在当前这道标准原料下，立即对所有人可见可用。
- 管理员在 admin-web 有一个「员工新增的采购商品」清单，可筛选、编辑、删除。
- 每条员工新增的商品都记下**谁加的、什么时候加的、当时传的截图**。

**非目标（明确不做）**

- 不新增/修改标准原料本身。
- 不做审批流（老板要当场生效）。
- 不改采购记录的录入逻辑（数量、金额仍然照旧填）。
- 不识别"订单列表"截图（见 6.2 输入约束）。
- 不做员工编辑/删除自己加的商品（只有管理员能改能删）。
- 不做多图批量识别、不做一次识别多个商品。

## 3. 用户与权限

| 角色 | 能做什么 |
|---|---|
| 员工（STAFF） | 在采购清单详情里新增采购商品（含传截图识别）；不能改、不能删 |
| 管理员（ADMIN） | 同上；另外能在 admin-web 看"员工新增的采购商品"清单，能编辑、能删除 |

把现有 `PUT / DELETE /api/v1/admin/ingredients/:ingredientId/procurement-skus/:id` 的守卫从
`StaffGuard`（员工+管理员）收紧为 `AdminGuard`（仅管理员）—— 因为员工端不再需要这两个接口，
而老板明确"员工不能改不能删"。若有其他调用方，实施时先全局搜索确认。

## 4. 端到端流程

```
采购清单详情
  └ 某道原料 →「添加采购记录」弹窗
        └ 采购商品列表底部：＋ 没有我要买的商品？新增一个
        └ 或者一个商品都没有时：＋ 新增一个采购商品
              ↓
      新增采购商品页（小程序新页面）
        ① 传商品详情页截图 → AI 读 → 表单自动填好
        ② 或直接手填
        ③ 核对 / 补标红的空 → 保存
              ↓
      返回"添加采购记录"弹窗，新商品已选中，继续填数量金额
```

## 5. 数据模型变更（Prisma migration）

在 `procurement_sku` 表上加三列（命名按 `docs/DATABASE_NAMING_CONVENTIONS.md`，Prisma 驼峰 / 库里蛇形）：

| Prisma 字段 | 库字段 | 类型 | 说明 |
|---|---|---|---|
| `createdById` | `created_by_id` | `String? @db.VarChar(36)` | 谁加的；外键到 `user`，`onDelete: SetNull` |
| `createdSource` | `created_source` | `String? @db.VarChar(20)` | `ADMIN` / `STAFF_APP`；历史数据保持 `NULL`（视为后台/导入） |
| `sourceScreenshotUrl` | `source_screenshot_url` | `String? @db.VarChar(500)` | 员工传的那张截图的 COS 地址，供管理员核对 |

索引：`@@index([createdSource, createdAt])`（后台清单按"员工新增 + 时间"筛）。

**不写默认值、不回填历史数据** —— 历史 SKU 的 `created_source` 留 `NULL`，
"员工新增"这类判断一律 `created_source = 'STAFF_APP'`，不会把老数据误标成员工加的。

关系：`createdBy User? @relation("ProcurementSkuCreator", fields: [createdById], references: [id], onDelete: SetNull)`。

## 6. AI 读截图

### 6.1 复用既有流水线

系统里已有成熟做法（健康报告识别、补剂包装识别）：
**上传图片到 COS → 视觉模型直接看图出结构化 JSON → 失败降级到"OCR 出文字 → DeepSeek 出 JSON" → 结果只作为"草稿"，人工确认后才落库**。

复用资产：

- `backend/src/application/recipe-designer/deepseek-chat.ts` 的 `callDeepSeekJson`，
  它支持 `userContent`（OpenAI 兼容的 `[{type:'text'},{type:'image_url',...}]`）直接看图。
- `backend/src/application/nutrition-governance/agent-provider-config.service.ts` 拿模型与密钥
  （新用途标识 `PROCUREMENT_SKU_DRAFT`，未单独配置时回退全局默认，和健康模块同一套回退规则）。
- 默认视觉模型 `deepseek-flash`（`health-report-extraction.service.ts` 的 `DEFAULT_VISION_MODEL`）。
- 上传：`backend/src/interfaces/controllers/staff-purchasing.controller.ts` 里已有
  `POST /staff/purchasing/upload-receipt-photo`（COS + 文件夹）。照它新增一个
  `POST /staff/purchasing/upload-sku-screenshot`，落到 `procurement-sku-screenshots/`。

### 6.2 输入约束（老板给过样本）

- **只认「商品详情页」截图**：一屏一个商品，图上有商品标题、净含量（如 `1kg`）、单价（如 `¥14.99/袋`）。
- 小程序的上传区必须给**示例图 + 三条要点**（商品标题 / 净含量 / 单价），引导员工截对图。
- 不承诺识别"订单列表"（一屏多商品、无净含量）。若识别结果显示像订单列表（多个商品、无净含量），
  直接判定失败并提示"请截商品详情页，像示例那样"，让员工手填或重截。

### 6.3 返回结构（草稿，不落库）

```json
{
  "name": "沃集鲜 糙米 1kg",
  "brand": "MARKETSIDE 沃集鲜",
  "productModel": "1kg",
  "purchaseChannel": "沃尔玛",
  "purchaseUnit": "袋",
  "netContent": { "value": 1, "unit": "kg", "ratioInBaseUnit": 1000, "text": "1kg" },
  "unitPrice": 14.99,
  "missing": ["netContent"],
  "confidence": { "name": "high", "purchaseChannel": "low" }
}
```

- `ratioInBaseUnit` 由服务端按原料的 `baseUnit` 归一：
  `G`：kg→×1000；`ML`：L→×1000；`PCS`：取"一袋几个"。
- **读不出来的字段一律放 `missing` 并留空**，不填任何猜测值。

### 6.4 渠道的特殊处理

商品详情页上通常没有"这是哪个商超"。允许按品牌推断（沃集鲜/MARKETSIDE → 沃尔玛），
但标记为 `confidence: low`，界面上显示成"AI 推测·可改"，员工必须能看到并确认。
推断不出就留空，让他从渠道列表里选。

### 6.5 成本与配额

- 每次识别几分钱量级，频率极低（一周几次），主路径不做省钱优化。
- 但要有兜底上限，防止刷：**每人每天 30 次、全系统每月 3000 次**，超限返回明确错误、界面降级为手填。
- 每次调用记一行日志：阶段、模型、token 数、耗时、是否降级（沿用健康模块 `[Extraction]` 的格式）。
- AI 不可用 / 超时 / 解析失败 → **一律降级为手填**，绝不让员工卡住（这是既有模块定过的原则）。

## 7. 接口清单

### 7.1 小程序端（`AuthGuard` + `StaffGuard`）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/v1/staff/purchasing/upload-sku-screenshot` | 上传商品详情页截图，返回 `{ url, key }`（新） |
| POST | `/api/v1/staff/purchasing/procurement-sku-draft` | 传 `{ imageUrl, ingredientId }`，返回 6.3 的草稿，**不落库**（新） |
| POST | `/api/v1/staff/purchasing/ingredients/:ingredientId/procurement-skus` | 新增采购商品（新，写 `createdById` / `createdSource='STAFF_APP'` / 截图地址） |

新增接口的入参与校验：

- `name` 必填，去空格后 1–100 字；
- `purchaseChannel` 必填；
- `purchaseUnit` 必填（袋/包/箱/瓶/盒/其他，实际以"这一采购单位 = 多少基准单位"能读懂为准）；
- `purchaseToBaseRatio` 必填且 > 0（**账目准确的底线，不接受空**）；
- `currentPurchasePrice` 选填，> 0；
- 原料必须存在且 `type` 允许挂采购 SKU（复用 `assertFoodIngredientCanOwnProcurementSkus`）。

**重名处理**：同一 `ingredientId` 下已存在同名（去空格、忽略大小写）且 `isActive` 的商品时，
**不创建**，返回已有那条的 id，界面提示"这道原料下已经有了，直接选它吗？"，点确认就选中已有商品。

### 7.2 后台端（`AdminGuard`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/admin/procurement-skus` | 新增：跨原料分页列表，支持 `createdSource` / `ingredientId` / `createdById` / `createdFrom` / `createdTo` / 关键字 / 分页 |
| PUT | `/api/v1/admin/ingredients/:ingredientId/procurement-skus/:id` | 已有，收紧为 AdminGuard |
| DELETE | `/api/v1/admin/ingredients/:ingredientId/procurement-skus/:id` | 已有，收紧为 AdminGuard |

`GET` 每行返回：`id`、`ingredientId`、`ingredientName`、`name`、`brand`、`productModel`、
`purchaseChannel`、`purchaseUnit`、`purchaseToBaseRatio`、`baseUnit`、`currentPurchasePrice`、
`isActive`、`createdById`、`createdByName`、`createdSource`、`createdAt`、`sourceScreenshotUrl`。

## 8. 界面

### 8.1 小程序：入口（改 `detail.vue` 的「添加采购记录」弹窗）

- 采购商品列表已有内容时，列表最下面加一行虚线行：`＋ 没有我要买的商品？新增一个`。
- 一个商品都没有时，把现在的「请联系管理员在该标准原料下新增采购 SKU 后再记录采购。」
  换成空状态 + 主按钮 `＋ 新增一个采购商品`。
- `record-form.vue`（独立页版本的添加采购记录）同样处理，保持两处一致。

### 8.2 小程序：新增采购商品页（新页面 `pages/staff-purchasing/procurement-sku-create.vue`）

老板已选定 **A 版（先传图）**：

1. 顶部固定显示 `挂到原料：糙米 · 基准单位 克`（防挂错原料）。
2. 大上传区：`拍商品详情页 / 从相册选`。
3. 示例引导卡：**示例缩略图 + 三条要点**（① 商品标题 ② 净含量 ③ 单价）。
4. 分隔线 `或手动填写`。
5. 表单字段（`*` 必填）：
   - 商品名 *
   - 采购渠道 *（山姆 / 沃尔玛 / 盒马 / 其他 + 自定义）
   - 采购单位 *（袋 / 包 / 箱 / 瓶 / 盒 + 自定义）
   - 净含量（克 / 毫升 / 个）* —— 标签随原料基准单位变化；**单位固定不可切换**，只有数字输入
   - 单价（选填）
   - 品牌（选填，默认收起）
6. AI 填过的字段带「AI 识别」小标；推断出来的带「AI 推测·可改」；读不出来的**标红并说明**（例：`截图里没看出多重，请看一下包装`）。
7. 底部 `取消 / 保存`；必填项没填时保存按钮不可用。
8. 保存成功后：回到「添加采购记录」弹窗，**新商品自动选中**，接着填数量金额。

### 8.3 后台：`原料管理 › 员工新增的采购商品`

- 顶部说明条：一句话解释这里是什么、能干什么。
- 筛选：原料、添加人、时间范围、关键字。
- 表格列：原料 / 新增的采购商品 / 规格净含量 / 采购单位 / 渠道 / 参考单价 / 添加人 / 添加时间 / 操作（编辑、删除）/ 查看截图。
- 编辑弹窗：名称、品牌、规格、采购单位、换算（= 净含量）、渠道、参考价、是否启用。
- 删除：二次确认，提示"会从该原料下移除，历史采购记录不受影响"。
- 同时在 `Ingredients/IngredientForm.vue` 每个采购 SKU 卡片上显示一行小字：
  `张三 · 2026-11-01 添加`（仅 `createdSource='STAFF_APP'` 时显示）。

## 9. 边界与失败处理

| 情况 | 处理 |
|---|---|
| 截图上传失败 | 提示重试，可继续手填（不阻断） |
| AI 超时 / 报错 / 返回空 | 提示"没认出来，手动填一下"，表单保持可用 |
| AI 认成订单列表 | 判定失败，提示"请截商品详情页，像示例那样" |
| AI 把渠道认错 | 标「AI 推测·可改」，员工可改；认不出就留空要求选 |
| 净含量没读出来 | 标红、必填、不给保存 |
| 同名商品已存在 | 不创建，提示并引导选中已有那条 |
| 员工重复点击保存 | 按钮 loading + 服务端去重（同名同原料） |
| 新增商品后清单数据过期 | 返回时重新拉一次清单详情，再自动选中新商品 |
| 员工想改自己加的 | 界面上没有入口；要改找管理员 |

## 10. 验证方式

- **后端**：`npx tsc --noEmit`；`npm test`（新增单测：基准单位归一化、重名判定、创建记录 `createdById`/`createdSource`、草稿接口的缺失字段处理、配额上限）。
  ⚠️ 联调期间不跑 `npm run build`（会删 `dist` 弄死 `start:dev`）。
- **小程序**：`cd miniapp && npx uni -p mp-weixin` 自查；结束前跑 `npm run build:mp-weixin`，
  告知用微信开发者工具打开 `miniapp/dist/build/mp-weixin`。
- **后台**：`cd admin-web && npm run build`。
- **端到端手测**：拿老板给的那张「沃集鲜 糙米 1kg」截图，走一遍 上传 → 识别 → 核对 → 保存 → 记采购记录。

## 11. 部署

- 后端与 admin-web 按既有授权可直接部署到生产（先自检、先合并 `origin/main`）。
- 小程序**只上传体验版**，不用直接发正式版。
- 上线顺序：后端（迁移 + 接口）→ 后台 → 小程序体验版。

## 12. 留给实施者的决定

- 具体 prompt 措辞、`temperature`、`maxTokens`（按既有模块的经验值起步）。
- 渠道/单位快选项的具体清单与顺序。
- 后台清单的分页大小、默认排序（默认按"添加时间倒序"）。
- 是否给"员工新增"这类商品在采购记录弹窗里加个小标记（本稿不要求）。
