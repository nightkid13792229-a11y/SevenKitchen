# 核心架构与数据逻辑
## 项目名称：狗狗鲜食 SaaS & ERP (Project Reborn)
**版本：** 1.1
**状态：** 已确认
**目标读者：** AI 开发者 (Cursor)

## ⚠️ 必读文档

**在操作数据库前，必须先阅读：**
- [数据库命名规范与Prisma映射规则](./DATABASE_NAMING_CONVENTIONS.md) - **防止"想象字段名"错误**
- 重要：Prisma使用驼峰命名，PostgreSQL实际存储使用蛇形命名

---

### 1. 项目背景与目标
本项目旨在为一家专业犬鲜食作坊构建一套包含“C端小程序 + 员工端 + 管理后台”的综合系统。
**核心原则：**
1.  **显性化逻辑：** 所有的营养计算必须基于明确的宠物营养学专业数学公式，拒绝模糊推断。
2.  **以销定产：** 业务流必须支持“先下单 -> 汇总采购 -> 生产 -> 发货”的 ERP 逻辑。
3.  **数据准确性：** 严格区分用户手动输入数据与系统参考数据（如品种默认值）。
4.  **全链路溯源：** 支持从“原料批次”到“食谱版本”再到“发货批次”的完整追溯，确保食品安全。
---

### 2. 数据库设计 (Schema Definition)
*Instruction for Cursor: Use strict typing. Use PostgreSQL/Prisma syntax guidelines. Field names must be in English.*

#### 2.1 用户与基础域 (User & Interaction)
**User (用户表)**
- `id`: UUID (Primary Key)
- `phone`: String (Unique, 手机号)
- `wechat_openid`: String? (微信OpenID)
- `role`: Enum { CUSTOMER, STAFF, ADMIN }
- `addresses`: Relation -> Address[]
- `created_at`: DateTime

**Address (地址表)**
- `id`: UUID
- `user_id`: UUID (Relation)
- `recipient_name`: String
- `phone`: String
- `region`: Json (存储省市区结构)
- `detail`: String (详细地址)
- `is_default`: Boolean

**UserInteraction (互动表)**
- `id`: UUID
- `user_id`: UUID
- `target_type`: Enum { RECIPE, ARTICLE }
- `target_id`: UUID
- `action`: Enum { 
    FAVORITE,      // 收藏
    LIKE,          // 点赞
    GENERATE_DIY,  // 生成制作单 (用于统计 DIY 数据)
    SHARE          // 分享
  }

#### 2.2 生物学核心域 (Dog Engine)
**DogBreed (品种数据库 - System Data)**
- `id`: UUID
- `name`: String (e.g., "拉布拉多")
- `size_category`: Enum { SMALL, MEDIUM, LARGE, GIANT }
- `growth_curve_type`: Enum { STANDARD, SLOW, VERY_SLOW }
  - *Constraint: Reserved for V2. V1 algorithms MUST NOT use this field for conditional logic. Use `size_category` combined with `adult_age_months` instead.*
- `adult_age_months`: Int (成年阈值月龄)
- `senior_age_years`: Int (老年阈值岁龄)
- `average_adult_weight_kg`: Float? (参考标准体重)

**Dog (爱犬档案)**
- `id`: UUID
- `owner_id`: UUID
- `name`: String
- `breed_id`: UUID
- `birthday`: DateTime
- `gender`: Enum { MALE, FEMALE }
- `is_neutered`: Boolean (是否绝育)
- `current_weight_kg`: Float
- `bcs_score`: Int (1-9, WSAVA Standard)
- `activity_level`: Enum { RESTING, LOW, NORMAL, HIGH, WORKING }
- `life_stage_override`: Enum { NONE, PREGNANCY, LACTATION, PUPPY, ADULT, SENIOR }
- `size_class_override`: Enum { SMALL, MEDIUM, LARGE, GIANT }?
- `meals_per_day`: Int @default(2) // 每日建议喂食次数 (e.g. 幼犬3, 成犬2)
- `treat_input_mode`: Enum { ESTIMATE_LEVEL, EXACT_KCAL } @default(ESTIMATE_LEVEL)
- `treat_level`: Enum { NONE, LOW, MODERATE, HIGH } @default(LOW)
- `manual_treat_kcal`: Int?
- `allergies`: Relation -> IngredientTag[]
- `dislikes`: Relation -> IngredientTag[]  // 不爱吃/挑食
- `medical_history`: Text
- `cached_target_food_kcal`: Int (System Calculated)

*Prisma-style default suggestion (for reference only):*
```prisma
model Dog {
  // ...
  treat_input_mode TreatInputMode @default(ESTIMATE_LEVEL)
  treat_level      TreatLevel     @default(LOW)
}
```

*Logic Constraints for Treats:*
1. **Defaults:** If not specified, default to `ESTIMATE_LEVEL` and `LOW` (conservative estimate).
2. **Logic Priority:**
   - If `treat_input_mode` == `ESTIMATE_LEVEL`: System **MUST** ignore `manual_treat_kcal` and calculate based on `treat_level` percentage.
   - If `treat_input_mode` == `EXACT_KCAL`: System **MUST** use `manual_treat_kcal` for calculation. `treat_level` is ignored (or used for UI display only).

**Domain Logic Specification (Computed Properties)**
*Architecture Constraint: Single Source of Truth.*
*Instruction for Cursor:*
1.  **Backend Only:** These properties MUST be calculated solely by the Backend Service.
2.  **API Exposure:** The API should return these computed fields (e.g., `dog.life_stage`) alongside raw data.
3.  **Frontend Ban:** The Frontend MUST NOT attempt to recalculate these values locally. It must strictly display what the API returns to ensure consistency.

1. **`age_months` (Current Age)**
   - Formula: `floor((Today - birthday) in days / 30.4375)` 

2. **`size_class` (Body Size)**
   - **Priority 1 (Manual):** If `size_class_override` is present, USE IT. (Handles Mixed breeds & Outliers).
   - **Priority 2 (Breed):** If `breed_id` exists, lookup `DogBreed.size_category`.
   - **Priority 3 (Fallback):** Default to `MEDIUM` (Safe middle ground).

3. **`life_stage` (Biological Stage)**
   - **Priority 1 (Override):** `life_stage_override`
   - **Priority 2 (Seniority):** Check `senior_age_years` logic.
   - **Priority 3 (Growth):** Check `adult_age_months` logic.
   - **Priority 4 (Maintenance):** Default to `ADULT`.

// Calculation Audit Log (For Debugging & Customer Service)
```prisma
model DogEnergyCalcLog {
  id          UUID      @id @default(uuid())
  dog_id      UUID
  created_at  DateTime  @default(now())
  
  // Snapshotted Inputs (Keep record of why we got this result)
  weight_kg   Float     // The weight used for calculation
  age_months  Int       // The age used
  life_stage  String    // e.g. "PUPPY_4_6_MONTHS"
  
  // Intermediate Values
  rer         Float
  stage_factor Float
  adult_factor Float    // Neutered * Activity
  bcs_factor   Float
  
  // Final Results
  total_der   Float     // Before treat deduction
  treat_deduction_kcal Float
  final_food_kcal Float // The result shown to user

  // Debug Flags
  is_treat_capped Boolean @default(false) // 标记：零食扣减是否触发了 10% 安全上限
  
  // Traceability
  formula_version String // e.g. "v1.0" (To track algorithm changes)
}
```

#### 2.3 原料与配方域 (Inventory & Recipe)
**IngredientTag (原料标签 - 解决分类层级)**
- `id`: UUID
- `name`: String (e.g., "牛肉类", "内脏", "无谷")
- `parent_id`: UUID? (Self-relation)

**Ingredient (原料库)**
- `id`: UUID
- `name`: String
- `type`: Enum { FOOD, SUPPLEMENT, PACKAGING }
- `tags`: Relation -> IngredientTag[]

