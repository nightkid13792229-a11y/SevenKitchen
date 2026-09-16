# AI 合规卖点生成 + 标签推荐 设计方案（阶段三）

> 版本：v1（2026-09-17）
> 上游：`docs/plans/2026-09-16-recipe-detail-page-ux-design.md`（D3/D6/D8 决策）、`docs/plans/2026-09-17-health-tag-compliance-checklist.md`（字典合规化已完成）
> 目标：让每个食谱都有**合规的一句话卖点与说明**，并把"打标签"从人工负担变成"AI 推荐 + 人工确认"

---

## 一、目标与价值

| 问题 | 现状 | 本方案 |
|------|------|--------|
| 食谱没有卖点 | 详情页只能展示名称与配方，家长不知道"为什么选它" | AI 生成一句话卖点 + 详细说明，落到 `sellingPoint` / `description` |
| 运营写不出合规文案 | 之前出现「抗炎」「肾脏友好」等违规表述 | 提示词内嵌合规边界 + 服务端敏感词兜底 |
| 打标签是人工负担 | 242 个食谱人工打标不现实 | AI 读配方推荐合规标签，人工点确认 |
| 合规风险难追溯 | 无法知道文案是谁写的、依据什么 | 生成→人工确认→保存，全程留痕 |

---

## 二、可复用的现有资产（已核实）

| 资产 | 位置 | 用途 |
|------|------|------|
| AI 用途注册表 | `admin-web/src/constants/agentPurposes.ts` | 已有 `DEFAULT` / `RECIPE_DESIGN` / `NUTRITION_REVIEW` / `SUPPLEMENT_LABEL`，每项可独立配模型 |
| DeepSeek 客户端 | `backend/src/application/recipe-designer/deepseek-chat.ts` | `callDeepSeekJson()` / `parseDeepSeekJsonOutput()` |
| AI 服务范式 | `backend/src/application/recipe-designer/ai-design-suggestion.service.ts` | `isAvailable()` + `generate()` + 系统提示词 + `normalize*` |
| 供应商配置 | `backend/src/application/nutrition-governance/agent-provider-config.service.ts` | `getEnabledDeepSeekRuntimeConfig({ purpose })` |
| 接口范式 | `backend/src/interfaces/controllers/recipe-designer.controller.ts` | `@Controller('api/v1/recipe-designer')` + `AuthGuard`/`StaffGuard`，如 `POST dogs/:dogId/design-insight/ai-suggest` |
| 标签主数据 | `RecipeHealthTag`（含层级/排序/颜色）+ `RecipeHealthTagAssignment` | 标签是数据，后台可维护 |

---

## 三、合规标签词表（可直接落库）

### 3.1 白名单（按四层卖点组织）

**第一层 · 原料事实**（成分声称：须在原料组成中标注该原料添加量）

| 标签 | 说明 |
|------|------|
| 含三文鱼 / 含鳕鱼 / 含青花鱼 / 含青口贝 / 含生蚝 | 水产类 |
| 含牛肉 / 含猪肉 / 含鸡胸 / 含鸭胸 / 含火鸡 / 含兔肉 / 含鹿肉 / 含羊肉 | 畜禽类 |
| 含红薯 / 含南瓜 / 含山药 / 含土豆 / 含芋头 | 根茎类 |
| 含燕麦 / 含糙米 / 含小米 / 含藜麦 | 谷物类 |
| 含西兰花 / 含胡萝卜 / 含西葫芦 / 含卷心菜 | 蔬菜类 |
| 含三文鱼油 / 含小麦胚芽油 | 油脂类 |
| 单一动物蛋白 | 须核对配方确为单一动物源 |

**第二层 · 工艺特性**（须与实际工艺一致）

| 标签 | 说明 |
|------|------|
| 鲜肉现制 | 与"按单现做"模式一致 |
| 低温蒸煮 | 工艺事实 |
| 冷链配送 | 物流事实 |
| 无防腐剂 | 法规允许对饲料添加剂作"无××"声称 |

**第三层 · 适用对象**（生命阶段类，法规明确允许）

