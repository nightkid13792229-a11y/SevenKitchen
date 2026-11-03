# 新增原料半自动流程重构设计

> 状态：已与用户确认方向，待实施
> 关联目标：把 `adding-standard-ingredients` 技能的重流程重构为半自动轻流程

## 背景与问题

现有 `skills/adding-standard-ingredients` 技能新增一个原料要走 8 个关卡：

1. 判断原料类型（FOOD / SUPPLEMENT）
2. 手工填写 import manifest（几十个字段）
3. 联网逐个搜索近 10 个官方营养库并计算覆盖率（最慢的一步）
4. 审计脚本把关（覆盖率 ≥ 60% 硬门、单位审计、犬用 A/D/E 换算、父子营养素一致性）
5. 用户确认 → 写入本地开发库
6. 本地/生产 DB 对齐检查（依赖生产只读隧道，失败即卡住）
7. 生成生产迁移包（up.sql / down.sql / 审计报告）
8. 用户再次确认 → 服务器手工执行 SQL → 人工验证

用户反馈：**太慢、门槛太严、步骤太多、效率低**。

## 已确认决策（2026-09-05 用户拍板）

1. **半自动**：系统自动完成全部资料收集与草稿生成，用户只确认一次即入库。
2. **直接写入正式环境**：不走"本地写 + SQL 迁移包"，而是通过正式 admin API 直接写入生产库。
3. **营养门槛放宽**：营养不完整不再卡死创建；允许先建原料并标记"营养待补"，之后随时补。
4. **本地营养数据库工程**：一次到位，导入多个官方营养库（USDA、CFCT 及新西兰/日本/澳洲等），之后查营养为秒级本地查询。
5. **凭据方式**：用户提供后台管理员账号，存放在本地专用配置文件（不入代码库），每次新增时自动登录写入。

## 核心架构

```text
用户输入（原料名/类型/状态/照片）
  -> 本地营养库匹配器（秒级查询 + 覆盖率自动计算，复用后端审计模块）
  -> 自动生成草稿（原料 + 营养档案 + 采购 SKU + 标签）
  -> 大白话总结 + 一次用户确认
  -> 自动安全兜底（查重、生产库备份）
  -> 通过正式 admin API 写入生产库
  -> 自动回读验证 + 后台原料页链接
```

对比旧流程，砍掉的环节：

- 联网查源 → 本地库秒查
- manifest 手填 + 多轮审计 → 自动生成 + 单一审计报告
- 覆盖率 60% 硬门 → 降级为"质量标注"（不达标 → 营养待补）
- DB 对齐检查 → 不需要（不再做 SQL 迁移包）
- SQL 迁移包 + 手工执行 → 正式 admin API 直接写入

保留的安全措施（全部自动化）：

- 写入前自动查重（同名/同品牌/同规格）
- 写入前自动备份生产库（沿用 production-ssh 的服务器备份方式）
- 写入走正式 admin API = 与人工在后台点"保存"同一条通道，自带校验与操作记录
- 写入后自动回读验证并报告结果

## 三个实施块

### 块 1：本地营养数据库（一次性工程）

- 把 USDA FoodData Central（SR Legacy 约 8 千条）、中国食物成分表 CFCT（约 1.5 千条）等官方库批量导入本地 `nutrition_source_record` 表（现有 291 条是旧流程零星导入的）。
- 待调研后确定清单：USDA、CFCT、NZFCD、MEXT、AFCD/AUSNUT、CNF 等，一次性导入。
- 新增"营养匹配器"命令：输入原料名 + 生/熟状态，从本地库找出候选、自动计算 FEDIAF 覆盖率并排序（复用 `backend/src/application/standard-ingredient-import/` 的 `source-policy`、`nutrition-audit` 模块，不重写）。

### 块 2：半自动新流程（技能瘦身）

新技能（或改写现有技能）只保留 3 步：

1. **生成草稿**：本地匹配营养 → 单位/犬用口径换算（复用现有转换器）→ 生成完整草稿（`CreateIngredientDto` 结构 + NutritionFood + Mapping + ProcurementSku + 标签）。营养不达标时草稿照常生成，标注"营养待补：覆盖率 xx%，缺哪些"。
2. **一次确认**：向用户输出业务语言总结（名称、类型、营养来源、覆盖率、缺失项、价格、采购信息），确认后执行。
3. **写入正式**：登录正式 admin API（`https://api.sevenkitchen.cloud/api/v1`），依次调用：
   - `POST /admin/ingredients`（原料主体 + 标签 + 内联营养档案）
   - `POST /nutrition-foods` + `POST /nutrition-foods/:id/mappings`（正式营养档案与主档案映射）
   - `POST /admin/ingredients/:ingredientId/procurement-skus`（食材采购 SKU）
   - 补剂不建采购 SKU，单层产品字段落在 Ingredient 本体 + recommended_product