// --- 1. 通用采购属性 (Common Procurement) ---
- `brand`: String?           // 采购品牌 (e.g. "Kirkland", "顺丰")
- `product_model`: String?   // 商品型号/规格 (e.g. "500粒装", "4号箱")
- `purchase_channel`: String?// 采购渠道 (e.g. "山姆", "拼多多", "1688")
- `notes`: Text?             // 补充说明 (e.g. "供应商联系方式...")

// --- 2. 单位与成本  ---
- `base_unit`: Enum { G, ML, PCS } @default(G)
  - *Logic: The atomic unit used in Recipes/Inventory (e.g., G for meat, PCS for pills/boxes).*
- `unit_display_label`: String?   
  - *Optimization Strategy:* **Optional Override (可选覆盖).**
  - *Logic:* - If NULL: System uses Global Default Map (G="克", ML="ml", PCS="粒").
    - If SET: System uses this value (e.g., "平勺", "条", "包").
  - *Benefit:* Reduces data entry for 95% of standard items.
- `purchase_unit`: String (e.g., "箱", "瓶", "kg")
  - *Logic: The unit used in Purchase Orders.*
- `purchase_to_base_ratio`: Float @default(1.0)
  - *Logic: Multiplier. e.g. 1 Bottle = 100 PCS -> Ratio = 100.*
- `current_price_per_purchase_unit`: Decimal 
  - *Logic: Price per "Bottle" or per "Box".*
// Computed Helper: unit_cost = price_per_purchase_unit / purchase_to_base_ratio

// --- 3. 物理属性 (Physical Stats) ---
- `weight_g`: Float?
  - *Definition:* 单个基准单位的物理自重 (Physical Weight per Base Unit).
  - *Usage Logic (Smart Defaults):*
    1. If `base_unit` == **G**: System IGNORES this field (Assume 1.0). **User does NOT need to enter.**
    2. If `base_unit` == **ML**: User SHOULD enter density in `properties`, this field is calculated or ignored.
    3. If `base_unit` == **PCS**:
       - **Packaging:** **MANDATORY** (e.g. Box weight is significant).
       - **Supplement:** **OPTIONAL** (e.g. 1 pill = 0.5g). If NULL, assumes 0g (negligible for shipping).
- `max_capacity_g`: Float?
  - *Usage:* For Packaging containers ONLY (e.g. Box capacity).
  - *Logic:* Used in Smart Bin Packing algorithm.

// --- 4. 差异化属性 (JSON - 业务逻辑核心) ---
- `properties`: Json (存储差异化规格数据)
  *Schema Constraint for `properties` (JSON):*
  ```typescript
  // Case A: IF type == FOOD (食材)
  interface FoodProperties {
     // 采购与定性描述 (Removed quantitative nutrients per user request)
     cfct_class: string;          // CFCT分类 (e.g. "畜肉类", "油脂类")
     edible_yield_rate: number;   // 可食部/出肉率 (Default 1.0, e.g. 0.85 for bone-in meat)
     main_nutrients_desc: string; // 主要营养价值 (e.g. "高蛋白, 富含铁")

     // 算法必需字段
     // Required ONLY if base_unit == 'ML'. Used to convert Vol(ml) -> Mass(g).
     density_g_per_ml?: number;   

     // [Strategic Architecture Note]
     // Q: Why no nutrient matrix (kcal, protein, fat) here?
     // A: V1 Strategy -> "Imported Intelligence". 
     //    We rely on the `Recipe.nutrition_detailed_data` (imported from professional software like ADF) 
     //    as the Single Source of Truth for nutritional analysis.
     //    V2 Plan -> Will introduce `IngredientNutritionProfile` table to enable 
     //    internal formulation algorithms and auto-verification against FEDIAF standards.
  }

  // Case B: IF type == SUPPLEMENT (营养补充剂)
  interface SupplementProperties {
     // 营养类型分类
     // Options: "MINERAL", "VITAMIN", "AMINO_ACID", "FATTY_ACID", "PROBIOTIC", "FUNCTIONAL", "OTHER"
     category_type: string;

     // 有效成分浓度表 (Key-Value Map)
     // 允许一款补剂包含多种营养素。
     // Key: 营养素标准代码 (e.g. "calcium_mg", "vitamin_d3_iu")
     // Value: 每1个基准单位(1g粉 or 1粒) 含有的数值
     active_nutrients: Record<string, number>; 
     // Example Logic:
     // If user adds 1 tablet: System looks up "calcium_mg" -> 600. Result: +600mg Calcium.

     // 个性化损耗率 (Override Global)
     // 默认建议 1.05 (5%)。鱼油可设为 1.0, 易损粉末设为 1.10
     production_loss_rate?: number;
  }

  // Case C: IF type == PACKAGING (包材)
  interface PackagingProperties {
     // [Refactor] weight_g & max_capacity_g moved to top-level fields.
     
     // 业务属性
     is_consumable: boolean;    // true=消耗品(随单扣减), false=固定资产
     linked_item_id?: string;   // 关联配件 (e.g. 4号箱绑定4号袋)
  }
  ```

**Recipe (食谱)**
*Prisma Enum Definition Reference (Strictly Follow):*
```prisma
enum RecipeHealthTag {
  HEALTHY             // 健康体态
  PICKY_EATER         // 挑食怪
  SENSITIVE_STOMACH   // 玻璃胃
  PANCREATITIS_SUPPORT // 胰腺呵护
  LOW_FAT             // 低脂
  SKIN_COAT_CARE      // 美毛护肤
}

enum LifeStage {
  PUPPY
  ADULT
  SENIOR
  PREGNANCY
  LACTATION
}
```
// In Recipe Model:
// target_health_tags RecipeHealthTag[]
// applicable_life_stages LifeStage[]
- `id`: UUID
- `version`: Int
- `name`: String
- `status`: Enum { DRAFT, PUBLIC, PRIVATE_CUSTOM }
- `nutrition_standard`: Enum { NRC_2006, FEDIAF_2021, FEDIAF_2024, AAFCO_2022 }
- `energy_density_kcal_per_kg`: Float (Manual Input)

// --- Visual Assets (New) ---
- `cover_image_url`: String?       // 列表页封面大图
- `detail_images`: Json?           // 详情页轮播图集 (Array of Strings)
  - *Logic:* ["url_packaging.jpg", "url_served_hot.jpg", ...]
  - *Frontend:* Can be labeled or just displayed as a gallery.
- `video_url`: String?             // (Optional) 介绍视频

// --- Marketing & Description  ---
- `description`: Text?             // 食谱营销描述/文案
- `design_source`: String?         // 设计来源 (e.g. "ADF软件", "自研", "宠物营养师XXX")
- `target_health_tags`: Enum[] // Ref: RecipeHealthTag[] (使用上方定义的枚举)
  - *Options: [HEALTHY, PICKY_EATER, SENSITIVE_STOMACH, PANCREATITIS_SUPPORT, ...]*
- `applicable_life_stages`: Enum[] // Ref: LifeStage[] (使用上方定义的枚举)
  - *Options: [PUPPY, ADULT, SENIOR, PREGNANCY, LACTATION]*
  - *Logic: Used for filtering. e.g. A recipe can be suitable for both PUPPY and ADULT.*

// --- Production & Process (New) ---
- `production_steps`: Text?        // 总烹饪步骤说明 (e.g. "1.绞肉 2.混合...")
- `production_loss_rate`: Float @default(1.07) 
    - *Definition:* **Process/Mechanical Loss (物理/加工损耗).**
    - *Context:* Since food is RAW (uncooked), this accounts for grinder residue, bowl residue, and packaging spills.
    - *Example:* 1.07 means 7% of material is lost during processing.
- `batch_labor_hours`: Float @default(2.0)

