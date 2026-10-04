# 05_API_Specs.md
# API Contract Specification (Frontend ↔ Backend)

    本文档定义系统所有对外 API 的“契约级规范”。
    目标是明确前后端的交互边界、职责划分与调用约束。

    本文档：
        - 不定义字段类型（以 07_PRD_Core_Architecture.md 为准）
        - 不包含算法逻辑（以 04_Domain_Model_and_Algorithms.md 为准）
        - 不包含 UI 结构（以 03_Features_and_UI_Blueprints.md 为准）
        - 不绑定具体技术栈（以 00_Tech_Stack_Standards.md 为准）

============================================================
# 1. Global Conventions（全局约定）
============================================================

------------------------------------------------------------
# 1.1 Base URL & Versioning
------------------------------------------------------------

    Base Path:
        /api/v1

    所有 API 必须显式带版本号。
    禁止无版本路径。


------------------------------------------------------------
# 1.2 Authentication & Identity
------------------------------------------------------------

    客户端类型：
        - CUSTOMER（C 端用户）
        - STAFF（员工端）
        - ADMIN（后台管理员）

    鉴权方式：
        - 所有需要登录的接口，必须携带用户身份上下文
        - API 不关心鉴权实现细节（Token / Session 等）

    API 层可读取的身份信息：
        - user_id
        - role (CUSTOMER | STAFF | ADMIN)


------------------------------------------------------------
# 1.3 Response Envelope（统一响应结构）
------------------------------------------------------------

    所有 API 返回统一结构：

        {
            code: number,
            message: string,
            data: object | null
        }

    说明：
        - code = 0 表示成功
        - 非 0 表示业务错误或系统错误
        - DomainException 映射为业务错误码


------------------------------------------------------------
# 1.4 Readonly vs Command APIs
------------------------------------------------------------

    查询类 API：
        - GET
        - 不改变系统状态
        - 不触发 Domain Event

    命令类 API：
        - POST / PUT
        - 改变系统状态
        - 必须通过 Domain Service
        - 必须校验状态机


============================================================
# 2. Customer APIs（用户端）
============================================================

------------------------------------------------------------
## 2.1 Dog Profile APIs
------------------------------------------------------------

### Create Dog Profile
    POST /dogs

    Purpose:
        创建新的狗狗档案

    Request:
        - DogProfile 可编辑字段集合（参照 07/04）
        - treat_input_mode 及对应字段

    Response:
        - dog_id
        - DogProfile（完整结构）
        - DogCalcResult（首次计算结果）


### Update Dog Profile
    PUT /dogs/{dog_id}

    Purpose:
        更新狗狗档案（体重、活动量、零食模式等）

    Constraints:
        - 必须触发 DogCalcService 重算
        - 返回最新 DogCalcResult
        - 该接口会写入 DogProfile（持久化）

    Response:
        - DogProfile（更新后）
        - DogCalcResult


### Get Dog Detail
    GET /dogs/{dog_id}

    Purpose:
        获取狗狗完整档案信息

    Response:
        - DogProfile
        - DogCalcResult


### Calc Preview (Dry-Run) ★新增：不落库试算
    POST /dogs/calc-preview

    Purpose:
        提供“试算/预览”能力：不修改、不写入 DogProfile，仅返回喂食建议结果。
        典型场景：
            - 用户在编辑页面切换 treat_level / manual_treat_kcal 做动态预览
            - 工具页（饭量计算器）需要完整 DogCalcResult

    Request:
        - DogCalcInput（不带 dog_id，纯数据输入；字段集合参照 04 文档 DogCalcInput）

    Constraints:
        - 不允许写入数据库
        - 不允许产生 Domain Event
        - 必须使用 DogCalcService 计算

    Response:
        - DogCalcResult


------------------------------------------------------------
## 2.2 Recipe APIs
------------------------------------------------------------

### List Recipes
    GET /recipes

    Purpose:
        获取可展示的食谱列表

    Filters:
        - status = PUBLISHED
        - 可选：适用 life_stage / size_class（由后端处理）

    Response:
        - Recipe summary list


