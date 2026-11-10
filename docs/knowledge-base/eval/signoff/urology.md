# 领域签字：urology（泌尿）

- 日期：2026-11-10
- 签字：执行 Agent（按计划 §3 自签；人工只需抽查域划分与签字）
- 范围：SACN5 38–46（各型犬尿石 + 猫 FLUTD）、ACVIM 2016 尿石共识、ACVIM 2024 犬尿失禁
- 文档数：主域 11 份（含副域共 11 份）

## 1. 题集

- 文件：`docs/knowledge-base/eval/urology/questions.json`
- 题数：8（numeric 5、table 1、zh 1、negative 1）
- 结果：**8/8**；`npm run kb:eval -- --domain urology --no-write` exit 0
- 负样本：`cat urolithiasis vitamin K requirement` → 0 节 0 表（documentIds 钉住本域 11 份）
- 期望只写证据位置（节/表 ID），不写临床结论

## 2. 设计任务

- 场景：G7「草酸钙结石犬：防复发饮食」
- 结果：**通过**
- 轨迹：首轮通过：检索 2 次、开表/开节 5 次、引用 23 条、unsupported 0。
- 口径：问答式，不改草稿、不跑评估；禁止出现药物剂量与诊断结论

## 3. 目录抽检（30 节）

| 项 | 结果 | 说明 |
|---|---|---|
| 物种 | 30/30 与原文一致 | 犬 24（SACN5 38–45）、犬猫通用 5（ACVIM 2016）、猫 1（SACN5-46 FLUTD 导言） |
| 分期 | 不适用 | 尿石症按矿物类型分类，无 1–4 分期 |
| 主题 | 未见明显错标 | struvite/草酸钙/胱氨酸/嘌呤/硅石/复合结石/FLUTD 分布均匀 |

抽检方式：`npm run kb:sections -- --domain urology --sample 30`（按文档+顺序均匀取样，含正文片段）。

## 4. 已知缺口

1. **ACVIM 2024 犬尿失禁以诊断/药物治疗为主，没有营养学证据**，本域题集不覆盖它（文档已归位，属边界内容）；
2. 猫尿石证据集中在 SACN5-46，猫的 struvite 溶解口径与犬（SACN5-43）不同，回答里必须分物种；
3. 结石处方粮表（如 T0309）能打开，但具体商品名不构成临床建议。

## 5. 结论

**可开**。`urology.audited = true`；加入生产 `KNOWLEDGE_DOMAINS`。
