# CKD 章节目录与覆盖地图

**用途**：CKD 试点的知识库结构层，不回答临床问题、不替代原文。

## 文件

| 文件 | 内容 |
|---|---|
| `section-catalog.json` | 5 份 CKD 文档的文档/章节级元数据，机器可读 |
| `section-catalog.md` | 同一份目录，给人看 |
| `coverage-map.md` | CKD 主题 → 文档/章节覆盖；列出未覆盖主题 |
| `retrieval-questions.json` | **旧 14 题**：CKD 目录路由验收问题（裸服务/目录层） |
| `retrieval-evaluation.md` | 旧 14 题目录路由验收结果 |
| `docs/knowledge-base/eval/ckd/questions.json` | **新 26 题**：最小图书馆版回归集（走 Agent 工具层，spec v1.1 附录 A） |
| `library-evaluation.md` / `.json` | 新 26 题回归结果（`npm run kb:eval` 生成） |
| `citation-smoke.md` | 5 场景引用冒烟结果（`npm run kb:smoke` 生成） |
| `full-library-decision.md` | 是否扩全库的决策与 v1 范围 |

## 两套评估的分工（不要混用）

| 维度 | `retrieval-evaluation.*`（旧） | `library-evaluation.*`（新） |
|---|---|---|
| 题集 | `retrieval-questions.json`，14 题 | `docs/knowledge-base/eval/ckd/questions.json`，26 题 |
| 测什么 | 目录/章节路由（裸检索服务） | Agent 实际看到的工具返回：节分组、`citationId`、表格摘要 |
| 怎么测 | 直接调检索/目录服务 | 每题一个 `CitationRegistry`，调 `executeTool('search_knowledge_library')`；表格题再用检索返回的 `citationId` 调 `open_knowledge` |
| 判分 | 目录 top-k 是否命中期望章节 | spec v1.1 附录 A：前 3 节命中 / 禁止节 / 负样本 `no_match` 或 0 节 0 表 / 表格命中且按 K 打开 |
| 状态 | 14/14（保留作历史对照） | 26/26（**本地库实测；生产未跑全量**） |

> 结论：**新改动看 `library-evaluation.*`**；`retrieval-evaluation.*` 只作为早期目录路由的历史基线，不再作为 Agent 可用性的验收依据。

## 元数据

- 文档：来源、版本、角色、类型（guideline / textbook / quick reference）、权威性、物种、分期、章节数、段落数；
- 章节：标题、页码、类型（staging / treatment / diagnosis / nutrition / appendix）、物种、分期、主题、段落数。

## 生成

```bash
cd backend
npx ts-node --transpile-only -r dotenv/config -r tsconfig-paths/register \
  scripts/knowledge-base/build-ckd-catalog.ts
```

脚本只读 source layer，不写数据库；生成的文件提交到本目录。

## 26 题工具层回归（`npm run kb:eval`）

```bash
cd backend
npm run kb:eval                 # 跑 26 题并写入 library-evaluation.md/.json
npm run kb:eval -- --no-write   # 只验证，不覆盖已提交的报告（Task 7 / 改动后自检用）
npm run kb:eval -- --check      # --no-write 的别名
npm run kb:eval -- --questions <path>   # 换题集做对照
```

- 题集：`docs/knowledge-base/eval/ckd/questions.json`（26 题；来源见 `docs/knowledge-base/2026-11-09-kb-minimal-library-design.md` 附录 A）。
- 退出码：整体/Stage 3/表格/中文/负样本/对抗/核心表/p95/max 任一条不过 → 1。
- 26 题是**产品外**的质量门禁，运行时不加载；不要把它接进 Agent 运行时。

## 5 场景引用冒烟（`npm run kb:smoke`）

```bash
cd backend
npm run kb:smoke                 # 5 场景 + 写入 citation-smoke.md
npm run kb:smoke -- --no-write   # 只打印，不覆盖报告
npm run kb:smoke -- --out <path> # 写到指定路径（值不能为空；父目录不存在会自动创建）
```

- 前 4 个场景：检索 → 取 top 节第一段 `citationId` → `open_knowledge({ citationId })` → 断言节里仍有该段、K 号一致、`CitationRegistry.audit` 引用有效；
- 第 5 个场景（`CKD dog vitamin K target`）：标签是**「未覆盖营养素对照」**（它仍在 CKD 检索范围内，只是 CKD 语料没有覆盖 vitamin K），必须 `no_match` 且 0 节 0 表；
- 期望：5/5 通过、无效引用 0。
- 附加诊断（**不计入 5/5**）：非 CKD `documentIds`/`sourceIds` 被 `OUT_OF_SCOPE` 拒绝；表格按 K 复用/回源；`new CitationRegistry().restore(record)` 后 audit 仍有效。真正的会话恢复主证据在 `citation-registry.spec.ts`。
- 报告是**本地库实测；生产未跑全量**。

## 旧 14 题目录路由（历史对照）

```bash
cd backend
npx ts-node --transpile-only -r dotenv/config -r tsconfig-paths/register \
  scripts/knowledge-base/evaluate-ckd-routing.ts
```

验收只测目录/检索，不测 Agent；`expectNoSource` 的碘问题用于验证“知识库没覆盖”能被识别。**这条路径已被 `npm run kb:eval` 取代，保留只为对照。**

## 已知限制

- 主题是从章节标题/正文关键词统计出来的，只表示“这段文字提到过”，不表示“讲清楚了”；
- 物种/分期是从标题和正文判断的；跨物种/跨分期的章节会标 `both` 或列出多个分期；
- 碘在 5 份 CKD 文档中没有出现（覆盖地图“未覆盖主题”），这是 **知识库来源缺口**，不是食物营养数据问题；
- 权威性只区分 guideline / textbook / reference，**不做临床冲突裁决**；
- 表格没有 `section_id`（文档级命中），5 张核心表页码暂为 `null`，留待 v2 补导入。