### Get Recipe Detail
    GET /recipes/{recipe_id}

    Purpose:
        获取食谱详情（非快照）

    Response:
        - Recipe
        - NutritionPanel
        - IngredientList


------------------------------------------------------------
## 2.3 DIY Process APIs
------------------------------------------------------------

### Generate DIY Process Sheet
    POST /recipes/{recipe_id}/diy-sheet

    Purpose:
        为指定食谱生成 DIY 制作流程单

    Request:
        - dog_id（用于生成对应克数提示；如不传则按默认展示）

    Response:
        - steps[]
        - recommended_daily_intake_g（若提供 dog_id）


### Save Customer DIY Sheet
    POST /user/diy-sheets

    Purpose:
        保存用户生成的 DIY 制作单，用于历史查看、评价权限和跨设备再次打开。

    Request:
        - recipe_id
        - recipe_name
        - dog_id
        - cycle_days
        - per_meal_g
        - daily_intake_g
        - package_plan[]（可选，多规格分装明细）
            - package_spec_g
            - package_count
        - purchase_list[]
        - production_steps

    Response:
        - DIYSheet
        - package_plan 原样返回；历史制作单再次打开时应继续传给制作单页面。


### List Customer DIY Sheets
    GET /user/diy-sheets

    Purpose:
        获取当前用户保存过的 DIY 制作单。

    Response:
        - DIYSheet[]
        - 每条记录包含 package_plan（如保存时提供），用于恢复多规格分装。


------------------------------------------------------------
## 2.4 Order APIs
------------------------------------------------------------

### Create Order Draft
    POST /orders/draft

    Purpose:
        创建订单草稿（未支付）

    Request:
        - dog_id
        - recipe_id
        - cycle_days
        - address_id

    Backend Behavior:
        - 创建 RecipeSnapshot
        - 调用 DogCalcService（或读取 DogProfile 已计算结果）
        - 调用 ShippingFeeService 计算运费
        - 调用 OrderPricing（读取 GlobalConfig）

    Response:
        - order_id
        - amount_product
        - amount_shipping
        - amount_total
        - status = INIT


### Submit Order for Payment
    POST /orders/{order_id}/submit

    Purpose:
        订单进入待支付状态

    Constraints:
        - 仅 INIT 状态允许

    Response:
        - status = PENDING_PAYMENT


### Get Order Detail
    GET /orders/{order_id}

    Purpose:
        获取订单详情（包含所有 OrderItems 与其 snapshot 摘要）

    Response:
        - Order
        - OrderItems（包含 snapshot 基础信息，用于列表展示）
        - Shipping info
        - OrderProgress


### List Orders
    GET /orders

    Purpose:
        获取用户订单列表

    Response:
        - Order summary list


### Get OrderItem Snapshot ★新增：独立快照详情
    GET /orders/items/{order_item_id}/snapshot

    Purpose:
        独立获取某个订单项的 RecipeSnapshot（用于 SnapshotRecipeDetailPage）
        典型场景：
            - 订单较大时，避免为了查看某个快照详情而拉全量订单
            - 快照详情页独立路由加载，组件复用更自然

    Constraints:
        - 仅返回 snapshot（只读）
        - 不允许基于 snapshot 进行任何编辑/更新
        - 必须保证 snapshot 不可变（后端不提供更新接口）

    Response:
        - RecipeSnapshot（完整结构，参照 07/04）


------------------------------------------------------------
## 2.5 Address APIs
------------------------------------------------------------

### List Addresses
    GET /addresses

    Purpose:
        获取用户地址列表

    Response:
        - Address[]


### Create Address
    POST /addresses

    Purpose:
        新建收货地址

    Request:
        - receiver_name
        - phone
        - region
        - detail_address
        - is_default（可选）

    Response:
        - address_id
        - Address


### Update Address
    PUT /addresses/{address_id}

    Purpose:
        修改地址信息

    Constraints:
        - 不允许修改历史订单“已绑定地址”的记录（如业务选择强一致，可通过复制新地址实现）

    Response:
        - Address


