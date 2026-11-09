# CKD 知识库 26 题回归结果（自动生成）

> 生成时间：2026-11-10 02:49:27　|　题集：`docs/knowledge-base/eval/ckd/questions.json`　|　脚本：`backend/scripts/knowledge-base/evaluate-library.ts`
>
> 走 Agent 工具层：每题一个全新的 `CitationRegistry`，调 `executeTool('search_knowledge_library', { query, species, stage, topics, limit: 5 })`；表格题再用**检索返回的 citationId** 调 `open_knowledge`。
> 判分：spec v1.1 附录 A —— 前 3 节含任一期望节即通过；前 3 节出现禁止节即不通过；负样本要求 `no_match` 或「0 节 0 表」；表格题要求命中期望表**且**按检索的 K 打开成功。

## 阶段出口

| 指标 | 实际 | 目标 | 结果 |
|---|---|---|---|
| 整体 | 26/26 | ≥26/26 | 通过 |
| Stage 3 | 1/1 | 1/1 | 通过 |
| 表格 | 2/2 | 2/2 | 通过 |
| 中文 | 6/6 | ≥6/6 | 通过 |
| 负样本 | 4/4 | 4/4 | 通过 |
| 对抗 | 4/4 | 4/4 | 通过 |
| 核心表可打开 | 6/6 | 6/6 | 通过 |
| 检索 p95 | 102.9ms | <300ms | 通过 |
| 单次工具调用 max | 251.6ms | <1000ms | 通过 |

## 耗时（单次工具调用，含检索 + 表格视图 + 引用登记；表格题另含按 K 打开）

- p50：77.4ms　p95：102.9ms　max：251.6ms（目标 p95 <300ms、单次 <1s）

## 6 张核心表

> 核心表用 `open_knowledge({ tableId })` 直接打开（能力检查，不对应某道题）。

| 表 | 打开 | citationId | 页码 | 行数 | 备注 |
|---|---|---|---|---|---|
| T0253 | 可打开 | K1 | null | 5 |  |
| T0497 | 可打开 | K1 | 17 | 10 |  |
| T0260 | 可打开 | K1 | null | 23 |  |
| T0261 | 可打开 | K1 | null | 18 |  |
| T0025 | 可打开 | K1 | null | 20 |  |
| T0026 | 可打开 | K1 | null | 22 |  |

## 26 题明细

