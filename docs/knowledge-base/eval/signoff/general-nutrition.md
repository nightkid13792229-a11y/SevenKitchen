# 领域签字：general-nutrition（基础营养）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §0.4 自签）
- 范围：AAHA 2021 营养与体重管理、2010 营养评估、2014 体重管理、2019 犬生命阶段（4 份文档）

## 1. 题集

- 文件：`docs/knowledge-base/eval/general-nutrition/questions.json`
- 题数：10（numeric 5、table 2、zh 2、negative 1）
- 结果：**10/10**；p95 285.5ms；exit 0
- 负样本：`dog vitamin K requirement` → 0 节 0 表，通过

## 2. 设计任务

- 场景：G1「BCS 8/9、20kg 犬减重：算每日热量与速度」
- 结果：**通过**
- 轨迹：检索 9 次、开表/开节 5 次、引用 14 个；无剂量/诊断
- 说明：Agent 用 AAHA Table 2 的 BCS 超重比例推算理想体重，并标明"估算值待核对"

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 未见错标 | `both`/`dog`/`cat` 与标题一致 |
| 分期 | 30/30 为空 | 本域不涉及 CKD 分期，符合预期 |
| 主题 | 噪声明显 | 结论节被标 `iron`/`staging`；影响排序，不影响可达 |

## 4. 已知缺口

1. 主题标签精度低（`staging`/`iron` 被过度标注），需要在 `detectTopics` 收窄或按域开关；
2. 中文题只有 2 道，覆盖面偏窄；
3. 表格只验了 2 张（T0021/T0022），未做全量 caption 审计。

## 5. 结论

**可开**。将 `knowledge-domains.ts` 的 `general-nutrition.audited` 置为 `true`；生产可通过 `KNOWLEDGE_DOMAINS=ckd,general-nutrition` 启用。

后续回归若推翻本结论，在本文件追加记录，不改历史结论。
