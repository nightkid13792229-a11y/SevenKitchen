# 知识库 v3 结构基准 / reference caller，不是模型调用次数

> reference caller, not model

本报告用固定流程的 reference caller 直接调用 `kb_catalog` / `kb_find` / `kb_read`，
度量“接口需要几次调用、一次返回几页”。它证明接口能力，**不证明模型会这样调**，
也不代表 Agent 的真实模型调用次数；Agent A/B 必须冻结模型/提示词/业务工具后另行测试。

- 生成时间：2026-11-11T16:23:40.100Z
- 仓库：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/20261111-kb-v3`
- 目标文档：`sacn5-chapters-SACN5-37`
- 会话 setup：`kb_catalog` × 1（不计入每题；Q6 内的 catalog 也不计数）
- token 估算：`estimateTokens` 只算文本；页图 base64 不计

| 题 | 场景 | 调用序列 | KB 调用次数 | 页数 | 估算 token（文本） | 首个命中页 | 耗时 ms | 结果 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | 已知文档：SACN5-37 表 37-9 附近 | kb_read | 1 | 5 | 7907 | 17 | 14.1 | OK | 页码取自题面，直接读 |
| Q2 | 已知问题、不知道在哪：磷需要量 | kb_find → kb_read | 2 | 5 | 6999 | 24 | 56.2 | OK | find top=p24 |
| Q3 | 表题：推荐量/表格 | kb_find → kb_read | 2 | 3 | 3585 | 24 | 20.3 | OK | find top=p24；表在页图里，图片 token 未计入 |
| Q4 | 图片型：无文字层文档 | kb_read | 1 | 1 | 0 | 1 | 2.6 | OK | wsava-nutrition-Muscle-Condition-Score-Cat 无文字层，页图即内容；图片 token 未计入 |
| Q5 | 负样本：biotin（预期 0 命中） | kb_find | 1 | 0 | 0 | — | 5.8 | OK | 0 命中；这只说明该词没命中，不判断知识库是否覆盖 |
| Q6 | 整章：目录定位后按 tocId 读 | kb_catalog(setup) → kb_read | 1 | 15 | 19618 | 1 | 14.4 | OK | toc "全文 1..46" p1–46；默认预算可截断 |

## 固定题集（6 题）

| 题 | 目标调用数 | 固定流程 |
| --- | --- | --- |
| Q1 | read 1 次 | 已知文档：SACN5-37 表 37-9 附近（页码已知，直接 read） |
| Q2 | find + read = 2 次 | 已知问题、不知道在哪：磷需要量（find top1 → read 该页起 5 页） |
| Q3 | find + read = 2 次 | 表题：推荐量/表格（find 表题 → read 该页起 3 页（带页图）） |
| Q4 | read 1 次 | 图片型：无文字层文档（read 无文字层文档第 1–2 页（带页图）） |
| Q5 | find 1 次 | 负样本：biotin（预期 0 命中）（find 负样本，0 命中） |
| Q6 | catalog(setup) + read = 1 次 | 整章：目录定位后按 tocId 读（catalog 取目录 → read 第一条 tocId） |

> 结构基准的用法：超过 2–3 次先改“页为单位的返回/索引/预算”，
> 不加工具、不改提示词、不加“必须先…”的约束（设计 §9.4）。
