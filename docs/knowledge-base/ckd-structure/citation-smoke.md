# CKD 知识库 5 场景引用冒烟（自动生成）

> 生成时间：2026-11-09 19:38:42　|　脚本：`backend/scripts/knowledge-base/evaluate-citation-smoke.ts`
>
> 走 Agent 工具层：`executeTool('search_knowledge_library')` → 取 top 节第一段的 `citationId` → `executeTool('open_knowledge', { citationId })` → 断言打开的节里仍有该段、K 号一致 → `CitationRegistry.audit('磷 0.2–0.5% DM [K#]')`。
> 第 5 个场景是**未覆盖营养素对照**：仍在 CKD 检索范围内，但 CKD 语料未覆盖 `vitamin K`；必须 `no_match` 且 0 节 0 表。
>
> 本报告为**本地库实测（159 份文档 / 27,902 段）；生产未跑全量**。

## 总览

| 指标 | 实际 | 目标 | 结果 |
|---|---|---|---|
| 场景通过 | 5/5 | 5/5 | 通过 |
| 无效引用 | 0 | 0 | 通过 |
| 表格 K 复用/回源（可选） | 4/4 | — | — |
| 会话恢复（可选） | 4/4 | — | — |
| 范围校验（附加） | documentIds ✔ / sourceIds ✔ | 非 CKD 被拒 | 通过 |
| 退出码 | 0 | 0 | 通过 |

## 5 场景明细

| # | 场景 | 查询 | 提示 | status | 节/表 | top 节 | 引用 K | 打开 | audit 有效/无效 | 会话恢复（可选） | 结果 | 耗时 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CKD 2 期血磷 | CKD dog stage 2 serum phosphate target | stage:2，topics:phosphorus | ok | 5/3 | iris-IRIS-staging-guidelines-2026-s003<br>段 `iris-IRIS-staging-guidelines-2026-p00018` | K1 | ✔（锚点命中） | 1/0 | ✔ | ✅ | 190.6ms |
| 2 | CKD 3 期血磷 | CKD dog stage 3 serum phosphate target | stage:3 | ok | 5/3 | iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005<br>段 `iris-IRIS-DOG-Treatment-Recommendations-may-2026-p00089` | K1 | ✔（锚点命中） | 1/0 | ✔ | ✅ | 90.4ms |
| 3 | CKD 4 期贫血 | CKD dog stage 4 anemia quality of life | stage:4 | ok | 5/3 | iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005<br>段 `iris-IRIS-DOG-Treatment-Recommendations-may-2026-p00080` | K1 | ✔（锚点命中） | 1/0 | ✔ | ✅ | 88.7ms |
| 4 | CKD 2 期 + UPC + 血压 | CKD dog stage 2 UPC blood pressure | stage:2 | ok | 5/3 | iris-IRIS-staging-guidelines-2026-s002<br>段 `iris-IRIS-staging-guidelines-2026-p00002` | K1 | ✔（锚点命中） | 1/0 | ✔ | ✅ | 97.7ms |
| 5 | 未覆盖营养素对照（维生素 K） | CKD dog vitamin K target | — | no_match | 0/0 | — | — | — | 0/0 | — | ✅ | 52.5ms |

## 说明（逐场景）

1. **CKD 2 期血磷**（`CKD dog stage 2 serum phosphate target`）：通过 — iris-IRIS-staging-guidelines-2026-s003 的段可打开、K 号一致、引用有效
   - 表格 K 复用/回源（可选）：T0262 / K10 ✔
   - 会话恢复（可选）：`new CitationRegistry().restore(record)` 后 audit 仍有效 ✔（有效/无效 1/0）
2. **CKD 3 期血磷**（`CKD dog stage 3 serum phosphate target`）：通过 — iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005 的段可打开、K 号一致、引用有效
   - 表格 K 复用/回源（可选）：T0262 / K10 ✔
   - 会话恢复（可选）：`new CitationRegistry().restore(record)` 后 audit 仍有效 ✔（有效/无效 1/0）
3. **CKD 4 期贫血**（`CKD dog stage 4 anemia quality of life`）：通过 — iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005 的段可打开、K 号一致、引用有效
   - 表格 K 复用/回源（可选）：T0021 / K10 ✔
   - 会话恢复（可选）：`new CitationRegistry().restore(record)` 后 audit 仍有效 ✔（有效/无效 1/0）
4. **CKD 2 期 + UPC + 血压**（`CKD dog stage 2 UPC blood pressure`）：通过 — iris-IRIS-staging-guidelines-2026-s002 的段可打开、K 号一致、引用有效
   - 表格 K 复用/回源（可选）：T0262 / K11 ✔
   - 会话恢复（可选）：`new CitationRegistry().restore(record)` 后 audit 仍有效 ✔（有效/无效 1/0）
5. **未覆盖营养素对照（维生素 K）**（`CKD dog vitamin K target`）：通过 — 负样本正确返回 no_match（0 节 0 表）

## 说明

- 引用冒烟只验「检索 → 打开 → K 号有效」，不验临床结论对错。
- `磷 0.2–0.5% DM [K#]` 是固定引用句式 fixture，只验证引用能对上，**不代表任何临床结论或推荐值**。
- 第 5 个场景标签是**「未覆盖营养素对照」**：它仍在 CKD 检索范围内，只是 CKD 语料未覆盖 `vitamin K`；不要把它理解成「非 CKD 范围」用例。
- 非 CKD 范围拒绝在「范围校验（附加）」里校验：非 CKD `documentIds`/`sourceIds` 必须 `OUT_OF_SCOPE`（非 CKD documentIds：OUT_OF_SCOPE ✔；非 CKD sourceIds：OUT_OF_SCOPE ✔）。
- 表格 K 复用/回源（可选）：同一 registry 内用检索登记的 K 打开同一张表并确认记录仍在；**这不是会话恢复**。
- 会话恢复（可选）：`new CitationRegistry().restore(record)` 后 audit 同一句仍有效；真正的 session restore 主证据在 `citation-registry.spec.ts`。
- 本报告是**本地库实测；生产未跑全量**。
- 退出码：任一场景不通过 → 1。
