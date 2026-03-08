# 食谱设计功能 - 技术实施计划

**版本：** 1.0
**日期：** 2026-03-08
**状态：** 待实施
**关联设计文档：** [2026-03-08-recipe-designer-design.md](./2026-03-08-recipe-designer-design.md)

---

## 1. 数据库设计

### 1.1 新增表结构

#### 1.1.1 营养原料库 (NutritionFood)

```prisma
model NutritionFood {
  id             String              @id @default(uuid()) @map("id")
  name           String              @map("name") @db.VarChar(200)
  nameEn         String?             @map("name_en") @db.VarChar(200)
  category       NutritionFoodCategory @map("category")
  dataSource     String              @map("data_source") @db.VarChar(100)
  externalId     String?             @map("external_id") @db.VarChar(100) // USDA FDC ID等
  version        Int                 @default(1) @map("version")
  status         NutritionFoodStatus @default(PENDING) @map("status")
  nutritionData  Json                @map("nutrition_data")
  notes          String?             @map("notes")
  createdBy      String?             @map("created_by")
  verifiedBy     String?             @map("verified_by")
  verifiedAt     DateTime?           @map("verified_at")
  createdAt      DateTime            @default(now()) @map("created_at")
  updatedAt      DateTime            @updatedAt @map("updated_at")
  mappings       NutritionFoodMapping[]

  @@unique([name, dataSource, version])
  @@index([category])
  @@index([status])
  @@index([dataSource])
  @@map("nutrition_food")
}

enum NutritionFoodCategory {
  MEAT              // 肉类
  ORGAN             // 内脏
  SEAFOOD           // 海鲜
  VEGETABLE         // 蔬菜
  FRUIT             // 水果
  GRAIN             // 谷物
  DAIRY             // 乳制品
  EGG               // 蛋类
  OIL               // 油脂
  SUPPLEMENT        // 补剂
  OTHER             // 其他
}

enum NutritionFoodStatus {
  PENDING           // 待验证
  VERIFIED          // 已验证
  DEPRECATED        // 已废弃
}
```

#### 1.1.2 营养原料映射表 (NutritionFoodMapping)

```prisma
model NutritionFoodMapping {
  id              String        @id @default(uuid()) @map("id")
  nutritionFoodId String       @map("nutrition_food_id")
  ingredientId    String       @map("ingredient_id")
  yieldRate       Float        @default(1.0) @map("yield_rate")
  isPrimary       Boolean      @default(false) @map("is_primary")
  notes           String?      @map("notes")
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")
  nutritionFood   NutritionFood @relation(fields: [nutritionFoodId], references: [id], onDelete: Cascade)
  ingredient      Ingredient   @relation(fields: [ingredientId], references: [id])

  @@unique([nutritionFoodId, ingredientId])
  @@index([nutritionFoodId])
  @@index([ingredientId])
  @@map("nutrition_food_mapping")
}
```

#### 1.1.3 设计配方表 (DesignRecipe)

```prisma
model DesignRecipe {
  id                    String              @id @default(uuid()) @map("id")
  name                  String              @map("name") @db.VarChar(200)
  version               Int                 @default(1) @map("version")
  status                DesignRecipeStatus  @default(DRAFT) @map("status")
  energyDensityKcalPerKg Float              @map("energy_density_kcal_per_kg")
  nutritionStandard     String              @default("FEDIAF_2024") @map("nutrition_standard")
  calculatedNutrition   Json                @map("calculated_nutrition")
  complianceStatus      Json                @map("compliance_status")
  complianceScore       Float               @default(0) @map("compliance_score")
  isCompliant           Boolean             @default(false) @map("is_compliant")
  targetHealthTags      String[]            @default([]) @map("target_health_tags")
  applicableLifeStages  String[]            @default([]) @map("applicable_life_stages")
  notes                 String?             @map("notes")
  createdBy             String              @map("created_by")
  publishedAt           DateTime?           @map("published_at")
  publishedRecipeId     String?             @map("published_recipe_id")
  createdAt             DateTime            @default(now()) @map("created_at")
  updatedAt             DateTime            @updatedAt @map("updated_at")
  items                 DesignRecipeItem[]
  aiGenerationLog       DesignRecipeAIGenerationLog?

  @@unique([name, version])
  @@index([status])
  @@index([createdBy])
  @@index([isCompliant])
  @@map("design_recipe")
}

enum DesignRecipeStatus {
  DRAFT               // 草稿
  COMPLIANT           // 已达标
  PUBLISHED           // 已发布
  ARCHIVED            // 已归档
}
```