// --- Nutrition Data (Consolidated & Normalized) ---
- `nutrition_detailed_data`: Json? 
  - *Logic: Stores full spectrum data imported from ADF or manually entered.*
  - *Constraint: KEYS MUST INDICATE BASIS explicitly.*
    - `moisture_pct`: As Fed basis (Wet).
    - All other macronutrients: **Dry Matter Basis (DM)**, strictly using `_dm_pct` suffix.
  - *Example Structure:*
    ```json
    {
      "moisture_pct": 72.5,        // 含水量 (As Fed)
      "protein_dm_pct": 45.5,      // 蛋白质 (Dry Matter Basis) - NOT 12.5%
      "fat_dm_pct": 28.2,          // 脂肪 (Dry Matter Basis)
      "fiber_dm_pct": 2.1,         // 纤维 (Dry Matter Basis)
      "ash_dm_pct": 5.5,           // 灰分 (Dry Matter Basis)
      "carbs_dm_pct": 18.7,        // 碳水 (Dry Matter Basis)
      "ca_p_ratio": 1.25,          // 钙磷比 (Decimal, 2 places)
      "energy_density_kcal_per_kg": 1450 // 热量密度 (As Fed, matching column)
    }
    ```

// --- Real Data Stats (Clean) ---
- `sales_count`: Int @default(0)       // 购买次数 (Paid Orders)
- `diy_gen_count`: Int @default(0)     // 制作单生成次数 (User Generated DIY)
- `like_count`: Int @default(0)        // 点赞数
- `favorite_count`: Int @default(0)    // 收藏数
- `items`: Relation -> RecipeItem[]

**RecipeItem (配方明细)**
- `id`: UUID
- `recipe_id`: UUID
- `ingredient_id`: UUID

// --- Pre-processing ---
- `preparation_method`: String? 
    - *Example: "去皮蒸熟", "切成1cm方块", "磨粉"*

// --- Mode 1: Food (食材/大料) ---
- `ratio_percent`: Float?
    - *Display Logic:* - No Profile: Show %.
        - With Profile/Order: Show % AND Calculated Grams.

// --- Mode 2: Supplement (补剂/小料) ---
- `nutrient_target_key`: String? 
    - *Example:* "calcium_mg"
- `nutrient_target_value`: Float?
    - *Example:* 1200 (mg per kg of base mix)

#### 2.4 订单与生产域 (Order & Production)
**Order (订单)**
- `id`: UUID
- `customer_id`: UUID
- `status`: Enum { INIT, PENDING_PAYMENT, PAID, WAITING_FOR_PRODUCTION, IN_PRODUCTION, READY_FOR_PACKAGING, READY_FOR_SHIPMENT, SHIPPED, COMPLETED, CANCELLED } // OrderStatus values are normative and must match backend/src/domain/order/enums.ts. Previously used alternative labels are deprecated and not part of the enum.
- `type`: Enum { FRESH_FOOD, CUSTOM_SERVICE }
- `target_production_date`: DateTime? (排期)
- `items`: Relation -> OrderItem[] 
- `amount_product`: Decimal
- `amount_shipping`: Decimal
- `amount_total`: Decimal
- `total_amount`: Decimal (legacy alias derived from `amount_total` for backward compatibility; not a primary field)
- `pricing_breakdown_snapshot`: Json (immutable pricing snapshot captured at order creation; MUST NOT be mutated after write; pricing/read endpoints MUST return data from this stored snapshot without recalculation)

*priceExplanation (说明)*  
- Read-only mapping derived from `pricing_breakdown_snapshot` for presentation; NOT persisted as a separate field; MUST NOT trigger recalculation.

**OrderItem (订单明细)**
- `id`: UUID
- `order_id`: UUID
- `recipe_snapshot`: Json (下单时的配方快照+版本号)
- `quantity_g`: Float
- `package_count`: Int (总包数)
- `package_spec_g`: Int (单包规格，如 100g, 200g) // [Update: Explicit spec]
- `custom_requirements`: Text? (定制需求)

**Patch Notes (Phase 8.1 Part 1 prerequisite)**
- Clarified Order amounts to include `amount_product`, `amount_shipping`, `amount_total` (with `total_amount` noted as legacy/derived).
- Aligned OrderStatus enum to the full state set from 04 (INIT → CANCELED/DELIVERED).
- Documented immutable `pricing_breakdown_snapshot` storage and that `priceExplanation` is a derived, non-persisted view.

    *Schema Constraint for `recipe_snapshot` (JSON):*
    ```typescript
    // IMPORTANT: This snapshot must be IMMUTABLE after order creation.
    interface RecipeSnapshot {
      id: string;              // Original Recipe UUID
      version: number;         // Recipe Version at time of order
      name: string;
      production_loss_rate: number; // CRITICAL: Captured at order time
      nutrition_standard: string;
      items: Array<{           // List of ingredients
          ingredient_id: string;
          name: string;
          ratio: number;       // or amount logic
      }>;
    }
    ```

**ProductionTask (生产任务)**
- `id`: UUID
- `target_date`: DateTime
- `recipe_id`: UUID
- `batch_code`: String? (e.g., "20231024-RecipeA-Batch1") // 用于厨房区分批次
- `status`: Enum { PENDING, IN_PROGRESS, COMPLETED }
- `linked_order_items`: Relation -> OrderItem[] (该任务包含哪些订单)
- `total_weight_planned`: Float
- `ingredients_usage_snapshot`: Json (实际投料记录)
- `batch_photos`: Json?  
  - *Type:* String[] (Array of URLs)
  - *Usage:* Chef uploads photos of raw meat/veggies for this batch.
  - *Customer View:* When viewing Order, system queries the linked Task to show these photos.

**Domain Logic Specification (Order Lifecycle)**
*Architecture Constraint: State Machine & Immutability.*
*Instruction for Cursor:*

1.  **Immutability Rule (State Locking):**
    - If `Order.status` is `IN_PRODUCTION`, `SHIPPED`, or `COMPLETED`:
      - The `Order` object and all linked `OrderItem`s **MUST BE READ-ONLY**.
      - API MUST reject any attempts to modify quantity, specifications, or recipe snapshots.
      - API MUST reject any attempts to add or remove items.
    - Edits are ONLY allowed when status is `PAID` (or pending states if added later).

2.  **Snapshot Integrity:**
    - Production tasks rely entirely on `OrderItem.recipe_snapshot`.
    - Even if the original `Recipe` is updated (v1 -> v2) in the database, the Order's snapshot MUST remain unchanged to ensure historical accuracy and traceability.

#### 2.5 全局配置域 (System Configuration)

**GlobalConfig (全局业务参数)**
- `id`: String @id @default("singleton")
- `labor_hourly_rate`: Decimal @default(30.0) // 人力时薪
- `min_order_weight_g`: Int @default(1000) // 起订门槛
- `default_batch_capacity_g`: Float @default(5000) 
  - *Logic: Standard cooking pot capacity used if Recipe doesn't specify override.*
- `target_margin`: Float @default(0.4) 
  - *Logic: Global target gross margin (e.g. 0.4 = 40%). Applied to all recipes for dynamic pricing.*

// Standard Costing Parameters (CPA Recommended)
- `overhead_cost_per_kg`: Decimal @default(2.0) 
  - *Logic: Manufacturing Overhead (MOH). Covers utilities (water/gas/electric), equipment depreciation, and rent allocation per kg of production.*
- `target_batch_utilization`: Float @default(0.8) 
  - *Logic: Standard Capacity Rate (e.g. 80%). Used to allocate labor costs based on "Expected Output" rather than "Actual Single Order", ensuring stable pricing.*
- `supplement_loss_rate`: Float @default(1.05) 
  - *Logic: Micro-loss allowance for powders/pills (5% loss). Accounts for residue on weighing tools and spills.*

