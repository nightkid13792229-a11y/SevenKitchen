# UI & Features Blueprint (Component + Pages)

    本文档描述项目中所有前端界面的 UI 结构、页面字段、交互逻辑、路由结构以及全局组件规范。
    本文件不包含技术栈、不包含字段类型定义、不包含后端算法细节、不包含 API 参数结构。


------------------------------------------------------------
# 1. 全局 UI 规范（Global UI Standards）
------------------------------------------------------------

## 1.1 页面布局（Layout）
    - 页面顶部为导航栏（标题 + 返回按钮）
    - 主体内容分为：信息区 / 列表区 / 操作区
    - 所有列表页面必须支持：空态、加载态、下拉刷新
    - 主操作按钮统一放在底部 ActionBar

## 1.2 复用组件规范（Reusable Components）
    全局可复用组件（部分在后文单独展开）：

    - ListItem：通用列表项
    - InfoCard：信息卡片
    - ProgressBar：订单/生产进度条
    - Tag：标签（低脂、增肥等）
    - EmptyState：空态展示
    - LoadingSkeleton：加载占位
    - Modal：确认/提示弹窗
    - Toast：轻提示
    - AddressCard：展示/选择收货地址
    - ImageUploader：多图上传组件（用于厨房溯源照片）
    - TabFilter：顶部筛选 Tab（如“待处理 / 进行中 / 已完成”）
    - BCSSelector：体况评分选择组件（1–9 可视化）
    - TreatConfigPanel：零食配置组件（支持估算模式和精确模式）


------------------------------------------------------------
# 2. Customer 小程序（狗家长端）
------------------------------------------------------------

============================================================
## 2.1 首页（Home Page）
============================================================

### 页面内容（字段级）
    - banner_images[]
    - dog_profile_preview:
        dog_id
        name
        avatar
        weight
        age_text
        health_tags[]
    - recommended_recipes[]:
        recipe_id
        title
        cover_image
        tags[]
    - actions:
        - 创建狗狗档案
        - 进入工具（DIY / 饭量计算）
        - 食谱橱窗入口
        - 地址管理入口
        - 客服入口

### 用户交互（Interaction）
    - 点击狗狗档案 → DogDetailPage(dog_id)
    - 点击推荐食谱 → RecipeDetailPage(recipe_id)
    - 无档案时 → 引导创建狗档案
    - 点击“地址管理” → AddressListPage

### 路由
    /pages/home/index

### 依赖 API（仅名称）
    GET /dogs
    GET /recipes


============================================================
## 2.2 狗狗档案（Dog Profile）
============================================================

### 页面：档案列表（DogProfileListPage）
字段：
    - dog_id
    - name
    - avatar
    - weight
    - age_text
    - disease_tags[]

交互：
    - 点击档案 → DogDetailPage(dog_id)
    - 删除档案
    - 创建新档案

路由：
    /pages/dog/list

API：
    GET /dogs
    DELETE /dogs/{id}

---

### 页面：档案详情 / 编辑（DogDetailPage）
    将原“档案编辑”强化为完整的“详情+编辑”页，并精确承载 07 文档中的狗狗域字段与 Treat 逻辑。