#### 1.1.4 设计配方明细表 (DesignRecipeItem)

```prisma
model DesignRecipeItem {
  id                  String      @id @default(uuid()) @map("id")
  designRecipeId      String      @map("design_recipe_id")
  nutritionFoodId     String      @map("nutrition_food_id")
  ratioPercent        Float       @map("ratio_percent")
  weightPerKgG        Float       @map("weight_per_kg_g")  // 每kg配方中该原料的克数
  preparationMethod   String?     @map("preparation_method") @db.VarChar(100)
  nutrientTargetKey   String?     @map("nutrient_target_key")
  nutrientTargetValue Float?      @map("nutrient_target_value")
  sortOrder           Int         @default(0) @map("sort_order")
  createdAt           DateTime    @default(now()) @map("created_at")
  updatedAt           DateTime    @updatedAt @map("updated_at")
  designRecipe        DesignRecipe @relation(fields: [designRecipeId], references: [id], onDelete: Cascade)
  nutritionFood       NutritionFood @relation(fields: [nutritionFoodId], references: [id])

  @@index([designRecipeId])
  @@index([nutritionFoodId])
  @@map("design_recipe_item")
}
```

#### 1.1.5 AI生成日志表 (DesignRecipeAIGenerationLog)

```prisma
model DesignRecipeAIGenerationLog {
  id                  String    @id @default(uuid()) @map("id")
  designRecipeId      String    @unique @map("design_recipe_id")
  inputParams         Json      @map("input_params")
  generationModel     String    @map("generation_model") @db.VarChar(100)
  attemptCount        Int       @default(0) @map("attempt_count")
  maxAttempts         Int       @default(10) @map("max_attempts")
  finalAttemptResult  String    @map("final_attempt_result") @db.VarChar(50)
  adjustmentLog       Json      @map("adjustment_log")
  gapReport           Json?     @map("gap_report")
  generatedAt         DateTime  @default(now()) @map("generated_at")
  designRecipe        DesignRecipe @relation(fields: [designRecipeId], references: [id], onDelete: Cascade)

  @@index([generationModel])
  @@index([finalAttemptResult])
  @@map("design_recipe_ai_generation_log")
}
```

#### 1.1.6 FEDIAF营养标准表 (NutritionStandardFediaf)

```prisma
model NutritionStandardFediaf {
  id              String    @id @default(uuid()) @map("id")
  nutrientKey     String    @unique @map("nutrient_key") @db.VarChar(50)
  nutrientName    String    @map("nutrient_name") @db.VarChar(100)
  nutrientNameEn  String    @map("nutrient_name_en") @db.VarChar(100)
  unit            String    @map("unit") @db.VarChar(20)
  category        String    @map("category") @db.VarChar(50)
  minValueAdult   Float?    @map("min_value_adult")
  maxValueAdult   Float?    @map("max_value_adult")
  minValuePuppy   Float?    @map("min_value_puppy")
  maxValuePuppy   Float?    @map("max_value_puppy")
  basis           String    @map("basis") @db.VarChar(20) // DM/AF
  notes           String?   @map("notes")
  sortOrder       Int       @default(0) @map("sort_order")
  isActive        Boolean   @default(true) @map("is_active")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@index([category])
  @@index([isActive])
  @@map("nutrition_standard_fediaf")
}
```

### 1.2 更新现有表

#### 1.2.1 在 Ingredient 表添加关联

```prisma
model Ingredient {
  // ... 现有字段 ...
  nutritionFoodMappings NutritionFoodMapping[]  // 新增
}
```

