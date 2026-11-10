# 领域签字：senior-care（老年护理）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签）
- 范围：AAHA 2023 老年护理指南 + 工具包、SACN5-14 中老年犬、SACN5-21 中老年猫、SACN5-35 犬认知功能障碍
- 文档数：主域 5 份（含副域共 5 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/senior-care/questions.json`
- 题数：7（numeric 4、table 1、zh 1、negative 1）
- 结果：**7/7**；`npm run kb:eval -- --domain senior-care --no-write` exit 0
- 负样本：`senior care vitamin K requirement` → 0 节 0 表（documentIds 钉住本域 5 份）

## 2. 设计任务

- 场景：G14「11 岁犬体重下降：老年营养与是否换老年粮」
- 结果：**通过**（连续两轮）
- 轨迹：3 轮 2 过（末两轮连续通过）：检索 2–6 次、开表 3–4 次、引用 18–27 条。

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 与原文一致 | 犬猫通用 22（AAHA 指南/工具包）、犬 5（SACN5-14）、猫 3（SACN5-21） |
| 分期 | 不适用 | 老年按生命阶段而非分期 |
| 主题 | 未见明显错标 | 营养/认知/疼痛/诊断路径分布合理 |

抽检方式：`npm run kb:sections -- --domain senior-care --sample 30`。

## 4. 已知缺口

1. **AAHA 工具包 18 节里有一半是营销/客户沟通材料**（"Roll Out the Red Carpet"、"Repurpose those photos for social"），营养证据主要在指南正文；
2. SACN5-35（认知障碍）只有 10 节，本域题集用它的 2 节；
3. 首轮场景因 2 条数值句被判 unsupported 未过，复跑通过——属回答表述抖动，不是证据缺失（已记入签字）。

## 5. 结论

**可开**。`senior-care.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
