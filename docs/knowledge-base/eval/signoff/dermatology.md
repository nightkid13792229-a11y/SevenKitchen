# 领域签字：dermatology（皮肤）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §0.4 自签）
- 范围：SACN5 第 31/32 章、MERCK 皮肤病维生素与矿物质、MERCK 营养性皮肤病

## 1. 题集

- 文件：`docs/knowledge-base/eval/dermatology/questions.json`
- 题数：8（numeric 4、table 1、zh 2、negative 1）
- 结果：**8/8**；exit 0
- 负样本：`dog vitamin K requirement` → 0 节 0 表，通过

## 2. 设计任务

- 场景：G5「犬过敏性皮炎营养依据」
- 结果：**通过**
- 轨迹：检索 3 次、开表/开节 5 次、引用 20 个；无剂量/诊断

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 合理 | both 24、cat 3、dog 3；未见明显错标 |
| 分期 | 30/30 为空 | 本域不涉及分期 |
| 主题 | 未逐条核 | 已知主题标签噪声 |

## 4. 已知缺口

1. MERCK 两份文档很短（6/12 段），本域主要靠 SACN5 31/32；
2. 主题标签未逐条审计；
3. 表格只验了 T0226/T0228。

## 5. 结论

**可开**。`dermatology.audited = true`。