### Set Default Address（可选）
    POST /addresses/{address_id}/set-default

    Purpose:
        设置默认地址

    Response:
        - ok


============================================================
# 3. Staff APIs（员工端）
============================================================

------------------------------------------------------------
## 3.1 Kitchen APIs
------------------------------------------------------------

### List Production Batches
    GET /staff/kitchen/batches

    Purpose:
        获取厨房生产批次列表

    Filters:
        - status: PENDING | IN_PROGRESS | COMPLETED

    Response:
        - ProductionBatch summary list


### Get Batch Detail
    GET /staff/kitchen/batches/{batch_id}

    Purpose:
        查看单个批次的投料任务

    Response:
        - ProductionBatch
        - ProductionTasks[]


### Update Production Task
    POST /staff/kitchen/tasks/{task_id}

    Purpose:
        录入实际投料并上传溯源照片

    Request:
        - actual_weight_g
        - photos_raw[]
        - photos_cooked[]
        - photos_portioned[]

    Constraints:
        - 写入必须通过 ProductionService
        - 更新后可能触发库存扣减（由 InventoryService 执行）
        - 幂等性建议：同一 task 重复提交应覆盖同一版本或生成审计记录（实现细节不在此文档定义）

    Response:
        - 更新后的 ProductionTask


------------------------------------------------------------
## 3.2 Purchasing APIs
------------------------------------------------------------

### Get Purchase List
    GET /staff/purchase/items

    Purpose:
        查看采购需求清单

    Response:
        - ingredient_id
        - expected_g
        - current_stock_g


### Submit Purchase Record
    POST /staff/purchase/orders

    Purpose:
        提交采购记录

    Request:
        - ingredient_id
        - purchased_g

    Response:
        - PurchaseOrder


------------------------------------------------------------
## 3.3 Shipping APIs
------------------------------------------------------------

### List Shipping Tasks
    GET /staff/shipping/orders

    Purpose:
        获取待发货订单

    Response:
        - order_id
        - address
        - total_weight


### Submit Shipment
    POST /staff/shipping/orders/{order_id}/ship

    Purpose:
        提交物流信息并发货

    Request:
        - tracking_number
        - carrier_code

    Constraints:
        - 仅 PACKAGED 状态允许

    Response:
        - status = SHIPPED


============================================================
# 4. Admin APIs（后台管理）
============================================================

------------------------------------------------------------
## 4.1 Recipe Management
------------------------------------------------------------

### Create / Update Recipe
    POST /admin/recipes
    PUT  /admin/recipes/{recipe_id}

    Purpose:
        创建或修改食谱

    Request:
        - Recipe 基础信息
        - items[]
        - design_source

    Backend Behavior:
        - 调用 RecipeNutritionService
        - 自动生成 nutrition_detailed_data

    Response:
        - Recipe


------------------------------------------------------------
## 4.2 Inventory Management
------------------------------------------------------------

### Get Inventory List
    GET /admin/inventory

    Purpose:
        查看库存情况

    Response:
        - ingredient_id
        - stock_g
        - reorder_point


------------------------------------------------------------
## 4.3 Global Config APIs
------------------------------------------------------------

### Get Global Config
    GET /admin/config

    Purpose:
        获取全局配置

    Response:
        - target_margin
        - labor_hourly_rate
        - 其他配置项


### Update Global Config
    PUT /admin/config

    Purpose:
        更新全局配置

    Constraints:
        - 仅 ADMIN 可操作
        - 修改后立即影响新订单定价

    Response:
        - 最新 GlobalConfig


============================================================
# 4.5 过敏板块（2026-10-04 重构后新增）
============================================================

>>> 【过敏原词表】GET /allergens/common
    - 描述：常见食物过敏原的受控词表
    - 认证：不需要
    - 返回：{ allergens: [{ code, name, aliases, commonRank }] }
    - 顺序依据知识库 skin-005（SACN5 第 31 章）的循证常见度：
      牛肉 / 乳制品 / 小麦合计约 69%，其次羊肉、鸡蛋、鸡肉、大豆约 25%
    - 小程序「一点即选」读这个接口，不再硬编码在小程序里