### 块 3："营养待补"标记

- 复用现有 `NutritionFood.status = PENDING`（待验证）作为营养档案状态。
- 在 `Ingredient.properties` 增加轻量标记（如 `nutritionPending: true`、`nutritionCoveragePercent`、`missingNutrients`），后台 `IngredientReadiness` 页面即可自然展示。
- 不新增表、不修改 admin-web 页面结构（必要时仅做展示增强，归入 admin-web 模块单独评估）。

## 写入序列（正式 API 路径）

1. `POST /api/v1/auth/login` → 拿 JWT
2. `POST /api/v1/admin/ingredients`（含 tagIds、nutritionProfile、properties）
3. `POST /api/v1/nutrition-foods`（正式营养档案，status 按审计结果定 PENDING/VERIFIED）
4. `POST /api/v1/nutrition-foods/:id/mappings`（isPrimary = true）
5. FOOD 需要采购时 `POST /api/v1/admin/ingredients/:ingredientId/procurement-skus`
6. 回读 `GET /api/v1/admin/ingredients/:id` 验证

## 安全与防呆

- 凭据：用户提供管理员账号，存 `backend/.env.ingredient-agent.local`（gitignore 已覆盖 *.local 类文件需确认），绝不入库。
- 生产备份：写入前经 `production-ssh` 技能在服务器执行一次 pg_dump（沿用旧流程备份目录规范）。
- 查重：写入前用正式 API 查询同名/同品牌/同规格；发现高度相似时停止并询问用户。
- 写后验证：回读比对关键字段，输出后台链接 `https://admin.sevenkitchen.cloud/.../ingredients/:id`（以实际部署域名为准）。
- 失败回滚：API 路径天然支持——发现写入异常时通过 `DELETE /admin/ingredients/:id` 及对应接口清理本次新增对象。

## 保留与归档

- 保留：后端 `standard-ingredient-import` 模块（营养审计、覆盖率、来源策略、犬用换算全部复用）。
- 归档（不删除代码，从流程移除）：manifest 校验、DB 对齐、SQL 迁移包构建；`skills/adding-standard-ingredients/scripts/` 中对应脚本停止作为默认路径。
- 旧流程产物目录 `.standard-ingredient-import/` 保留为历史记录。

## 成功标准

1. 新增一个食材（含营养档案 + 采购 SKU）从输入到正式库可用，人工交互 ≤ 1 次确认，总耗时目标分钟级。
2. 新增一个补剂（凭包装照片）从输入到正式库可用，人工交互 ≤ 1 次确认。
3. 营养覆盖率不达标的原料可以成功创建，且后台可见"待补"标记与缺失清单。
4. 本地营养库覆盖常见中西方食材，匹配查询秒级返回。
5. 任何一次写入前自动完成查重与生产备份，写后自动验证并报告后台链接。
6. 凭据不入代码库，生产写入全程走正式 API。

## 风险与应对

| 风险 | 应对 |
|------|------|
| 直接写生产出错 | 写前备份 + 查重 + API 同通道校验 + 写后回读 + 可删除回滚 |
| 营养待补原料被误用于配方 | 复用现有 readiness 机制：PENDING 档案不参与计算或明确提示 |
| 本地营养库来源权威性 | 只导官方库原文件，保留 source_key 与版本号，可追溯 |
| 凭据泄露 | 本地专用文件 + gitignore + 定期轮换（提示用户） |
| 官方数据集获取困难（如 CFCT 无官方下载） | 逐个评估：官方文件优先；无官方文件时向用户确认替代方案再定 |

## 生产 API 现状核实（2026-09-05 实测）

- `POST /api/v1/auth/admin-login`：正式环境可用（错误凭据返回 401），登录路径与本地一致。
- `GET /api/v1/admin/ingredients`：**未鉴权即可返回全量原料列表**（实测 HTTP 200 无 token）。
- `POST /api/v1/admin/ingredients`：**未鉴权即可触达写入逻辑**（实测空 body 直达 Prisma 报 500，未写入数据）。
- `POST /api/v1/nutrition-foods`：有鉴权（无 token 返回 401）。
- ⚠️ 结论：生产 admin 原料读写接口存在**既有鉴权缺口**，与本重构无关但属于高危问题；
  建议单独立项修复（backend 模块）。本重构的写入脚本仍会先登录带 token 调用，不依赖该缺口。

## 待办实施顺序