| 标签 | 说明 |
|------|------|
| 幼犬期 / 成犬维持 / 老年犬 / 妊娠期 / 哺乳期 | 与生命阶段字典一致 |
| 挑食友好 | 适用场景（现保留） |
| 易消化 | ⚠️ 属功能声称，**须能举证**（可消化性数据/文献） |
| 低脂 | ⚠️ **须满足法规数值门槛**（见 3.3），建议系统自动校验后才可勾选 |

**第四层 · 标准背书**

| 标签 | 说明 |
|------|------|
| 符合 FEDIAF 2021 / FEDIAF 2025 | 须能提供检测报告或配方作为证明材料 |

### 3.2 黑名单（禁用，AI 输出与人工输入双重拦截）

```
疾病名：肾、肾脏、肝、肝脏、关节、心脏、皮肤、肿瘤、癌、结石、糖尿病、胰腺、IBD、炎症、过敏
医疗/功效：抗炎、消炎、治疗、改善、预防、处方、药、护肾、护肝、排毒、增强免疫、抗癌
不规范：低敏、脱敏、无谷（如配方含谷物）、天然（未达"天然粮"条件时）
```

> 说明："无谷"仅在配方确实不含谷物时可用；"天然"须符合第二十条第（四）项对"天然粮"的严格条件（所有原料未经化学工艺加工等），默认禁用以免误用。

### 3.3 「低脂」数值门槛（自动校验规则）

犬用：水分 <20% → 湿基脂肪 ≤9%；20%~65% → ≤7%；**>65% → ≤4%**。
校验：`湿基脂肪 = 脂肪%(DM) × (1 − 水分%)`。
建议：**勾选「低脂」时自动校验，不达标不允许保存**（避免再次出现已清理的 12 条超标问题）。

---

## 四、AI 卖点生成设计

### 4.1 新增 AI 用途

- 用途常量：`RECIPE_COPYWRITING`（标签名建议「食谱文案生成」）
- 建议模型：`deepseek-v4-pro`（与「食谱设计建议」同档，文案质量优先）
- 注册位置：`admin-web/src/constants/agentPurposes.ts`（后台可独立配模型/密钥）

### 4.2 输入（结构化事实，避免 AI 臆测）

```jsonc
{
  "task": "generate_recipe_selling_point",
  "recipe": {
    "name": "燕麦鳕鱼猪肉",
    "nutritionStandard": "FEDIAF_2025",
    "lifeStages": ["ADULT", "SENIOR"],
    "energyDensityKcalPerKg": 1244,
    "moisturePercent": 69.2,
    "fatPercentDm": 10.5,
    "proteinPercentDm": 45.2,
    "ingredients": [{ "name": "鳕鱼", "type": "FOOD", "ratio": 11.2 }, ...],
    "supplements": [{ "name": "碳酸钙粉", "target": "每kg食材添加2800mg钙" }],
    "currentDescription": "……"
  },
  "allowedTags": ["含鳕鱼", "含红薯", "成犬维持", "老年犬", "符合 FEDIAF 2025"],
  "forbiddenPatterns": ["肾", "肝", "关节", "抗炎", "改善", "预防", "治疗", "低敏", "..."]
}
```

> 关键设计：**只把"已审核的白名单标签"与"配方事实"交给 AI**，不允许它自行发明卖点维度。

### 4.3 输出

```jsonc
{
  "sellingPoint": "含鳕鱼与红薯，符合 FEDIAF 2025 的成犬日常维持鲜食",   // ≤ 30 字，一句话
  "description": "以鳕鱼和猪里脊提供动物蛋白，搭配红薯、燕麦与西兰花……", // 80~150 字，客观描述
  "suggestedTags": ["含鳕鱼", "含红薯", "成犬维持"],                    // 只能从 allowedTags 中选
  "basis": "依据配方原料与营养计算结果"                                  // 留痕：生成依据
}
```

### 4.4 合规兜底（三层防护）

| 层 | 机制 | 位置 |
|----|------|------|
| ① 提示词约束 | 系统提示词内嵌四层白名单 + 黑名单 + "不得涉及疾病/功效"硬规则 | 后端服务 |
| ② 输出校验 | 生成结果**必须**过敏感词扫描；命中则整条拒绝并返回原因 | 后端服务 |
| ③ 人工确认 | 编辑页「生成 → 预览 → 修改 → 保存」，**不自动发布** | admin-web |