| # | id | 类型 | status | 前 3 节 | 表格 | 结果 | 说明 | 耗时 |
|---|---|---|---|---|---|---|---|---|
| 1 | dietary-phosphorus | numeric | ok | sacn5-chapters-SACN5-37-s017（p24）<br>sacn5-chapters-SACN5-37-s016（p22）<br>iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g-s004（p2） | T0497（K10）<br>T0253（K11）<br>T0260（K12） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s017 | 251.6ms |
| 2 | protein | numeric | ok | sacn5-chapters-SACN5-37-s015（p20）<br>sacn5-chapters-SACN5-37-s018（p27）<br>aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines-s027（p20） | T0260（K9）<br>T0261（K10）<br>T0497（K11） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s015 | 82.9ms |
| 3 | sodium | numeric | ok | sacn5-chapters-SACN5-37-s018（p26）<br>sacn5-chapters-SACN5-37-s017（p24）<br>aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines-s027（p20） | T0497（K10）<br>T0262（K11）<br>T0025（K12） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s018、sacn5-chapters-SACN5-37-s017 | 82.8ms |
| 4 | potassium | numeric | ok | sacn5-chapters-SACN5-37-s018（p27）<br>sacn5-chapters-SACN5-37-s021（p32）<br>iris-IRIS-staging-guidelines-2026-s007（p7） | T0497（K10）<br>T0260（K11）<br>T0261（K12） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s018、sacn5-chapters-SACN5-37-s021 | 83.9ms |
| 5 | chloride | numeric | ok | sacn5-chapters-SACN5-37-s018（p27）<br>sacn5-chapters-SACN5-37-s014（p17） | T0497（K4）<br>T0262（K5） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s018、sacn5-chapters-SACN5-37-s014 | 66ms |
| 6 | omega3 | numeric | ok | sacn5-chapters-SACN5-37-s019（p28）<br>sacn5-chapters-SACN5-37-s021（p32） | T0497（K5）<br>T0260（K6）<br>T0261（K7） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s019、sacn5-chapters-SACN5-37-s021 | 102.9ms |
| 7 | staging | staging | ok | iris-IRIS-staging-guidelines-2026-s002（p1）<br>iris-IRIS-staging-guidelines-2026-s003（p2）<br>iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g-s004（p2） | T0253（K11）<br>T0255（K12）<br>T0262（K13） | ✅ | 前 3 节命中 iris-IRIS-staging-guidelines-2026-s002、iris-IRIS-staging-guidelines-2026-s003 | 77.4ms |
| 8 | upc | staging | ok | sacn5-chapters-SACN5-37-s009（p8）<br>iris-IRIS-staging-guidelines-2026-s004（p4）<br>iris-IRIS-staging-guidelines-2026-s002（p1） | T0253（K10）<br>T0258（K11）<br>T0262（K12） | ✅ | 前 3 节命中 iris-IRIS-staging-guidelines-2026-s004 | 75.4ms |
| 9 | bp | staging | ok | iris-IRIS-staging-guidelines-2026-s002（p1）<br>iris-IRIS-DOG-Treatment-Recommendations-may-2026-s007（p24）<br>iris-IRIS-staging-guidelines-2026-s006（p5） | T0255（K11）<br>T0262（K12）<br>T0256（K13） | ✅ | 前 3 节命中 iris-IRIS-staging-guidelines-2026-s006 | 101.2ms |
| 10 | stage3 | staging | ok | iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005（p11）<br>iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g-s005（p4）<br>iris-IRIS-staging-guidelines-2026-s003（p2） | T0497（K10）<br>T0262（K11）<br>T0263（K12） | ✅ | 前 3 节命中 iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005 | 74.9ms |
| 11 | zh-stage3 | zh | ok | iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005（p11）<br>iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g-s005（p4）<br>iris-IRIS-staging-guidelines-2026-s003（p2） | T0497（K10）<br>T0262（K11）<br>T0263（K12） | ✅ | 前 3 节命中 iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005 | 76.6ms |
| 12 | zh-dietary | zh | ok | sacn5-chapters-SACN5-37-s011（p12）<br>sacn5-chapters-SACN5-37-s014（p17）<br>iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g-s005（p4） | T0497（K10）<br>T0262（K11）<br>T0263（K12） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s014 | 78ms |
| 13 | zh-protein | zh | ok | sacn5-chapters-SACN5-37-s021（p32）<br>sacn5-chapters-SACN5-37-s014（p17）<br>aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines-s027（p21） | T0260（K9）<br>T0261（K10）<br>T0497（K11） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s014 | 74.9ms |
| 14 | zh-upc | zh | ok | sacn5-chapters-SACN5-37-s009（p8）<br>iris-IRIS-staging-guidelines-2026-s004（p4）<br>iris-IRIS-staging-guidelines-2026-s002（p1） | T0253（K10）<br>T0258（K11）<br>T0262（K12） | ✅ | 前 3 节命中 iris-IRIS-staging-guidelines-2026-s004 | 82.3ms |
| 15 | zh-bp | zh | ok | iris-IRIS-staging-guidelines-2026-s006（p5）<br>iris-IRIS-DOG-Treatment-Recommendations-may-2026-s007（p24）<br>iris-IRIS-staging-guidelines-2026-s002（p1） | T0253（K9）<br>T0255（K10）<br>T0256（K11） | ✅ | 前 3 节命中 iris-IRIS-staging-guidelines-2026-s006 | 78.9ms |
| 16 | zh-sodium | zh | ok | sacn5-chapters-SACN5-37-s018（p26）<br>sacn5-chapters-SACN5-37-s014（p17）<br>iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005（p12） | T0497（K8）<br>T0262（K9）<br>T0025（K10） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s018 | 55.8ms |
| 17 | no-vitamin-k | negative | no_match | — | — | ✅ | 负样本：0 节 0 表 | 67.2ms |
| 18 | no-biotin | negative | no_match | — | — | ✅ | 负样本：0 节 0 表 | 56.7ms |
| 19 | no-manganese | negative | no_match | — | — | ✅ | 负样本：0 节 0 表 | 58.1ms |
| 20 | no-chromium | negative | no_match | — | — | ✅ | 负样本：0 节 0 表 | 46.2ms |
| 21 | stage2-vs4 | adversarial | ok | iris-IRIS-staging-guidelines-2026-s003（p3）<br>iris-IRIS-DOG-Treatment-Recommendations-may-2026-s004（p8）<br>iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005（p11） | T0262（K10）<br>T0263（K11）<br>T0497（K12） | ✅ | 前 3 节命中 iris-IRIS-DOG-Treatment-Recommendations-may-2026-s004、iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005 | 101.7ms |
| 22 | dietary-vs-serum | adversarial | ok | iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005（p11）<br>iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g-s005（p4）<br>iris-IRIS-staging-guidelines-2026-s003（p2） | T0262（K10）<br>T0263（K11）<br>T0497（K12） | ✅ | 前 3 节命中 iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005 | 88.8ms |
| 23 | dog-protein-hint | adversarial | ok | aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines-s024（p17）<br>sacn5-chapters-SACN5-37-s015（p20）<br>sacn5-chapters-SACN5-37-s017（p23） | T0260（K9）<br>T0261（K10）<br>T0497（K11） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s015 | 43.1ms |
| 24 | synonym | adversarial | ok | sacn5-chapters-SACN5-37-s014（p17）<br>sacn5-chapters-SACN5-37-s011（p12）<br>iris-IRIS-DOG-Treatment-Recommendations-may-2026-s006（p22） | T0497（K10）<br>T0262（K11）<br>T0263（K12） | ✅ | 前 3 节命中 sacn5-chapters-SACN5-37-s014 | 79.3ms |
| 25 | table-37-9 | table | ok | sacn5-chapters-SACN5-37-s022（p33）<br>aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines-s008（p5）<br>aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines-s005（p2） | T0497（K10）<br>T0260（K11）<br>T0261（K12） | ✅ | 表格命中且可打开 T0497、T0260、T0261<br>按 K 打开：T0497✔（K10）、T0260✔（K11）、T0261✔（K12） | 93.4ms |
| 26 | table-37-1 | table | ok | iris-IRIS-staging-guidelines-2026-s003（p2）<br>iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g-s004（p3）<br>iris-IRIS-staging-guidelines-2026-s002（p1） | T0253（K10）<br>T0255（K11）<br>T0262（K12） | ✅ | 表格命中且可打开 T0253<br>按 K 打开：T0253✔（K10） | 43ms |