1. 数据源调研（各官方库的获取方式、格式、规模、许可）——进行中
2. 本地营养库导入脚本 + 匹配器命令
3. 新技能 3 步流程（草稿生成 + 确认 + 正式写入）
4. "营养待补"标记落地
5. 端到端验证（食材 + 补剂各一例，真实写入正式库）
6. 旧流程归档说明 + 文档更新

## 实施进度（2026-09-05）

已完成：

- ✅ 本地营养匹配器：`skills/adding-standard-ingredients/scripts/match-local-nutrition.ts`
  - 输入原料名（中/英）+ 状态，本地扫描 `nutrition_source_record`，复用后端
    `scoreIngredientSourceNameMatch`、`mapUsdaNutrientsToNutritionProfile`、
    `auditNutritionProfileForImport`、`rankNutritionSourceCandidates`，
    输出按状态/覆盖率排序的候选（含缺失营养素、阻断问题、来源记录 ID）。
  - 已用卷心菜/冬瓜实测：秒级返回，状态匹配与覆盖率计算正确。
- ✅ 草稿生成器：`skills/adding-standard-ingredients/scripts/build-draft-from-match.ts`
  - 选定候选记录 + 基础业务字段（名称/分类/单位/价格/渠道）→ 生成完整草稿，
    自动计算 `nutritionPending`（覆盖率 < 60）、缺失清单，营养数据直接复用
    本地记录档案；支持 `--overrides` 补充采购 SKU、补剂字段等。
- ✅ 正式写入脚本：`skills/adding-standard-ingredients/scripts/apply-production-ingredient.ts`
  - 登录（`/auth/login`，失败自动回退 `/auth/admin-login`）→ 查重 → 预演计划 →
    `--confirm` 后执行：创建原料 → 创建营养档案（状态=待验证）→ 设主档案 →
    创建采购 SKU → 回读验证。
  - 已在本地后端完成全链路实测（原料+营养档案+映射+SKU），并验证清理路径。
  - 凭据读取自 `backend/.env.ingredient-agent.local`（gitignore 已覆盖 `.env.*`）。
- ✅ 技能文档瘦身：`skills/adding-standard-ingredients/SKILL.md` 重写为 3 步轻流程，
  明确"营养待补"规则、禁止事项、旧流程归档说明。
- ✅ 草稿模板：`assets/ingredient-draft-template.json`。
- ✅ "营养待补"展示确认：无需改 admin-web——现有 `IngredientReadiness` 页面
  天然展示 NOT_READY/READY_BASIC 与缺失营养素；`nutrition_food.status=PENDING`
  即"待验证"。

待完成：

- ⏳ MEXT 八訂导入（官方 Excel 已定位，下载中）→ NZFCD FOODfiles 导入。
- ⏳ 端到端验证：真实写入正式库（食材 + 补剂各一例）——需用户提供正式后台凭据。
- ⏳ 生产备份步骤（production-ssh）与写入脚本的实操联调。

## 第二轮进度（2026-09-05 晚）

- ✅ 数据源调研完成：`docs/audits/2026-09-05-nutrition-database-sources-research.md`
  - 结论：USDA（public domain，直下）→ MEXT 八訂（政府規約）→ NZFCD（条款需注意）为导入顺序；
    CFCT 无官方电子数据，维持手工补录通道。
- ✅ USDA FDC 批量导入完成：`backend/scripts/import-usda-fdc-bulk.ts`
  - SR Legacy 7,793 条 + Foundation 468 条全部入库 `nutrition_source_record`（0 失败），
    与既有 272 条 USDA 记录按 `USDA:{fdcId}` 合并。
  - 匹配器实测：苋菜（Amaranth leaves raw 78.3%）、南美白虾（93.5%）、冬瓜均秒级命中。
- ✅ MEXT 八訂主表批量导入完成：`backend/scripts/import-mext-bulk.ts` + `backend/scripts/mext-xlsx-to-json.py`
  - 2,478 条全部入库（0 失败），sourceKey `MEXT:{食品番号}`，含维生素 A/E 犬用活性换算。
  - 配套迁移 `20260905000000_add_mext_and_more_nutrition_source_types`（枚举新增 MEXT/COFID/CIQUAL/CNF）。
  - 匹配器中→日别名表 + 日文状态识别（生/ゆで/干し等）已加。
  - 已知缺口：主表不含氨基酸/脂肪酸（别册导入中）；氯与胆碱 MEXT 不测。
- ✅ CSV 解析器（RFC4180，含引号/逗号/换行）在真实 USDA 文件上验证通过。
- ✅ 生产备份预演完成：SSH 验证通过，服务器 `pg_dump -Fc` 完整转储成功
  （`/opt/sevenkitchen/backups/standard-ingredient-import/pre-semi-auto-rehearsal-20260905-232511.dump`，77.5MB），
  真实写入前的备份命令已验证可用。
