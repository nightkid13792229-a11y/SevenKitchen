# 领域签字：hepatology（肝胆）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签；人工只需抽查域划分与签字）
- 范围：SACN5-68 肝胆疾病、ACVIM 2019 犬慢性肝炎、MERCK 肝功能检查
- 文档数：主域 3 份（含副域共 3 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/hepatology/questions.json`
- 题数：8（numeric 5、table 1、zh 1、negative 1）
- 结果：**8/8**；`npm run kb:eval -- --domain hepatology --no-write` exit 0
- 负样本：`dog biotin requirement` → 0 节 0 表（documentIds 钉住本域 3 份）
- 期望只写证据位置（节/表 ID），不写临床结论

## 2. 设计任务

- 场景：G9「铜相关性慢性肝炎犬：控铜与蛋白质」
- 结果：**通过**
- 轨迹：首轮通过：检索 6 次、开表/开节 4 次、引用 19 条、unsupported 0。
- 口径：问答式，不改草稿、不跑评估；禁止出现药物剂量与诊断结论

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 与原文一致 | 犬 17（ACVIM 慢性肝炎）、犬猫通用 11（SACN5-68）、猫 2（肝脂沉积） |
| 分期 | 不适用 | 肝胆无分期门槛 |
| 主题 | 未见明显错标 | 铜/蛋白质/肝性脑病/抗氧化物/胆管分布合理 |

抽检方式：`npm run kb:sections -- --domain hepatology --sample 30`（按文档+顺序均匀取样，含正文片段）。

## 4. 已知缺口

1. ACVIM 2019 是**犬**慢性肝炎共识，猫的肝脂沉积/胆管炎只在 SACN5-68，猫问题要显式分物种；
2. 维生素 K 在本域**有**证据（凝血），所以负样本改用 biotin，避免"看起来像负样本其实覆盖"；
3. MERCK 肝功能检查是检验参考（14 段），不提供营养目标。

## 5. 结论

**可开**。`hepatology.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