字段结构（分区展示）：

    1. 基础信息区
        - name
        - gender
        - birthday / age_months（只读，后端返回 age_text）
        - weight
        - breed
        - neutered
        - size_class（只读，由后端根据体重和品种判定）
        - life_stage（只读，由后端判定）

    2. BCS（体况评分）区
        使用组件：BCSSelector

        BCSSelector 交互规范：
            - 展示一排 1–9 数字或 5–9 张狗狗体态图片
            - 用户可点击选择当前体况分数（bcs_score）
            - 选中后高亮对应图示
            - 提示文案例如：
                "1-3 偏瘦 / 4-5 理想 / 6-9 偏胖"

    3. 健康与禁忌区（DogHealthPanel）
        - health_tags[]
        - allergies[]
        - dislikes[]
        - medical_history[]（例如：心脏病、胰腺炎等）

    4. 活动水平 & 零食配置区（TreatConfigPanel）
        字段：
            - activity_level（枚举：低 / 中 / 高；提交：LOW/NORMAL/HIGH；RESTING/WORKING 由后端规则修正）
            - treat_input_mode（ESTIMATE_LEVEL / EXACT_KCAL）

        TreatConfigPanel 交互规范：
            Layout：
                Column
                    Title("日常运动与零食")
                    Row: ActivityLevel Selector
                    Row: Treat Mode Radio
                    Conditional Section: Estimate 或 Exact

            ASCII：
                运动水平: [低][中][高]

                零食模式:
                    ( ) 估算模式
                    ( ) 精确模式

                若选 估算模式:
                    零食习惯:
                        [ 不喂 ]
                        [ 偶尔 ]
                        [ 经常 ]
                        [ 疯狂 ]

                若选 精确模式:
                    每日零食能量:
                        [   0   ] kcal
            
            数据契约与枚举映射（必须遵守）：

                后端枚举（07_Core_Architecture.md 为唯一真源）：
                    - TreatLevel: NONE | LOW | MODERATE | HIGH

                UI 展示文案（仅用于显示）：
                    - 不喂
                    - 偶尔
                    - 经常
                    - 疯狂

                强制映射规则（前后端契约）：
                    - 不喂     -> NONE
                    - 偶尔     -> LOW
                    - 经常     -> MODERATE
                    - 疯狂     -> HIGH

                提交规则：
                    - 前端向 API 提交时，必须使用 TreatLevel 枚举值
                    - 严禁提交中文文案
                    - 严禁使用 rare / often / crazy 等非定义枚举

                ActivityLevel 映射说明：

                    UI 选项：
                        - 低
                        - 中
                        - 高

                    后端枚举映射：
                        - 低 -> LOW
                        - 中 -> NORMAL
                        - 高 -> HIGH

                    说明：
                        - RESTING 与 WORKING 不在 C 端手动选择
                        - 由后端根据 life_stage / breed / training_flag 自动修正
            

            行为：
                - treat_input_mode = ESTIMATE_LEVEL:
                    显示枚举按钮：不喂 / 偶尔 / 经常 / 疯狂
                - treat_input_mode = EXACT_KCAL:
                    显示数字输入框 manual_treat_kcal

    5. 喂食建议预览区（只读摘要）
        - 展示当前 DogCalc 的 RER / DER / 推荐每日鲜食克数 / 零食上限
        - 实际计算由后端完成，本页面只展示返回数据

交互：
    - 修改 weight / activity_level / treat 配置 / BCSSelector → 保存后触发 DogCalc 重算（不在此文档描述算法）
    - 保存成功 → Toast "已更新狗狗档案，喂食建议已刷新"

路由：
    /pages/dog/detail?id={dog_id}

API：
    GET /dogs/{id}
    PUT /dogs/{id}
    POST /dogs/calc-preview


============================================================
## 2.3 食谱橱窗（Recipe Showcase）
============================================================

字段：
    - recipe_id
    - title
    - cover_image
    - kcal_per_100g
    - tags[]

筛选器：
    - 适用年龄（幼犬 / 成犬 / 老年）
    - 主原料
    - 功能属性（低脂、增肥等）

交互：
    - 点击食谱卡片 → RecipeDetailPage(recipe_id)

路由：
    /pages/recipe/list

API：
    GET /recipes


============================================================
## 2.4 食谱详情（RecipeDetailPage）
============================================================

字段：
    - recipe_id
    - title
    - images[]
    - description
    - tags[]
    - nutrition_detailed_data（湿物质 vs 干物质营养）
    - items[]（每个食材 / 补剂与比例）
    - dog_intake_suggestion（若已选择狗档）

布局：
    ScrollView
        ImageCarousel
        Text(title)
        RecipeNutritionPanel
        IngredientList
        DogIntakeSuggestion
        Button("生成 DIY 流程单")
        Button("订购此食谱")

