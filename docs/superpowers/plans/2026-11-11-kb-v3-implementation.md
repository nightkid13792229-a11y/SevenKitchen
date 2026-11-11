# 知识库 v3 极简架构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把知识库从“节/段/表格 JSON/结论层”的检索模块，重构成“书 → 页 → 块 → 目录”的极简原文服务；只保留 `kb_catalog` / `kb_find` / `kb_read` 三个动作，删除 387 条结论和旧运行时。

**Architecture:** 4 个实体（`kb_source` / `kb_page` / `kb_block` / `kb_toc`）+ 页/块全文索引 + 3 个通用动作。页是原子单位：一次 `read` 默认返回 3–5 页（可按预算读整章）、表/图块、页图和锚点；结构基准的调用次数靠“一次读多页”下降，不靠加工具、加约束或改提示词；它不是模型调用次数。运行时 0 次模型调用；表格不转录、图片不裁剪，模型直接看页图。

**Tech Stack:** NestJS + TypeScript + Prisma/PostgreSQL（`tsvector` + `pg_trgm`）+ PyMuPDF（Python 解析/渲染）+ Jest + ts-node。

**Spec:** `docs/knowledge-base/2026-11-11-kb-v3-design.md`

**Review Record:** `docs/knowledge-base/2026-11-11-kb-v3-plan-review.md`（独立评审：初评 5 个 P0，修订后全部关闭，剩余 P0 无）

---

## Global Constraints

- **只在工位改代码**：从 `origin/main` 开工位；主工作区只读，不提交、不 `git add`。
- **提交只在工位**：每个 Task 只 `git add` 本任务 Files 列出的路径，再 `bash scripts/session.sh commit -m "<message>"`；不要 `--all`、不要 `git add -A`。
- **只改 `backend/` 和 `docs/`**：不碰 `miniapp/`、`admin-web/`。
- **数据库只经 Prisma/迁移**：不手写 SQL 改库；迁移 SQL 必须提交。
- **不做结论/摘要/分级/分诊/剂量/疾病规则/临床词表/疾病路由**：代码里出现这些概念即视为越界。
- **页是唯一原子单位**：不新增 `section` / `paragraph` / `table JSON` / `figure crop` 实体。
- **只有 3 个工具**：`kb_catalog` / `kb_find` / `kb_read`；不加 `open_*`、`resolve`、`search_*`。
- **不做 Agent 接入设计**：不新增 Agent 权限/角色/提示词；旧 Agent 的知识工具只做删除，不做替换设计。
- **运行时 0 次模型调用**：解析、索引、读取都不调用 LLM；不做 embedding/reranker。
- **不做旧接口兼容**：旧表、旧服务、旧控制器、旧脚本、旧测试直接删除。
- **生成物不进 git**：`docs/knowledge-base/page-layer/`、`docs/knowledge-base/page-images/` 加入 `.gitignore`；只提交解析器、导入器、fixture。
- **测试命令**：`cd backend && npm test -- <path>`；类型检查 `npx tsc --noEmit`。联调期间不要跑 `npm run build`（会删 `dist`，弄死本机后端）。
- **tsc 基线**：2026-11-11 在干净 `669fb492` 上 `npx tsc --noEmit` 有 **333 个既有错误**；Task 8 删旧 citation 测试后为 **332**。以每个 Task 开始时的当前数为基线；本计划的类型验收 = **新增/改动文件 0 错误**、全仓错误数与基线一致；不要声称“全仓 tsc 绿”。
- **测试基线**：2026-11-11 全量 `npm test` 有 **3 个既有失败套件 / 15 个失败用例**（`custom-recipe-aftersale`、`supplement-order`、`standard-ingredient-import`，日期/报价相关），与本计划无关。验收 = **v3 定向测试全绿 + 全量测试失败集合与基线一致（不新增）**；不要声称“全量 npm test 全绿”。
- **测试不许只有注释**：每个新增 `it` 至少一个 `expect`；TDD 的“先失败”必须看到真实断言失败。
- **merge 在工位执行**：`bash scripts/session.sh merge` 必须在 worktree 根目录跑。

## Review Focus

1. **扫描件/图片型页**：`text` 为空、`imagePath` 仍在；`kb_read` 必须能返回该页，`kb_find` 0 命中不能崩、不能谎称“未覆盖”。
2. **表格检测漏判**：`find_tables()` 可能漏掉表；页图必须始终存在，`kb_read` 不依赖 `kind=table` 才给图。
3. **预算边界**：单页文本超过 `budgetTokens` 时，至少返回一页 + `nextCursor`，不能返回空页或无限循环；`nextCursor` 必须能继续读完。
4. **无目录文档**：`doc.get_toc()` 为空时，`kb_catalog` 仍要返回一条“全文 1..N”，`kb_read` 按页码可读。
5. **中文/空查询/越界**：中文查英文页允许 0 命中，但必须返回 `hits: []` + `searched`，不得出现“未覆盖”；空 query 返回 `INVALID_ARGUMENT`；页码越界返回 `PAGE_OUT_OF_RANGE`。
6. **删除完整性**：`git grep` 不再命中旧服务/旧工具/387 条结论；健康分析明确返回不可用；`npx tsc --noEmit` 无新增错误、全量 `npm test` 失败集合与基线一致。

---

## 文件结构

```text
backend/
  prisma/
    schema.prisma                                  # +4 个 kb_* 模型；后续删旧 source_* 模型
    migrations/20261111150000_kb_v3_page_layer/    # 建表 + 索引
    migrations/20261112120000_drop_legacy_kb/       # 删旧表（Task 10）
  src/application/knowledge-v3/
    knowledge-v3.types.ts                          # 对外类型/入参/返回
    knowledge-v3.errors.ts                         # KnowledgeToolError + 错误码
    knowledge-v3.anchors.ts                        # anchor/cursor/token 估算
    knowledge-catalog.service.ts                   # 找书 + 目录
    knowledge-find.service.ts                      # 找页 + 索引查询
    knowledge-read.service.ts                      # 读页 + 预算/游标
    page-image.service.ts                          # 页图路径解析
    knowledge-gateway.service.ts                   # 3 个动作的校验/编排
    knowledge-v3.tools.ts                          # 3 个工具定义 + execute
  scripts/knowledge-v3/
    import-page-layer.ts                           # JSON → DB，幂等
    smoke.ts                                       # 真实库冒烟
    benchmark-calls.ts                             # 结构基准：调用次数
    assert-no-conclusions.ts                       # 仓库内 387 条正文清零硬门禁
    audit-conclusion-tables.ts                     # DB 结论表/锚点表盘点
  tests/application/knowledge-v3/
    anchors.spec.ts
    page-layer.mapper.spec.ts
    catalog.service.spec.ts
    find.service.spec.ts
    read.service.spec.ts
    gateway.spec.ts
    tools-contract.spec.ts
  tests/fixtures/kb-v3/
    sample.page-layer.json
docs/knowledge-base/
  tools/build-page-layer.py                        # PDF/TXT → page-layer JSON
  tools/render-page-images.py                      # PDF 页 → JPEG
  tools/test-build-page-layer.py                   # 无 pytest 的自检脚本
  2026-11-11-kb-v3-design.md                       # 已存在
  RUNBOOK-kb-v3.md                                 # Task 11
  eval/kb-v3-smoke.md                              # Task 11 生成
  eval/kb-v3-call-benchmark.md                     # Task 11 生成
```

---

## Phase 0：基线与工位

- [ ] **Step 1: 开工位**

Run:
```bash
cd /Users/zhaochen/Documents/SevenKitchen
bash scripts/session.sh start "知识库 v3 极简架构"
```
Expected: 打印 worktree 路径、分支 `task/20261111-kb-v3`、端口。后续命令都在该 worktree 根目录执行。

- [ ] **Step 2: 记录基线**

Run:
```bash
cd backend
npx tsc --noEmit
npm test -- tests/application/knowledge-base tests/application/health/health-analysis.service.spec.ts
```
Expected: 记录 `npm test` 基线（3 个既有失败套件/15 个失败用例，见 Global Constraints）与 `npx tsc --noEmit` 的 332 个既有错误（初始 333，Task 8 后 332）；后续只对自己新增的错误/失败负责。

- [ ] **Step 3: 确认旧知识库没有真实流量**

Run:
```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/knowledge-base/knowledge-usage-report.ts
```
Expected: 最近 7 天真实调用为 0 或仅评测数据；如果有真实调用，停下来找老板确认再删。

- [ ] **Step 4: 确认设计与计划已在分支**

Run:
```bash
ls docs/knowledge-base/2026-11-11-kb-v3-design.md
ls docs/knowledge-base/assets/kb-v3-architecture.png
ls docs/superpowers/plans/2026-11-11-kb-v3-implementation.md
```
Expected: 三个文件都存在。若从 `main` 新开工位，先把这三份文档提交进工位，再开始 Task 1。

- [ ] **Step 5: 确认工作区干净**

Run: `git status --short`
Expected: 只有本计划/设计文档；没有主工作区改动。

---