#### 1.2.2 在 NutritionFood 表添加关联

```prisma
model NutritionFood {
  // ... 现有字段 ...
  designRecipeItems DesignRecipeItem[]  // 新增
}
```

---

## 2. API接口设计

### 2.1 营养原料库接口

#### 2.1.1 获取原料列表
```
GET /api/v1/nutrition-foods
Query: category?, status?, search?, page?, pageSize?
Response: { data: NutritionFood[], total: number, page: number, pageSize: number }
```

#### 2.1.2 获取原料详情
```
GET /api/v1/nutrition-foods/:id
Response: NutritionFood (含映射的采购原料信息)
```

#### 2.1.3 创建原料
```
POST /api/v1/nutrition-foods
Body: { name, category, dataSource, nutritionData, notes? }
Response: NutritionFood
```

#### 2.1.4 从USDA导入
```
POST /api/v1/nutrition-foods/import-usda
Body: { searchQuery }
Response: { results: USDAFood[] }
```

#### 2.1.5 确认导入USDA数据
```
POST /api/v1/nutrition-foods/import-usda/confirm
Body: { fdcId, name?, category }
Response: NutritionFood
```

#### 2.1.6 验证原料
```
PATCH /api/v1/nutrition-foods/:id/verify
Response: NutritionFood
```

#### 2.1.7 创建原料映射
```
POST /api/v1/nutrition-foods/:id/mappings
Body: { ingredientId, yieldRate?, isPrimary?, notes? }
Response: NutritionFoodMapping
```

### 2.2 设计配方接口

#### 2.2.1 获取配方列表
```
GET /api/v1/design-recipes
Query: status?, isCompliant?, createdBy?, search?, page?, pageSize?
Response: { data: DesignRecipe[], total: number, page: number, pageSize: number }
```

#### 2.2.2 获取配方详情
```
GET /api/v1/design-recipes/:id
Response: DesignRecipe (含所有明细和营养计算结果)
```

#### 2.2.3 创建配方
```
POST /api/v1/design-recipes
Body: { name, targetHealthTags?, applicableLifeStages?, notes? }
Response: DesignRecipe
```

#### 2.2.4 添加配方原料
```
POST /api/v1/design-recipes/:id/items
Body: { nutritionFoodId, ratioPercent, preparationMethod?, nutrientTargetKey?, nutrientTargetValue? }
Response: DesignRecipeItem
```

#### 2.2.5 更新配方原料
```
PATCH /api/v1/design-recipes/:id/items/:itemId
Body: { ratioPercent?, preparationMethod?, nutrientTargetKey?, nutrientTargetValue? }
Response: DesignRecipeItem
```

#### 2.2.6 删除配方原料
```
DELETE /api/v1/design-recipes/:id/items/:itemId
Response: { success: true }
```

#### 2.2.7 实时计算营养
```
POST /api/v1/design-recipes/:id/calculate
Body: { items: [{ nutritionFoodId, ratioPercent }] }  // 可选，不传则使用已保存的
Response: { calculatedNutrition, complianceStatus, complianceScore, isCompliant }
```

#### 2.2.8 保存配方
```
PATCH /api/v1/design-recipes/:id
Body: { name?, targetHealthTags?, applicableLifeStages?, notes?, items? }
Response: DesignRecipe
```

#### 2.2.9 获取版本历史
```
GET /api/v1/design-recipes/:id/versions
Response: DesignRecipe[]
```

#### 2.2.10 版本对比
```
GET /api/v1/design-recipes/:id/compare?version1=1&version2=2
Response: { version1: DesignRecipe, version2: DesignRecipe, diff: ComparisonResult }
```

### 2.3 AI辅助生成接口

#### 2.3.1 AI生成配方
```
POST /api/v1/design-recipes/ai-generate
Body: {
  dogId?: string,
  dogProfile?: {  // 如果没有dogId，手动输入
    ageMonths, weightKg, breed?, gender?, isNeutered?, activityLevel?
  },
  healthNeeds: string[],
  tastePreferences: { likes?: string[], dislikes?: string[] },
  ingredientConstraints: { allergies?: string[], allowedCategories?: string[] }
}
Response: {
  candidates: DesignRecipe[],
  generationLog: { attemptCount, finalAttemptResult }
}
```