// Default SKU Mapping (ERP Best Practice)
// Avoids hardcoding names like "真空袋" in code.
- `default_vacuum_bag_id`: UUID?     // 默认真空袋 SKU ID
- `default_product_label_id`: UUID?  // 默认产品标签 SKU ID
- `default_shipping_label_id`: UUID? // 默认快递面单 SKU ID
- `default_ice_pack_id`: UUID?       // 默认生物冰袋 SKU ID

**ShippingTemplate (运费模板)**
- `id`: UUID
- `name`: String (e.g. "顺丰冷链")
- `base_weight_kg`: Float @default(1.0)
- `base_fee`: Decimal @default(12.0)
- `step_weight_kg`: Float @default(1.0)
- `step_fee`: Decimal @default(5.0)
- `vas_fee_per_order`: Decimal @default(3.0) // 增值服务费
- `is_active`: Boolean @default(true)

---

### 3. 核心算法逻辑 (Core Algorithms)
*Instruction for Cursor: Implement as pure functions.*

**Architecture Constraint (Pure Functions & DTOs):**
* **Strict Rule:** All calculation functions below MUST be **Pure Functions**.
* **Prohibited:** Do NOT pass raw Prisma/ORM objects (e.g., `Dog` model) into these functions. This prevents implicit lazy-loading and N+1 query performance issues.
* **Required:** The Service Layer must assemble all necessary data into a plain Data Transfer Object (DTO) **BEFORE** calling the algorithm.

**DTO Definition (DogCalcProfile):**
*Instruction for Cursor: Use this interface for all algorithm inputs.*
```typescript
interface DogCalcProfile {
  // Basic Stats
  current_weight_kg: number;
  age_months: number;  // Computed by Service Layer
  gender: 'MALE' | 'FEMALE';
  is_neutered: boolean;
  bcs_score: number;
  
  // Classification (Computed)
  size_class: 'SMALL' | 'MEDIUM' | 'LARGE' | 'GIANT'; 
  life_stage: 'PUPPY' | 'ADULT' | 'SENIOR' | 'PREGNANCY' | 'LACTATION';
  
  // Configs
  activity_level: 'RESTING' | 'LOW' | 'NORMAL' | 'HIGH' | 'WORKING';
  meals_per_day: number;
  
  // Treats
  treat_input_mode: 'ESTIMATE_LEVEL' | 'EXACT_KCAL';
  treat_level: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';
  manual_treat_kcal?: number;
  
  // Breed Info (Flattened)
  // Service layer must extract these from `dog.breed` if available
  breed_adult_age_months?: number; 
  breed_senior_age_years?: number;
}
```

#### 3.1 能量需求计算公式 (DER Calculation)
*设计原则：模块化、临床导向、强容错性。*
*数据来源：FEDIAF (2021), WSAVA Global Nutrition Guidelines, AAHA Weight Management.*

**核心逻辑链：**
`Final_Food_Kcal = (RER * LifeStageFactor * AdultModifiers(Neuter+Activity) * BCS_Adjustment) - Treat_Calories`

##### 3.1.1 基础模块：RER (静息能量)
这是所有计算的基石，不随状态改变。
```python
def calculate_RER(current_weight_kg):
    # Kleiber's Law: 70 * weight^0.75
    return 70 * (current_weight_kg ** 0.75)
``` 
##### 3.1.2 核心模块：生命阶段系数 (Life Stage Factor) 
*Engineering Note: 本函数为工程化近似模型。实际阈值应优先读取 `DogBreed` 配置，硬编码数值仅为兜底默认值。建议后续将系数表提取为 Config 常量管理。*

* **体型定义 (Size Class):**
    * Small (<10kg)
    * Medium (10-25kg)
    * Large (25-45kg)
    * Giant (>45kg)

**Helper: 获取成年门槛 (Dynamic Threshold)**
```python
def get_adult_threshold_months(dog, size_class):
    """
    获取该犬种进入成犬期的月龄阈值
    优先级: DogBreed.adult_age_months > Size Class Default
    """
    if dog.breed and dog.breed.adult_age_months:
        return dog.breed.adult_age_months
        
    # 兜底默认值
    if size_class == 'SMALL': return 10
    if size_class == 'MEDIUM': return 12
    if size_class == 'LARGE': return 18
    if size_class == 'GIANT': return 24
    return 12
```
**Helper Function: 老年犬判定逻辑**
```python
def check_is_senior(dog, age_months, size_class):
    """
    判定是否进入老年期 (Senior Stage)
    逻辑优先级：品种数据库明确定义 > 体型默认值
    """
    # 1. 优先使用品种数据库定义的准确阈值 (如果存在关联品种数据)
    # 假设 ORM 可以通过 dog.breed 访问 DogBreed 表
    if dog.breed and dog.breed.senior_age_years:
        return age_months >= (dog.breed.senior_age_years * 12)

    # 2. 兜底逻辑：基于体型的一般性判定 (Source: AAHA Senior Care Guidelines)
    age_years = age_months / 12.0
    
    if size_class == 'SMALL': return age_years >= 11
    if size_class == 'MEDIUM': return age_years >= 10
    if size_class == 'LARGE': return age_years >= 8
    if size_class == 'GIANT': return age_years >= 7
    
    return False
```
```python
def get_life_stage_factor(dog, age_months, size_class):
    
    # 0. 动态阈值准备
    adult_threshold = get_adult_threshold_months(dog, size_class)
    
    # --- A. 妊娠期 (Override) ---
    if dog.life_stage_override == 'PREGNANCY': 
        return LIFE_STAGE_FACTORS['PREGNANCY']

    # --- B. 哺乳期 (Override) ---
    if dog.life_stage_override == 'LACTATION': 
        return LIFE_STAGE_FACTORS['LACTATION']

    # --- C. 幼犬与亚成体期 (Puppy & Growth) ---
    if age_months < adult_threshold:
        
        # C1. 极速生长期 (< 4个月)
        if age_months < 4: 
            return LIFE_STAGE_FACTORS['PUPPY_0_4_MONTHS']

        # C2. 快速生长期 (4 - 6个月)
        if age_months < 6:
            if size_class in ['LARGE', 'GIANT']:
                return LIFE_STAGE_FACTORS['PUPPY_4_6_MONTHS_LARGE_GIANT']
            return LIFE_STAGE_FACTORS['PUPPY_4_6_MONTHS_GENERIC']

        # C3. 过渡生长期 I (6 - 9个月) 
        if age_months < 9:
            if size_class == 'GIANT': return LIFE_STAGE_FACTORS['PUPPY_6_9_MONTHS_GIANT']
            if size_class == 'LARGE': return LIFE_STAGE_FACTORS['PUPPY_6_9_MONTHS_LARGE']
            return LIFE_STAGE_FACTORS['PUPPY_6_9_MONTHS_GENERIC']

        # C4. 过渡生长期 II (9 - 12个月) 
        if age_months < 12:
            if size_class == 'GIANT': return LIFE_STAGE_FACTORS['PUPPY_9_12_MONTHS_GIANT']
            if size_class == 'LARGE': return LIFE_STAGE_FACTORS['PUPPY_9_12_MONTHS_LARGE']
            return LIFE_STAGE_FACTORS['PUPPY_9_12_MONTHS_GENERIC']
        
        # C5. 延迟生长期 (12个月 ~ 成年阈值)
        if size_class == 'GIANT':
            if age_months < 18: return LIFE_STAGE_FACTORS['JUNIOR_GIANT_12_18_MONTHS']
            return LIFE_STAGE_FACTORS['JUNIOR_GIANT_18_24_MONTHS']
        
        if size_class == 'LARGE':
            return LIFE_STAGE_FACTORS['JUNIOR_LARGE_12_18_MONTHS']
            
        # Fallback for Medium/Small late bloomers (rare but safe)
        return LIFE_STAGE_FACTORS['ADULT_INTACT']

    # --- D. 老年犬 (Senior) ---
    if check_is_senior(dog, age_months, size_class): 
        return LIFE_STAGE_FACTORS['SENIOR']

    # --- E. 成年犬 (Adult Default) ---
    # Not yet adjusted for neuter/activity (handled in next step)
    return LIFE_STAGE_FACTORS['ADULT_INTACT']
```
##### 3.1.3 修正模块：绝育与活动 (Neutered & Activity)
*设计原则：安全优先。绝育和低运动量的减法修正，仅适用于代谢稳定的成年空窗期犬只。*
```python
def is_growth_or_repro_stage(dog, age_months, size_class):
    """
    判定当前是否处于"高能量需求"阶段 (生长、妊娠、哺乳)。
    在此阶段，禁止应用绝育或低运动量的减法修正。
    """
    # 1. 检查繁殖状态 (Reproduction)
    if dog.life_stage_override in ['PREGNANCY', 'LACTATION']:
        return True

    # 2. 检查生长状态 (Growth)
    # 调用 3.1.2 中定义的阈值获取函数
    adult_threshold = get_adult_threshold_months(dog, size_class)
    
    # 只要未满成年阈值，都视为生长/亚成体期，保持高代谢设定
    if age_months < adult_threshold:
        return True

    return False

def apply_adult_modifiers(base_factor, dog, age_months, size_class):
    
    # 1. 安全守卫 (Safety Guard)
    # 如果处于生长或繁殖期，直接返回原始高系数，禁止减法修正
    if is_growth_or_repro_stage(dog, age_months, size_class):
        return base_factor

    # --- 以下逻辑仅对 "非孕非乳的成年犬" 生效 ---
    
    current_factor = base_factor

    # 2. 绝育修正 (Neutered)
    # 逻辑说明 (Rationale):
    # - 普通成犬：根据绝育状态区分 1.6 (绝育) / 1.8 (未绝育)。
    # - 老年犬 (SENIOR)：
    #   出于预防肥胖和代谢综合征的考虑，本系统在 V1 中不再根据绝育状态提高基准。
    #   统一以 1.4 为基线，再叠加活动系数。
    #   *极端情况处理：* 若遇极高运动量的老年工作犬，请营养师通过 `life_stage_override` 手动干预。
    is_senior = check_is_senior(dog, age_months, size_class)
    
    if not is_senior:
        if dog.is_neutered:
            current_factor = LIFE_STAGE_FACTORS['ADULT_NEUTERED'] # 1.6
        else:
            current_factor = LIFE_STAGE_FACTORS['ADULT_INTACT']   # 1.8

    # 3. 运动量修正 (Activity Level)
    # 使用字典直接查找，确保覆盖 WORKING 等所有枚举值
    # 如果枚举值不在表中，默认返回 1.0
    multiplier = ACTIVITY_MULTIPLIERS.get(dog.activity_level, 1.0)
    
    current_factor *= multiplier

    return current_factor
```
##### 3.1.4 医疗模块：BCS 体况评分调整 (Weight Management) - v1.1
*来源：WSAVA BCS Guidelines. 采用 9 分制标准。*

