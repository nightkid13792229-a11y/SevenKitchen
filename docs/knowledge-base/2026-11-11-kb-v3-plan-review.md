# 知识库 v3 实施计划 · 独立评审记录

**日期**：2026-11-11
**被审对象**：
- 设计：`docs/knowledge-base/2026-11-11-kb-v3-design.md`
- 计划：`docs/superpowers/plans/2026-11-11-kb-v3-implementation.md`

**评审方式**：独立子 Agent，只读设计与计划（不读代码、不改文件），按老板 A–F 六条约束逐条对照；初评后按 P0 修订，再做一次只读复审。

**最终结论**：**有条件通过**——初评 5 个 P0，修订后全部关闭，无剩余 P0；P1 观察项在计划里保留（部分已修，部分属于执行期验证）。

---

## 一、初评结论

**总裁决：不通过。** 方向（页为原子单位、3 个工具、0 运行时模型调用）成立，但 5 个 P0 未闭环；按初版计划执行会在删除中间态编译红，且调用次数指标不能证明是架构功劳。

### 初评 5 个 P0

| # | 问题 | 位置 | 处置 |
|---|---|---|---|
| P0-1 | Task 8 先删结论层、Task 9 才清 Agent 引用，中间态 `tsc` 会红 | 计划 Task 8/9 | **已改**：顺序改为 Task 8 清 Agent/补剂/citation → Task 9 删结论/健康分析 → Task 10 删旧层；Task 9 加“必须先完成 Task 8” |
| P0-2 | 调用次数由固定 reference caller 自证，不是模型/架构驱动 | 设计 §9、计划 Task 7/11 | **已改**：拆成“结构基准（reference caller，不是模型）”与“Agent 实测（本计划外）”；明确不宣称模型调用次数下降；Agent A/B 要求冻结模型/提示词/业务工具、只换 KB |
| P0-3 | 387 条结论未证明全部删除（docs 审核包/DB 未清零） | 设计 §13、计划 Task 8/9 | **已改**：删除 `review-packet/`、`aaha2014-review.md`；新增 `assert-no-conclusions.ts`（ID + 结论/要点/注意事项正文硬门禁）和 `audit-conclusion-tables.ts`（information_schema 盘点，`--after-drop`） |
| P0-4 | 页图只给路径，模型拿不到图 | 设计 §6.4/§8.2、计划 Task 6/7 | **已改**：`kb_read` 返回 `imageBase64`（最多 5 张/次），`imagePath` 兜底；测试/冒烟断言 base64 以 `/9j/` 开头 |
| P0-5 | 700/root 与 2–3GB 页图的落地路径未闭环 | 设计 §8.2/§11.4、计划 Task 11 | **已改**：生产路径定死 `/var/lib/sevenkitchen/kb/{page-layer,page-images}`；一次性 root job + `chown` + `df` 2×（≥6GB）；删除“首次渲染 <1s”，改为批量渲染、`read` 只读缓存 |

### 初评 P1（择要）

| # | 问题 | 处置 |
|---|---|---|
| P1-1 | `ceil(len/3)` 低估中文 token | **已改**：CJK 1 token/字 + 非 CJK 1 token/4 字符；测试改为中文六字=5 |
| P1-2 | `page.text` 与 `block.text` 重复；非 PDF 单页可能 190 万字 | **已改**：`read` 的 blocks 只给结构/bbox/caption；非 PDF 按 ~3,000 字切伪页 |
| P1-3 | `KbFindHit.kind` / `catalog get` 形状不一致；缺 anchor 解析 | **已改**：kind 统一 `page/table/figure`；`get` 返回 `{sources:[source],toc}`；新增 `parseAnchor` |
| P1-4 | 删除清单/门禁不完整 | **已改**：旧 `kb:*` 脚本全列；加概念级 `git grep` 硬门禁；`|| true` 改为命中即 `exit 1` |
| P1-5 | 冒烟/基准输出路径、负样本、p95 无测法；导入事务 5s 超时 | **已改**：用 `git rev-parse` 定位仓库根；负样本 `vitamin K` 命中则退 `biotin/chromium`；`find` 连跑 20 次记 p95；导入事务 `timeout: 120000` |

