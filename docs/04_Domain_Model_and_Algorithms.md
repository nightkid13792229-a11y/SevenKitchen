# Domain Model & Algorithms Blueprint (Based on PRD 07)

    本文档定义本项目的后端领域模型（Domain Model）、聚合（Aggregates）、
    不变量（Invariants）、领域服务（Domain Services）、计算算法（Algorithms），
    并明确每个领域的输入与输出结构。

    本文档不包含：
        - API 入参/出参规范（属于 05 文档）
        - 数据库存储细节（已经在 07 文档定义）
        - UI（属于 03 文档）
        - 技术栈（属于 00 文档）


============================================================
# 1. Domain Layer Overview（领域层总体结构）
============================================================

    系统采用分层结构：
        Application Layer（编排逻辑）
        Domain Layer（本文件定义）
        Infrastructure Layer（数据库、缓存、第三方服务）

    Domain 层负责：
        - 领域实体的定义
        - 业务规则的表达
        - 状态机约束
        - 不变量检查
        - 计算算法
        - 领域事件


------------------------------------------------------------
# 1.1 领域划分（Bounded Contexts）
------------------------------------------------------------

本项目包含六个核心领域：

    1. Dog Domain（狗狗档案与营养需求）
    2. Recipe Domain（食谱配置与营养计算）
    3. Order Domain（订单与 Snapshot）
    4. Production Domain（排产、厨房、溯源）
    5. Inventory & Purchasing Domain（库存与采购）
    6. Shipping & Address Domain（地址、运费）

这六个领域之间通过 Application Service 调用，不直接耦合。


============================================================
# 2. Entities, Value Objects & Aggregates（实体与聚合）
============================================================

------------------------------------------------------------
## 2.1 Dog Domain
------------------------------------------------------------

### Aggregate Root: DogProfile
    字段（高层级，不写具体类型）：
        dog_id
        name
        gender
        birthday
        weight
        breed
        neutered

        activity_level
            枚举值必须与 07 文档保持一致：
                RESTING
                LOW
                NORMAL
                HIGH
                WORKING

        bcs_score（1–9 体况评分）
        allergies[]
        dislikes[]
        medical_history[]

        treat_input_mode
            枚举：
                ESTIMATE_LEVEL
                EXACT_KCAL

        treat_level
            当 treat_input_mode = ESTIMATE_LEVEL 时生效：
                枚举值必须与 07 文档保持一致：
                    NONE
                    LOW
                    MODERATE
                    HIGH

        manual_treat_kcal
            当 treat_input_mode = EXACT_KCAL 时生效

### 不变量（Invariants）
    - birthday 不可大于当前日期
    - weight > 0
    - bcs_score 必须为 1–9 的整数
    - treat_input_mode === ESTIMATE_LEVEL ⇒ manual_treat_kcal 必须为空
    - treat_input_mode === ESTIMATE_LEVEL ⇒ treat_level ∈ {NONE, LOW, MODERATE, HIGH}
    - treat_input_mode === EXACT_KCAL ⇒ treat_level 必须为空，manual_treat_kcal ≥ 0

### 派生字段（由 Domain Service 计算）
    - age_months
    - size_class（依据体重/品种，参照 07 文档 SizeClass 规则）
    - life_stage（幼犬/成犬/老年，参照 07 文档 LifeStage 规则）
    - treat_cap_kcal（行为由 DogCalcService 决定）

### Value Object: DogCalcInput
    用于 DogCalcService 的输入：
        - weight
        - activity_level
        - life_stage
        - treat_input_mode
        - treat_level（若 ESTIMATE_LEVEL）
        - manual_treat_kcal（若 EXACT_KCAL）
        - recipe_energy_density（用于计算克数时）

### Value Object: DogCalcResult
    - rer
    - der
    - treat_cap_kcal
    - daily_intake_g


------------------------------------------------------------
## 2.2 Recipe Domain
------------------------------------------------------------

### Aggregate Root: Recipe
    - recipe_id
    - title
    - description
    - design_source
    - cover_images[]
    - items[]（RecipeItem 列表）
    - nutrition_detailed_data
    - status (PUBLISHED / HIDDEN)

### Entity: RecipeItem
    - ingredient_id
    - type (FOOD | SUPPLEMENT)
    - ratio_percent
    - nutrient_target_key（若 type = SUPPLEMENT 时使用，用于补剂目标）

### Value Object: NutritionPanel
    - protein_dm
    - fat_dm
    - fiber_dm
    - carbs_dm
    - energy_density_kcal_per_kg
    - 其他营养指标（以 07 文档为准）

### 不变量（Invariants）
    - ratio_percent 总和必须 = 100（食品 + 补剂）
    - 相同 ingredient_id 不可重复
    - nutrition_detailed_data 必须由 RecipeNutritionService 统一计算，不可人工编辑