```python
def get_bcs_adjustment(bcs_score):
    """
    根据体况评分调整热量系数。
    """
    # 1. 输入清洗 (Input Validation)
    # 强制将评分限制在 1-9 之间，防止非法输入导致计算异常
    # e.g., 输入 0 变为 1, 输入 10 变为 9
    bcs_score = max(1, min(9, bcs_score))

    # 2. 理想体况 (Ideal, BCS 4-5)
    if 4 <= bcs_score <= 5:
        return 1.0
    
    # 3. 超重 (Overweight, BCS 6-9)
    # 目标：减少热量摄入。每增加1分，减少约 10%
    if bcs_score > 5:
        # BCS 6 -> 0.9, BCS 7 -> 0.8, BCS 8 -> 0.7, BCS 9 -> 0.6
        return 1.0 - ((bcs_score - 5) * 0.1)
    
    # 4. 过瘦 (Underweight, BCS 1-3)
    # 目标：增加热量摄入以追赶生长
    # Note: 采用保守增重策略 (Conservative Weight Gain)。
    # 对于极度消瘦 (BCS 1-2) 使用 1.4 而非更高，以降低再喂食综合征风险。
    if bcs_score == 3: return 1.2
    if bcs_score <= 2: return 1.4
    
    return 1.0
```
##### 3.1.5 终极计算：能量需求汇总 (Final Energy Summary) - v1.2 (Split)
*设计原则：将“生物学总需求”与“鲜食喂食量”解耦，防止逻辑混淆。*

**Function A: 计算生物学每日总需 (Total DER)**
*用于评估狗狗整体代谢水平，不涉及零食扣减。*
```python
def calculate_total_der(dog):
    # 1. 计算 RER
    rer = calculate_RER(dog.current_weight_kg)
    
    # 2. 获取生命阶段基础系数
    stage_factor = get_life_stage_factor(dog, dog.age_months, dog.size_class)
    
    # 3. 应用成犬修正 (绝育 & 运动)
    # 注意：幼犬/孕犬会在此步骤被拦截，保持原系数
    adjusted_factor = apply_adult_modifiers(stage_factor, dog, dog.age_months, dog.size_class)
    
    # 4. 应用 BCS 修正 (胖瘦调整)
    bcs_coeff = get_bcs_adjustment(dog.bcs_score)
    
    # 5. 返回总 DER
    return rer * adjusted_factor * bcs_coeff
```
**Function B: 计算鲜食应供热量 (Fresh Food Kcal)**
*用于生成订单和食谱，需扣除零食配额。*
```python
def calculate_fresh_food_needs(dog):
    # 1. 获取总需求
    total_der = calculate_total_der(dog)
    
    # 2. 计算零食安全上限 (Treat Cap)
    max_treat_allowance = total_der * TREAT_LIMITS['CAP_PERCENT'] # 10%
    
    # 3. 确定扣减量
    treat_deduction = 0
    is_capped = False # 初始化标记
    
    if dog.treat_input_mode == 'EXACT_KCAL':
        input_val = dog.manual_treat_kcal if dog.manual_treat_kcal else 0
        
        # 判定是否触发上限
        if input_val > max_treat_allowance:
            treat_deduction = max_treat_allowance
            is_capped = True # 触发熔断
        else:
            treat_deduction = input_val
            is_capped = False
        
    else:
        # 估算模式逻辑 (略，保持不变)
        ratio = 0
        if dog.treat_level == 'LOW': ratio = TREAT_LIMITS['LOW_RATIO']
        elif dog.treat_level == 'MODERATE': ratio = TREAT_LIMITS['MODERATE_RATIO']
        elif dog.treat_level == 'HIGH': ratio = TREAT_LIMITS['HIGH_RATIO']
        
        treat_deduction = total_der * ratio
            
    # 4. 最终鲜食需提供的热量
    final_food_kcal = total_der - treat_deduction
    
    # 返回一个字典，包含计算结果和 Log 标记
    # *Architecture Instruction:*
    # API Layer MUST check `is_treat_capped`. 
    # If True, API response should include a warning code (e.g. "WARN_TREAT_CAP_HIT").
    # Frontend MUST display a toast/alert: "您输入的零食热量已超过每日限额(10%)，系统已自动调整为安全最大值，以保障爱犬营养均衡。"
    return {
        "final_food_kcal": max(final_food_kcal, 0),
        "treat_deduction": treat_deduction,
        "is_treat_capped": is_capped,
        "total_der": total_der
    }
```
##### 3.1.6 每日喂食重量计算 (Daily Feeding Amount) ---
```python
def calculate_daily_feeding_amount_g(dog, recipe):
    """
    计算狗狗每天应该吃多少克这款食谱。
    Formula: Needs / Density * 1000
    """
    # 1. 获取计算结果对象 (Dict)
    # 包含: final_food_kcal, treat_deduction, is_treat_capped, total_der
    needs_result = calculate_fresh_food_needs(dog)
    
    # 从字典中提取"最终鲜食热量需求"
    daily_kcal_needs = needs_result['final_food_kcal']
    
    # 2. 获取食谱的能量密度 (kcal/kg)
    # V1 阶段直接读取配方中录入的数值
    recipe_density = recipe.energy_density_kcal_kg
    
    # 防止除以零错误
    if recipe_density <= 0:
        return 0
        
    # 3. 计算重量 (g)
    # 需求 500kcal / 密度 1500kcal/kg = 0.33kg = 333g
    amount_kg = daily_kcal_needs / recipe_density
    amount_g = amount_kg * 1000
    
    return round(amount_g) # 取整
```