## Task 1: 4 个实体、迁移、跨层工具函数

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261111150000_kb_v3_page_layer/migration.sql`
- Create: `backend/src/application/knowledge-v3/knowledge-v3.types.ts`
- Create: `backend/src/application/knowledge-v3/knowledge-v3.errors.ts`
- Create: `backend/src/application/knowledge-v3/knowledge-v3.anchors.ts`
- Test: `backend/tests/application/knowledge-v3/anchors.spec.ts`

**Interfaces:**
- Produces:
  - `pageAnchor(sourceId: string, pageNo: number): string`
  - `blockAnchor(sourceId: string, pageNo: number, orderIndex: number): string`
  - `estimateTokens(text: string): number`
  - `encodeReadCursor(cursor: ReadCursor): string`
  - `decodeReadCursor(raw: string): ReadCursor`
  - `KnowledgeToolError` with `code: KnowledgeToolErrorCode`
  - 类型：`KbSourceSummary`、`KbTocEntry`、`KbCatalogResult`、`KbFindHit`、`KbFindResult`、`KbBlock`、`KbPage`、`KbReadResult`、`KbCatalogArgs`、`KbFindArgs`、`KbReadArgs`、`KnowledgeToolResult<T>`

- [ ] **Step 1: 写失败测试**

`backend/tests/application/knowledge-v3/anchors.spec.ts`：

```ts
import {
  blockAnchor,
  parseAnchor,
  decodeReadCursor,
  encodeReadCursor,
  estimateTokens,
  pageAnchor,
} from '../../../src/application/knowledge-v3/knowledge-v3.anchors';

describe('knowledge v3 anchors/cursor', () => {
  it('builds stable page and block anchors', () => {
    expect(pageAnchor('sacn5-chapters-SACN5-37', 22)).toBe(
      'sacn5-chapters-SACN5-37/p22',
    );
    expect(blockAnchor('sacn5-chapters-SACN5-37', 22, 3)).toBe(
      'sacn5-chapters-SACN5-37/p22#b0003',
    );
  });

  it('parses page and block anchors', () => {
    expect(parseAnchor('doc-1/p22')).toEqual({ documentId: 'doc-1', pageNo: 22 });
    expect(parseAnchor('doc-1/p22#b0003')).toEqual({
      documentId: 'doc-1', pageNo: 22, blockOrder: 3,
    });
    expect(() => parseAnchor('bad')).toThrow('INVALID_ARGUMENT');
  });

  it('round-trips a read cursor', () => {
    const cursor = {
      documentId: 'doc-1',
      nextPage: 7,
      endPage: 21,
      includeImages: true,
      budgetTokens: 20000,
    };
    expect(decodeReadCursor(encodeReadCursor(cursor))).toEqual(cursor);
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeReadCursor('not-base64')).toThrow('INVALID_CURSOR');
  });

  it('estimates tokens conservatively', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdef')).toBe(2);
    expect(estimateTokens('中文六个字')).toBe(5);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-v3/anchors.spec.ts`
Expected: FAIL，`Cannot find module ...knowledge-v3.anchors`。

- [ ] **Step 3: 实现类型、错误、anchors**

`knowledge-v3.types.ts` 至少包含：

```ts
export type KnowledgeToolName = 'kb_catalog' | 'kb_find' | 'kb_read';

export interface KbSourceSummary {
  id: string;
  collection: string;
  title: string;
  publisher: string | null;
  version: string | null;
  publishedYear: number | null;
  status: string | null;
  license: string | null;
  pageCount: number;
  hasTextLayer: boolean;
}

export interface KbTocEntry {
  id: string;
  title: string;
  level: number;
  pageFrom: number;
  pageTo: number;
}

export interface KbCatalogResult {
  sources: KbSourceSummary[];
  toc?: KbTocEntry[];
}

export interface KbFindHit {
  documentId: string;
  pageNo: number;
  chapter: string | null;
  blockId: string | null;
  kind: 'page' | 'table' | 'figure';
  snippet: string;
  score: number;
  anchor: string;
}

export interface KbFindResult {
  hits: KbFindHit[];
  searched: { documents: number; pages: number };
}

export type KbBlockKind = 'heading' | 'paragraph' | 'table' | 'figure' | 'footnote';

export interface KbBbox { x0: number; y0: number; x1: number; y1: number; }

export interface KbBlock {
  id: string;
  kind: KbBlockKind;
  bbox: KbBbox;
  text: string | null;
  caption: string | null;
  anchor: string;
}

export interface KbPage {
  pageNo: number;
  text: string;
  blocks: KbBlock[];
  imagePath: string | null;
  imageMime: 'image/jpeg' | null;
  imageBase64: string | null;
  anchor: string;
}

export interface KbReadResult {
  documentId: string;
  pages: KbPage[];
  nextCursor: string | null;
  version: string;
}

export interface KbCatalogArgs { collection?: string; documentId?: string; }
export interface KbFindArgs {
  query: string;
  collections?: string[];
  documentIds?: string[];
  limit?: number;
}
export interface KbReadArgs {
  documentId: string;
  pageFrom?: number;
  pageTo?: number;
  tocId?: string;
  includeImages?: boolean;
  budgetTokens?: number;
  cursor?: string;
}

export interface ReadCursor {
  documentId: string;
  nextPage: number;
  endPage: number;
  includeImages: boolean;
  budgetTokens: number;
}

export type KnowledgeToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

`knowledge-v3.errors.ts`：

```ts
export type KnowledgeToolErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_CURSOR'
  | 'SOURCE_NOT_FOUND'
  | 'PAGE_OUT_OF_RANGE'
  | 'TOC_NOT_FOUND'
  | 'IMAGE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class KnowledgeToolError extends Error {
  constructor(
    public readonly code: KnowledgeToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'KnowledgeToolError';
  }
}
```

`knowledge-v3.anchors.ts`：按 `sourceId/p{pageNo}`、`sourceId/p{pageNo}#b{order:4}` 生成；`parseAnchor` 用 `^([^/]+)/p(\d+)(?:#b(\d+))?$`，非法抛 `INVALID_ARGUMENT`；cursor 用 `Buffer.from(JSON.stringify(cursor)).toString('base64url')`，解码失败抛 `INVALID_CURSOR`；`estimateTokens`：CJK 字符按 1 token/字，非 CJK 按 1 token/4 字符，向上取整（`cjk + ceil(nonCjk/4)`）；中英混排不会低估。

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd backend && npm test -- tests/application/knowledge-v3/anchors.spec.ts`
Expected: PASS。

- [ ] **Step 5: 加 Prisma 模型与迁移**

在 `schema.prisma` 加 4 个模型（字段按设计 §5）：

```prisma
model KbSource {
  id           String   @id @db.VarChar(120)
  collection   String   @db.VarChar(40)
  title        String   @db.VarChar(500)
  publisher    String?  @db.VarChar(200)
  version      String?  @db.VarChar(80)
  publishedYear Int?    @map("published_year")
  status       String?  @db.VarChar(20)
  license      String?  @db.VarChar(200)
  checksum     String   @db.VarChar(64)
  archivePath  String   @map("archive_path") @db.VarChar(500)
  pageCount    Int      @map("page_count")
  hasTextLayer Boolean  @map("has_text_layer") @default(true)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  pages KbPage[]
  toc   KbToc[]

  @@index([collection])
  @@map("kb_source")
}

model KbPage {
  id             String    @id @db.VarChar(160)
  sourceId       String    @map("source_id") @db.VarChar(120)
  pageNo         Int       @map("page_no")
  text           String    @db.Text
  charCount      Int       @map("char_count")
  width          Float?
  height         Float?
  imagePath      String?   @map("image_path") @db.VarChar(500)
  imageRenderedAt DateTime? @map("image_rendered_at")

  source KbSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  blocks KbBlock[]

  @@unique([sourceId, pageNo])
  @@index([sourceId])
  @@map("kb_page")
}

model KbBlock {
  id         String  @id @db.VarChar(180)
  pageId     String  @map("page_id") @db.VarChar(160)
  kind       String  @db.VarChar(20)
  bbox       Json
  text       String? @db.Text
  caption    String? @db.Text
  orderIndex Int     @map("order_index")

  page KbPage @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId])
  @@map("kb_block")
}

model KbToc {
  id         String @id @db.VarChar(180)
  sourceId   String @map("source_id") @db.VarChar(120)
  title      String @db.VarChar(500)
  level      Int    @default(1)
  pageFrom   Int    @map("page_from")
  pageTo     Int    @map("page_to")
  orderIndex Int    @map("order_index")

  source KbSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@index([sourceId])
  @@map("kb_toc")
}
```

迁移 SQL 至少包含建表、唯一键、普通索引，以及：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX kb_page_text_tsv_idx ON kb_page USING GIN (to_tsvector('simple', text));
CREATE INDEX kb_page_text_trgm_idx ON kb_page USING GIN (text gin_trgm_ops);
CREATE INDEX kb_block_text_tsv_idx ON kb_block USING GIN (to_tsvector('simple', coalesce(text,'') || ' ' || coalesce(caption,'')));
CREATE INDEX kb_block_text_trgm_idx ON kb_block USING GIN ((coalesce(text,'') || ' ' || coalesce(caption,'')) gin_trgm_ops);
```