交互：
    - 选择狗狗档案 → 调用 /dogcalc/calc-intake → 刷新 DogIntakeSuggestion
    - 点击“生成 DIY 流程单” → DIYProcessPage
    - 点击“订购此食谱” → OrderConfigPage（携带 recipe_id 与 dog_id）

路由：
    /pages/recipe/detail?id={recipe_id}

API：
    GET /recipes/{id}
    POST /dogs/calc-preview


============================================================
## 2.5 DIY 制作流程单（DIYProcessPage）
============================================================

字段：
    - recipe_id
    - process_steps[]
    - scaled_ingredient_list[]

布局：
    ScrollView
        DIYProcessStep[]

交互：
    - 可选：导出或分享流程单（逻辑稍后定义）

路由：
    /pages/diy/index?recipe_id={id}

API：
    POST /recipes/{recipe_id}/diy-sheet


============================================================
## 2.6 饭量计算器（FoodIntakeCalculatorPage）
============================================================

输入字段：
    - dog_weight
    - activity_level
    - food_energy_density
    - 可选：treat_input_mode & treat_level / treat_kcal

输出字段：
    - recommended_calories
    - intake_grams

路由：
    /pages/tools/calculator

API：
    POST /dogs/calc-preview


============================================================
## 2.7 下单配置页面（OrderConfigPage）★已补充地址逻辑
============================================================

目的：
    将 recipe + dog_profile + address + 生产周期 与价格/运费结合，形成可支付的订单草稿。

字段：
    - 选中狗狗：
        dog_id
    - 选中食谱：
        recipe_id
    - 每日克数（可从 DogCalc 推荐自动带出，也可手动调整）
    - 订购周期（天数）
    - 总量预估（只读）
    - 收货地址（address_id）
    - 运费预估（只读）
    - 商品金额（只读）
    - 订单备注

布局（关键部分）：
    ScrollView
        Section("狗狗与食谱")
            DogInfoCard
            RecipeCard（缩略）
        Section("喂食方案")
            输入/调整每日克数
            选择周期天数
            展示总量（每日克数 * 天数）
        Section("收货地址")
            AddressCard(当前默认地址)
            Button("选择/管理地址") → AddressListPage
        Section("价格汇总")
            Text("商品金额：xxx")
            Text("运费：xxx（根据地址区域与运费模板由后端计算）")
            Text("合计：xxx")

        Bottom ActionBar:
            Button("提交订单，去支付")

ASCII：
    [DogInfoCard] + [RecipeCard]
    ----------------------------
    每日克数: [   230g  ]
    周期: [7][14][30]
    总量: xxxx g
    ----------------------------
    收货地址:
       [AddressCard: 姓名 / 电话 / 省市区+详细地址]
       [管理地址]
    ----------------------------
    商品: xxx
    运费: xxx
    合计: xxx
    [提交订单]

交互：
    - 点击“管理地址” → AddressListPage
    - 选择/修改地址后返回本页 → 重新请求后端计算运费（不在此文档定义算法）
    - 点击“提交订单” → 创建订单草稿并调起支付

路由：
    /pages/order/config?recipe_id={id}&dog_id={dog_id}

API：
    GET /addresses
    POST /orders/draft


============================================================
## 2.8 地址列表页面（AddressListPage）★新增
============================================================

Purpose:
    管理收货地址、选择当前订单使用的地址。

字段：
    - address_list[]:
        id
        receiver_name
        phone
        region_text（省市区拼接）
        detail_address
        is_default

布局：
    VerticalList:
        AddressCard(address) * N
    Bottom:
        Button("新增地址")

AddressCard 组件结构：
    Row
        Column
            Text(receiver_name + " " + phone)
            Text(region_text + " " + detail_address)
        Tag("默认")（若 is_default）

交互：
    - 点击某个 AddressCard：
        1）在“地址管理上下文”中视为编辑 → AddressEditPage(address_id)
        2）在“下单选择上下文”中视为“选择该地址并返回 OrderConfigPage”
       （可通过路由参数区分模式，如 mode=select 或 mode=manage）
    - 点击“新增地址” → AddressEditPage（不带 id）

路由：
    /pages/address/list?mode={manage|select}

