# 领域签字：reference（参考库）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签）
- 范围：NRC 2006 犬猫营养需求、FEDIAF 2025 营养指南、SACN5-2 循证方法学、SACN5-69 药物-营养相互作用、MERCK 临床生化、MERCK 临床血液学
- 文档数：主域 6 份（含副域共 6 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/reference/questions.json`
- 题数：7（numeric 4、table 1、zh 1、negative 1）
- 结果：**7/7**；`npm run kb:eval -- --domain reference --no-write` exit 0
- 负样本：`dog phosphorus requirement` 钉住 MERCK 临床血液学 → 0 节 0 表（见下方说明）

## 2. 设计任务

- 场景：G15「营养标准的换算口径：代谢体重与能量需求」
- 结果：**通过**（连续两轮）
- 轨迹：改口径后连续两轮通过：检索 4–7 次、开表 1 次、引用 6–9 条。

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 犬猫通用 | FEDIAF/NRC/MERCK/SACN5-69 都是犬猫通用参考 |
| 分期 | 不适用 | 参考库无分期 |
| 主题 | 未见明显错标 | 能量/蛋白/氨基酸/毒理/药物相互作用分布合理 |

抽检方式：`npm run kb:sections -- --domain reference --sample 30`。

## 4. 已知缺口

1. **负样本口径特殊**：NRC（5588 段）+ FEDIAF（852 段）覆盖了全部营养素词表，全域网关内任何查询都能命中，构造不出"0 节 0 表"；改为钉住「纯参考」文档 MERCK 临床血液学（无磷需求目标），实测 no_match。这是本域唯一一处偏离"钉住整域"的地方，理由写在这里；
2. **表格类证据同样存在裁判盲区**：首版场景问"钙磷比是否合规"，3 轮里 2 轮因表格引用被判 unsupported/notCheckable；改成"代谢体重换算口径"（段落型证据）后连续两轮通过；
3. NRC 的节是章节级、标题高度重复（"Nutrient Requirements o..."），节级导航弱；FEDIAF 是 161 节的长文档，表格极多；
4. 本域只做可达性与引用题，**不写临床结论**（按计划 Task 6）。

## 5. 结论

**可开**。`reference.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