Run:
```bash
cd backend
npx prisma validate
npx prisma migrate dev --name kb_v3_page_layer
npx prisma generate
```
Expected: migration 应用成功；`kb_source/kb_page/kb_block/kb_toc` 四张表存在。

- [ ] **Step 6: 类型检查 + 提交**

Run:
```bash
cd backend && npx tsc --noEmit
cd .. && git add backend/prisma/schema.prisma backend/prisma/migrations/20261111150000_kb_v3_page_layer backend/src/application/knowledge-v3/knowledge-v3.types.ts backend/src/application/knowledge-v3/knowledge-v3.errors.ts backend/src/application/knowledge-v3/knowledge-v3.anchors.ts backend/tests/application/knowledge-v3/anchors.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): v3 四实体模型与锚点/游标"
```

---

## Task 2: 页级解析器（PDF/TXT → page-layer JSON）

**Files:**
- Create: `docs/knowledge-base/tools/build-page-layer.py`
- Create: `docs/knowledge-base/tools/render-page-images.py`
- Create: `docs/knowledge-base/tools/test-build-page-layer.py`
- Modify: `docs/knowledge-base/.gitignore`（加 `page-layer/`、`page-images/`）

**Interfaces:**
- Produces JSON：
```json
{
  "source": {
    "id": "doc-id", "collection": "SACN5", "title": "…",
    "publisher": "…", "version": "…", "publishedYear": 2010,
    "status": "unknown", "license": "internal", "checksum": "sha256",
    "archivePath": "sacn5/…pdf", "pageCount": 46, "hasTextLayer": true
  },
  "pages": [{
    "pageNo": 1, "text": "…", "charCount": 1200,
    "width": 595.0, "height": 842.0,
    "imagePath": "doc-id/p0001.jpg",
    "blocks": [{
      "id": "doc-id-p0001-b0001", "kind": "paragraph",
      "bbox": {"x0": 50, "y0": 60, "x1": 540, "y1": 120},
      "text": "…", "caption": null, "orderIndex": 1
    }]
  }],
  "toc": [{"id": "doc-id-toc-1", "title": "第37章", "level": 1,
           "pageFrom": 1, "pageTo": 46, "orderIndex": 1}]
}
```
- CLI：`python3 docs/knowledge-base/tools/build-page-layer.py --archive <dir> --out <dir> [--ids-from <dir>] [--only <docId>] [--force]`
- `render-page-images.py --archive <dir> --layer <dir> --out <dir> [--only <docId>] [--dpi 110]`

- [ ] **Step 1: 写失败的自检脚本**

`test-build-page-layer.py` 用 `fitz` 生成 3 页 PDF：第 1 页标题 + 正文，第 2 页画一个 2×2 表格线，第 3 页空白；设置 TOC；然后调用解析器，断言：

```python
assert data["source"]["pageCount"] == 3
assert "CKD" in data["pages"][0]["text"]
assert any(b["kind"] == "table" for b in data["pages"][1]["blocks"])
assert len(data["toc"]) == 1
assert data["toc"][0]["pageFrom"] == 1
assert data["toc"][0]["pageTo"] == 3
```

再生成一个 `.txt` 文件，断言 `pageCount == 1` 且 `hasTextLayer is True`；最后断言缺失文件以非 0 退出。

Run: `python3 docs/knowledge-base/tools/test-build-page-layer.py`
Expected: FAIL（脚本不存在）。

- [ ] **Step 2: 实现解析器**

要点：

- `fitz.open(path)`；`doc.get_toc()` 返回 `[level, title, page]`：`pageFrom = page`，`pageTo = 下一条的 page - 1`（最后一条到 `pageCount`）；为空时写一条“全文 1..N”；
- 页文本 `page.get_text("text")`；块用 `page.get_text("dict")["blocks"]`，按行合并成块，保留 bbox；
- 表：`page.find_tables().tables`，每张表加一个 `kind="table"` 块（bbox 来自 `table.bbox`），不取行列；**find_tables 是线检测，borderless 表（如 SACN5 37 的 Table 37-9）可能检测不到，这是已知限制：页图仍在，`read` 仍能看表；不为了出块去猜外框**；表题取 bbox 上方最近文本块的首行，只有匹配 `Table|TABLE` 才写入 `caption`，否则 null；
- 图：`page.get_images(full=True)` + `page.get_image_rects(xref)`，加 `kind="figure"` 块；图注取 bbox 下方最近文本块首行，只有匹配 `Figure|FIGURE` 才写入 `caption`，否则 null；
- 块 ID：`{sourceId}-p{pageNo:04d}-b{order:04d}`；页 ID：`{sourceId}-p{pageNo:04d}`；
- 非 PDF：`.txt` 直读；`.xml`/`.html` 用正则去标签；`.epub` 用 `zipfile` 读 XHTML；按 ~3,000 字切伪页（优先段落/句号边界），`hasTextLayer=true`，`imagePath=null`；`.docx` 等未支持格式明确报错并跳过，不静默漏；
- PDF 页：`imagePath = "{sourceId}/p{pageNo:04d}.jpg"`（与渲染器输出一致）；渲染器还没跑时文件不存在，`read` 会返回 `null`；
- `collection`：默认取归档相对路径的第一段并大写（`sacn5/...` → `SACN5`）；允许 `--collection` 覆盖；
- `status` 默认 `unknown`（没有可靠来源状态就不猜 current）；`license` 默认 `internal`；`title` 依次取 manifest 说明 / PDF metadata title / 文件名；`publisher` 取 collection；`version`/`publishedYear` 没有可靠来源就留 `null`；
- checksum：优先用 `manifest.csv` 的 SHA256；没有就计算文件 SHA256；两者都有但不一致 → 报错，不导入；
- 从归档根目录的 `manifest.csv` 读 `来源ID / 相对路径 / SHA256 / 说明`；**`source.id` 用 `--ids-from` 文件名（或相对路径去扩展名）的稳定 docId**（如 `sacn5-chapters-SACN5-37`），不要用 manifest 的 `来源ID` —— 后者是归集键，159 行只有 22 个唯一值，照用会让 69 本书撞 id；manifest 的 `来源ID` 只用于 collection/来源归组；
- `--ids-from docs/knowledge-base/source-layer`：只解析该目录文件名对应的 159 个 docId（跳过 `_stats.json` / `_expected-counts.json` / `_excluded-README.json` 这类下划线文件），跳过 README/MANIFEST/重复文件；默认就用这个白名单，数量不是 159 时先停；
- 输出一个 `<sourceId>.json`；`--force` 覆盖，否则跳过已存在。
- `render-page-images.py`：遍历 PDF 页，`page.get_pixmap(dpi=110)`，JPEG 质量 78，写 `<out>/<sourceId>/p0001.jpg`；已存在跳过；
- 权限：解析/渲染脚本由有源目录读权限的用户（root/受权组）跑；产出目录 `chown` 给后端运行用户；后端只读 DB + 页图，不直接读 700 源目录。

- [ ] **Step 3: 跑自检，确认通过**

Run:
```bash
python3 docs/knowledge-base/tools/test-build-page-layer.py
```
Expected: PASS，打印页数/块数/表块数，退出码 0。

- [ ] **Step 4: 对一份真实 PDF 试跑**

Run:
```bash
python3 docs/knowledge-base/tools/build-page-layer.py \
  --archive "$HOME/Documents/SevenKitchen-knowledge-sources" \
  --out /tmp/kb-v3-layer \
  --only sacn5-chapters-SACN5-37 --force
```
Expected: `/tmp/kb-v3-layer/sacn5-chapters-SACN5-37.json` 存在；`jq '.source.pageCount, (.pages|length), (.toc|length)'` 合理；第 17 页附近有 `kind=table` 块。

- [ ] **Step 5: 提交**

```bash
git add docs/knowledge-base/tools/build-page-layer.py docs/knowledge-base/tools/render-page-images.py docs/knowledge-base/tools/test-build-page-layer.py docs/knowledge-base/.gitignore
bash scripts/session.sh commit -m "feat(knowledge): 页级解析与页图渲染"
```

---

## Task 3: page-layer → DB 导入（幂等）

**Files:**
- Create: `backend/src/application/knowledge-v3/page-layer.mapper.ts`
- Create: `backend/scripts/knowledge-v3/import-page-layer.ts`
- Create: `backend/tests/fixtures/kb-v3/sample.page-layer.json`
- Test: `backend/tests/application/knowledge-v3/page-layer.mapper.spec.ts`

**Interfaces:**
- `validatePageLayerFile(raw: unknown): PageLayerFile`，非法时抛 `INVALID_ARGUMENT`；
- `mapPageLayerToRows(file: PageLayerFile): {
    source: Prisma.KbSourceCreateInput;
    pages: Prisma.KbPageCreateManyInput[];
    blocks: Prisma.KbBlockCreateManyInput[];
    toc: Prisma.KbTocCreateManyInput[];
  }`；
- CLI：`import-page-layer.ts --dir <dir> [--only <id>] [--dry-run]`。

- [ ] **Step 1: 写失败测试**

断言：