#### 3.2 生产排单逻辑 (Production Planning)

```python
def generate_batch_code(date, recipe_id, version, sequence_num):
    """
    生成标准批次号
    Format: YYYYMMDD-{RecipeShort}-V{Version}-{Seq}
    Example: 20231209-BEEF-V2-01
    """
    date_str = date.strftime('%Y%m%d')
    recipe_short = str(recipe_id)[:4].upper() 
    return f"{date_str}-{recipe_short}-V{version}-{sequence_num:02d}"

def aggregate_production_tasks(date):
    """
    按 [食谱+版本] 聚合订单 -> 计算总需 -> 严格分锅 -> FIFO关联订单。
    """
    orders = find_orders(status=PAID, target_production_date=date)
    
    # 1. 聚合阶段 (Aggregation Phase)
    # Key: (recipe_id, version) -> 复合键，确保不同版本物理隔离
    # Value: { "total_raw_weight": float, "item_queue": [(item, raw_needed), ...] }
    production_groups = {}

    for order in orders:
        for item in order.items: 
            snapshot = item.recipe_snapshot
            recipe_id = snapshot['id']
            version = snapshot['version'] # [Fix] 获取版本号
            
            # 复合键
            group_key = (recipe_id, version)
            
            if group_key not in production_groups:
                production_groups[group_key] = {
                    "total_raw_weight": 0.0,
                    "item_queue": [], # [Fix] 使用队列暂存，用于后续FIFO分配
                    "max_capacity": GLOBAL.default_batch_capacity_g
                }
            
            # 读取快照中的损耗率 (精准追溯)
            current_loss_rate = snapshot.get('production_loss_rate', 1.07)
            raw_needed = item.quantity_g * current_loss_rate
            
            # 累加
            production_groups[group_key]["total_raw_weight"] += raw_needed
            # 入队：记录这个订单项需要多少生肉
            production_groups[group_key]["item_queue"].append((item, raw_needed))

    # 2. 生成任务阶段 (Task Generation Phase)
    generated_tasks = []

    for (recipe_id, version), data in production_groups.items():
        remaining_weight = data["total_raw_weight"]
        capacity = data["max_capacity"]
        item_queue = data["item_queue"] # 待分配的订单队列
        batch_seq = 1
        
        # 严格分锅循环
        while remaining_weight > 0:
            # 决定本锅重量
            current_batch_weight = min(remaining_weight, capacity)
            
            batch_code = generate_batch_code(date, recipe_id, version, batch_seq)
            
            # 创建任务对象
            new_task = create_task(
                target_date=date,
                recipe_id=recipe_id,
                # 注意：实际存库时可能需要记录 version，或通过关联的 OrderItem 追溯
                batch_code=batch_code,
                total_weight_planned=current_batch_weight,
                status='PENDING'
            )
            
            # FIFO 订单分配逻辑 (Granularity Linkage)
            # 逻辑：从队列头部取出订单，直到填满本锅容量
            # 注意：这里简化处理，如果一个订单跨了两锅，通常归入占比较大的一锅，或拆分(V2)。
            # V1 策略：只要本锅还有容量，就往里塞订单关联。
            
            assigned_items = []
            filled_weight = 0
            
            # 当队列不为空，且本锅还没（大概）装满时
            while item_queue and filled_weight < current_batch_weight:
                # 预读队列头
                item, item_raw_need = item_queue[0]
                
                # 链接进本任务
                assigned_items.append(item)
                filled_weight += item_raw_need
                
                # 从总队列移除
                item_queue.pop(0)
                
            # 建立数据库关联
            new_task.link_order_items(assigned_items)
            generated_tasks.append(new_task)
            
            remaining_weight -= current_batch_weight
            batch_seq += 1

    return generated_tasks
```

#### 3.3 核心系数配置表 (System Constants)
*Instruction for Cursor: DO NOT hardcode numbers in functions. Use these constants definitions. Refactor logic to reference these values.*

```python
# --- A. Life Stage Base Factors (RER Multipliers) ---
LIFE_STAGE_FACTORS = {
    'PREGNANCY': 3.0,
    'LACTATION': 4.0,
    # Puppy Growth Phases
    'PUPPY_0_4_MONTHS': 3.0,
    'PUPPY_4_6_MONTHS_GENERIC': 2.5,
    'PUPPY_4_6_MONTHS_LARGE_GIANT': 3.0,
    'PUPPY_6_9_MONTHS_GENERIC': 2.0,
    'PUPPY_6_9_MONTHS_LARGE': 2.5,
    'PUPPY_6_9_MONTHS_GIANT': 2.8,
    'PUPPY_9_12_MONTHS_GENERIC': 1.8, # Reaches Adult-like level
    'PUPPY_9_12_MONTHS_LARGE': 2.0,
    'PUPPY_9_12_MONTHS_GIANT': 2.5,
    # Late Growth
    'JUNIOR_GIANT_12_18_MONTHS': 2.0,
    'JUNIOR_GIANT_18_24_MONTHS': 1.8,
    'JUNIOR_LARGE_12_18_MONTHS': 1.8,
    
    # Adult Base
    'ADULT_INTACT': 1.8,   # 未绝育基准
    'ADULT_NEUTERED': 1.6, # 绝育基准
    'SENIOR': 1.4
}

# --- B. Activity Modifiers (Multipliers on Adult Base) ---
# Applied ONLY to Adult Maintenance (not Growth/Repro)
ACTIVITY_MULTIPLIERS = {
    'RESTING': 0.8,
    'LOW': 0.9,
    'NORMAL': 1.0,
    'HIGH': 1.2,
    'WORKING': 1.5
}

# --- C. Treat Ratios (Percentage of Total DER) ---
TREAT_LIMITS = {
    'CAP_PERCENT': 0.10,    # Max 10% safety cap
    'LOW_RATIO': 0.03,      # 3%
    'MODERATE_RATIO': 0.06, # 6%
    'HIGH_RATIO': 0.10      # 10%
}

# --- D. BCS Adjustments (Body Condition Score) ---
# Logic is functional, but base steps can be defined
BCS_PARAMS = {
    'IDEAL_LOW': 4,
    'IDEAL_HIGH': 5,
    'OVERWEIGHT_PENALTY_PER_POINT': 0.1, # -10% per point > 5
    'UNDERWEIGHT_BOOST_BCS_3': 1.2,
    'UNDERWEIGHT_BOOST_BCS_1_2': 1.4
}
```

#### 3.4 全局单位标准 (Global Unit System)
*Instruction for Cursor: Strictly adhere to these units. Variable names MUST include the suffix to enforce unit types.*

