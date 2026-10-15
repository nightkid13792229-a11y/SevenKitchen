# 标准原料入库 · 油麦菜

**日期**：2026-10-16
**原料**：油麦菜（叶用莴苣，*Lactuca sativa* var. *angustata*）
**类型**：FOOD（食材）
**执行方式**：skills/adding-standard-ingredients 半自动流程，走正式 admin API 写入

---

## 一、为什么用中国食物成分表打底

本地营养库（约 1.96 万条）里**没有叫「油麦菜」的档案**。检索结论：

| 来源 | 检索结果 |
|---|---|
| MEXT（日本八訂） | `レタス類` 只有 7 条（结球莴苣土耕/水耕、リーフレタス、サニーレタス、サラダな、コスレタス、サンチュ）。**没有「茎レタス／ステムレタス」**，即无油麦菜。 |
| USDA FDC | `Celtuce, raw`（169990）——**莴笋**，与油麦菜同种不同栽培型（吃茎 vs 吃叶），覆盖率 71.7% 但身份不精确。 |
| CNF（加拿大） | `Celtuce, raw`（2051），覆盖率 41.3%，不达标。 |
| CFCT（中国） | **`045334 油麦菜`，身份精确**。 |

按来源政策「先匹配身份、再匹配状态」，采用 **CFCT 油麦菜** 为主档。

---

## 二、CFCT 原始出处

《中国食物成分表 标准版 第六版 第一册》（杨月欣 主编，北京大学医学出版社，2018）

| 内容 | 位置 |
|---|---|
| 主表（水分/能量/蛋白/脂肪/碳水/灰分/维A/B1/B2） | 第 74 页（PDF p98）第 7 行 |
| 续表（矿物质/维C/烟酸/维E） | 第 75 页（PDF p99）第 7 行 |
| 碘 | 第 212 页「常见食物中碘含量」序号 127 油麦菜（代表值）= 3.1 µg/100g |
| 胆碱/生物素/泛酸 | 第 229 页：油麦菜三项均为「—」（未检测） |
| 样品描述 | 第 30 页：`045334 油麦菜 生、鲜。见附图 去根，数斤混合打匀 2002.8 北京市崇文门菜市场` |
| 氨基酸（表二 p154-187） | **无油麦菜行** |
| 脂肪酸（表三 p190-229） | **无油麦菜行** |

食物编码 `045334`，属「蔬菜类及制品 / 嫩茎、叶、花菜类」，食部 81%。

---

## 三、⚠️ OCR 列错位（人工复核抓到的）

后端 `import:cfct-ocr-source` 自动结构化把**续表整列读错位**：

| 字段 | 自动 OCR 结果 | 照书页核对后的正确值 |
|---|---|---|
| 灰分 ash | **63**（把总维生素A 串进来了） | 0.5 |
| 镁 magnesium | **0.5**（实为铁） | 23 |
| 铁 iron | **0.24**（实为锌） | 0.5 |
| 锌 zinc | **0.16**（实为硒） | 0.24 |
| 硒 selenium | **0.02**（实为铜） | 0.16 |
| 铜 copper | **0.06**（实为锰） | 0.02 |
| 锰 manganese | 丢失 | 0.06 |

自动结构化同时给出 `MACRO_SUM_OUT_OF_RANGE` + `CONTINUATION_INCOMPLETE`，状态 `NEEDS_REVIEW`。
**本档案的全部数值均为人工对着书页原图逐格核对后填写**，未直接采用 OCR 输出。

---

## 四、方案对比（FEDIAF 2025 犬必需营养素 46 项）

| 方案 | 覆盖率 | 核心数值来源 |
|---|---|---|
| ① 纯 CFCT 油麦菜 | 45.7% | 油麦菜 |
| **② CFCT 打底 + 只补氨基酸（采用）** | **71.7%** | **油麦菜**（氨基酸借同种莴苣） |
| ③ CFCT + USDA 补齐所有空缺 | 78.3% | 油麦菜（更多字段借莴苣） |
| ④ 纯 USDA Celtuce | 71.7% | **莴笋**（非油麦菜） |