API：
    GET /addresses
    POST /addresses/{id}/set-default


============================================================
## 2.9 地址编辑页面（AddressEditPage）★新增
============================================================

字段：
    - receiver_name
    - phone
    - region (省/市/区选择组件，后端存 JSON)
    - detail_address
    - is_default

交互：
    - 保存 → 返回 AddressListPage → 下单页可以重新读取最新默认地址或选中返回
    - 删除地址（可选）

路由：
    /pages/address/edit?id={address_id}

API：
    GET /addresses/{id}
    POST /addresses
    PUT /addresses/{id}
    DELETE /addresses/{id}


============================================================
## 2.10 我的订单（MyOrdersPage）
============================================================

字段：
    - order_id
    - created_at
    - status
    - items_summary

交互：
    - 点击订单 → OrderDetailPage(order_id)

路由：
    /pages/order/list

API：
    GET /orders


============================================================
## 2.11 订单详情（OrderDetailPage）★补充 Snapshot 行为
============================================================

字段：
    - order_id
    - status
    - tracking_no
    - shipping_company
    - order_items[]（每个带 snapshot）
        snapshot:
            recipe_title
            recipe_version
            total_grams
            daily_intake_g
            nutrition_summary（下单时刻的版本）

布局：
    ScrollView
        OrderProgressBar
        For each order_item:
            OrderItemCard(snapshot)
        ShippingInfoSection（只读）

Snapshot 展示要求：
    - OrderItemCard 中显示：
        - 食谱名
        - “配方版本 vX（历史快照）” Tag
        - 下单时每日/总克数
    - 点击 OrderItemCard：
        跳转到 SnapshotRecipeDetailPage：
            - 展示下单时的配方结构和营养参数
            - 完全只读，不允许编辑
            - 不跳转到当前最新的 RecipeDetailPage

路由：
    /pages/order/detail?id={order_id}
    /pages/order/snapshot?id={order_item_id}

API：
    GET /orders/{id}
    GET /orders/items/{order_item_id}/snapshot


------------------------------------------------------------
# 3. Staff 小程序（员工端）
------------------------------------------------------------

============================================================
## 3.1 厨房任务页（KitchenTaskPage）★补充 TabFilter 与照片上传
============================================================

Purpose:
    供厨房查看当日所有 Batch/Task，以及录入实际投料和上传过程照片。

字段：
    - tab_filter：enum("待处理", "进行中", "已完成")
    - batch_task_list[]:
        batch_id
        batch_code
        recipe_title
        status
        ingredients_required[]
        ingredients_actual[]
        photos_raw[]
        photos_cooked[]
        photos_portioned[]

布局：
    Column
        TabFilter("待处理" | "进行中" | "已完成")
        VerticalList
            BatchTaskItem[]

ASCII：
    [待处理][进行中][已完成]
    ------------------------
    [BatchTaskItem]
    [BatchTaskItem]

BatchTaskItem（强化版）：
    Card
        Text(batch_code)
        Text(recipe_title)
        For each ingredient:
            Row
                Text(name)
                Text("应投 " + required_g)
                Input("实投", actual_g)

        Section("溯源照片")
            Text("原料照片")
            ImageUploader(photos_raw)
            Text("烹饪照片")
            ImageUploader(photos_cooked)
            Text("分装照片")
            ImageUploader(photos_portioned)

交互：
    - TabFilter 选择不同状态 → 过滤 batch_task_list
    - ImageUploader 支持：
        - 拍照或选择相册
        - 上传成功后可预览 / 删除
    - 保存实际重量与照片 → 后端记录 ProductionTask 数据

路由：
    /pages/staff/kitchen/tasks

API：
    GET /staff/kitchen/batches?status={tab}
    POST /staff/kitchen/tasks/{task_id}


============================================================
## 3.2 采购任务页（PurchasingWorkboardPage）
============================================================

字段：
    - purchase_list[]:
        ingredient_name
        required_g
        current_stock_g
        shortage_g
        suggested_purchase_g
        status

布局：
    VerticalList
        PurchaseItemCard[]