| 维度 (Dimension) | 标准单位 (Unit) | 变量后缀规范 (Suffix) | 说明 (Note) |
| :--- | :--- | :--- | :--- |
| **重量 (物理)** | **g (克)** | `_g` | 数据库库存与生产的唯一物理重量单位。<br>禁止使用 kg, oz, lb。<br>`ML` 需经密度换算为 `_g`。 |
| **数量 (离散)** | **pcs (逻辑计数)** | `_count` 或 `_pcs` | 适用于 `base_unit=PCS` 的物品。<br>前端显示逻辑见下方映射表。 |
| **金额 (财务)** | **CNY (元)** | `_cny` | 精度保留 2 位小数 (Decimal)。 |
| **宏量营养素 (占比)** | **% (百分比)** | `_pct` | **区分基准：**<br>1. 水分使用 `moisture_pct` (As Fed).<br>2. 蛋白/脂肪/碳水等使用 `_dm_pct` (干物质 Dry Matter Basis). |
| **微量营养素 (常规)** | **mg (毫克)** | `_mg` | 适用：钙, 磷, 钾, 钠, 镁, 铁, 锌, 铜, 锰 等。 |
| **微量营养素 (特殊)** | **mcg / ug (微克)** | `_ug` | **强制适用：** 碘 (Iodine), 硒 (Selenium), 维B12。<br>*1000 ug = 1 mg* |
| **微量营养素 (活性)** | **IU (国际单位)** | `_iu` | **强制适用：** 维生素 A, D, E。 |
| **能量密度 (食谱)** | **kcal/kg** | `_kcal_per_kg` | 食谱成品的能量密度 (As Fed)。 |
| **能量需求 (DER)** | **kcal/day** | `_kcal` | 每日代谢能需求。 |
| **钙磷比** | **Decimal (比值)** | `_ratio` | 无单位比值，保留两位小数 (e.g. 1.25)。 |

**Frontend Display Logic (Default Mapping):**
*Instruction for Cursor: When `Ingredient.unit_display_label` is NULL, apply these defaults based on `base_unit`.*

| Base Unit | Default Label (CN) | 适用场景示例 |
| :--- | :--- | :--- |
| **G** | **"克"** | 鸡胸肉、肝脏、大部分食材 |
| **ML** | **"ml"** | 橄榄油、酸奶 |
| **PCS** | **"粒"** | 维生素胶囊、钙片、鱼油 (95% 情况) |

*Scenario Example:*
1. **Vitamin E:** `base_unit=PCS`, `label=NULL`. -> UI shows: "1 粒".
2. **Seaweed:** `base_unit=PCS`, `label="平勺"`. -> UI shows: "1 平勺".

#### 3.5 订单总价与运费算法 (Order Price & Shipping Cost)
*Instruction for Cursor: Use the schemas defined in Section 2.5.*
```python
def calculate_order_price_details(dog, recipe, daily_g, days, discount_rate=1.0):
    """
    计算订单总价 (V3.6 - Bug Fix Edition)
    Strategy: 
    1. Product Price = (COGS + Labor + Overhead + Packaging) / (1 - Global Margin)
    2. Shipping Fee = Pass-through (Calculated separately, NO Margin applied)
    """
    
    # ==========================================
    # 0. 起订量检查
    # ==========================================
    total_net_food_weight_g = daily_g * days
    if total_net_food_weight_g < GLOBAL.min_order_weight_g: 
        raise BusinessError(f"订单净重不足 1kg (当前 {total_net_food_weight_g}g)")

    # ==========================================
    # 1. 基础物理量
    # ==========================================
    meals_per_day = dog.meals_per_day
    # 向上取整到 5g (分装规格)
    single_pack_spec_g = ceil_to_5g(daily_g / meals_per_day)
    total_packs = meals_per_day * days
    
    # 生产投料净重
    total_net_weight_kg = (single_pack_spec_g * total_packs) / 1000.0
    
    # 生产投料毛重 (含烹饪损耗)
    raw_input_weight_kg = total_net_weight_kg * recipe.production_loss_rate

    # ==========================================
    # 2. 核心成本计算 (Product Cost)
    # ==========================================
    cost_ingredients = 0
    
    for item in recipe.items:
        # --- A. 食材 (Yield Rate Logic) ---
        if item.ingredient.type == 'FOOD': 
            item_net_needed_kg = raw_input_weight_kg * (item.ratio_percent / 100.0)
            
            # 出肉率校准
            yield_rate = item.ingredient.properties.get('edible_yield_rate', 1.0)
            item_gross_purchase_kg = item_net_needed_kg / yield_rate
            
            unit_cost = item.ingredient.current_price_per_purchase_unit / item.ingredient.purchase_to_base_ratio
            # 假设 base_unit 是 G/ML，转换 kg -> g
            cost_ingredients += (item_gross_purchase_kg * 1000) * unit_cost

        # --- B. 补剂 (Custom Loss Logic) ---
        elif item.ingredient.type == 'SUPPLEMENT':
            target_key = item.nutrient_target_key
            target_val = item.nutrient_target_value
            concentration = item.ingredient.properties.get('active_nutrients', {}).get(target_key, 0)
            
            if concentration <= 0: raise BusinessError(f"Missing concentration for {item.ingredient.name}")
            
            total_nutrient_needed = target_val * raw_input_weight_kg
            units_theoretical = total_nutrient_needed / concentration
            
            # 读取该补剂特有的损耗率 (默认 1.05)
            custom_loss = item.ingredient.properties.get('production_loss_rate', 1.05)
            units_needed = units_theoretical * custom_loss
            
            unit_cost = item.ingredient.current_price_per_purchase_unit / item.ingredient.purchase_to_base_ratio
            cost_ingredients += units_needed * unit_cost

    # --- C. 人工与制造费用 (Standard Costing) ---
    # 人工成本 - 标准成本法
    standard_batch_output_kg = (GLOBAL.default_batch_capacity_g / 1000.0) * GLOBAL.target_batch_utilization
    standard_labor_cost_per_kg = (GLOBAL.labor_hourly_rate * recipe.batch_labor_hours) / standard_batch_output_kg
    
    cost_labor = raw_input_weight_kg * standard_labor_cost_per_kg
    
    # 制造费用 (Manufacturing Overhead)
    cost_overhead = raw_input_weight_kg * GLOBAL.overhead_cost_per_kg

    # --- D. 包材成本与重量 (Packaging) ---
    cost_packaging = 0
    weight_packaging_g = 0

    # 获取默认包材对象 (通过 ID 而非 Name)
    # Helper: fetch_ingredient_or_default(id, fallback_name)
    vacuum_bag = get_ingredient_by_id(GLOBAL.default_vacuum_bag_id)
    prod_label = get_ingredient_by_id(GLOBAL.default_product_label_id)

    # Safety Check
    if not vacuum_bag or not prod_label:
        raise BusinessError("System Config Error: Default packaging SKUs not set.")
    
    # D1. 随餐耗材 (每包一个)
    cost_packaging += total_packs * (vacuum_bag.current_price + prod_label.current_price)
    weight_packaging_g += total_packs * (vacuum_bag.weight_g + prod_label.weight_g)

    # D2. 物流耗材 (智能分箱)
    containers = calculate_shipping_containers(total_net_food_weight_g)
    
    shipping_label = get_ingredient_by_id(GLOBAL.default_shipping_label_id)
    ice_pack = get_ingredient_by_id(GLOBAL.default_ice_pack_id)
    
    if not shipping_label or not ice_pack:
         raise BusinessError("System Config Error: Shipping SKUs not set.")

    for c in containers:
        box = c['box_item']
        bag = c['thermal_item']
        
        # 累加成本 (假设每箱配 2 个冰袋)
        cost_packaging += box.current_price + bag.current_price + shipping_label.current_price + (ice_pack.current_price * 2)
        # 累加重量
        weight_packaging_g += box.weight_g + bag.weight_g + shipping_label.weight_g + (ice_pack.weight_g * 2)
    
    total_product_cost = cost_ingredients + cost_labor + cost_overhead + cost_packaging

    # ==========================================
    # 3. 产品定价 (Product Pricing)
    # ==========================================
    # 仅对产品成本应用毛利，运费不应用
    # [Fix] 使用全局配置的目标利润率 (GLOBAL.target_margin)
    base_product_price = total_product_cost / (1 - GLOBAL.target_margin)

    # ==========================================
    # 4. 运费计算 (Shipping Fee)
    # ==========================================
    total_shipping_weight_kg = (total_net_food_weight_g + weight_packaging_g) / 1000.0
    shipping_tpl = get_active_shipping_template()
    
    final_shipping_fee = shipping_tpl.vas_fee_per_order + shipping_tpl.base_fee
    if total_shipping_weight_kg > shipping_tpl.base_weight_kg:
        extra_weight = total_shipping_weight_kg - shipping_tpl.base_weight_kg
        import math
        steps = math.ceil(extra_weight / shipping_tpl.step_weight_kg)
        final_shipping_fee += steps * shipping_tpl.step_fee

    # ==========================================
    # 5. 最终总价 (Final Total)
    # ==========================================
    # 商品打折，运费通常不打折
    final_total = (base_product_price * discount_rate) + final_shipping_fee
    
    return {
        "product_price": base_product_price,
        "shipping_fee": final_shipping_fee,
        "total_price": final_total,
        "cost_breakdown": {
            "ingredients": cost_ingredients,
            "labor": cost_labor,
            "overhead": cost_overhead,
            "packaging": cost_packaging
        }
    }

# --- 辅助函数：装箱算法 (Bin Packing Greedy) ---
def calculate_shipping_containers(total_weight_g):
    """
    计算最少箱子组合。
    模拟逻辑：优先填满大容量箱子。

    **Architecture Note (V1 vs V2 Strategy):**
    - **V1 (MVP):** Hardcoding specific box specs below is acceptable for quick launch.
    - **V2 (Target):** DO NOT hardcode. Logic must be:
      1. Query `Ingredient` where `type='PACKAGING'` AND `max_capacity_g` IS NOT NULL.
      2. Sort by `max_capacity_g` DESC.
      3. Use these dynamic objects for the greedy calculation.
    """
    """
    remaining_weight = total_weight_g
    selected_boxes = []
    
    # Mock Database Fetch (In real code, fetch from Ingredient where type=PACKAGING and has max_capacity_g)
    # 按容量降序排列
    # [V1 Implementation] Mock Database Fetch
    # 假设 Ingredient 库中有这些箱子，且 max_capacity_g 已录入
    box_specs = [
        {"item_name": "3号泡沫箱", "cap": 4500}, 
        {"item_name": "4号泡沫箱", "cap": 2500}
    ]
    
    while remaining_weight > 0:
        # 简单贪心策略
        if remaining_weight > 2500:
            # 超过小箱子极限，用大箱子
            box_type = box_specs[0] 
        else:
            # 小于等于2500，用小箱子
            box_type = box_specs[1]
            
        # 模拟获取数据库对象 (实际开发需通过 Name 或 Tag 查找)
        # 注意：此处仍需防范 Name 变更风险，建议 V2 尽快改为 Config 配置列表
        box_ingredient = get_ingredient_by_name(box_type["item_name"])
        # 关联耗材：假设 泡沫箱 总是搭配同型号 铝箔袋
        thermal_bag_name = box_type["item_name"].replace("泡沫箱", "铝箔袋")
        thermal_bag = get_ingredient_by_name(thermal_bag_name)
        
        selected_boxes.append({
            "box_item": box_ingredient,
            "thermal_item": thermal_bag
        })
        remaining_weight -= box_type["cap"]
            
    return selected_boxes
```