老板 2026-10-16 选定 **方案 ②**：核心营养数值全部来自 CFCT 油麦菜，仅 CFCT 未检测的 15 个氨基酸字段借用同种莴苣 USDA FDC 169990。
膳食纤维 / 维生素B5 / B6 / 叶酸 保持空缺，不借用，留给后台营养治理流程后续补。

---

## 五、写入结果

| 项目 | 值 |
|---|---|
| 原料 ID | `086d7b67-3252-4d0e-98e1-be6b0ef0f8b0` |
| 原料名 | 油麦菜 |
| 采购规格 | 份 / 500g / 3.98 元 |
| 营养档案 ID | `0291dff2-74f0-4a12-866e-1ed64fcbfc59` |
| 营养档案名 | 油麦菜（生） |
| 档案状态 | **VERIFIED（已验证）**，2026-10-16 由老板审核通过后转入 |
| dataSource / externalId | CFCT / 045334 |
| 映射 ID | `6f005797-2f96-4ff4-baca-b8eaad5f53a1`（主档案，出肉率 1） |
| 生产库 FOOD 食材数 | 118 → **119** |

### 审核与转「已验证」

1. 老板 2026-10-16 在后台核对原料与营养档案，回复「没问题」。
2. 调用 `PATCH /api/v1/nutrition-foods/0291dff2-.../verify` 转入 `VERIFIED`
   （`verifiedBy=admin-user-001`，`verifiedAt=2026-10-15T19:08:34.760Z`）。
3. 直连生产库复核：`status = VERIFIED` ✓

复现：`node -r ts-node/register -r tsconfig-paths/register ../.standard-ingredient-import/youmaicai/verify-nutrition-food.ts --id <档案ID> [--confirm]`

写入前已备份生产库：`/opt/sevenkitchen/backups/standard-ingredient-import/pre-youmaicai-standard-ingredient-20261016-025717.dump`
（86 MB，sha256 `34e6e4de5165f16456360620c25db1e21b3d3ea16e61652be1ce72a19f2cf4c3`，114 个表数据条目）

---

## 六、过敏避雷闸门

`backend/prisma/seed-allergen-vocabulary.ts` 的 `REVIEWED_NON_ALLERGEN_INGREDIENTS` 是白名单制：
原料库出现不在清单里的新食材时，脚本**直接失败**（防止「鸡胸【有机】」那类无声漏标）。

已把「油麦菜」补进蔬菜类，并用**生产库真实 119 个食材名单**复核：

```
生产库 FOOD 食材: 119
已标过敏原: 65
未标过敏原: 54（蔬菜/水果/菌菇/油脂/种子类）
其中不在「已复核」清单里的: 0
✅ 闸门通过
```

⚠️ 该代码改动**尚未部署**：工作区存在另一工作流未完成的疫苗模块改动（未提交的 schema + migration），
且 Oct 15 有未部署的提交，此时部署后端会把不相关内容一并带上生产。

---

## 七、上线后暴露的问题：缺「膳食纤维」导致整片营养评估失效

**现象**（老板 2026-10-16 报）：把油麦菜加进食谱后，右侧「营养评估」整片变「缺数据」，
但「关键比例仪表」「宏量构成」仍正常。

**根因**：配方的能量用**犬用 Atwater 公式**计算，该公式强制要求 5 个字段：

```
水分 · 粗蛋白 · 粗脂肪 · 灰分 · 膳食纤维
```

`admin-web/src/utils/recipeDesigner/dogAtwaterEnergy.ts`：

```ts
const DOG_ATWATER_REQUIRED_FIELDS = ['moisture','crudeProtein','crudeFat','ash','fiber'];
// 任一缺失 → energyKcalPer100g = null
```

而 CFCT 第六版第一册**没有检测油麦菜的膳食纤维**（书中该列为「—」），
方案 ② 又把膳食纤维留在空缺里 → 油麦菜能量 = null
→ **整份食谱能量 = null** → 所有「每1000千卡 / 每兆焦」口径的指标全部 `MISSING_DATA`。

`assessment.ts` 的 `getEntryStatus()`：指标有上下限但算不出值 → 返回 `MISSING_DATA`（界面显示「缺数据」）。

**为什么是"一片"而不是"一项"**：缺的是*能量本身*，而绝大多数指标以能量为分母，
所以一项数据缺口会让整块面板塌掉。

