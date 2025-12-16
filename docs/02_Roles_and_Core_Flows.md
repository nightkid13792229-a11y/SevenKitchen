# 02_Roles_and_Core_Flows

    本文件定义系统的主要角色、关键业务流程、状态机以及数据流，是前端 UI、
    后端 API、领域逻辑、数据库 Schema 以及 AI 自动生成代码的统一依据。

---------------------------------------------------------------------

# 1. 角色定义（Role Definitions）

## 1.1 Customer（客户 / 狗狗家长）

    使用端：
        - 微信小程序（H5 为后续可选扩展）

    Customer 的核心目标：
        让普通养狗用户能够轻松管理狗狗资料、获得专业喂食建议、浏览标准食谱、
        并能够自由选择 DIY 方式、购买食谱定制服务或购买成品鲜食，并享受售前售后服务。

    Customer 可执行的操作（能力清单）：

        1. 创建与维护狗狗档案（Dog Profile）
            - 填写：名字、品种、性别、出生日期、体重、绝育状态、活动水平、健康状况等
            - 档案信息更新后，系统需自动重新计算喂食建议

        2. 查看“喂食建议”（基于 DogCalc）
            - 喂食建议在“狗狗档案页”中展示
            - 包括：RER、DER/MER、每日建议能量（kcal）、每日鲜食克数
            - 当 Customer 进入食谱详情页时，同样显示基于该食谱能量密度换算出的每日建议克数
            - 在订购页面中，喂食建议用于计算周期总量（例如 7/14/30 天）

        3. 浏览“食谱橱窗”中的标准食谱
            - 查看原料、宏量营养素信息、能量密度、适用阶段和群体、参考的营养标准等食谱信息

        4. 一键生成“鲜食制作流程单”（适用于 DIY 用户）
            - 原料列表（按狗狗每日/周期量自动计算）
            - 切配方式与烹饪流程
            - 加工注意事项
            - 营养成分与保存方式

        5. 使用“饭量计算器”计算每日应喂食量
            - 商品粮或零食的每日喂食量

        6. 若找不到合适食谱，可购买“食谱定制服务”
            - 填写狗狗详细健康与口味偏好
            - 平台营养师根据 FEDIAF 规范生成个性化配方
            - 生成的食谱可作为后续订购入口（个性化 SKU）
            - 如果客户同意，才可将定制食谱公开到食谱橱窗

        7. 配置鲜食订购方案（如选择成品鲜食）
            - 选择食谱
            - 选择周期（7/15/30 天）
            - 选择每日餐数和每餐饭量（系统根据狗狗档案自动生成，但可手动调整）
            - 查看自动计算的总克数与价格

        8. 在线下单与支付（微信支付、支付宝支付）

        9. 查看订单详情、生产进度、发货进度、物流信息

        10. 售前 / 售后咨询客服
            - 对接微信客服能力
            - 可获取常见问题（FAQ）
            - 可查看售后政策



---------------------------------------------------------------------

## 1.2 Staff（内部员工）

    使用端：微信小程序

    Staff 的核心目标：
        让厨房、打包、发货、采购等岗位能够以最低学习成本完成每天的生产任务，
        同时确保数据可追溯、流程可监督、操作可标准化。

    角色标签（Tag，不做独立账号体系）：
        - Purchasing（采购）
        - Kitchen（厨房）
        - Shipping（发货）
        

    职责范围：
        Purchasing：
            - 查看采购清单
        
        Kitchen：
            - 查看每日排产生成的生产任务与分锅清单
            - 按照清单称重、加工、完成烹饪流程
            - 录入生产数据（如实际出成率、损耗量）
            - 上传原料照片（需要上传到订单让顾客查看）
            - 标记任务完成


        Shipping：
            - 查看“待发货订单列表”
            - 输入物流公司（默认顺丰）、运单号
            - 系统自动将订单状态更新为 SHIPPED
            - 客户可在前端实时查看物流信息

        

---------------------------------------------------------------------

## 1.3 Admin（管理员 / 老板）

    使用端：管理后台（Web）

    职责范围：
        - 原料管理（营养值、成本）
        - 配方管理（标准配方 / 版本管理）
        - 定价策略与全局参数管理
        - 查看生产效率、订单状态
        - 运营数据分析

---------------------------------------------------------------------

# 2. 核心业务流程（Core Business Flows）

---------------------------------------------------------------------