### Value Object: RecipeSnapshot（不可变）
用于订单冻结配方状态。

    字段包含（以 07 文档为准）：
        recipe_title
        version
        items（深拷贝）
        nutrition_detailed_data（深拷贝）
        design_source
        energy_density
        created_at

不变规则：
    - Snapshot 创建后永不可更改
    - 不允许对 snapshot 做更新，只允许新建


------------------------------------------------------------
## 2.3 Order Domain
------------------------------------------------------------

### Aggregate Root: Order
    - order_id
    - customer_id
    - address_id
    - amount_product
    - amount_shipping
    - amount_total
    - status

### Entity: OrderItem
    - order_item_id
    - recipe_snapshot（RecipeSnapshot 对象）
    - daily_intake_g
    - total_grams

### 状态机（State Machine）
OrderStatus：
    INIT
    PENDING_PAYMENT
    PAID
    SCHEDULING
    IN_PRODUCTION
    PACKAGED
    SHIPPED
    DELIVERED
    CANCELED

允许的转移（必须在 Domain 层强制）：
    INIT → PENDING_PAYMENT
    PENDING_PAYMENT → PAID
    PAID → SCHEDULING
    SCHEDULING → IN_PRODUCTION
    IN_PRODUCTION → PACKAGED
    PACKAGED → SHIPPED
    SHIPPED → DELIVERED
    任意状态（在未支付或支付超时前）→ CANCELED

非法转移必须抛出 InvalidStateTransitionException。


------------------------------------------------------------
## 2.4 Production Domain（生产域）
------------------------------------------------------------

### Aggregate Root: ProductionBatch
    - batch_id
    - batch_code
    - recipe_id
    - tasks[]（ProductionTask 列表）
    - status (PENDING / IN_PROGRESS / COMPLETED)

### Entity: ProductionTask
    - task_id
    - batch_id
    - ingredient_id
    - required_weight_g
    - actual_weight_g
    - photos_raw[]
    - photos_cooked[]
    - photos_portioned[]

不变量：
    - actual_weight_g 必须 >= 0（允许为 0 表示未录入或弃用）
    - 若 photos_cooked / photos_portioned 非空，则 task 状态必须已到相应阶段（由 Application 层执行业务校验）

溯源要求：
    - photos_raw / photos_cooked / photos_portioned 必须通过订单间接可追溯（Order → OrderItem → Recipe / Batch → ProductionTask）。


------------------------------------------------------------
## 2.5 Inventory & Purchasing Domain
------------------------------------------------------------

### Entity: IngredientStock
    - ingredient_id
    - stock_g
    - yield_rate（出肉率，食品专用）
    - purchase_to_base_ratio（补剂浓度 / 稀释比）

不变量：
    - stock_g >= 0
    - yield_rate > 0
    - purchase_to_base_ratio > 0

### Aggregate Root: PurchaseOrder
    - po_id
    - ingredient_id
    - expected_g
    - purchased_g
    - status

采购完成后库存更新规则：
    - stock_g += purchased_g（如涉及 yield 或 purchase_to_base_ratio，由 InventoryService 统一封装换算，不在 UI 或 Controller 中计算）


------------------------------------------------------------
## 2.6 Shipping & Address Domain
------------------------------------------------------------

### Entity: Address
    - receiver_name
    - phone
    - region（省/市/区 JSON 结构）
    - detail_address
    - is_default

不变量：
    - phone 必须通过手机号格式验证
    - region 必须包含省/市/区字段

### Value Object: ShippingFeeResult
    - amount_shipping
    - template_id
    - rule_applied_description（方便调试与客服解释）


============================================================
# 3. Domain Services（领域服务）
============================================================

    所有 Domain Services 必须：
        - 无状态（stateless）
        - 不依赖具体 Web 框架
        - 只依赖 Repository 接口和 Value Object
        - 不直接操作 HTTP / Session / Cookie 等


------------------------------------------------------------
## 3.1 DogCalcService（核心营养计算）
------------------------------------------------------------

### Input: DogCalcInput
    - dog_profile（或最小必要字段：weight, life_stage, activity_level, bcs_score, treat 配置）
    - recipe_energy_density（计算克数时需要）
    - treat_input_mode（ESTIMATE_LEVEL / EXACT_KCAL）
    - treat_level（NONE / LOW / MODERATE / HIGH，当 ESTIMATE_LEVEL 时）
    - manual_treat_kcal（当 EXACT_KCAL 时）

### Output: DogCalcResult
    - rer
    - der
    - treat_cap_kcal
    - daily_intake_g

### Algorithm:

#### Step 1: 计算 RER
    RER = 70 × (weight_kg ^ 0.75)