**排查手段**（可复用）：把 `GET /recipe-designer/drafts/<id>/assessment-inputs` 的返回存下来，
用 `admin-web` 的 vitest 跑同款 `assessRecipeDraft()` + `auditDogAtwaterProfile()`，
逐原料打印缺失字段。实测结论：

```
✅ 鸭胸/鸭心/鸭胗/鸭肝/鸡蛋/青花鱼/燕麦米/南瓜/胡萝卜/小麦胚芽油/食用盐 …（能量均可算）
❌ 油麦菜  缺失=[膳食纤维]
（5 个补剂也返回 null，但补剂走 missingValueAsZero 分支，不拖垮合计）
```

**修复**：给油麦菜补 `macros.fiber = 1.7 g/100g`，取自同种莴苣 USDA FDC 169990
（`Fiber, total dietary`，field catalog 中 `macros.fiber` 的对应项就是 USDA 1079），
与氨基酸字段同一处理方式：借用 + 在 `meta.sourceForms['macros.fiber']` 标注来源。
档案仍为 `VERIFIED`（更新接口不改状态）。

**复验**（对着生产实时数据跑同款评估函数）：

| | 修复前 | 修复后 |
|---|---|---|
| 缺数据条目 | **76** | **0** |
| 粗蛋白（每1000千卡） | null | 85.63 ✅达标 |
| 状态统计 | COMPLIANT 41 / MISSING_DATA 76 / INFO 18 | COMPLIANT 116 / INFO 18 / DEFICIENT 1 |

剩下 1 项 DEFICIENT 是这份食谱真实的营养结论（磷 每兆焦 0.277 vs 下限 0.28），不是数据缺失。

### ⚠️ 两个遗留问题（未处理）

1. **苋菜同样缺膳食纤维**（主档案 `data_source=USDA`，状态还是 `PENDING`）。
   全库扫描：`type='FOOD'` 且主档案 `macros.fiber IS NULL` 的只有 **油麦菜（已修）和苋菜**。
   苋菜目前**未被任何配方引用**（`design_recipe_item` 命中 0），所以还没爆，但一旦有人用它就会复现同样问题。
2. **失败模式太差**：一个食材缺一个字段，整块面板变「缺数据」，而界面**不告诉你是哪个食材缺哪个字段**，
   只能靠人观察「加了什么之后变的」。建议在评估结果里带上缺失字段的原料清单，直接显示出来。

---

## 八、复现方式

```bash
# 生成草稿（只读本地营养库）
cd backend
node -r ts-node/register -r tsconfig-paths/register \
  ../.standard-ingredient-import/youmaicai/build-draft.ts

# 复核过敏闸门（需先把生产库食材名单写到 /tmp/prod-food-ingredients.txt）
node -r ts-node/register -r tsconfig-paths/register \
  ../.standard-ingredient-import/youmaicai/check-allergen-gate.ts

# 写入（先不带 --confirm 预演）
node -r ts-node/register -r tsconfig-paths/register \
  ../skills/adding-standard-ingredients/scripts/apply-production-ingredient.ts \
  --draft ../.standard-ingredient-import/youmaicai/youmaicai.draft.json \
  --credentials-env .env.ingredient-agent.local [--confirm]

# 转「已验证」
node -r ts-node/register -r tsconfig-paths/register \
  ../.standard-ingredient-import/youmaicai/verify-nutrition-food.ts \
  --id <nutritionFoodId> [--confirm]

# 补膳食纤维（见第七节）
node -r ts-node/register -r tsconfig-paths/register \
  ../.standard-ingredient-import/youmaicai/fix-fiber.ts \
  --id <nutritionFoodId> [--confirm]

# 只读拉取正式接口数据（排查用）
node -r ts-node/register -r tsconfig-paths/register \
  ../.standard-ingredient-import/youmaicai/prod-api-get.ts \
  --path /recipe-designer/drafts/<draftId>/assessment-inputs --out /tmp/assessment-inputs.json
```

原始 OCR 产物（gitignore，未入库）：`backend/reports/cfct-v1-p23-p125.jsonl`、`cfct-v1-p126-p387.jsonl`