#### 2.3.2 获取AI生成进度
```
GET /api/v1/design-recipes/ai-generate/:taskId/status
Response: { status, progress, currentAttempt, candidates? }
```

### 2.4 报告导出接口

#### 2.4.1 生成营养分析报告
```
POST /api/v1/design-recipes/:id/report
Body: { format: 'PDF' }
Response: { reportUrl, expiresAt }
```

#### 2.4.2 获取报告预览数据
```
GET /api/v1/design-recipes/:id/report/preview
Response: NutritionReportData
```

### 2.5 FEDIAF标准接口

#### 2.5.1 获取营养标准列表
```
GET /api/v1/nutrition-standards/fediaf
Query: category?, lifeStage?
Response: NutritionStandardFediaf[]
```

---

## 3. 前端页面设计

### 3.1 页面结构

```
/admin/recipe-designer
├── /nutrition-foods           # 营养原料库管理
│   ├── /list                  # 原料列表
│   ├── /create                # 新增原料
│   ├── /import-usda           # USDA导入
│   └── /:id                   # 原料详情/编辑
├── /design                    # 配方设计
│   ├── /list                  # 配方列表
│   ├── /create                # 新建配方（选择方式）
│   ├── /ai-generate           # AI生成入口
│   └── /:id                   # 配方编辑器
└── /standards                 # 营养标准管理
    └── /fediaf                # FEDIAF标准查看
```

### 3.2 配方编辑器组件结构

```
RecipeDesignerPage
├── RecipeHeader               # 配方名称、版本、状态
├── RecipeDesignerLayout
│   ├── IngredientSelector     # 左侧：原料选择
│   │   ├── CategoryFilter
│   │   ├── SearchInput
│   │   ├── USDAImportButton
│   │   └── IngredientList
│   ├── RecipeEditor           # 中间：配方编辑
│   │   ├── RecipeItemList
│   │   ├── RatioSlider        # 配比调整
│   │   └── SupplementSuggester # 补剂建议
│   └── NutritionPanel         # 右侧：营养计算
│       ├── EnergyDensity
│       ├── NutrientTable
│       ├── ComplianceIndicator
│       └── ComplianceScore
├── ActionBar
│   ├── SaveButton
│   ├── CalculateButton
│   ├── ExportReportButton
│   └── PublishButton
└── VersionHistory             # 版本历史侧边栏
```

### 3.3 关键交互流程

#### 3.3.1 手动设计流程
1. 用户从左侧选择原料 → 添加到中间编辑区
2. 调整配比百分比
3. 右侧实时更新营养计算结果
4. 查看达标状态，调整配方
5. 达标后保存并导出报告

#### 3.3.2 AI生成流程
1. 用户填写需求表单
2. 提交后显示进度条
3. 生成3个候选配方
4. 用户选择一个进入编辑模式
5. 可微调后保存

---

## 4. 核心算法实现

### 4.1 营养计算服务

```typescript
// services/nutrition-calculator.service.ts

interface NutritionCalculationInput {
  items: {
    nutritionFoodId: string;
    ratioPercent: number;
  }[];
}

interface NutritionCalculationResult {
  energyDensityKcalPerKg: number;
  calculatedNutrition: Record<string, number>;
  complianceStatus: Record<string, ComplianceStatus>;
  complianceScore: number;
  isCompliant: boolean;
}

interface ComplianceStatus {
  nutrientKey: string;
  currentValue: number;
  minValue: number | null;
  maxValue: number | null;
  status: 'COMPLIANT' | 'BELOW_MIN' | 'ABOVE_MAX' | 'NO_STANDARD';
}

class NutritionCalculatorService {
  /**
   * 计算配方的营养成分
   * 基于每kg配方计算各营养素含量
   */
  async calculate(input: NutritionCalculationInput): Promise<NutritionCalculationResult> {
    // 1. 获取所有原料的营养数据
    // 2. 按配比加权计算
    // 3. 对比FEDIAF标准
    // 4. 计算达标分数
  }

  /**
   * 获取FEDIAF标准
   */
  async getFediafStandards(lifeStage?: 'ADULT' | 'PUPPY'): Promise<NutritionStandardFediaf[]> {
    // ...
  }

  /**
   * 检查单项营养素达标状态
   */
  checkCompliance(nutrientKey: string, value: number, standard: NutritionStandardFediaf): ComplianceStatus {
    // ...
  }
}
```