## Q12 / Q13 / Q24 诊断（同文档多节裁剪的关注点）

| id | 前 3 节 | 同文档节数 | 结果 |
|---|---|---|---|
| zh-dietary | sacn5-chapters-SACN5-37-s011<br>sacn5-chapters-SACN5-37-s014<br>iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g-s005 | sacn5-chapters-SACN5-37=2；iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g=1；iris-IRIS-DOG-Treatment-Recommendations-may-2026=2 | ✅ |
| zh-protein | sacn5-chapters-SACN5-37-s021<br>sacn5-chapters-SACN5-37-s014<br>aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines-s027 | sacn5-chapters-SACN5-37=2；aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines=2；iris-IRIS-DOG-Treatment-Recommendations-may-2026=1 | ✅ |
| synonym | sacn5-chapters-SACN5-37-s014<br>sacn5-chapters-SACN5-37-s011<br>iris-IRIS-DOG-Treatment-Recommendations-may-2026-s006 | sacn5-chapters-SACN5-37=2；iris-IRIS-DOG-Treatment-Recommendations-may-2026=2；iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g=1 | ✅ |

## 说明

- 节 ID 用完整 ID；`S`=`sacn5-chapters-SACN5-37`、`I`=`iris-IRIS-DOG-Treatment-Recommendations-may-2026`、`G`=`iris-IRIS-staging-guidelines-2026`、`P`=`iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g`、`A`=`aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines`。
- 这是「图书馆」验收，不是临床答案验收：通过与否只看 Agent 能不能找到该看的原文/表，不看结论对错。
- 负样本要求「无节也无表」：只返回表格也算有证据（spec 附录 A 的「未覆盖」语义）。
- 退出码由本节 9 条指标共同决定：任一不过 → `process.exitCode = 1`。