>>> 【过敏档案】GET /dogs/:dogId/allergen-profile
    - 描述：这只狗的过敏档案（结论 + 会命中的食材）
    - 认证：X-Customer-Id
    - 返回：
        allergens[]               过敏原（带 certainty / source / 是否收录于词表）
        avoidedIngredientNames[]  原料库里会被命中的食材名（确诊 + 可疑/待排查）
        confirmedIngredientNames[]其中属于「确诊」的
        hasAnyAllergen
    - 用途：小程序首页「挑食/过敏」筛选默认带出、健康页「不能吃的」、
            后台营养师面板 —— 三处共用同一份口径

>>> 【过敏记录】/dogs/:dogId/allergies
    - GET / POST / GET :id / PUT :id / DELETE :id（2025 年就有，2026-10-04 收紧）
    - 收紧点：
        · 同一只狗 + 同一过敏原唯一（数据库唯一约束 + 接口友好报错）
        · 过敏原不允许空白、限长 40（此前只校验「是个字符串」）
        · PUT 不再「没传 notes 就清空」（此前只改名称会悄悄抹掉备注）
        · 支持 certainty（确诊/可疑/待排查/已排除）与 source

>>> 【检测报告】/dogs/:dogId/allergy-reports
    - GET  /                        列出报告（含每份的结论）
    - POST /                        新建报告 + 结论（结论会做词表归一）
    - GET  /:reportId               报告详情
    - GET  /:reportId/impact        这份报告让原料库里哪些食材要避开
    - PUT  /:reportId               修改
    - DELETE /:reportId             删除报告（**不级联删除过敏记录**）
    - 结论等级 level（照抄报告，不做医学判断）：
        POSITIVE 阳性 → 记成「确诊」；WEAK_POSITIVE/SUSPECTED → 「可疑」；
        NEGATIVE 阴性 → **不记成过敏**；UNKNOWN → 「可疑」（宁可多避）
    - 检测方式 testMethod：SERUM / INTRADERMAL / ELIMINATION / OTHER / UNKNOWN
    - **原件留得住**：改造前顾客上传的识别用图片传完就丢

>>> 【排查计划】/dogs/:dogId/allergy-trials
    - GET  /dogs/:dogId/allergy-trial         当前进行中的计划 + 规则表
    - GET  /dogs/:dogId/allergy-trials/history 历史计划
    - POST /dogs/:dogId/allergy-trials        新建（一只狗同时只能有一个进行中）
    - PUT  /:trialId                          修改（含开始排除期、勾选必守清单）
    - POST /:trialId/logs                     每日打卡（按日期 upsert）
    - POST /:trialId/challenges               开始再挑战
    - PUT  /:trialId/challenges/:allergen     记录结论 → **回写过敏记录可信度**
    - POST /:trialId/conclude                 结束 / 中途放弃
    - 规则表（建议时长 / 必守清单 / 再挑战窗口 / 兽医边界提示）由后端下发：
      那些数字都带出处（SACN5 第 31 章），不该散落在客户端
    - ⚠️ 定位：**帮你执行，不替兽医开方案**。试验必须由兽医设计与监督。

>>> 【识别】POST /health/extract-report
    - 2026-10-04 第五期扩展：过敏报告额外读出
        reportMeta.testMethod  检测方式（照抄报告）
        reportMeta.testDate    检测日期（照抄报告）
        drafts[].level         每一项的结论等级（照抄报告）
    - 边界不变：AI 只把纸上的字搬进表单，**不判断疾病名称、严重程度、
      过敏类型**；识别结果必须顾客确认才落库


============================================================
# 5. Error Handling（错误处理）
============================================================

常见业务错误示例：

    - InvalidStateTransition
    - InvalidDogCalcInput
    - InventoryShortage
    - ShippingTemplateNotFound
    - GlobalConfigNotFound
    - SnapshotNotFound

API 层职责：
    - 捕获 DomainException
    - 转换为统一 code / message 返回
    - 不吞异常、不在 Controller 写业务补偿逻辑


============================================================
# End of Document
============================================================