### 4.2 AI配方生成服务

```typescript
// services/ai-recipe-generator.service.ts

interface AIGenerationInput {
  dogProfile: DogProfileInput;
  healthNeeds: string[];
  tastePreferences: TastePreferences;
  ingredientConstraints: IngredientConstraints;
}

interface AIGenerationResult {
  candidates: DesignRecipe[];
  generationLog: {
    attemptCount: number;
    maxAttempts: number;
    finalAttemptResult: 'SUCCESS' | 'PARTIAL' | 'FAILED';
    adjustmentLog: AdjustmentStep[];
    gapReport?: GapReport;
  };
}

interface AdjustmentStep {
  attemptNumber: number;
  changes: string[];
  previousScore: number;
  currentScore: number;
}

interface GapReport {
  nonCompliantNutrients: {
    nutrientKey: string;
    currentValue: number;
    targetValue: number;
    gap: number;
    gapPercent: number;
    suggestion: string;
  }[];
}

class AIRecipeGeneratorService {
  /**
   * 生成配方（带自动优化）
   */
  async generate(input: AIGenerationInput): Promise<AIGenerationResult> {
    // 1. 解析输入，构建AI提示词
    // 2. 调用AI生成初始配方
    // 3. 计算营养，检查达标
    // 4. 循环优化直到达标或达到上限
    // 5. 返回结果
  }

  /**
   * 单次AI生成
   */
  private async generateOnce(context: GenerationContext): Promise<DesignRecipe> {
    // ...
  }

  /**
   * 自动调整配方
   */
  private async adjustRecipe(recipe: DesignRecipe, gaps: GapReport): Promise<DesignRecipe> {
    // ...
  }
}
```

### 4.3 报告生成服务

```typescript
// services/report-generator.service.ts

class ReportGeneratorService {
  /**
   * 生成PDF报告
   */
  async generatePDF(recipeId: string): Promise<{ reportUrl: string; expiresAt: Date }> {
    // 1. 获取配方数据
    // 2. 获取营养计算结果
    // 3. 使用模板引擎生成HTML
    // 4. 转换为PDF
    // 5. 上传到COS
    // 6. 返回URL
  }
}
```

---

## 5. 开发任务分解

### 5.1 MVP阶段（第一期）

#### Phase 1.1: 数据库与基础架构（预计2-3天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 1.1.1 | 创建数据库迁移文件，添加新表 | P0 |
| 1.1.2 | 执行迁移，验证表结构 | P0 |
| 1.1.3 | 初始化FEDIAF标准数据 | P0 |
| 1.1.4 | 创建Prisma模型和类型定义 | P0 |

#### Phase 1.2: 营养原料库模块（预计3-4天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 1.2.1 | 后端：原料CRUD API | P0 |
| 1.2.2 | 后端：USDA API集成 | P1 |
| 1.2.3 | 后端：原料映射API | P0 |
| 1.2.4 | 前端：原料列表页面 | P0 |
| 1.2.5 | 前端：原料创建/编辑表单 | P0 |
| 1.2.6 | 前端：USDA导入流程 | P1 |

