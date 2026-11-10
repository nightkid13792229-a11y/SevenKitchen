# 领域签字：oncology（肿瘤）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签；人工只需抽查域划分与签字）
- 范围：SACN5-30 癌症营养、ACVIM 2018 细胞毒化疗安全、WSAVA 口腔肿瘤、WSAVA 癌痛、WSAVA 微芯片与肿瘤立场
- 文档数：主域 5 份（含副域共 5 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/oncology/questions.json`
- 题数：7（numeric 4、table 1、zh 1、negative 1）
- 结果：**7/7**；`npm run kb:eval -- --domain oncology --no-write` exit 0
- 负样本：`cancer patient vitamin K requirement` → 0 节 0 表（documentIds 钉住本域 5 份）

## 2. 设计任务

- 场景：G10「化疗中的肥大细胞瘤犬：omega-3 与碳水」
- 轨迹：首轮通过：检索 3 次、开表 3 次、引用 9 条、unsupported 0。

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 犬猫通用 | SACN5-30 与化疗安全共识都是犬猫通用 |
| 分期 | 不适用 | 无分期门槛 |
| 主题 | 偏科：22/30 落在化疗职业防护 | 该共识是"人/环境防护"文档，不是营养证据 |

抽检方式：`npm run kb:sections -- --domain oncology --sample 30`。

## 4. 已知缺口

1. **本域最大的一份文档（ACVIM 2018 化疗安全，23 节）讲的是职业防护**，不是营养；营养证据实际集中在 SACN5-30（13 节）；
2. 原文全英文；纯中文查询在补词典前实测 no_match，本次补了「肿瘤/癌症/化疗/恶病质」四个词才通（见 `query-expansion.ts`）；
3. WSAVA 微芯片立场、WSAVA 癌痛专题两份文档 **0 节**（只有段落），节级检索取不到，只能靠全库关键词；
4. 癌症营养的具体目标（蛋白/omega-3 剂量）不在本域签字的临床结论范围内。

## 5. 结论

**可开**。`oncology.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