```ts
const file = validatePageLayerFile(fixture);
expect(file.source.pageCount).toBe(2);
expect(file.pages).toHaveLength(2);
expect(file.pages[0].blocks[0].id).toBe('doc-1-p0001-b0001');
expect(() => validatePageLayerFile({ ...fixture, pages: [] })).toThrow('INVALID_ARGUMENT');
expect(() => validatePageLayerFile({
  ...fixture,
  pages: [fixture.pages[0], fixture.pages[0]],
})).toThrow('INVALID_ARGUMENT');
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-v3/page-layer.mapper.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 mapper 与导入脚本**

- `validatePageLayerFile` 校验：source.id、pageCount、pages 数量/页码唯一、blocks id 唯一、toc 页码范围；
- `mapPageLayerToRows` 生成确定性的页/块/目录行；页 ID 用 `{source.id}-p{pageNo:04d}`，块 ID 用 parser 给的值；
- 导入脚本：读目录下 `*.json`；每个文件 `prisma.$transaction(..., { timeout: 120000 })`（5k 块/大文档不能按默认 5s）：
  - `deleteMany({ where: { id: source.id } })`（级联删 pages/blocks/toc）；
  - `create` source；再按 **200 页/批** `createMany` pages（页 ID 是确定性的）；再按 **1,000 块/批** `createMany` blocks；最后 `createMany` toc；不要把一个 5,000 块的大文档一次性嵌套；
  - `--dry-run` 只校验不写；
  - `--only` 过滤；
  - 失败时打印文件与错误，退出码 1；
  - 结束打印 `imported/skipped/failed`。

- [ ] **Step 4: 跑测试 + dry-run**

Run:
```bash
cd backend
npm test -- tests/application/knowledge-v3/page-layer.mapper.spec.ts
npx ts-node --transpile-only -r tsconfig-paths/register scripts/knowledge-v3/import-page-layer.ts --dir tests/fixtures/kb-v3 --dry-run
```
Expected: PASS；dry-run 打印 1 个文件通过，不写库。

- [ ] **Step 5: 提交**

```bash
git add backend/src/application/knowledge-v3/page-layer.mapper.ts backend/scripts/knowledge-v3/import-page-layer.ts backend/tests/fixtures/kb-v3/sample.page-layer.json backend/tests/application/knowledge-v3/page-layer.mapper.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): page-layer 导入与校验"
```

---

## Task 4: `kb_catalog`（找书 + 目录）

**Files:**
- Create: `backend/src/application/knowledge-v3/knowledge-catalog.service.ts`
- Test: `backend/tests/application/knowledge-v3/catalog.service.spec.ts`

**Interfaces:**
```ts
class KnowledgeCatalogService {
  constructor(private readonly prisma: PrismaService) {}
  list(collection?: string): Promise<KbSourceSummary[]>;
  get(documentId: string): Promise<KbCatalogResult>;
}
```
- `get` 返回 `{ sources: [source], toc }`，与 `catalog` 工具输出同形状；
- `documentId` 与 `collection` 同时给时，`documentId` 优先，`collection` 忽略；
- 找不到 → `KnowledgeToolError('SOURCE_NOT_FOUND')`。

- [ ] **Step 1: 写失败测试**

用 mock Prisma：

```ts
const prisma = {
  kbSource: {
    findMany: jest.fn().mockResolvedValue([{
      id: 'doc-1', collection: 'SACN5', title: '...', publisher: null,
      version: null, publishedYear: null, status: 'current', license: null,
      pageCount: 2, hasTextLayer: true,
    }]),
    findUnique: jest.fn().mockResolvedValue({
      id: 'doc-1', collection: 'SACN5', title: '...', pageCount: 2,
      hasTextLayer: true, toc: [{ id: 't1', title: '全文', level: 1,
        pageFrom: 1, pageTo: 2, orderIndex: 1 }],
    }),
  },
};
```
断言 `list` 返回 1 条；`list('SACN5')` 传 where；`get` 返回 toc；`get('missing')` reject `SOURCE_NOT_FOUND`。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-v3/catalog.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现服务**

- `list`：`findMany({ where: collection ? { collection } : undefined, orderBy: [{ collection:'asc' }, { id:'asc' }] })`；
- `get`：`findUnique({ where:{id}, include:{toc:{orderBy:{orderIndex:'asc'}}} })`；返回 `{sources:[source], toc}`；无记录抛错。

- [ ] **Step 4: 跑测试 + 提交**

Run: `cd backend && npm test -- tests/application/knowledge-v3/catalog.service.spec.ts`
Expected: PASS。

```bash
git add backend/src/application/knowledge-v3/knowledge-catalog.service.ts backend/tests/application/knowledge-v3/catalog.service.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): kb_catalog 服务"
```

---

## Task 5: `kb_find`（找页 + 索引）

**Files:**
- Create: `backend/src/application/knowledge-v3/knowledge-find.service.ts`
- Test: `backend/tests/application/knowledge-v3/find.service.spec.ts`

**Interfaces:**
```ts
class KnowledgeFindService {
  constructor(private readonly prisma: PrismaService) {}
  find(args: KbFindArgs): Promise<KbFindResult>;
}
```
- 空 query / limit 越界 → `INVALID_ARGUMENT`；
- 0 命中 → `{ hits: [], searched }`，**不返回 `no_match`**。

- [ ] **Step 1: 写失败测试**

测试 `makeSnippet`、`isCjkQuery`（从服务文件导出）和服务：

```ts
expect(makeSnippet('...phosphorus 0.2-0.5% DM...', 'phosphorus')).toContain('phosphorus');
expect(isCjkQuery('犬 磷 目标')).toBe(true);
expect(isCjkQuery('CKD phosphorus')).toBe(false);

const prisma = { $queryRaw: jest.fn().mockResolvedValue([
  { source_id: 'doc-1', page_no: 17, text: 'Table 37-9 phosphorus 0.2-0.5',
    block_id: null, kind: 'page', score: 0.9 },
]), kbSource: { count: jest.fn().mockResolvedValue(8) },
   kbPage: { count: jest.fn().mockResolvedValue(857) } };
const result = await service.find({ query: 'phosphorus' });
expect(result.hits[0]).toMatchObject({ documentId: 'doc-1', pageNo: 17,
  anchor: 'doc-1/p17' });
expect(result.searched).toEqual({ documents: 8, pages: 857 });
```
再断言空 query 抛 `INVALID_ARGUMENT`，0 命中返回 `hits: []` 且没有 `no_match` 字段。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-v3/find.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现服务**

- 英文查询：
```sql
SELECT p.source_id, p.page_no, p.text, NULL::text AS block_id,
       'text'::text AS kind,
       ts_rank_cd(to_tsvector('simple', p.text),
                  websearch_to_tsquery('simple', $1)) AS score
FROM kb_page p
JOIN kb_source s ON s.id = p.source_id
WHERE ($2::text[] IS NULL OR s.collection = ANY($2))
  AND ($3::text[] IS NULL OR p.source_id = ANY($3))
  AND to_tsvector('simple', p.text) @@ websearch_to_tsquery('simple', $1)
ORDER BY score DESC, p.page_no ASC
LIMIT $4
```
- 中文/CJK 兜底：`p.text ILIKE '%' || $1 || '%'`（或 `similarity(p.text,$1) > 0.05`），按 `page_no` 排序；
- 表/图标题命中：再查 `kb_block`（`kind IN ('table','figure')`，`caption/text ILIKE`），返回 `block_id` 与 `kind`；
- 合并去重：同一 `source_id + page_no` 只留最高分；总数 ≤ `limit`；页命中 `kind='page'`，表/图命中 `kind='table'|'figure'`；
- `snippet`：取命中词前后 160 字；没有命中词取前 160 字；
- `searched`：按过滤条件 `count` 文档/页；
- `chapter`：可按 `kb_toc` 页范围反查，查不到给 `null`（不在本任务硬性要求；实现时用一次 `findFirst`）。

- [ ] **Step 4: 跑测试 + 提交**

Run: `cd backend && npm test -- tests/application/knowledge-v3/find.service.spec.ts`
Expected: PASS。

```bash
git add backend/src/application/knowledge-v3/knowledge-find.service.ts backend/tests/application/knowledge-v3/find.service.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): kb_find 页级检索"
```

---

## Task 6: `kb_read`（读页 + 预算/游标/页图）

**Files:**
- Create: `backend/src/application/knowledge-v3/page-image.service.ts`
- Create: `backend/src/application/knowledge-v3/knowledge-read.service.ts`
- Test: `backend/tests/application/knowledge-v3/read.service.spec.ts`

**Interfaces:**
```ts
class PageImageService {
  constructor(private readonly prisma: PrismaService) {}
  resolve(documentId: string, pageNo: number): Promise<{
    absolutePath: string; mime: 'image/jpeg';
  } | null>;
}

class KnowledgeReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: PageImageService,
  ) {}
  read(args: KbReadArgs): Promise<KbReadResult>;
}
```
- `budgetTokens` 默认 20,000，最大 200,000；`<1` 或非数字 → `INVALID_ARGUMENT`；至少返回 1 页；
- `includeImages` 默认 true（PDF 页都有图）；`false` 时 `imagePath=null`、`imageMime=null`、`imageBase64=null`；
- `imageBase64`：每页读文件转 base64；每次 `read` 最多带 5 张，超过的页只给 `imagePath`；图片不参与 token 预算（只算文本），但要计入响应大小；
- 页码越界 → `PAGE_OUT_OF_RANGE`；`tocId` 不存在 → `TOC_NOT_FOUND`。

- [ ] **Step 1: 写失败测试**

用 mock DB 两页：

```ts
const pages = [
  { id: 'doc-1-p0001', pageNo: 1, text: 'a'.repeat(3000), imagePath: 'doc-1/p0001.jpg',
    blocks: [{ id: 'b1', kind: 'paragraph', bbox: {x0:0,y0:0,x1:1,y1:1},
      text: 'a'.repeat(3000), caption: null, orderIndex: 1 }] },
  { id: 'doc-1-p0002', pageNo: 2, text: 'b'.repeat(3000), imagePath: null,
    blocks: [] },
];
```
断言：

- `read({documentId:'doc-1', pageFrom:1, pageTo:2, budgetTokens:1000})` 返回 1 页 + `nextCursor`；
- 用 `nextCursor` 再读返回第 2 页；
- 第 1 页 `anchor === 'doc-1/p1'`，块 `anchor === 'doc-1/p1#b0001'`；
- `includeImages:false` 时 `imagePath=null`、`imageBase64=null`；
- 有 `imagePath` 时 `imageBase64` 非空（测试可用 1×1 JPEG fixture，断言以 `/9j/` 开头）；
- 页码 99 → `PAGE_OUT_OF_RANGE`；
- 无目录文档 `tocId:'missing'` → `TOC_NOT_FOUND`；
- `PageImageService.resolve('doc-1', 1)` 对 `../` 路径抛错/返回 null，不能逃出 `KB_PAGE_IMAGE_ROOT`。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-v3/read.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现服务**

- 解析范围：`tocId` → 查 `kb_toc`（`toc.sourceId` 必须等于 `documentId`，否则 `TOC_NOT_FOUND`）；否则 `pageFrom/pageTo`；只给 `pageFrom` 时 `pageTo = pageFrom + 4`；都没给时 `1..min(5, pageCount)`；
- cursor：`decodeReadCursor`，校验 `documentId` 一致；
- 查询 `kb_page.findMany({ where: { sourceId, pageNo: { gte, lte } }, include:{ blocks:{orderBy:{orderIndex:'asc'}} }, orderBy:{pageNo:'asc'} })`；
- 预算：逐页累加 `estimateTokens(page.text)`；blocks 只给结构/bbox/caption，不返回重复的块文本；加入当前页后超预算且已有页 → 停；至少 1 页；
- `nextCursor`：若还有页（`lastPage < endPage`），`encodeReadCursor({documentId, nextPage: lastPage+1, endPage, includeImages, budgetTokens})`；到了 `endPage` 就给 `null`；
- 页图：`includeImages === false` 跳过；否则 `page.imagePath` 存在时用 `images.resolve()` 检查文件，`KbPage.imagePath` 保留相对路径，`imageMime='image/jpeg'`；前 5 张读文件转 `imageBase64`，超过 5 张只给路径；文件不存在则 `imagePath=null`（不抛错，避免整次读取失败）；
- `version`：`source.updatedAt.toISOString()`；
- 不返回结论/摘要/覆盖判断。

- [ ] **Step 4: 跑测试 + 提交**

Run: `cd backend && npm test -- tests/application/knowledge-v3/read.service.spec.ts`
Expected: PASS。

```bash
git add backend/src/application/knowledge-v3/page-image.service.ts backend/src/application/knowledge-v3/knowledge-read.service.ts backend/tests/application/knowledge-v3/read.service.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): kb_read 页级读取"
```

---

## Task 7: 3 个工具的契约 + 冒烟/基准脚本

**Files:**
- Create: `backend/src/application/knowledge-v3/knowledge-gateway.service.ts`
- Create: `backend/src/application/knowledge-v3/knowledge-v3.tools.ts`
- Create: `backend/scripts/knowledge-v3/smoke.ts`
- Create: `backend/scripts/knowledge-v3/benchmark-calls.ts`
- Modify: `backend/src/app.module.ts`（注册 5 个 provider）
- Modify: `backend/package.json`（`kb:v3:import` / `kb:v3:smoke` / `kb:v3:bench`）
- Modify: `backend/.env.example`（`KB_PAGE_LAYER_DIR` / `KB_PAGE_IMAGE_ROOT` / `KB_SOURCE_ARCHIVE`）
- Test: `backend/tests/application/knowledge-v3/gateway.spec.ts`
- Test: `backend/tests/application/knowledge-v3/tools-contract.spec.ts`

**Interfaces:**
```ts
class KnowledgeGatewayService {
  catalog(args: KbCatalogArgs): Promise<KbCatalogResult>;
  find(args: KbFindArgs): Promise<KbFindResult>;
  read(args: KbReadArgs): Promise<KbReadResult>;
  execute(name: KnowledgeToolName, rawArgs: unknown): Promise<KnowledgeToolResult<unknown>>;
}

