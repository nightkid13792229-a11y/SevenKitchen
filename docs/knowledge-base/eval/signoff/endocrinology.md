# 领域签字：endocrinology（内分泌）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签；人工只需抽查域划分与签字）
- 范围：AAHA 2018 糖尿病管理、SACN5-27（肥胖，副域）、SACN5-28（脂质代谢）、SACN5-29（内分泌疾病）
- 文档数：主域 3 份（含副域共 4 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/endocrinology/questions.json`
- 题数：8（numeric 5、table 1、zh 1、negative 1）
- 结果：**8/8**；`npm run kb:eval -- --domain endocrinology --no-write` exit 0
- 负样本：`diabetic cat vitamin D dose` → 0 节 0 表（documentIds 钉住本域：AAHA-2018 + SACN5 27/28/29）
- 期望只写证据位置（节/表 ID），不写临床结论

## 2. 设计任务

- 场景：G6「糖尿病猫：碳水/蛋白/纤维方向与能否只靠换粮」
- 结果：**通过**
- 轨迹：首轮通过：检索 5 次、开表/开节 6 次、引用 23 条、unsupported 0。
- 口径：问答式，不改草稿、不跑评估；禁止出现药物剂量与诊断结论

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 与原文一致 | 犬猫通用 24、猫 4（甲亢节）、犬 2（甲减/相关节） |
| 分期 | 不适用 | 本域无分期门槛 |
| 主题 | 未见明显错标 | 糖尿病/甲状腺/肥胖/脂质代谢四类；AAHA-2018 封面 1 节无正文 |

抽检方式：`npm run kb:sections -- --domain endocrinology --sample 30`（按文档+顺序均匀取样，含正文片段）。

## 4. 已知缺口

1. AAHA 2018 是**犬猫合并**指南，猫的缓解率证据主要来自 SACN5-29，两份口径需在回答里分开；
2. SACN5-27（肥胖）主域在基础营养，本域只作副域检索，题集不依赖它；
3. 甲状腺部分只有甲亢/甲减的营养口径，**没有**放射性碘/药物剂量（也不该有）。

## 5. 结论

**可开**。`endocrinology.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
