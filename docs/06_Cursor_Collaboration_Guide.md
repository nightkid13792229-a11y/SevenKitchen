# How to Collaborate with Cursor (AI Coding Agent)

    本文档定义：
        - 如何让 Cursor 正确理解本项目
        - 如何分阶段向 Cursor 投喂文档
        - 如何限制 Cursor 的“自由发挥”
        - 如何 Review AI 生成的代码
        - 如何在不中断项目的前提下持续迭代

    本文档是：
        - AI 的协作规范
        - 人类的操作手册
        - 项目的安全围栏（Guardrails）

    核心原则：
        AI 是执行者，不是产品经理，不是架构师，不是营养专家。


============================================================
# 1. 总体协作哲学（Non-Negotiable Rules）
============================================================

    以下规则在任何阶段都不可违反：

    1. Cursor 只能“实现已定义的文档”，不能“补全需求”
    2. 未在文档中出现的逻辑，禁止 Cursor 自行发明
    3. Domain 决策永远优先于代码便利
    4. Snapshot、状态机、不变量是红线
    5. 一切“看起来更简单”的实现，必须先通过文档校验


============================================================
# 2. 文档优先级（Source of Truth Hierarchy）
============================================================

    当 Cursor 发现多个文档存在潜在冲突时，必须按以下优先级执行：

        Level 0（绝对真理）：
            07_PRD_Core_Architecture.md

        Level 1（领域规则）：
            04_Domain_Model_and_Algorithms.md

        Level 2（API 契约）：
            05_API_Specs.md

        Level 3（UI 蓝图）：
            03_Features_and_UI_Blueprints.md

        Level 4（流程与角色）：
            02_Roles_and_Core_Flows.md

        Level 5（技术规范）：
            00_Tech_Stack_Standards.md

    若任何生成代码与高优先级文档冲突：
        → 代码必须修改
        → 文档不动


============================================================
# 3. 启动 Cursor 前的“项目初始化步骤”
============================================================

    在让 Cursor 写第一行代码前，必须完成以下操作：

    Step 1:
        在项目根目录放置全部文档：
            /docs/00_Tech_Stack_Standards.md
            /docs/01_Project_Overview.md
            /docs/02_Roles_and_Core_Flows.md
            /docs/03_Features_and_UI_Blueprints.md
            /docs/04_Domain_Model_and_Algorithms.md
            /docs/05_API_Specs.md
            /docs/06_Cursor_Collaboration_Guide.md
            /docs/07_PRD_Core_Architecture.md

    Step 2:
        在 Cursor 的 Project Instructions 中明确写入：

            “You must strictly follow the documents in /docs.
             You are not allowed to invent business logic.
             Domain rules override implementation convenience.”

    Step 3:
        禁止 Cursor 在未被指示的情况下扫描整个项目并自动“重构”。


============================================================
# 4. 分阶段协作策略（Phased Execution）
============================================================

------------------------------------------------------------
# Phase 1：Domain Skeleton（领域骨架）
------------------------------------------------------------

    目标：
        让 Cursor 只生成“空壳但结构正确”的 Domain 层代码。

    输入文档：
        - 04_Domain_Model_and_Algorithms.md
        - 07_Core_Architecture.md

    强制附加要求（Testing is Mandatory）：
        - 对每一个“计算类 Domain Service/Function”（例如 DogCalcService），
          必须同时生成对应的 Unit Test 文件。
        - 每个计算函数至少包含 3 个测试用例，其中至少 2 个为边界值用例。
        - 测试用例必须覆盖：
            1) treat_input_mode = ESTIMATE_LEVEL 与 EXACT_KCAL 两种模式
            2) activity_level 或 treat_level 的枚举切换
            3) 至少一个异常/告警场景（例如 treat_kcal > DER 的处理策略）

    重要约束：
        - 测试不得“自证正确”（避免实现与测试一起胡写仍然全绿）：
            - 预期值必须来自 04/07 明确的公式与常量表（fixtures），或
            - 在测试中明确标注预期值的推导依据（引用文档章节号）
        - 若文档未明确某个边界行为（例如抛错还是 clamp），必须先提问确认。

    验收标准：
        - 没有任何 HTTP 代码
        - 没有任何 UI 逻辑
        - Snapshot 对象不可变
        - 枚举值与 07 完全一致
        - Unit Tests 可运行且全部通过（绿勾）


