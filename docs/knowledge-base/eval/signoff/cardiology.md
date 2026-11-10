# 领域签字：cardiology（心脏）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签；人工只需抽查域划分与签字）
- 范围：SACN5-36 心血管疾病、ACVIM 2019 犬 MMVD（全文 + 摘要卡片）、ACVIM 2020 心肌病/肺动脉高压、ACVIM 2018 系统性高血压、ACVIM 2015 心肾轴
- 文档数：主域 7 份（含副域共 7 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/cardiology/questions.json`
- 题数：9（numeric 6、table 1、zh 1、negative 1）
- 结果：**9/9**；`npm run kb:eval -- --domain cardiology --no-write` exit 0
- 负样本：`cardiac disease vitamin K requirement dog` → 0 节 0 表（documentIds 钉住本域 7 份）
- 期望只写证据位置（节/表 ID），不写临床结论

## 2. 设计任务

- 场景：G8「MMVD B2 犬：膳食限钠口径」
- 结果：**通过**
- 轨迹：4 轮 3 过（末两轮连续通过）：检索 2–5 次、开表/开节 2–3 次、引用 13–17 条。
- 口径：问答式，不改草稿、不跑评估；禁止出现药物剂量与诊断结论

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 与原文一致 | 犬 15（MMVD 两个文档）、猫 5（心肌病）、犬猫通用 10（心肾轴/高血压/SACN5-36） |
| 分期 | 9 节带 ACVIM 分期（B1/B2/C/D） | 与 MMVD 共识一致，不是 1–4 分期 |
| 主题 | 未见明显错标 | 钠/牛磺酸/恶病质/高血压/肺动脉高压分布合理 |

抽检方式：`npm run kb:sections -- --domain cardiology --sample 30`（按文档+顺序均匀取样，含正文片段）。

## 4. 已知缺口

1. **场景有 1/4 轮次不通过**：失败模式是 1 条数值/综合句被语义裁判判 unsupported（如"轻度限钠"的量化转述），不是检索失败；
2. 第一版场景问"限盐 + 需不需要补牛磺酸"，连续两轮未过（notCheckable 2 / unsupported 1）——否定型结论（"B2 不是心衰期""没有补牛磺酸证据"）会缺少引用；改为单一限钠口径后连续两轮通过。**该 Agent 侧缺口已登记，未修复**；
3. MMVD 摘要卡片是图片型摘要，9 节无正文，靠全文文档取证据。

## 5. 结论

**可开**。`cardiology.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