#### Step 2: 计算 DER（引用 07 文档常量表）
    DER = RER × factor

    这里的 factor 不允许在本文件硬编码具体数字，
    必须通过 07_PRD_Core_Architecture.md 中定义的常量表获取，例如：

        ACTIVITY_MULTIPLIERS
            - RESTING
            - LOW
            - NORMAL
            - HIGH
            - WORKING

        LIFE_STAGE_FACTORS
            - Puppy 不同月龄阶段的系数
            - Adult 的系数
            - Senior 的系数

    实际计算流程：
        1）根据 DogProfile.life_stage 查 LIFE_STAGE_FACTORS
        2）根据 DogProfile.activity_level 查 ACTIVITY_MULTIPLIERS
        3）将二者组合（如：base_factor × activity_factor 或按 07 文档定义）
        4）得到最终 DER 系数，不在此处硬编码任何具体数值

#### Step 3: 计算 treat_cap_kcal（引用 07 文档零食等级常量表）
    treat_input_mode = ESTIMATE_LEVEL 时：
        - treat_level ∈ {NONE, LOW, MODERATE, HIGH}
        - 对应的“零食占 DER 的比例”必须引用 07 中定义的常量表
          （例如 TREAT_LEVEL_MULTIPLIERS），
          禁止在此处写死 NONE=0%, LOW=5% 类似的魔法数字。

        treat_cap_kcal = DER × TREAT_LEVEL_MULTIPLIERS[treat_level]

    treat_input_mode = EXACT_KCAL 时：
        treat_cap_kcal = manual_treat_kcal

#### Step 4: 计算每日鲜食克数
    food_kcal_needed = max(DER − treat_cap_kcal, 0)
    daily_intake_g = food_kcal_needed / (energy_density_kcal_per_kg / 1000)

#### 验证规则：
    - daily_intake_g >= 0
    - treat_cap_kcal >= 0
    - 若 manual_treat_kcal > DER，则可选择：
        - 抛出 InvalidDogCalcInputException，或
        - 记录 warning，并将 food_kcal_needed 视为 0


------------------------------------------------------------
## 3.2 RecipeNutritionService（食谱营养计算）
------------------------------------------------------------

Input:
    - recipe.items（含 ratio_percent, ingredient_id, type）
    - ingredient_nutrient_table（原始营养表）

Output:
    - nutrition_detailed_data（湿物质 + 干物质 + 能量）

Algorithm（概要）：
    1. 遍历每个 RecipeItem：
        - 按 100g 食谱计算单项贡献
        - 将原料营养数据转换到统一基准（湿物质或干物质）
    2. 根据 ratio_percent 对所有营养指标做加权平均
    3. 使用 Atwater 系数计算能量密度（kcal/kg）
    4. 输出 NutritionPanel 结构

Invariants:
    - 不允许在 Application 层重复实现营养计算逻辑
    - 所有营养相关的展示都应依赖 NutritionPanel，不应自行拼接


------------------------------------------------------------
## 3.3 RecipeSnapshotService（快照服务）
------------------------------------------------------------

Snapshot 必须在 "订单创建（或即将支付）" 时生成。

Algorithm:
    createSnapshot(recipe: Recipe) → RecipeSnapshot：
        - 拷贝 Recipe 的关键字段：
            recipe_title
            version
            items（深拷贝）
            nutrition_detailed_data（深拷贝）
            design_source
            energy_density
        - 设置 created_at = now()

不变性（Immutable Rule）：
    - snapshot 一旦写入数据库，不允许对其做任何 UPDATE
    - 任何想变更“订单所对应配方”的行为，必须通过新建订单，而非修改 snapshot


------------------------------------------------------------
## 3.4 OrderService（订单逻辑）
------------------------------------------------------------

### 主流程

Step 1: 创建订单草稿（INIT）
    - 输入：用户选择的 recipe、dog_profile、周期天数、收货地址
    - 调用：
        - RecipeSnapshotService 生成 snapshot
        - DogCalcService 计算每日克数（如需要）
        - ShippingFeeService 计算运费
        - PricingService（可内嵌在 OrderService 或单独 Domain Service）依据 GlobalConfig 计算价格

    - 组合：
        - amount_product
        - amount_shipping
        - amount_total
        - 初始状态：INIT

Step 2: 进入 PENDING_PAYMENT
    - Application 层调用支付网关，Domain 层仅更新状态

Step 3: 支付成功 → PAID
    - 校验支付金额与 amount_total 一致
    - 状态由 PENDING_PAYMENT → PAID
    - 触发 OrderPaid 领域事件

Step 4: 进入排产（SCHEDULING）
    - 由 SchedulingService 根据 PAID 状态订单创建 ProductionBatch
    - OrderStatus 由 PAID → SCHEDULING