#### Phase 1.3: 手动配方设计模块（预计5-6天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 1.3.1 | 后端：营养计算服务 | P0 |
| 1.3.2 | 后端：配方CRUD API | P0 |
| 1.3.3 | 后端：实时计算API | P0 |
| 1.3.4 | 前端：配方编辑器布局 | P0 |
| 1.3.5 | 前端：原料选择组件 | P0 |
| 1.3.6 | 前端：配方编辑组件 | P0 |
| 1.3.7 | 前端：营养面板组件 | P0 |
| 1.3.8 | 前端：达标状态可视化 | P0 |

#### Phase 1.4: 版本管理与报告（预计2-3天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 1.4.1 | 后端：版本管理逻辑 | P0 |
| 1.4.2 | 后端：版本对比API | P1 |
| 1.4.3 | 后端：报告生成服务 | P0 |
| 1.4.4 | 前端：版本历史侧边栏 | P1 |
| 1.4.5 | 前端：版本对比页面 | P2 |
| 1.4.6 | 前端：报告预览与导出 | P0 |

### 5.2 第二期扩展

#### Phase 2.1: AI辅助生成（预计5-7天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 2.1.1 | 后端：AI服务基础架构 | P0 |
| 2.1.2 | 后端：需求解析与提示词构建 | P0 |
| 2.1.3 | 后端：自动优化循环逻辑 | P0 |
| 2.1.4 | 后端：差距报告生成 | P0 |
| 2.1.5 | 前端：AI生成表单 | P0 |
| 2.1.6 | 前端：生成进度展示 | P1 |
| 2.1.7 | 前端：候选配方选择 | P0 |

#### Phase 2.2: 原料映射完善（预计2天）

| 任务 | 描述 | 优先级 |
|------|------|--------|
| 2.2.1 | 后端：映射关系管理API完善 | P1 |
| 2.2.2 | 前端：映射管理界面 | P1 |
| 2.2.3 | 数据：初始化常用原料映射 | P1 |

### 5.3 第三期（C端开放）

待第二期完成后规划

---

## 6. 技术依赖

### 6.1 后端新增依赖

```json
{
  "dependencies": {
    "axios": "^1.6.0",           // USDA API调用
    "pdfkit": "^0.14.0",         // PDF生成
    "puppeteer": "^21.0.0"       // HTML转PDF（可选）
  }
}
```

### 6.2 前端新增依赖

```json
{
  "dependencies": {
    "@ant-design/charts": "^2.0.0",  // 营养图表
    "recharts": "^2.10.0"            // 备选图表库
  }
}
```

### 6.3 外部服务

- **USDA FoodData Central API**: https://api.nal.usda.gov/fdc/v1/
- **AI服务**: 待确定（OpenAI / Claude / 国内大模型）

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| USDA API限流 | 导入功能受限 | 实现本地缓存，批量导入 |
| AI生成不稳定 | 用户体验差 | 设置重试机制，提供手动调整入口 |
| 营养数据不准确 | 配方质量问题 | 人工审核机制，数据来源标注 |
| 计算性能问题 | 实时计算卡顿 | 前端缓存，Web Worker优化 |

---

## 8. 验收标准

### 8.1 MVP阶段验收

- [ ] 营养师可创建、编辑、删除营养原料
- [ ] 营养师可从USDA导入原料数据
- [ ] 营养师可手动创建配方
- [ ] 系统实时计算营养成分并显示达标状态
- [ ] 配方版本自动管理
- [ ] 可导出营养分析报告PDF

### 8.2 第二期验收

- [ ] 营养师可使用AI生成配方
- [ ] AI生成的配方经过FEDIAF标准验证
- [ ] 未达标配方显示差距报告
- [ ] 营养原料与采购原料正确映射

---

## 9. 时间估算

| 阶段 | 预计时间 |
|------|----------|
| Phase 1.1 数据库与基础架构 | 2-3 天 |
| Phase 1.2 营养原料库模块 | 3-4 天 |
| Phase 1.3 手动配方设计模块 | 5-6 天 |
| Phase 1.4 版本管理与报告 | 2-3 天 |
| **MVP总计** | **12-16 天** |
| Phase 2.1 AI辅助生成 | 5-7 天 |
| Phase 2.2 原料映射完善 | 2 天 |
| **第二期总计** | **7-9 天** |