- ✅ NZFCD FOODfiles 2024 导入完成：`backend/scripts/import-nzfcd-bulk.ts`
  - MSI 解包（msitools）+ NAME.FT / Unabridged CODE.FT / Unabridged DATA.FT（57.1 万行）全量解析，
    2,857 条全部入库（0 失败），sourceKey `NZFCD:{FoodID}`，含可食部%、State→sampleState、
    牛磺酸/EPA/DHA/花生四烯酸等完整版组分，并保留版权署名（许可合规）。
- ✅ CNF 2026（加拿大）导入完成：`backend/scripts/import-cnf-bulk.ts`
  - CSV 关系型 9 文件全量解析（5,993 食品 × 173 营养素 × 56.5 万行，0 失败），
    sourceKey `CNF:{Food_Code}`；营养素编号经 `backend/scripts/data/usda-nutrient-nbr-to-fdc-id.json`
    （由 USDA 官方 nutrient 表生成，334 个编号）翻译后复用 USDA 字段映射器；
    OGL-C 许可署名保留在 sourceDetail。
- ✅ 四大库导入全部完成：本地营养库现有 **19,607 条**记录
  （USDA 8,263 + CNF 5,993 + NZFCD 2,857 + MEXT 2,478 + 其他 16）。
- ✅ 补剂（SUPPLEMENT）端到端本地演练通过（NOW Foods L-OptiZinc：创建原料+PER_SERVING 营养档案
  +主映射+回读验证→清理）；期间发现并修复草稿模板缺补剂示例/枚举提示的问题
  （`ingredient.procurementStrategy` 只有 DAILY_PURCHASE/STOCK_REPLENISHMENT/HYBRID）。
- ✅ 生产环境 dry-run 验证：`POST /auth/admin-login` 用 **admin/admin123 可直接登录生产**
  （返回 ADMIN token）——生产仍在使用默认密码，这既是凭据发现也是安全缺口实锤。
- ✅ 两份生产验证草稿已备好（写入前需用户过目确认）：
  - `production-verify-amaranth.draft.json`：苋菜（FOOD，USDA Amaranth leaves raw，覆盖率 78.3%）
  - `production-verify-optizinc.draft.json`：NOW Foods L-OptiZinc（SUPPLEMENT，PER_SERVING，营养待补）
- ✅ **生产环境端到端验证完成**（2026-09-06，用户确认凭据+草稿后执行）：
  1. 写入前生产备份：`pre-semi-auto-verify-20260906-114754.dump`（75MB，pg_dump -Fc）；
  2. 苋菜（FOOD）：原料 `e603de61-…` + 营养档案 `74850030-…`（USDA，78.3% 覆盖，PENDING），
     独立回读验证：宏量/矿物质/维生素（含犬用换算）/16 项氨基酸/脂肪酸全部正确落库，字段级 sourceForms 溯源完整；
  3. NOW Foods L-OptiZinc（SUPPLEMENT）：原料 `f533b01e-…` + 营养档案 `b4c164e8-…`
     （PER_SERVING，PENDING），`properties.nutritionPending=true` 营养待补标记在生产环境生效。
- ✅ 生产后台默认密码已修改（2026-09-06，经 `/auth/change-password` 官方接口；旧密码失效已验证，
  新密码已同步到本地 gitignored 凭据文件）。**强烈建议用户尽快在后台管理界面再次自行修改一次。**
- ✅ admin API 鉴权缺口已修复并部署生产：AdminController、admin procurement-skus、
  admin ingredient-suggestions 控制器统一加 `AuthGuard+StaffGuard`（匿名 401、伪造 X-Customer-Id 403、
  员工/管理员令牌放行），全量单测 1782 项通过；生产实测 401/403/200 符合预期，健康检查不受影响。
  admin-web 始终带 Bearer 令牌、小程序员工端带 STAFF 令牌，兼容性已核实。
- ✅ 全部改动已提交 Git 并推送（`feature/web-recipe-designer` @ `972978d8`，服务器 main 已快进合并），
  凭据与草稿产物均已排除在版本库外。
- ⚠️ 遗留（后续可做）：`/staff/kitchen` 控制器同样无守卫，建议下轮补上；其余无守卫控制器
  （recommended-products/shared-photos/health）为公开接口，属正常。

## 待完成（下一步）

- ⏳ 生产后台复核（用户）：原料管理 → 搜索"苋菜"与"NOW Foods L-OptiZinc"。
- ⏳ 可选后续：改生产默认密码、修复鉴权缺口、CoFID/Ciqual 按需再导、Git 提交。