## 2.1 流程 A：客户建档与首次下单（Onboarding → Order）

    参与角色：
        - Customer（客户）
        - 系统（DogCalc / Recommendation Engine / Order Engine）

    流程目标：
        引导首次使用平台的客户完成狗狗建档、查看喂食建议、选择食谱、配置订购方案、
        完成支付并创建正式订单。

    Step-by-step：

        1. 微信授权登录
            - Customer 首次进入小程序，完成微信授权
            - 系统创建用户账号（User），建立初始会话状态

        2. 创建狗狗档案（Dog Profile）
            - Customer 填写狗狗基本信息：
                名字、品种、性别、出生日期、体重、绝育状态、活动水平、健康情况等
            - 档案提交后系统自动调用 DogCalc，生成以下喂食建议：
                - RER（静息能量需求）
                - DER / MER（每日能量需求）
                - 每日建议能量（kcal）
                - 每日鲜食建议克数（g）
            - 喂食建议在狗狗档案页展示

        3. 系统推荐适配食谱（Recipe Recommendation）
            - 根据狗狗年龄段、活动水平、体况与能量需求自动筛选可用食谱
            - Customer 可进入任一食谱详情页查看适配性

        4. 浏览食谱详情（Recipe Detail）
            - Customer 查看食谱内容：原料构成、能量密度、营养结构、制作方式等
            - 系统自动基于该食谱的能量密度换算“每日应喂克数”，展示给 Customer
            - 如 Customer 是 DIY 用户，可一键生成“鲜食制作流程单”

        5. 配置订购方案（Plan Configuration）
            - Customer 选择狗狗
            - 选择目标食谱
            - 选择订购周期（如 7 / 15 / 30 天）
            - 选择每日餐数（1–3 餐）
            - 系统依据 DogCalc 自动计算周期总克数与对应价格
            - Customer 确认后进入下一步

        6. 创建订单（Order INIT）
            - 系统生成初始订单，状态为：INIT
            - Customer 选择支付方式：
                - 微信支付
                - 支付宝支付
            - Customer 点击“立即支付”，订单状态变为：PENDING_PAYMENT

        7. 支付结果处理（Payment Result）
            支付成功：
                - 系统将订单状态更新为 PAID
                - 系统生成 OrderItem 并进入排产等待队列：WAITING_FOR_PRODUCTION

            支付失败 / 超时 / 用户取消：
                - 系统将订单状态更新为 CANCELLED
                - 订单不会进入排产，不产生任何生产或物流流程
                - Customer 可重新下单

        8. 首次下单完成
            - Customer 可在订单页面查看订单详情与后续生产/发货进度
            - 系统进入流程 B：排产与生产（Production Scheduling）

    订单核心状态流：
        INIT → PENDING_PAYMENT → 
            (支付成功) PAID → WAITING_FOR_PRODUCTION →
            (进入后续生产流程)

            (支付失败 / 超时 / 取消) CANCELLED


---------------------------------------------------------------------

## 2.2 流程 B：排产、库存检查与厨房生产（Production Scheduling → Kitchen Run）

    参与角色：
        - Staff（Kitchen / Shipping / Purchasing）
        - 系统（Scheduling Engine / Inventory Engine / ProductionLog）
        - Admin（监督）

    流程目标：
        将支付完成的订单自动转化为可执行的每日生产计划，
        通过排产计算原料需求、检查库存、触发采购流程，
        并最终由 Kitchen 完成烹饪与食品分装，再由 Shipping 完成物流打包发货准备。

    Step-by-step：

        1. 进入排产队列（来自流程 A）
            - 支付成功后，OrderItem 状态自动更新为：WAITING_FOR_PRODUCTION
            - Scheduling Engine 定时扫描排产队列并开始计算

        2. 排产计算（Scheduling Engine）
            排产输出包括：
                - Batch 列表（按食谱分组）
                - 每个 Batch 的原料需求
                - 分锅清单（目标克数）
                - Batch 与 OrderItem 的映射关系

            排产完成：
                - Batch 状态：INIT
                - OrderItem 状态：IN_PRODUCTION

        3. 原料需求清单（MRL）生成
            系统合并所有 Batch：
                - 生成原料需求总表（MRL）
                - 内容包括今日生产全部原料的精确需求量

            系统动作：
                - 调用库存引擎对比当前库存（Raw Inventory）

        4. 库存检查（Inventory Checking）
            Inventory Engine 执行：
                - 对比 MRL 与库存
                - 计算缺口原料清单（Shortage List）

            若库存充足：
                - 进入下一步骤（Kitchen 可执行生产）

            若库存不足：
                - 自动生成采购清单（Purchase List）
                - Purchase List 推送给 Purchasing 员工
                - 采购流程启动：WAITING_FOR_PURCHASE

        5. 采购流程（Purchasing Cycle）
            Purchasing 员工执行：
                - 查看缺口原料清单
                - 前往采购并上传凭证、发票
                - 提交报销申请
                - 将采购原料入库（Raw Inventory +）

            系统动作：
                - 更新采购状态：PURCHASE_COMPLETED

            注：
                - 在库存满足之前，Kitchen 不能开始生产
                - Kitchen 端将显示“等待原料补充”

        6. 库存满足，Kitchen 解锁生产权限
            - Inventory Engine 检查原料已全部到位
            - Kitchen Workboard 解锁，可执行烹饪与分装

        7. Kitchen 原料准备（Preparation）
            Kitchen 员工执行：
                - 按 Batch 清单称重、切配
                - 上传原料实拍照片（食品安全记录）
                - 标记准备完成

            系统动作：
                - ProductionLog 记录阶段：PREPARED
                - Batch 状态：PREPARED

        8. Kitchen 烹饪（Cooking）
            - 按分锅清单逐锅执行烹饪
            - 记录投入量、出成量、异常情况
            - 上传烹饪过程照片

            系统动作：
                - ProductionLog 记录阶段：COOKED
                - Batch 状态：COOKED

        9. Kitchen 食品分装（Portioning）
            Kitchen 执行：
                - 按 OrderItem 要求克数进行真空袋分装
                - 封口、贴内部标签（批次号、克数、食谱编号）
                - 上传成品袋照片
                - 标记分装完成

            系统动作：
                - OrderItem 状态更新为：PORTIONED
                - 若订单所有 OrderItem 均为 PORTIONED：
                    - 订单状态：READY_FOR_PACKAGING
                - Batch 状态：PORTIONING_COMPLETED