export interface KnowledgeToolDefinition {
  type: 'function';
  function: {
    name: KnowledgeToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const KNOWLEDGE_TOOL_DEFINITIONS: KnowledgeToolDefinition[];
export async function executeKnowledgeTool(
  gateway: KnowledgeGatewayService,
  name: string,
  rawArgs: unknown,
): Promise<KnowledgeToolResult<unknown>>;
```

- [ ] **Step 1: 写失败测试**

`tools-contract.spec.ts`：

```ts
expect(KNOWLEDGE_TOOL_DEFINITIONS.map((t) => t.function.name)).toEqual([
  'kb_catalog', 'kb_find', 'kb_read',
]);
for (const tool of KNOWLEDGE_TOOL_DEFINITIONS) {
  expect(tool.function.parameters).toBeTruthy();
  expect(tool.function.description).not.toMatch(/返回结论|生成摘要|证据分级|分诊建议|药物剂量/);
}
```
`gateway.spec.ts`：mock 3 个服务；断言 `execute('kb_find', { query: '' })` 返回 `ok:false` code `INVALID_ARGUMENT`；未知工具返回 `INVALID_ARGUMENT`；`kb_read` 缺 documentId 返回 `INVALID_ARGUMENT`；`kb_find({query:'x', documentIds:[]})` 返回 0 命中而不是全库；成功时返回 `ok:true`。

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd backend && npm test -- tests/application/knowledge-v3/tools-contract.spec.ts tests/application/knowledge-v3/gateway.spec.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 gateway 与 3 个工具定义**

- 参数校验用简单纯函数（`readString`/`readStringArray`/`readInt`），错误抛 `KnowledgeToolError`；
- `execute` 捕获 `KnowledgeToolError` → `{ok:false,error:{code,message}}`，未知错误 → `INTERNAL_ERROR`；
- 工具定义：`kb_catalog` / `kb_find` / `kb_read`，参数与设计 §6 一致；描述里不写“先…再…”“必须…”；
- `executeKnowledgeTool` 按名字转调 `gateway.execute`；
- `app.module.ts` 注册 `KnowledgeCatalogService`、`KnowledgeFindService`、`KnowledgeReadService`、`PageImageService`、`KnowledgeGatewayService`；
- `KnowledgeGatewayService` 注入 `Logger`：每次 `execute` 记录 `{tool, ok, documentId?, pages?, ms}`；不建审计表、不做身份（本次不设计 Agent；传输层以后补）；
- `.env.example` 加：
```text
# 本地开发
KB_PAGE_LAYER_DIR=docs/knowledge-base/page-layer
KB_PAGE_IMAGE_ROOT=docs/knowledge-base/page-images
KB_SOURCE_ARCHIVE=/Users/zhaochen/Documents/SevenKitchen-knowledge-sources
# 生产（示例，写在服务器 .env）
# KB_PAGE_LAYER_DIR=/var/lib/sevenkitchen/kb/page-layer
# KB_PAGE_IMAGE_ROOT=/var/lib/sevenkitchen/kb/page-images
# KB_SOURCE_ARCHIVE=/opt/sevenkitchen/knowledge-sources
```
- `smoke.ts`：真实库，依次：
  1. `catalog()` 文档数 ≥159；
  2. `catalog({documentId:'sacn5-chapters-SACN5-37'})` 有 toc；
  3. `find({query:'phosphorus', documentIds:['sacn5-chapters-SACN5-37']})` top 页在 17–22；
  4. `read({documentId, pageFrom:17, pageTo:21, includeImages:true, budgetTokens:30000})` 返回 5 页、`sacn5-chapters-SACN5-37/p17` 锚点、每页有 `imagePath` 且前 5 张有 `imageBase64`（以 `/9j/` 开头）；p17 文本包含 `Phosphorus` 或 `Table 37-9`；表块命中则记录，检测漏了不算失败（页图仍在）；
  5. 用 `nextCursor` 继续读不报错；
  6. 负样本先试 `find({query:'"vitamin K"', documentIds:['sacn5-chapters-SACN5-37']})`；若命中，改用 `biotin` / `chromium` 直到 0 命中，并在报告里记录用了哪个；返回 `hits: []`，且 JSON 里没有 `no_match`/`未覆盖`；
  7. 读一个无文字层文档第 1 页，`text` 可为空、`imagePath` 存在；
  8. 页码 99999 → `PAGE_OUT_OF_RANGE`；
  9. 对 `find` 连跑 20 次，记录 p50/p95/max，写进报告；p95 < 300ms 才算通过。
  输出路径用 `git rev-parse --show-toplevel` 定位仓库根，再写 `docs/knowledge-base/eval/kb-v3-smoke.md`（不要按 `cd backend` 的相对路径写，容易落到 `backend/docs`）。
- `benchmark-calls.ts`：**结构基准，reference caller 不是模型**；脚本必须打印 `reference caller, not model`。它只证明接口能力，不证明模型会这样调；Agent A/B 由调用方另行做（冻结模型/提示词/业务工具，只换 KB）。`catalog` 单独记为“会话 setup”，不计入每题；如果每题都调 `catalog`，另加 1 次。固定 6 题：
  - 已知文档：`read` 1 次；
  - 未知：`find` + `read` 2 次；
  - 表题：`find` + `read` 2 次；
  - 图片型：`read` 1 次；
  - 负样本：`find` 1 次；
  - 整章：`catalog` + `read` 1 次（catalog 不计）。
  输出路径同样用仓库根定位；`docs/knowledge-base/eval/kb-v3-call-benchmark.md`，列：题、调用序列、页数、估算 token、首个命中页、耗时。

- [ ] **Step 4: 跑测试 + 提交**

Run:
```bash
cd backend && npm test -- tests/application/knowledge-v3
```
Expected: PASS。

```bash
git add backend/src/application/knowledge-v3/knowledge-gateway.service.ts backend/src/application/knowledge-v3/knowledge-v3.tools.ts backend/scripts/knowledge-v3/smoke.ts backend/scripts/knowledge-v3/benchmark-calls.ts backend/src/app.module.ts backend/package.json backend/.env.example backend/tests/application/knowledge-v3/gateway.spec.ts backend/tests/application/knowledge-v3/tools-contract.spec.ts
bash scripts/session.sh commit -m "feat(knowledge): 三个通用动作与结构基准"
```

---

## Task 8: 移除旧知识库的 Agent/补剂接线与引用门禁

**Files:**
- Modify: `backend/src/application/recipe-designer/agent/tools.ts`
- Modify: `backend/src/application/recipe-designer/agent/recipe-agent.service.ts`
- Modify: `backend/src/application/recipe-designer/agent/prompt.ts`
- Delete: `backend/src/application/recipe-designer/agent/citation-registry.ts`
- Delete: `backend/src/application/recipe-designer/agent/citation-judge.ts`
- Delete: `backend/tests/application/recipe-designer/agent-tools-library.spec.ts`
- Delete: `backend/tests/application/recipe-designer/citation-registry.spec.ts`
- Delete: `backend/tests/application/recipe-designer/citation-judge.spec.ts`
- Delete: `backend/tests/application/recipe-designer/citation-gate.spec.ts`
- **不存在的文件不要凭空加**：先跑 Step 1 的 `git grep` 枚举；如果还有 `citation-gate.ts` 或其他 citation helper，把它们补进本清单后再删。
- Modify: `backend/src/application/ingredient-creation/supplement-agent.service.ts`
- Modify: `backend/src/application/ingredient-creation/supplement-tools.ts`
- Modify: `backend/tests/application/ingredient-creation/supplement-agent.service.spec.ts`
- Modify: `backend/tests/application/ingredient-creation/supplement-tools.spec.ts`

**Interfaces:**
- 删除后 `AGENT_TOOLS` 只剩配方业务工具（`read_draft` / `read_taxonomy` / `find_food` / `edit_recipe` / `assess` / `write_copy` / `ask` 等，按当前文件实际保留）；
- `ToolExecutionContext` 只保留配方业务依赖（`port`、`catalog`、`onAsk`）；
- 补剂工具不再含 `search_knowledge`。

- [ ] **Step 1: 枚举全部 citation 引用并写/改失败测试**

Run:
```bash
cd backend
git grep -n -E "CitationRegistry|citation-judge|citation-gate|formatTableCitationText" -- src tests || true
```
Expected: 只命中本任务 Files 里列出的文件；若还有别的 citation helper，补进 Files 再删。

- `agent-tools-library.spec.ts` 删除；
- 补剂测试删除 `search_knowledge` 用例，并新增：
```ts
expect(SUPPLEMENT_TOOL_DEFINITIONS.map((t) => t.function.name)).not.toContain('search_knowledge');
```
- 如果存在 agent 工具数量断言，更新为新数量。

Run: `cd backend && npm test -- tests/application/ingredient-creation`
Expected: FAIL，仍含 `search_knowledge`。

- [ ] **Step 2: 删除旧接线**

- `tools.ts`：删 3 个 KB 工具定义、3 个 case、KB 类型/import、`scope/library/sourceLayer/citations` 字段；
- `recipe-agent.service.ts`：
  - 删 `CitationRegistry`/`citation-judge`/`KnowledgeLibraryService`/`SourceLayerService`/`scopeFromEnv` import 与构造注入；
  - 删 `loadCitationRegistry`、`citations`、`judgeAnswer`/`rewriteAnswer`/`citationGatePassed` 整段；
  - 最终回答只做 `redactDrugDoses(response.content).text`，`appendMessage` 后 `markWaiting`；
  - `runTool` 不再传 citations/library/sourceLayer/scope。
- `prompt.ts`：删知识库相关段落（“知识库是图书馆…”“检索时给的 species/stage…”等）；
- 补剂：删 `KnowledgeSearchService` 注入、`search_knowledge` 定义/case/context 字段；
- 删除 2 个 citation 源文件（`citation-registry.ts`、`citation-judge.ts`）与 3 个测试（`citation-registry.spec.ts`、`citation-judge.spec.ts`、`citation-gate.spec.ts`）；如果 Step 1 枚举出别的 helper，一并删。
- 注意：`dose-redaction`、`find_food`、`edit_recipe`、`assess` 等业务逻辑不动；但 `assess.targetOverrides` 依赖 citationId，随引用门禁一起从 Agent 工具移除；`RecipeDraftPort` 的 override 机制保留为死路径（不在本 Task 清理）。

- [ ] **Step 3: 跑测试 + 类型检查**

Run:
```bash
cd backend
npm test -- tests/application/ingredient-creation tests/application/recipe-designer
npx tsc --noEmit
```
Expected: PASS/无类型错误。硬门禁（命中即失败，只查本任务清掉的调用方；旧 `src/application/knowledge-base/` 与 `tests/application/knowledge-base/` 里的评测脚本引用留到 Task 10 随目录删除）：
```bash
if git grep -n -E "search_knowledge_library|open_knowledge|knowledge_scope|CitationRegistry|citation-judge|citation-gate" -- src/application/recipe-designer/agent src/application/ingredient-creation tests/application/recipe-designer tests/application/ingredient-creation; then
  echo "旧 citation/知识接线仍存在"; exit 1;
fi
```

- [ ] **Step 4: 提交**

```bash
git add -u backend/src/application/recipe-designer/agent backend/src/application/ingredient-creation backend/tests/application/recipe-designer backend/tests/application/ingredient-creation
bash scripts/session.sh commit -m "refactor(knowledge): 移除旧 Agent/补剂知识接线与引用门禁"
```

---

## Task 9: 删除 387 条结论，把健康分析降级为“不可用”

> **顺序要求**：必须先完成 Task 8（清掉 Agent/补剂/citation 对旧知识库的引用），再做本任务；反过来会在中间态编译红。

**Files:**
- Delete: `backend/src/domain/recipe-designer/knowledge-base/`（**保留 `tag-vocabulary.ts`**，员工端健康标签仍在用；只改注释，不删）
- Delete: `docs/knowledge-base/review-packet/`（两份审核包，387 条结论全文）
- Delete: `docs/knowledge-base/aaha2014-review.md`（含结论正文）
- Delete: `backend/src/application/recipe-designer/knowledge-base.service.ts`
- Modify: `backend/src/application/health/health-analysis.service.ts`（替换为最小服务）
- Modify: `backend/tests/application/health/health-analysis.service.spec.ts`（重写）
- Delete: `backend/tests/application/health/health-analysis-cache.spec.ts`
- Modify: `backend/src/app.module.ts`（移除 `KnowledgeBaseService`）
- Delete: `backend/tests/application/recipe-designer/knowledge-base-structure.spec.ts`
- Delete: `backend/tests/application/recipe-designer/knowledge-base.service.spec.ts`
- Delete: `backend/tests/scripts/export-knowledge-review-packet.spec.ts`
- Delete: `backend/tests/scripts/audit-health-knowledge.spec.ts`
- Delete: `backend/scripts/audit-health-knowledge.ts`
- Delete: `backend/scripts/export-knowledge-review-packet.ts`
- Create: `backend/scripts/knowledge-v3/assert-no-conclusions.ts`
- Create: `backend/scripts/knowledge-v3/audit-conclusion-tables.ts`

**Interfaces:**
- `HealthAnalysisService` 变为无依赖的最小服务：
```ts
@Injectable()
export class HealthAnalysisService {
  async analyze(
    customerId: string,
    dogId: string,
    audience: 'nutritionist' | 'customer' = 'customer',
  ): Promise<HealthAnalysisUnavailable> {
    return {
      available: false,
      message: '知识库结论层已下线，健康分析暂停，等待新的原文阅读方案。',
      enableWith: 'HEALTH_ANALYSIS_V3',
    };
  }

  async analyzeForStaff(dogId: string): Promise<HealthAnalysisUnavailable> {
    return this.analyze('', dogId, 'nutritionist');
  }
}
```
- 保留 `HEALTH_ANALYSIS_SECTIONS`、`HEALTH_ANALYSIS_SECTION_LABELS`、`HealthAnalysisSection`、`HealthAnalysisItem`、`HealthAnalysisResult`、`HealthAnalysisUnavailable` 这些类型/常量（controller 和前端类型仍可能引用）。
- 删除 `HealthAnalysisCache`、`buildSystemPrompt`、`deriveProfileTags`、`normalizeCitationList`、`buildCitationTitleMap`、`resolveCitationTitles`、`countKnowledgeEntries` 以及所有 KB/citation 逻辑。

- [ ] **Step 1: 写失败测试（替换旧测试文件）**

`health-analysis.service.spec.ts` 只保留三条：

```ts
import {
  HEALTH_ANALYSIS_SECTIONS,
  HealthAnalysisService,
} from '../../../src/application/health/health-analysis.service';

describe('HealthAnalysisService（结论层删除后）', () => {
  const service = new HealthAnalysisService();

  it('顾客侧明确不可用', async () => {
    const result = await service.analyze('customer-1', 'dog-1', 'customer');
    expect(result.available).toBe(false);
    expect(result.message).toContain('结论层已下线');
    expect(result.enableWith).toBe('HEALTH_ANALYSIS_V3');
  });

  it('营养师侧同样不可用（没有结论来源）', async () => {
    const result = await service.analyzeForStaff('dog-1');
    expect(result.available).toBe(false);
    expect(result.message).toContain('结论层已下线');
  });

  it('七项常量保留，前端契约不崩', () => {
    expect(HEALTH_ANALYSIS_SECTIONS).toHaveLength(7);
  });
});
```

Run: `cd backend && npm test -- tests/application/health/health-analysis.service.spec.ts`
Expected: FAIL（构造函数/返回类型不匹配）。

- [ ] **Step 2: 删除结论层，替换健康分析**

- 删除 `backend/src/domain/recipe-designer/knowledge-base/` 下的 387 条数据、类型、登记表；**保留 `tag-vocabulary.ts`**（`staff-dog-health.service.ts` 仍用它做健康标签校验，只把注释里“KnowledgeBaseService 启动校验”改成“员工端健康标签受控词表”）；
- 删除 `docs/knowledge-base/review-packet/` 两份审核包、`docs/knowledge-base/aaha2014-review.md`；其余 docs 历史分析只允许出现条目 ID，不允许完整结论正文；
- 删除 `backend/src/application/recipe-designer/knowledge-base.service.ts`；
- 用上面的最小服务替换 `health-analysis.service.ts`；只保留类型/常量/服务，不再 import Prisma、timeline、agent config、KB；
- 删除 `health-analysis-cache.spec.ts`；
- 删除两个审核脚本及其测试；
- `app.module.ts` 移除 `KnowledgeBaseService` import/provider。

- [ ] **Step 3: 跑测试 + 零结论硬门禁**

先实现两个门禁脚本：

- `assert-no-conclusions.ts`：扫描 `docs/knowledge-base/**/*.md`；凡是同时出现“条目 ID（`renal-001` 这类）”和“`^### <id>` 标题”或“`**结论**：` / `**要点**：` / `**注意事项**：`”的文件，视为残留结论正文，退出码 1；允许只有 ID、没有结论正文的历史审计文档。
- `audit-conclusion-tables.ts`：用 Prisma `information_schema` 列出 `public` 下 `%knowledge%` / `source_%` 表；如果存在 `knowledge_entry` / `knowledge_entries` / `knowledge_conclusion` 之类结论表，退出码 1；`knowledge_citation_anchor` 只打印行数，允许在 Task 10 drop 前存在；`--after-drop` 模式要求 `source_*` / `knowledge_citation_anchor` 全部不存在，只剩 4 张 `kb_*` 表。

Run:
```bash
cd backend
npm test -- tests/application/health/health-analysis.service.spec.ts
npx tsc --noEmit
npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/assert-no-conclusions.ts
npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/audit-conclusion-tables.ts
if git grep -n -E "KnowledgeBaseService|knowledge-base/data|KnowledgeEntry|HealthAnalysisCache" -- src tests; then
  echo "结论层代码仍有残留"; exit 1;
fi
```
Expected: PASS/无类型错误；两个门禁脚本退出 0；`git grep` 无命中。再跑：
```bash
npm test -- tests/application/health/staff-dog-health.service.spec.ts
```
Expected: PASS（健康标签词表仍可用）。

- [ ] **Step 4: 提交**

```bash
git add -u backend/src/domain/recipe-designer/knowledge-base backend/src/application/recipe-designer/knowledge-base.service.ts docs/knowledge-base/review-packet docs/knowledge-base/aaha2014-review.md backend/src/application/health/health-analysis.service.ts backend/scripts/knowledge-v3/assert-no-conclusions.ts backend/scripts/knowledge-v3/audit-conclusion-tables.ts backend/tests/application/health/health-analysis.service.spec.ts backend/tests/application/health/health-analysis-cache.spec.ts backend/src/app.module.ts backend/tests/application/recipe-designer/knowledge-base-structure.spec.ts backend/tests/application/recipe-designer/knowledge-base.service.spec.ts backend/tests/scripts/export-knowledge-review-packet.spec.ts backend/tests/scripts/audit-health-knowledge.spec.ts backend/scripts/audit-health-knowledge.ts backend/scripts/export-knowledge-review-packet.ts
bash scripts/session.sh commit -m "refactor(knowledge): 删除 387 条结论层，健康分析暂停"
```

---

## Task 10: 删除旧原文层、控制器、脚本、表

**Files:**
- Delete: `backend/src/application/knowledge-base/`（全部）
- Delete: `backend/src/application/knowledge/knowledge-search.service.ts`
- Delete: `backend/src/domain/knowledge/`（scope/domains/routing/topic-aliases，旧检索专用）
- Delete: `backend/src/domain/recipe-designer/knowledge-base/source-registry.ts`（旧服务最后一个消费者随本任务删除）
- Delete: `backend/src/interfaces/controllers/knowledge-source.controller.ts`
- Delete: `backend/tests/application/knowledge-base/`（全部）
- Delete: `backend/tests/application/knowledge/knowledge-search.service.spec.ts`
- Delete: `backend/tests/domain/knowledge/`（全部）
- Delete: `backend/scripts/knowledge-base/`（全部）
- Delete: `backend/scripts/import-knowledge-source-layer.ts`
- Delete: `docs/knowledge-base/tools/` 下除 `build-page-layer.py` / `render-page-images.py` / `test-build-page-layer.py` 之外的旧解析工具
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json`（删全部旧 `kb:*` 脚本：`kb:eval` / `kb:eval:all` / `kb:agent` / `kb:smoke` / `kb:usage` / `kb:seed-eval` / `kb:data-check` / `kb:domains` / `kb:bench` / `kb:coverage` / `kb:prod-smoke` / `kb:sections`）
- Modify: `backend/prisma/schema.prisma`（删旧 `SourceDocument` / `SourceSection` / `SourceParagraph` / `SourceTable` / `SourceFigure` / `KnowledgeCitationAnchor`）
- Create: `backend/prisma/migrations/20261112120000_drop_legacy_kb/migration.sql`

**Interfaces:**
- `AppModule` 不再 import/注册旧服务/控制器；
- 旧表 `source_document` / `source_section` / `source_paragraph` / `source_table` / `source_figure` / `knowledge_citation_anchor` 全部 drop。

- [ ] **Step 1: 确认没有运行时引用**

Run:
```bash
cd backend
git grep -n -E "KnowledgeLibraryService|SourceLayerService|KnowledgeSearchService|KnowledgeSourceController|search_knowledge_library|open_knowledge|knowledge_scope" -- src tests || true
```
Expected: 只在本任务要删的文件里命中；`src` 中不再有业务代码引用。

- [ ] **Step 2: 删除代码与迁移**

- 删除目录/文件；
- `app.module.ts` 移除 import/providers/controllers；
- `package.json` 删旧 `kb:*` 脚本；
- `schema.prisma` 删旧模型；
- 新迁移：
```sql
DROP TABLE IF EXISTS knowledge_citation_anchor;
DROP TABLE IF EXISTS source_figure;
DROP TABLE IF EXISTS source_table;
DROP TABLE IF EXISTS source_paragraph;
DROP TABLE IF EXISTS source_section;
DROP TABLE IF EXISTS source_document;
```
Run:
```bash
cd backend
npx prisma migrate dev --name drop_legacy_kb
npx prisma generate
```

- [ ] **Step 3: 全量验证**

Run:
```bash
cd backend
npx tsc --noEmit
npm test
if git grep -n -E "source_paragraph|source_section|source_table|source_figure|knowledge_citation_anchor|KnowledgeLibraryService|SourceLayerService|KnowledgeSearchService|KnowledgeSourceController|search_knowledge_library|open_knowledge|knowledge_scope|query-expansion|stagePhrases|topicPhrases|detectQueryDomains|CKD_DOCUMENT_IDS|\[K[0-9]" -- src tests; then
  echo "旧知识库概念仍有残留"; exit 1;
fi
npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/audit-conclusion-tables.ts --after-drop
```
Expected: `tsc` 通过；全量测试绿；硬门禁 0 命中；DB 只剩 4 张 `kb_*` 表，`source_*` / `knowledge_citation_anchor` 已不存在。

- [ ] **Step 4: 提交**

```bash
git add -u backend/src/application/knowledge-base backend/src/application/knowledge backend/src/domain/knowledge backend/src/domain/recipe-designer/knowledge-base/source-registry.ts backend/src/interfaces/controllers/knowledge-source.controller.ts backend/tests/application/knowledge-base backend/tests/application/knowledge backend/tests/domain/knowledge backend/scripts/knowledge-base backend/scripts/import-knowledge-source-layer.ts docs/knowledge-base/tools backend/src/app.module.ts backend/package.json backend/prisma/schema.prisma
git add backend/prisma/migrations/20261112120000_drop_legacy_kb
bash scripts/session.sh commit -m "refactor(knowledge): 下线旧原文层与 K# 接口"
```

---

## Task 11: 真实库跑通、结构基准、运行手册

**Files:**
- Create: `docs/knowledge-base/RUNBOOK-kb-v3.md`
- Create: `docs/knowledge-base/eval/kb-v3-smoke.md`（脚本生成）
- Create: `docs/knowledge-base/eval/kb-v3-call-benchmark.md`（脚本生成）
- Modify: `docs/knowledge-base/README.md`（顶部加 v3 横幅）
- Modify: `docs/knowledge-base/2026-11-11-kb-v3-design.md`（如实现有偏差，回写）

- [ ] **Step 1: 全量解析 + 渲染 + 导入**

Run:
```bash
python3 docs/knowledge-base/tools/build-page-layer.py \
  --archive "$HOME/Documents/SevenKitchen-knowledge-sources" \
  --out docs/knowledge-base/page-layer --force
python3 docs/knowledge-base/tools/render-page-images.py \
  --archive "$HOME/Documents/SevenKitchen-knowledge-sources" \
  --layer docs/knowledge-base/page-layer \
  --out docs/knowledge-base/page-images --dpi 110
cd backend
npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/import-page-layer.ts \
  --dir ../docs/knowledge-base/page-layer
```
Expected: 159 份导入；`kb_source` 159、`kb_page` ≈4,000+（27k 是旧段落数，不是页数）、`kb_block` 有数据、`kb_toc` 有数据；页图文件存在。

- [ ] **Step 2: 跑真实库冒烟**

Run:
```bash
cd backend
npm run kb:v3:smoke
```
Expected: 退出码 0；`docs/knowledge-base/eval/kb-v3-smoke.md` 生成；CKD 磷问题能读到 p17–21、表块、页图；负样本 `hits: []` 且无 `no_match`；图片型文档可读。

- [ ] **Step 3: 跑结构基准**

Run:
```bash
cd backend
npm run kb:v3:bench
```
Expected: `kb-v3-call-benchmark.md` 生成；已知 1 次、未知 2 次、表题 2 次、负样本 1 次、整章 1 次；没有 >3 的项。报告标题必须写“结构基准 / reference caller，不是模型调用次数”。

- [ ] **Step 4: 写运行手册 + README 横幅**

`RUNBOOK-kb-v3.md` 至少包含：

- 依赖：PyMuPDF、Postgres `pg_trgm`、原文目录读权限（root/受权组）；解析/渲染产出目录要 `chown` 给后端用户，后端不直接读 `/opt/sevenkitchen/knowledge-sources`；
- 生产路径：`/var/lib/sevenkitchen/kb/page-layer`、`/var/lib/sevenkitchen/kb/page-images`；用一次性 root job 跑解析/渲染，产物 `chown sevenkitchen:sevenkitchen`、`chmod 750`；
- 磁盘：预估 2–3 GB，至少留 2×（≥6 GB）；`df -h` 不足就停；
- 首次导入：解析 → 渲染 → 导入；
- 增量：`--only <sourceId> --force`；
- 冒烟：`npm run kb:v3:smoke`；
- 基准：`npm run kb:v3:bench`；
- 回滚：新表可直接重建；旧表已删，回滚只回代码版本；
- 已知限制：扫描件只能按目录/页读；中文查询由调用方翻译；页图存储约 2–3GB。

`docs/knowledge-base/README.md` 顶部加：

```md
> **2026-11-11 起运行时以 v3 为准**：知识库只做原文图书馆（书/页/块/目录 + 3 个动作），
> 387 条结论已删除。历史治理/评测文档保留作背景；设计与实施见
> [2026-11-11-kb-v3-design.md](2026-11-11-kb-v3-design.md)。
```

- [ ] **Step 5: 最终验证 + 提交**

Run:
```bash
cd backend
npx tsc --noEmit
npm test
cd ..
git status --short
```
Expected: `tsc` **无新增错误**（全仓错误数=基线 332；v3 文件 0 错误）、全量 `npm test` 失败集合=基线 3 个套件/15 用例（不新增）；只包含本任务文件。

```bash
git add docs/knowledge-base/RUNBOOK-kb-v3.md docs/knowledge-base/eval/kb-v3-smoke.md docs/knowledge-base/eval/kb-v3-call-benchmark.md docs/knowledge-base/README.md docs/knowledge-base/2026-11-11-kb-v3-design.md
bash scripts/session.sh commit -m "docs(knowledge): v3 运行手册、冒烟与结构基准"
```

---

### Task 11 实施偏差（2026-11-12 实测）

- `kb_page` 实际 **4,183**（128 份 PDF 2,393 页 + 31 份非 PDF 1,790 伪页），不是本 Task 写的 27,000+；
  27,902 是旧 `source-layer` 的段落数。其余：`kb_block` 48,376、`kb_toc` 604、`kb_source` 159。
- 页图 2,393 张 / **479 MB**（110 dpi q78），低于 2–3 GB 预估；磁盘仍按 ≥6 GB 留。
- 冒烟 `find phosphorus` 第一命中 p24（推荐量表词频最高），p17 是章节首页但排第 15；
  断言改为“前 5 条命中覆盖 17–22 节”，`read p17–21`/5 张 base64 的断言不变。
- 结构基准 Q4 的唯一无文字层文档只有 1 页，`pageTo` 改为 `min(2, pageCount)`，避免越界。
- 本地页图默认根改为相对 backend cwd 的 `../docs/knowledge-base/page-images`；生产仍用
  `KB_PAGE_IMAGE_ROOT=/var/lib/sevenkitchen/kb/page-images`。

## 验收清单（执行完逐条打勾）

- [x] `kb_source` / `kb_page` / `kb_block` / `kb_toc` 四张表存在；旧 `source_*` / `knowledge_citation_anchor` 已 drop；
- [x] `git grep` 不再命中 `KnowledgeBaseService` / `KnowledgeLibraryService` / `SourceLayerService` / `search_knowledge_library` / `CitationRegistry`；
- [x] 387 条结论代码/审核包/`### 条目` 标题 0 命中；DB 无结论表；健康分析返回 `available:false`；
- [x] 只有 `kb_catalog` / `kb_find` / `kb_read` 三个工具定义；
- [x] `kb_read` 默认一次返回 3–5 页（整章按预算）+ 表/图块 + 页图 + anchor；预算/游标可续读；
- [x] 图片型文档 `text` 可为空，但 `imagePath` 存在、可读；
- [x] 负样本返回 `hits: []` + `searched`，无 `no_match` / “未覆盖”；
- [x] `npm run kb:v3:smoke` 通过；`npm run kb:v3:bench` 的结构基准（reference caller）已知/未知/表题/整章 ≤ 目标；**不把它冒充模型调用次数**；
- [x] `npx tsc --noEmit` 无新增错误（全仓=基线 332；v3 文件 0）；全量 `npm test` 失败集合=基线 3 个套件/15 用例（不新增）；v3/Agent/补剂定向测试全绿；
- [x] 设计文档与实现一致（如有偏差已回写）。

## 工作量估算

| Task | 内容 | 人日 |
|---|---|---:|
| 1 | 四实体 + 迁移 + 工具函数 | 1.5 |
| 2 | 页级解析 + 页图渲染 | 2 |
| 3 | 导入 + 校验 | 1 |
| 4 | catalog | 1 |
| 5 | find + 索引 | 2 |
| 6 | read + 预算/页图 | 2 |
| 7 | 契约 + 冒烟/基准 | 2 |
| 8 | 删结论 + 健康分析 | 1 |
| 9 | 旧 Agent/补剂接线清理 | 1.5 |
| 10 | 旧原文层/表/脚本清理 | 1 |
| 11 | 真实库跑通 + 文档 | 2 |
| **合计** | | **17 人日**（2 人约 2 周；1 人约 3.5 周） |
