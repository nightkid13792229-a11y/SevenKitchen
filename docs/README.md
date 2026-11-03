# 文档总索引

> 2026-11-03 重整。原则：**活文档只写代码里看不出来的约束/取舍；历史资料统一进 `_archive/`，不冒充当前实现。**

---

## 1. 活文档（需要维护）

| 文档 | 用途 |
|---|---|
| [项目概览](01_Project_Overview.md) | 业务范围、用户、非目标 |
| [技术栈与工程约定](00_Tech_Stack_Standards.md) | 版本、命令、质量门 |
| [角色与核心流程](02_Roles_and_Core_Flows.md) | 三端角色、主流程 |
| [功能与页面蓝图](03_Features_and_UI_Blueprints.md) | 页面/功能地图 |
| [领域模型与算法](04_Domain_Model_and_Algorithms.md) | 领域边界、不变量、算法入口 |
| [API 契约与接口索引](05_API_Specs.md) | 全局约定 + Swagger + 模块索引 |
| [核心架构](07_Core_Architecture.md) | 分层、模块地图、数据流 |
| [数据库命名规范](DATABASE_NAMING_CONVENTIONS.md) | 字段真源与验证方法 |
| [多会话协作](MULTI_SESSION_WORKFLOW.md) | 工位、门禁、收尾 |
| [通知矩阵](notification-matrix.md) | 订阅消息/站内消息规则 |
| [时区处理](TIMEZONE_HANDLING.md) | 时间口径 |
| [补剂用量口径](supplement-amount-rules.md) | 补剂损耗/添加量规则 |
| [原料批量替换](ingredient-batch-replace.md) | 后台批量替换行为 |
| [员工端 UI 规范](员工端UI规范.md) | 员工端一页纸规范 |
| [部署与 SSH](ops/deploy-and-ssh.md) | 生产部署、日志、回滚 |
| [对象存储与图片](ops/object-storage-and-images.md) | COS/CDN/图片故障 |
| [打印与标签](ops/printing.md) | B3S/JCING/打印排查 |

### 参考/按需

| 目录 | 用途 |
|---|---|
| [knowledge-base/](knowledge-base/README.md) | 知识库治理、来源、证据政策 |
| [design/](design/) | 设计草案/审核单（不是当前实现说明） |
| [_archive/testing/](_archive/testing/) | 历史验收/测试指南（按需） |

---

## 2. 历史资料（`_archive/`，不维护）

| 目录 | 内容 |
|---|---|
| `_archive/plans/` | 按日期的设计/执行/收尾计划（原 `docs/plans`） |
| `_archive/superpowers/` | DSH/superpowers 的计划、规格、验收、评审 |
| `_archive/audits/` | 按日期的代码/算法/UI 审计 |
| `_archive/reports/` | 按日期的导入、事故复盘、验收报告 |
| `_archive/handoff/` | 会话/环境交接记录 |
| `_archive/legacy/` | 2026-11-03 重整前的旧版核心/运维文档 |
| `_archive/alignment/` | 历史对齐报告 |
| `_archive/history/` | 更早的阶段收尾记录 |

> 历史资料只在追溯“当时为什么这么做”时翻；**不要按里面的路径/字段/命令直接施工**。
> 如需引用，在文首标“历史记录，不代表当前实现”。

---

## 3. 文档规则

1. **代码是事实源**：字段看 `schema.prisma`，接口看 Swagger/controller，页面看代码。
2. **活文档只写“为什么/约束/边界”**：不要手抄字段清单、接口清单、页面像素。
3. **新增活文档前先问**：它是否影响高频决策？是否有代码里看不出的信息？谁来维护？
4. **历史资料只归档、不重写**：加横幅、移到 `_archive/`，不要逐份改正文。
5. **链接用相对路径**；移动文档时同步更新活文档里的链接。
6. **旧工具专用文档**不放进活文档区；不用了就归档到 `_archive/`。

---

## 4. 快速入口

- 项目规则：[AGENTS.md](../AGENTS.md)
- 文档分堆报告（历史）：[_archive/reports/DOC_TRIAGE_2026-11-03.md](_archive/reports/DOC_TRIAGE_2026-11-03.md)
- 归档说明：[_archive/README.md](_archive/README.md)