#### 3.6 食谱投料与生产计算 (Recipe Batch Execution)
*Instruction for Cursor: This logic converts a Recipe into a Kitchen Production List.*

**Architecture Constraint (COGS Consistency):**
The input parameter `raw_batch_weight_g` MUST be defined exactly as it is in the Costing Algorithm (Section 3.5):
> `raw_input_weight = target_cooked_weight * recipe.production_loss_rate`
* This ensures that the "Inventory Deduction" (Costing) matches the "Kitchen Instruction" (Production).
* Any deviation will cause inventory variance (Phantom Loss/Gain).

```python
def calculate_recipe_batch_metrics(recipe, raw_batch_weight_g):
    """
    计算单锅投料单 (Production Bill of Materials)
    
    参数说明:
    - raw_batch_weight_g: 本批次计划投入的原料总重。
      (包含为了抵消绞肉/搅拌残留而额外增加的 buffer，即 3.2 算法中的 raw_needed)
      
    核心逻辑：
    1. 液体/固体全称重：统一使用 'g' 单位，方便厨房操作 (液体不转体积)。
    2. 补剂物理化：将营养素目标值 (Target) 换算为物理投入量 (g/pcs)。
    """
    food_items = [i for i in recipe.items if i.ingredient.type == 'FOOD']
    supp_items = [i for i in recipe.items if i.ingredient.type == 'SUPPLEMENT']
    
    production_list = []
    
    # --- Phase 1: Base Mix (食材/大料) ---
    # 逻辑：将生肉总重按配比分配给各食材
    for item in food_items:
        # 1. 计算目标投料重量 (g)
        # 厨师需投入含损耗的重量，以确保最终分装时，扣除挂壁残留后，份数依然够分
        target_weight_g = raw_batch_weight_g * (item.ratio_percent / 100.0)
        
        # 2. 厨房显示逻辑 (Kitchen Display)
        # 液体也不转换体积，统一称重，操作更从容
        display_qty = target_weight_g
        display_unit = "g" 
        
        production_list.append({
            "category": "BASE_MIX",
            "ingredient_name": item.ingredient.name,
            "costing_weight_g": target_weight_g,  # 成本/库存扣减依据
            "kitchen_instruction": f"{round(display_qty, 1)} {display_unit}" # 厨师操作指令
        })
        
    # --- Phase 2: Additives (补剂/小料) ---
    # 逻辑：基于"原料总重"计算。因为补剂也会混合在肉里一起挂壁流失。
    raw_batch_weight_kg = raw_batch_weight_g / 1000.0
    
    for item in supp_items:
        # 1. 计算本锅总营养素需求 (e.g. 50kg肉 * 1200mg/kg = 60,000mg 钙)
        target_key = item.nutrient_target_key
        target_val = item.nutrient_target_value or 0
        total_nutrient_needed = target_val * raw_batch_weight_kg
        
        # 2. 获取该批次所用补剂的浓度 (e.g. 400mg/g)
        concentration = item.ingredient.properties.get('active_nutrients', {}).get(target_key, 0)
        
        if concentration > 0:
            # 3. 计算物理投料量 (Physical Weight)
            # Formula: 总需求 / 浓度 = 需要的粉重/粒数
            physical_qty = total_nutrient_needed / concentration
            
            # 4. 获取显示单位
            # 优先用 override label (e.g. "平勺")，否则默认显示 "g" 或 "粒"
            unit_label = item.ingredient.unit_display_label
            if not unit_label:
                # 默认单位映射: PCS显示粒，其他(含G/ML)都显示g
                if item.ingredient.base_unit == 'PCS':
                    unit_label = '粒'
                else:
                    unit_label = 'g'
            
            production_list.append({
                "category": "ADDITIVE",
                "ingredient_name": item.ingredient.name,
                "nutrient_info": f"Target: {total_nutrient_needed}{target_key.split('_')[-1]}", # 备注给营养师核对
                "kitchen_instruction": f"{round(physical_qty, 2)} {unit_label}" # 厨师操作指令
            })
        else:
            # 数据缺失报警
            production_list.append({
                "category": "ERROR",
                "ingredient_name": item.ingredient.name,
                "kitchen_instruction": "❌ 浓度数据缺失，无法计算投料量！"
            })
        
    return production_list
```