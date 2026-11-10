# 领域签字：reproduction（生殖）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签；人工只需抽查域划分与签字）
- 范围：WSAVA 生殖管理指南（英文全文 / 中文版 / 执行摘要）、SACN5 15 繁殖犬、SACN5 22 繁殖猫、SACN5 16/23 新生幼犬猫、WSAVA 遗传病立场、WSAVA 剖宫产/孕哺疼痛专题
- 文档数：主域 10 份（含副域共 10 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/reproduction/questions.json`
- 题数：7（numeric 4、table 1、zh 1、negative 1）
- 结果：**7/7**；`npm run kb:eval -- --domain reproduction --no-write` exit 0
- 负样本：`breeding vitamin K requirement` → 0 节 0 表（documentIds 钉住本域 10 份）

## 2. 设计任务

- 场景：G13「母犬配种：排卵判断与孕哺期饲喂」
- 轨迹：首轮通过：检索 16 次、开表 6 次、引用 21 条、unsupported 0（本批检索次数最多，属正常：题面含两个子问题）。

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 与原文一致 | 抽检 29 节来自中文版（犬猫通用）、1 节 SACN5-15（犬） |
| 分期 | 不适用 | 无分期门槛 |
| 主题 | 未见明显错标 | 发情/排卵/剖宫产/绝育/遗传病分布合理 |

抽检方式：`npm run kb:sections -- --domain reproduction --sample 30`。

## 4. 已知缺口

1. **WSAVA 生殖指南中文版被切成 2653 节**（约一段一节），标题多为句子片段，节级导航噪声大；英文全文版只有 7 节（1161 段）；
2. 三份同源文档（英文全文/中文版/执行摘要）内容重复，排序时可能互相挤占；
3. 疼痛专题（剖宫产、孕哺）各只有 1–2 节，证据很薄。

## 5. 结论

**可开**。`reproduction.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
