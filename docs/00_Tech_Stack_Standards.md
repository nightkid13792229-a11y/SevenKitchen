# Technical Stack & Engineering Standards

    本文档用于定义：
        - 本项目唯一允许使用的技术栈（Tech Stack）
        - 各技术在系统中的职责边界
        - 工程结构、测试与质量标准
        - AI（Cursor）在实现代码时必须遵守的技术约束

    本文档是：
        - 技术选型的 Source of Truth
        - AI 决定“用什么工具写代码”的唯一依据

    本文档不是：
        - 产品需求文档
        - 业务流程说明
        - 算法或公式定义文档


============================================================
# 1. Technology Stack Definition (Source of Truth)
============================================================

    以下技术栈为本项目**唯一允许使用的技术组合**。
    AI（Cursor）不得自行替换、降级或引入平替框架。

------------------------------------------------------------
# 1.1 Backend (Server-side)
------------------------------------------------------------

    Runtime:
        - Node.js (LTS)

    Language:
        - TypeScript (strict mode)

    Backend Framework:
        - NestJS

    选择理由：
        - 原生支持清晰的分层架构（Module / Controller / Provider）
        - 与 Domain / Application / Infrastructure 分层天然契合
        - 依赖注入（DI）机制适合复杂业务与长期演进
        - AI 对 NestJS 的语料成熟度高，生成稳定

    禁止使用：
        - Express
        - Koa
        - Fastify（除非作为 NestJS 内部 Adapter，由人类显式确认）


------------------------------------------------------------
# 1.2 ORM & Database
------------------------------------------------------------

    ORM:
        - Prisma

    Database:
        - PostgreSQL

    选择理由：
        - Prisma Schema 已在 07_Core_Architecture.md 中作为核心设计存在
        - 强类型 Client，避免运行期字段错误
        - 良好的 Migration 与 Schema 演进能力

    强制规则：
        - Prisma Schema 以 07 文档为准
        - AI 不得自行新增或修改字段
        - Domain 层不得直接依赖 Prisma Client


------------------------------------------------------------
# 1.3 Frontend
------------------------------------------------------------

    Customer / Staff 端：
        - Platform: WeChat Mini Program
        - Framework: Uni-app
        - Language: TypeScript
        - UI 实现遵循 03_Features_and_UI_Blueprints.md

    Admin 后台：
        - Platform: Web
        - Framework: Vue 3
        - UI Library: Element Plus

    强制规则：
        - 禁止使用 React / Next.js
        - 禁止在前端实现业务计算逻辑
        - 前端仅作为 API Consumer 与状态展示层


------------------------------------------------------------
# 1.4 Infrastructure & Deployment
------------------------------------------------------------

    Cloud Provider:
        - Alibaba Cloud (Aliyun)

    Core Services:
        - ECS（计算）
        - RDS for PostgreSQL（数据库）
        - OSS（对象存储：图片、溯源资料）

    Containerization:
        - Docker

    Deployment Principle:
        - 后端服务容器化部署
        - 不采用 Serverless（避免冷启动与复杂性）
        - 环境分离（dev / staging / production）

    强制规则：
        - AI 不得引入其他云厂商依赖
        - 不得生成生产环境运维脚本（由人类控制）


------------------------------------------------------------
# 1.5 Payment & External Services
------------------------------------------------------------

    Payment:
        - WeChat Pay
        - Alipay

    Logistics:
        - 国内主流物流服务（通过聚合接口）

    原则：
        - 外部服务仅能通过 Infrastructure 层接入
        - Domain 层不得感知任何第三方 SDK


============================================================
# 2. Project Structure Conventions
============================================================

    推荐的基础目录结构如下：

        /src
            /domain
                /dog
                /recipe
                /order
                /production
                /inventory
            /application
            /infrastructure
            /interfaces

        /tests
            /domain
                /dog
                /recipe
                /order

        /docs
        /.cursor

    规则说明：

        - Domain 层必须完全独立于其他层
        - Domain 层禁止引用 application / infrastructure / interfaces
        - 测试代码与业务代码严格分离


============================================================
# 3. Domain Layer Standards
============================================================

    Domain 层的基本规则：

        - 只包含纯业务逻辑
        - 不允许任何 I/O 操作
        - 不允许依赖 HTTP、数据库、UI、第三方 SDK
        - 不允许读取环境变量

    Domain 层允许的内容：

        - Entities
        - Value Objects
        - Domain Enums
        - Domain Services
        - Domain-specific Errors


============================================================
# 4. API & Application Layer Boundaries
============================================================

    Application / API 层规则：

        - Controller 只负责：
            - 参数接收
            - 权限校验
            - 调用 Domain Service
            - 返回结果

        - Controller 禁止：
            - 编写业务计算逻辑
            - 复制 Domain 中的规则
            - 修改 Snapshot 数据

        - 所有状态流转必须由 Domain 层控制


============================================================
# 5. Persistence & Infrastructure Rules
============================================================

    Persistence 层（Repository）规则：

        - 只负责数据映射与持久化
        - 不允许出现业务判断
        - 不允许跨 Domain 操作数据

    Infrastructure 层规则：

        - 外部系统（支付、物流、存储）只允许在该层接入
        - 不得将 SDK 或外部 API 泄漏到 Domain 层


============================================================
# 6. Testing Standards (Mandatory)
============================================================

    测试是本项目的强制组成部分，而非可选项。

    测试技术约定：

        - 测试语言：TypeScript
        - 测试类型：Unit Test 优先
        - 测试目录：/tests 与 /src 严格分离

    对 Domain 层的强制要求：

        - 所有“计算类 Domain Service”必须有单元测试
        - 每个计算函数至少包含：
            - 边界值测试
            - 枚举切换测试
            - 异常或告警场景测试


============================================================
# 7. Code Style & Readability
============================================================

    代码风格原则：

        - 明确优于简洁
        - 可读性优于技巧性
        - 显式命名，避免魔法数字


============================================================
# 8. Version Control & Safety
============================================================

    Git 是本项目的强制工具。

    基本规则：

        - 所有阶段性工作必须通过 Git 提交
        - 禁止在未提交的情况下进行大规模修改
        - 重要重构必须通过独立分支进行


============================================================
# 9. AI Execution Constraints
============================================================

    AI（Cursor）在任何阶段必须遵守：

        - 不得自行决定技术栈
        - 不得引入未经允许的框架或工具
        - 不得“顺手优化”未被要求的模块
        - 不得以实现便利为理由破坏架构分层

============================================================
# End of Document
============================================================