交互：
    - 输入采购量
    - 上传票据（如需）
    - 标记采购完成

路由：
    /pages/staff/purchasing/index

API：
    GET /staff/purchase/items
    POST /staff/purchase/orders


============================================================
## 3.3 物流打包页（ShippingWorkboardPage）
============================================================

字段：
    - order_list[]:
        order_id
        customer_name
        total_weight_g
        status (READY_FOR_PACKAGING)

布局：
    VerticalList
        ShippingPackageCard[]

交互：
    - 输入/选择箱型、冰袋数（若设计）
    - 完成打包 → 标记订单 READY_FOR_SHIPMENT

路由：
    /pages/staff/shipping/index

API：
    GET /staff/shipping/orders


============================================================
## 3.4 发货确认页（ShipmentConfirmPage）
============================================================

字段：
    - order_id
    - shipping_company
    - tracking_no

布局：
    ShippingPackageCard（带可编辑物流单号）

交互：
    - 输入运单号
    - 点击“确认发货” → 状态变为 SHIPPED

路由：
    /pages/staff/shipping/ship?id={order_id}

API：
    POST /staff/shipping/orders/{order_id}/ship


------------------------------------------------------------
# 4. Admin Web（后台）
------------------------------------------------------------

============================================================
## 4.1 Dashboard（仪表盘）
============================================================

字段：
    - 今日订单数
    - 今日生产总量
    - 今日采购金额
    - 库存预警原料列表
    - 订单状态分布图

路由：
    /admin/dashboard

API：
    (Not defined in 05_API_Specs.md - endpoint may not exist)


============================================================
## 4.2 Recipe Management（食谱管理 / AdminRecipeEditor）★补充 design_source 字段
============================================================

Purpose:
    创建/编辑食谱，维护营养信息与原料配比，并记录“设计来源”。

字段：
    - recipe_id
    - name
    - cover_image
    - description
    - design_source（例如："ADF 配方文件" / "内训营配方 v2024Q4"）
    - ingredient_list[]
    - nutrition_panel{}
    - status（上架 / 下架）

布局：
    TwoColumnLayout
        Left:
            基础信息表单：
                name
                cover_image
                description
                design_source（普通文本输入框，下方可附“设计来源用于内部追溯，不对用户展示”说明）
            原料与配比编辑区（IngredientList 可编辑版）
        Right:
            RecipeNutritionPanel（预览当前营养数据，只读）

交互：
    - 修改配方 → 右侧 NutritionPanel 自动刷新（由后端计算）
    - design_source 为可选字段，但推荐填写
    - 上架/下架切换需确认弹窗

路由：
    /admin/recipe

API：
    GET /admin/recipes/{id}
    POST /admin/recipes
    PUT /admin/recipes/{id}


============================================================
## 4.3 Order Management（订单管理）
============================================================

字段：
    - order_list[]:
        order_id
        customer_name
        status
        created_at
        total_amount

布局：
    Table
        Columns: 订单号 | 用户 | 状态 | 时间 | 金额 | 操作

交互：
    - 查看订单详情（跳转到后台订单详情页）
    - 修改订单状态（管理员权限）

路由：
    /admin/order

API：
    (Not defined in 05_API_Specs.md - endpoint may not exist)


============================================================
## 4.4 Scheduling Monitor（排产监控）
============================================================

字段：
    - batch_list[]
    - 每批次的任务数量与状态

路由：
    /admin/scheduling

API：
    (Not defined in 05_API_Specs.md - endpoint may not exist)


============================================================
## 4.5 Inventory Management（库存管理）
============================================================

字段：
    - ingredient_list[]:
        ingredient_id
        name
        stock_g
        reorder_point_g

布局：
    Table:
        原料名 | 库存 (g) | 预警线 (g) | 操作

路由：
    /admin/inventory

API：
    GET /admin/inventory


============================================================
## 4.6 Staff Management（员工管理）
============================================================

字段：
    - staff_id
    - name
    - role
    - permissions[]

路由：
    /admin/staff

API：
    (Not defined in 05_API_Specs.md - endpoint may not exist)