---

## 二、复审结论

**P0-A（387 清零）**：关闭。已删审核包/`aaha2014-review`，新增正文级硬门禁与 DB 盘点；门禁命中即失败。

**P0-B（citation 删除清单）**：关闭。Task 8 已明确 2 个 citation 源文件 + 3 个测试；Step 1 先 `git grep` 枚举；`citation-gate.ts` 实际不存在，已注明“不存在的文件不要凭空加”。

**剩余必须改的 P0**：无。

**保留的 P1/执行期验证**：
1. 上线前在类生产机验证 700/root 源目录与 `/var/lib` 产物路径；
2. `read` 5 张 base64 图的响应体积/vision token 在 smoke 里记录（不阻塞）；
3. Agent 实测（模型调用次数 A/B）在接线后由调用方做；本计划不把 reference caller 数字冒充模型调用次数。

---

## 三、A–F 约束逐条对照（最终）

| 约束 | 结论 | 证据 |
|---|---|---|
| **A. 387 条结论全部删除** | **满足** | 代码数据/类型/服务删除；`review-packet/`、`aaha2014-review.md` 删除；`assert-no-conclusions` + DB 盘点硬门禁；验收“仓库+DB 精确 0” |
| **B. 调用次数靠架构，不靠工具/约束/提示词** | **满足** | 设计 §9 拆分结构基准与 Agent 实测；明确不宣称模型调用次数；Agent A/B 冻结模型/提示词/业务工具；计划不加专用工具/约束 |
| **C. 不设计哪些 Agent 访问知识库** | **满足** | 设计 §0/§1.2/§4.2 明确不设计；计划 Task 8 只删旧接线，不新增 Agent 能力/权限/提示词 |
| **D. 共享契约通用，不把食谱/原料当唯二使用者** | **满足** | 契约只按 `collection`/`documentId` 过滤；面向“任意 Agent/服务”；没有 recipe/ingredient 字段 |
| **E. 未上线，可大刀阔斧，不做旧兼容** | **满足** | 决策 6/§11.2 明确旧表直接 drop、无新旧双读；Task 10 有 drop migration |
| **F. 精简、可扩展、快速上线** | **部分满足** | 4 实体/3 工具/0 运行时模型调用；扩展靠策略不加层；17 人日按 2 人约 2 周。剩余：700/root 与 2–3GB 需类生产机验证（执行期） |

---

## 四、实施结果（2026-11-12，Task 1–11 完成后）

- 解析：159/159，失败 0（128 PDF + 24 XML + 6 TXT + 1 EPUB）；
- 入库：`kb_source` 159、`kb_page` 4,183、`kb_block` 48,376、`kb_toc` 604；
- 页图：2,393 张 / 479 MB（110 dpi q78），未进 git；
- 冒烟：9/9 PASS（`docs/knowledge-base/eval/kb-v3-smoke.md`）；
- 结构基准：6/6 OK，1/2/2/1/1/1 次（`docs/knowledge-base/eval/kb-v3-call-benchmark.md`，明确不是模型调用次数）；
- `npx tsc --noEmit`：332 个既有错误（与当前基线一致，v3 文件 0）；全量 `npm test`：3 个既有失败套件/15 用例，无新增；v3/Agent/补剂定向 71 suites / 1,052 tests 全绿；
- 结论清零：`assert-no-conclusions.ts` exit 0；`audit-conclusion-tables.ts --after-drop` exit 0，只剩 4 张 `kb_*`。

**结论：计划已按 P0 修订并执行完成；P1 中“类生产机 700/root 验证”仍建议上线前补一次。**

## 五、评审边界

- 评审只读设计与计划，未执行代码、未跑测试、未连生产库；
- “通过”指计划层面可执行，不代表实现已验收；
- 实现完成后仍需按计划 Task 11 跑 `tsc`、全量测试、真实库冒烟与结构基准。