## 2.3 流程 C：物流包装（Packaging for Shipment）

    参与角色：
        - Staff（Shipping）
        - 系统（Order Engine）

    流程目标：
        将 Kitchen 已完成分装的订单食品，进行物流端的冷链包装与出库准备。

    Step-by-step：

        1. Shipping 查看“待物流打包订单”
            - 系统中状态为 READY_FOR_PACKAGING 的订单进入 Shipping 工作台

        2. Shipping 执行物流包装
            - 接收 Kitchen 的分装食品袋
            - 配置冰袋、泡沫箱、干冰（按季节规则）
            - 外箱装箱、封箱
            - 打印物流面单并贴单
            - 标记订单物流包装完成

            系统动作：
                - 订单状态更新为：READY_FOR_SHIPMENT

## 2.4 流程 D：发货（Shipping）

    参与角色：
        - Staff（Shipping）
        - 系统（Order Engine / Courier API）

    流程目标：
        将已完成物流包装的订单交付快递公司，并开始物流追踪。

    Step-by-step：

        1. 录入物流信息
            Shipping 执行：
                - 输入或扫描面单
                - 录入快递公司、运单号

            系统动作：
                - 订单状态更新为：SHIPPED
                - 前端展示物流追踪信息

        2. 订单发货完成
            - 系统进入物流在途阶段
            - 后续售后、异常揽收等流程不在本章节范围内

---------------------------------------------------------------------

# 3 状态机（State Machines）

    本节定义订单（Order）、订单项（OrderItem）、批次（Batch）、
    采购（Purchase）、库存（Inventory）在生产链路中的状态变化规则。
    所有系统流程与角色行为均以状态机为核心驱动。

## 3.1 Order 状态机（Order State Machine）

    Order = Customer 视角的整体订单。

    状态流：
        INIT
            → PENDING_PAYMENT
            → PAID
            → WAITING_FOR_PRODUCTION （由 OrderItem 状态驱动）
            → READY_FOR_PACKAGING     （所有 OrderItem 已 PORTIONED）
            → READY_FOR_SHIPMENT      （物流包装完成）
            → SHIPPED
            → COMPLETED（可选，表示客户已确认收货）
            → CANCELLED（支付失败或超时）

    状态说明：
        INIT：订单已创建但未发起支付
        PENDING_PAYMENT：调起支付中
        PAID：支付成功
        WAITING_FOR_PRODUCTION：支付后等待排产
        READY_FOR_PACKAGING：厨房已完成食品分装
        READY_FOR_SHIPMENT：物流包装完成，待发货
        SHIPPED：已发货
        COMPLETED：客户确认收货（可做售后触发点）
        CANCELLED：支付失败、超时、或客服人工取消


## 3.2 OrderItem 状态机（OrderItem State Machine）

    OrderItem = 每个食谱/每袋货对应的生产任务单元。
    OrderItem 状态机体现生产链路的真实执行过程。

    状态流：
        WAITING_FOR_PRODUCTION
            → IN_PRODUCTION
            → COOKED
            → PORTIONED
            → READY_FOR_PACKAGING
            → SHIPPED

    状态说明：
        WAITING_FOR_PRODUCTION：支付成功，等待排产
        IN_PRODUCTION：已被纳入今日 Batch，等待烹饪
        COOKED：大锅烹饪完成
        PORTIONED：已完成食品真空袋分装
        READY_FOR_PACKAGING：厨房分装完成，等待 Shipping 包装
        SHIPPED：该 OrderItem 所属订单已发货


