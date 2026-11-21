# 领域签字：pancreatitis（胰腺炎）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §0.4 自签）
- 范围：ACVIM 2021 猫胰腺炎共识、SACN5 第 67 章

## 1. 题集

- 文件：`docs/knowledge-base/eval/pancreatitis/questions.json`
- 题数：9（numeric 5、table 1、zh 2、negative 1）
- 结果：**9/9**；p95 203.6ms；exit 0
- 负样本：`dog vitamin K requirement` → 0 节 0 表，通过

## 2. 设计任务

- 场景：G3「猫胰腺炎饮食注意」
- 结果：**通过**
- 轨迹：检索 3 次、开表/开节 3 次、引用 15 个；无剂量/诊断

## 3. 目录抽检（26 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 26/26 合理 | cat 10、both 16；猫共识与 SACN5 章节混排，未见明显错标 |
| 分期 | 26/26 为空 | 本域不涉及 CKD 分期 |
| 主题 | 未逐条核 | 本次只核物种/分期；主题噪声沿用基础营养的已知缺口 |

## 4. 已知缺口

1. 只有 2 份文档，犬胰腺炎主要依赖 SACN5 第 67 章；
2. 主题标签未逐条审计；
3. 表格只验了 T0498 一张。

## 5. 结论

**可开**。`pancreatitis.audited = true`；生产可用 `KNOWLEDGE_DOMAINS=...,pancreatitis` 启用。