Step 5: 后续状态流转
    - 按状态机约束逐步流转至 DELIVERED 或 CANCELED


------------------------------------------------------------
## 3.5 SchedulingService（排产服务）
------------------------------------------------------------

Input:
    - 一批 PAID 订单

Output:
    - ProductionBatch 列表

Core Logic:
    1. 将订单的 OrderItem 按 recipe_id 分组
    2. 根据工厂产能（每锅最大重量）拆分为多个 batch
    3. 为每个 batch 生成对应的 ProductionTask：
        - 计算每个 ingredient 的 required_weight_g
    4. 触发 StockLowEvent / Purchase 建议（由 InventoryService 处理）


------------------------------------------------------------
## 3.6 ProductionService（厨房任务）
------------------------------------------------------------

负责：
    - 接收 SchedulingService 生成的生产批次
    - 记录实际投料（actual_weight_g）
    - 记录溯源照片（raw / cooked / portioned）
    - 完成后更新 batch.status = COMPLETED

重要约束：
    - 不允许在此处改变订单的数量逻辑，只能影响库存与溯源信息
    - 若实际投料与应投差距过大（由业务规则定义），应发出告警事件


------------------------------------------------------------
## 3.7 InventoryService（库存与采购）
------------------------------------------------------------

负责：
    - 根据 ProductionTask 的 actual_weight_g 扣减 stock_g
    - 当 stock_g < reorder_point 时触发 StockLowEvent
    - 处理 PurchaseOrder 完成时，对 stock_g 进行增加（考虑 yield_rate 与 purchase_to_base_ratio）

禁止：
    - 在 Controller 或 Application 层重复实现库存扣减逻辑
    - 在前端根据估算值直接修改库存


------------------------------------------------------------
## 3.8 ShippingFeeService（运费）
------------------------------------------------------------

Input:
    - address.region
    - shipping_template
    - total_weight

Output:
    - ShippingFeeResult

Core Rules:
    - 根据省市区匹配运费模板
    - 考虑首重/续重、包邮区等规则（以 07 文档定义的模板为准）
    - Domain 层只负责规则运算，不负责选择具体物流公司


============================================================
# 4. Domain Events（领域事件）
============================================================

建议关键事件：

    DogProfileUpdated
    RecipeUpdated
    OrderCreated
    OrderPaid
    OrderScheduled
    BatchCreated
    BatchCompleted
    StockLowEvent
    ShipmentCreated

用途：
    - 解耦模块间联动
    - 触发日志/审计记录
    - 驱动异步动作（如通知、报表）


============================================================
# 5. Cross-Domain Interaction Rules（跨领域规则）
============================================================

### 5.1 Dog → DogCalc → UI
    - DogCalcService 只能存在于 Domain 层
    - UI 仅展示 DogCalcResult，不得自行实现 RER/DER/Treat 等计算

### 5.2 Recipe → RecipeSnapshot → Order
    - Order 必须依赖 RecipeSnapshot，而非直接引用 Recipe 当前版本
    - Snapshot 不可变，禁止 Update

### 5.3 Order → Scheduling → Production
    - 只有 PAID 状态的订单才能进入排产
    - SchedulingService 不允许修改订单内容，只能生成 ProductionBatch

### 5.4 Production → Inventory
    - 只有基于 actual_weight_g 的数据才能影响库存
    - 任何基于“应投重量”的库存扣减都是无效实现

### 5.5 Address → ShippingFee → OrderPricing
    - 运费计算必须通过 ShippingFeeService 完成
    - Order 只持有运费结果，不关心模板细节

### 5.6 OrderPricing → GlobalConfig（新增）
    - OrderService 在计算金额时，必须通过 GlobalConfig 读取：
        - target_margin（目标毛利率）
        - labor_hourly_rate（人工小时成本）
    - 禁止在 Order Domain 或任何 Service 中硬编码利润率或人工成本常数。
    - 价格相关逻辑应形如：
        amount_product = BaseCost × (1 + target_margin)
        其中 BaseCost 可能来自：
            - 食材成本（由 Inventory/Ingredient 数据提供）
            - 人工成本（labor_hourly_rate × 估算工时）
    - GlobalConfig 的读取由 Application 层注入到 Domain Service 中，
      Domain Service 只依赖抽象接口（例如 GlobalConfigProvider），不直接访问数据库。


============================================================
# 6. Domain Exceptions（领域异常）
============================================================

所有异常必须通过统一的 DomainException 体系表达，以便上层做统一处理：

    - InvalidStateTransitionException
    - InvalidSnapshotMutationException
    - InvalidDogCalcInputException
    - InventoryShortageException
    - InvalidRecipeItemException
    - ShippingTemplateNotFoundException
    - GlobalConfigNotFoundException（读取不到全局配置时抛出）

============================================================
# End of Document
============================================================
