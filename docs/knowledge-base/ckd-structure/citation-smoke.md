# CKD 知识库 5 场景引用冒烟（自动生成）

> 生成时间：2026-11-09 19:29:01　|　脚本：`backend/scripts/knowledge-base/evaluate-citation-smoke.ts`
>
> 走 Agent 工具层：`executeTool('search_knowledge_library')` → 取 top 节第一段的 `citationId` → `executeTool('open_knowledge', { citationId })` → 断言打开的节里仍有该段、K 号一致 → `CitationRegistry.audit('磷 0.2–0.5% DM [K#]')`。
> 第 5 个场景是负样本：`CKD dog vitamin K target` 必须 `no_match` 且 0 节 0 表。

## 总览

| 指标 | 实际 | 目标 | 结果 |
|---|---|---|---|
| 场景通过 | 5/5 | 5/5 | 通过 |
| 无效引用 | 0 | 0 | 通过 |
| 表格 K 恢复（可选） | 4/4 | — | — |
| 退出码 | 0 | 0 | 通过 |

## 5 场景明细

| # | 场景 | 查询 | 提示 | status | 节/表 | top 节 | 引用 K | 打开 | audit 有效/无效 | 结果 | 耗时 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CKD 2 期血磷 | CKD dog stage 2 serum phosphate target | stage:2，topics:phosphorus | ok | 5/3 | iris-IRIS-staging-guidelines-2026-s003<br>段 `iris-IRIS-staging-guidelines-2026-p00018` | K1 | ✔（锚点命中） | 1/0 | ✅ | 270.2ms |
| 2 | CKD 3 期血磷 | CKD dog stage 3 serum phosphate target | stage:3 | ok | 5/3 | iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005<br>段 `iris-IRIS-DOG-Treatment-Recommendations-may-2026-p00089` | K1 | ✔（锚点命中） | 1/0 | ✅ | 98ms |
| 3 | CKD 4 期贫血 | CKD dog stage 4 anemia quality of life | stage:4 | ok | 5/3 | iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005<br>段 `iris-IRIS-DOG-Treatment-Recommendations-may-2026-p00080` | K1 | ✔（锚点命中） | 1/0 | ✅ | 78.8ms |
| 4 | CKD 2 期 + UPC + 血压 | CKD dog stage 2 UPC blood pressure | stage:2 | ok | 5/3 | iris-IRIS-staging-guidelines-2026-s002<br>段 `iris-IRIS-staging-guidelines-2026-p00002` | K1 | ✔（锚点命中） | 1/0 | ✅ | 95.2ms |
| 5 | 非 CKD 对照（维生素 K） | CKD dog vitamin K target | — | no_match | 0/0 | — | — | — | 0/0 | ✅ | 53.9ms |

## 说明（逐场景）

1. **CKD 2 期血磷**（`CKD dog stage 2 serum phosphate target`）：通过 — iris-IRIS-staging-guidelines-2026-s003 的段可打开、K 号一致、引用有效
   - 表格 K 恢复（可选）：T0262 / K10 ✔
2. **CKD 3 期血磷**（`CKD dog stage 3 serum phosphate target`）：通过 — iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005 的段可打开、K 号一致、引用有效
   - 表格 K 恢复（可选）：T0262 / K10 ✔
3. **CKD 4 期贫血**（`CKD dog stage 4 anemia quality of life`）：通过 — iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005 的段可打开、K 号一致、引用有效
   - 表格 K 恢复（可选）：T0021 / K10 ✔
4. **CKD 2 期 + UPC + 血压**（`CKD dog stage 2 UPC blood pressure`）：通过 — iris-IRIS-staging-guidelines-2026-s002 的段可打开、K 号一致、引用有效
   - 表格 K 恢复（可选）：T0262 / K11 ✔
5. **非 CKD 对照（维生素 K）**（`CKD dog vitamin K target`）：通过 — 负样本正确返回 no_match（0 节 0 表）

## 说明

- 引用冒烟只验「检索 → 打开 → K 号有效」，不验临床结论对错。
- 第 5 个场景（`CKD dog vitamin K target`）是负样本：`topicPhrases` 门禁要求命中 `vitamin k` 短语，不能因为命中 `vitamin` 就算过；0 节 0 表才算通过。
- 表格 K 恢复是可选诊断：检索命中表格时，用检索登记的 K 打开同一张表并确认 registry 里仍有该记录；不参与 5/5 判定。
- 退出码：任一场景不通过 → 1。