------------------------------------------------------------
# Phase 2：API Layer（接口层）
------------------------------------------------------------

    目标：
        生成 Controller / Route 层，但不下放业务逻辑。

    输入文档：
        - 05_API_Specs.md
        - 04_Domain_Model_and_Algorithms.md

    明确指令示例：
        “Implement API endpoints exactly as defined in 05.
         Controllers must delegate logic to domain services.
         Do not duplicate business rules in controllers.”

    验收标准：
        - Controller 中不出现公式
        - Controller 不修改 snapshot
        - 状态机校验来自 Domain 层


------------------------------------------------------------
# Phase 3：Persistence & Repositories（持久化）
------------------------------------------------------------

    目标：
        实现 Repository 层，连接数据库结构。

    输入文档：
        - 07_PRD_Core_Architecture.md
        - 04_Domain_Model_and_Algorithms.md

    规则：
        - Repository 只做 CRUD + mapping
        - 不允许在 Repository 中写业务判断
        - 不允许跨 Domain 操作数据库表


------------------------------------------------------------
# Phase 4：Frontend Implementation（前端实现）
------------------------------------------------------------

    目标：
        按 UI 蓝图生成页面与组件。

    输入文档：
        - 03_Features_and_UI_Blueprints.md
        - 05_API_Specs.md

    强制约束：
        - UI 不计算 RER / DER
        - UI 不计算运费
        - UI 不处理状态机
        - UI 只展示 Snapshot，不编辑 Snapshot


============================================================
# 5. Prompt 模板（强烈建议复用）
============================================================

------------------------------------------------------------
# 5.1 通用约束模板
------------------------------------------------------------

    “You are implementing part of a production system.
     You must strictly follow the provided documents.
     Do not invent new fields, enums, or logic.
     If information is missing, ask instead of guessing.”


------------------------------------------------------------
# 5.2 Domain 生成模板
------------------------------------------------------------

    “Based on 04_Domain_Model_and_Algorithms.md,
     generate domain entities and services.
     Snapshot objects must be immutable.
     Enumerations must exactly match definitions in 07.”


------------------------------------------------------------
# 5.3 API 生成模板
------------------------------------------------------------

    “Based on 05_API_Specs.md,
     generate API controllers.
     Do not implement business logic inside controllers.
     All validation must be delegated to domain services.”


============================================================
# 6. Review Checklist（人工验收清单）
============================================================

    每次 Cursor 输出代码后，你必须人工检查：

    Domain 层：
        - 是否存在重复算法？
        - 是否存在硬编码枚举？
        - Snapshot 是否真的不可变？
        - 计算类函数是否附带 Unit Tests？
        - Unit Tests 是否覆盖边界条件且全部通过？

    API 层：
        - 是否偷偷做了计算？
        - 是否绕过状态机？
        - 是否返回了不该返回的字段？

    Frontend：
        - 是否有业务计算？
        - 是否直接修改 Domain 状态？
        - 是否误导用户理解（如把 Snapshot 当实时配方）？


============================================================
# 7. 常见 AI 失控模式与应对
============================================================

    失控模式 1：
        Cursor “好心”补了一个字段或逻辑
    应对：
        立即删除，回到文档，补文档再继续

    失控模式 2：
        Cursor 为了方便把逻辑写进 Controller
    应对：
        明确要求迁移回 Domain Service

    失控模式 3：
        Cursor 试图重构你没要求的模块
    应对：
        终止当前生成，回滚，缩小任务范围


============================================================
# 8. 变更管理（Change Management）
============================================================

    所有需求变更流程必须是：

        业务变化 →
        更新 02 / 03 / 04 / 07 中的一个或多个文档 →
        明确标注“Changed Section” →
        再让 Cursor 改代码

    禁止：
        - 先改代码再补文档
        - 让 Cursor 自行“推断需求变化”


============================================================
# 9. 最终原则（写给未来的你）
============================================================

    当你感到 Cursor 开始“越来越聪明但越来越危险”时，
    说明你给它的约束不够强。

    记住：
        你不是在“用 AI 写代码”，
        你是在“用文档指挥一个极快但不懂业务的工程师”。

============================================================
# End of Document
============================================================