建议②的词表做成**可配置**（数据库或配置文件），而非写死在代码里。

### 4.5 接口设计（沿用现有范式）

```
POST /api/v1/recipe-designer/recipes/:recipeId/ai-copywriting      # 仅生成，不落库
  鉴权：AuthGuard + StaffGuard（内部角色）
  返回：{ sellingPoint, description, suggestedTags, basis, provider }

POST /api/v1/recipe-designer/recipes/:recipeId/ai-copywriting/apply # 人工确认后落库
  返回：更新后的 recipe（含 sellingPoint / description / 标签关联）
```

---

## 五、数据模型变更

| 变更 | 内容 | 说明 |
|------|------|------|
| 新增字段 | `Recipe.sellingPoint String? @db.VarChar(120)` | 一句话卖点（≤30 字足够） |
| 新增枚举 | `AGENT_PURPOSES` 增加 `RECIPE_COPYWRITING` | 前端常量，无 migration |
| 复用 | `description` | 详细说明（已有字段） |
| 复用 | `RecipeHealthTagAssignment` | 推荐标签落库走现有关系 |

> migration 规范：按 CLAUDE.md 要求走 **Prisma migration**，不直接改库。

---

## 六、后台交互设计（`admin-web/src/views/Recipes/RecipeForm.vue`）

```
食谱说明  [AI 生成卖点与说明]  ← 新增按钮（无 AI 配置时置灰并提示）
   ┌─────────────────────────────────────┐
   │ 一句话卖点*                          │
   │ [含鳕鱼与红薯，符合 FEDIAF 2025…]   │
   │                                      │
   │ 详细说明                             │
   │ [以鳕鱼和猪里脊提供动物蛋白……]      │
   │                                      │
   │ 推荐标签（点击采纳）                 │
   │ [含鳕鱼] [含红薯] [成犬维持]         │
   │                                      │
   │ 生成依据：依据配方原料与营养计算结果  │
   │            [重新生成]  [采纳并保存]  │
   └─────────────────────────────────────┘
```

关键交互约束：
1. **生成的是草稿**，人工可编辑后再保存（不覆盖已有内容，替换前二次确认）
2. 推荐标签**逐个点击采纳**，不自动全选
3. 命中敏感词时**明确提示命中了哪个词**，而不是笼统报错
4. 采纳后记录 `basis` 与生成时间（留痕，便于追溯）

---

## 七、实施步骤（建议顺序）

| 步骤 | 内容 | 依赖 |
|:---:|------|------|
| 1 | 落库合规标签词表（后台批量创建白名单标签） | 纯数据操作 |
| 2 | 后端：`Recipe.sellingPoint` 字段 + Prisma migration | 后端 |
| 3 | 后端：`RecipeCopywritingService` + 敏感词校验 + 两个接口 | 依赖 2 |
| 4 | 后端：注册 `RECIPE_COPYWRITING` 用途 + 后台配置模型/密钥 | 依赖 3 |
| 5 | admin-web：`agentPurposes` 增加用途项 | 独立 |
| 6 | admin-web：`RecipeForm.vue` 接入生成/预览/采纳 | 依赖 3、5 |
| 7 | 后端：`低脂` 标签保存时自动校验数值门槛 | 独立 |
| 8 | 详情页：展示 `sellingPoint`（阶段四） | 依赖 2、6 |

---

## 八、需要你确认的事项

1. **合规标签词表**（第三节）：是否认可？需要增删哪些？特别是「易消化」是否需要（它需要举证材料）？
2. **`低脂` 自动校验**：是否采纳"不达标不允许勾选"（防止再次超标）？
3. **AI 用途命名与模型**：`RECIPE_COPYWRITING` / 「食谱文案生成」/ `deepseek-v4-pro`，是否可以？
4. **落地范围**：本方案涉及 **backend + admin-web + miniapp** 三个模块，是否全部由我推进？还是先做后端+后台（1~7 步），详情页展示（第 8 步）随后？
5. **标签批量创建**：白名单标签（约 30 个）需要人工在后台创建，还是我写一个 seed 脚本批量建？