## 3.3 Batch 状态机（Batch State Machine）

    Batch = 排产后的生产批次（按相同食谱合并）。

    状态流：
        INIT
            → PREPARED
            → COOKED
            → PORTIONING_COMPLETED
            → COMPLETED

    状态说明：
        INIT：排产生成 Batch
        PREPARED：厨房称重与切配完成
        COOKED：所有锅次已完成烹饪
        PORTIONING_COMPLETED：所有 OrderItem 关联的分装完成
        COMPLETED：该 Batch 全部流程完成（可归档）


## 3.4 采购状态机（Purchase State Machine）

    Purchase = 今日缺口原料的采购任务。

    状态流：
        WAITING_FOR_PURCHASE
            → PURCHASE_IN_PROGRESS
            → PURCHASE_COMPLETED
            → MATERIAL_READY

    状态说明：
        WAITING_FOR_PURCHASE：排产生成缺口清单，待采购
        PURCHASE_IN_PROGRESS：采购员已开始执行采买任务
        PURCHASE_COMPLETED：采购员提交凭证，本次采购完成
        MATERIAL_READY：原料全部已入库，库存满足 Kitchen 生产需求


## 3.5 库存状态机（Inventory State Machine）

    描述 RawInventory（原料库存）的生命周期：

    状态节点（非线性状态）：
        AVAILABLE：库存可用
        RESERVED（可选）：预留给今日排产（高级场景）
        DEPLETED：库存耗尽
        LOW_STOCK：低库存预警（阈值可配置）

    动作说明：
        - 入库：采购完成后库存增加
        - 出库：Kitchen 备料扣减库存
        - 库存校准：定期盘点


---------------------------------------------------------------------

# 4 数据流（Data Flow）

    本节定义各个系统模块、数据实体（Order、OrderItem、Batch、MRL、
    Purchase、Inventory）之间的数据交互关系。

## 4.1 订单到排产的数据流（Order → Scheduling）

        - OrderItem（WAITING_FOR_PRODUCTION）
        - 排产引擎扫描队列
        - 合并同食谱项 → 生成 Batch
        - Batch 映射 OrderItem（1-to-many）

        输出：
            Batch[]
            BatchRecipeRequirements（每个 Batch 的原料需求）
            OrderItem → Batch 映射表


## 4.2 排产到原料需求清单（Scheduling → MRL）

        输入：
            BatchRecipeRequirements

        系统计算：
            MRL（Material Requirement List）：
                每种原料今日生产需要的总克数

        输出：
            MRL（包含所有原料需求明细）


## 4.3 原料需求清单到库存检查（MRL → Inventory Check）

        输入：
            MRL
            RawInventory（当前库存）

        Inventory Engine 执行：
            - 对比每种原料需求与库存
            - 生成 ShortageList（缺口清单）

        输出：
            若无缺口 → MATERIAL_READY
            若有缺口 → PurchaseList（需采购清单）


## 4.4 缺口清单到采购流程（ShortageList → Purchase）

        输入：
            ShortageList

        系统创建：
            Purchase 记录（WAITING_FOR_PURCHASE）

        Purchasing 员工执行采买并入库（RawInventory+）

        输出：
            Purchase 状态 → PURCHASE_COMPLETED
            RawInventory 更新
            MATERIAL_READY 触发厨房生产


## 4.5 库存到厨房生产（Inventory → Kitchen）

        当 MATERIAL_READY：
            Kitchen Workboard 解锁
            可执行：
                - Preparation（称重切配）
                - Cooking（烹饪）
                - Portioning（真空袋分装）

        生产过程中写入：
            ProductionLog（阶段型记录）


## 4.6 分装到物流包装（Kitchen → Shipping）

        输入：
            PORTIONED 的 OrderItem

        系统动作：
            - 聚合同一订单的所有 PORTIONED 项
            - 当全部完成 → 订单状态：READY_FOR_PACKAGING

        Shipping 执行物流打包：
            - 装箱
            - 冷链配置
            - 面单打印

        输出：
            订单状态：READY_FOR_SHIPMENT


## 4.7 物流打包到发货（Shipping → Courier）

        输入：
            READY_FOR_SHIPMENT 的订单

        Shipping 操作：
            - 录入运单号、物流公司
            - 标记发货

        系统输出：
            - 订单状态：SHIPPED
            - 物流追踪数据写入 OrderTracking


## 4.8 客户端数据流（Customer-Facing Data Flow）

        前端需要从多个来源获取数据：
            - 我的订单（Order + OrderItem）
            - 狗狗档案（DogProfile）
            - 推荐食谱（Recommendation Engine）
            - DIY 流程单（Recipe）
            - 喂食建议（DogCalc）
            - 生产进度（OrderItem 状态）
            - 物流追踪（OrderTracking）

        系统自动聚合后返回给小程序端显示。

