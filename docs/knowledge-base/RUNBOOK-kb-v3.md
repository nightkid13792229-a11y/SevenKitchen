# 知识库 v3 运行手册

> 适用：2026-11-11 起的知识库 v3（4 个实体、3 个动作、运行时 0 次模型调用）。
> 设计：[2026-11-11-kb-v3-design.md](2026-11-11-kb-v3-design.md)；
> 实施计划：[2026-11-11-kb-v3-implementation.md](../superpowers/plans/2026-11-11-kb-v3-implementation.md)。
> 本手册覆盖：依赖、生产路径、首次导入、增量、冒烟、结构基准、回滚、已知限制。

---

## 0. 一句话

原文归档 →（一次性 root job）解析成页级 JSON + 渲染整页 JPEG →（后端用户）导入 4 张 `kb_*` 表 → 跑冒烟/结构基准。
后端只在请求路径读数据库和页图，**不读原文归档、不调用模型**。

---

## 1. 依赖

| 依赖 | 用途 | 检查 |
| --- | --- | --- |
| Python 3 + PyMuPDF（`fitz`） | 解析 PDF、渲染页图 | `python3 -c "import fitz; print(fitz.__doc__)"` |
| PostgreSQL `pg_trgm` | `kb_find` 的 ILIKE/CJK/表题兜底索引 | 迁移里的 `CREATE EXTENSION IF NOT EXISTS pg_trgm`；数据库账号需有建扩展权限 |
| 原文归档读权限 | 解析/渲染读取 PDF/XML/TXT/EPUB | 生产归档 `/opt/sevenkitchen/knowledge-sources` 是 `700`、root 属主 → 用 root（或受权组）跑解析/渲染 |
| 后端运行用户 | 只读数据库 + 页图目录 | 生产为 `sevenkitchen`；产物必须 `chown sevenkitchen:sevenkitchen` |
| 磁盘 | 页级 JSON + 页图 | `df -h`，至少留 **6 GB**（设计按 2–3 GB 预估的 2×） |

安装/检查：

```bash
python3 -m pip install pymupdf          # 解析/渲染依赖（本机 PyMuPDF 1.26.7）
python3 -c "import fitz; print(fitz.__doc__)"
sudo -u postgres psql -d sevenkitchen -c "SELECT extname FROM pg_extension WHERE extname='pg_trgm';"
```

解析/渲染是**一次性特权 job**：它们需要读原文目录；后端进程**不直接读** `/opt/sevenkitchen/knowledge-sources`。
不要把原文/页图复制到 nginx 站点根，也不要生成公开 URL。

本机实测（2026-11-12，110 dpi / JPEG q78）：`page-layer` 约 **33 MB**，`page-images` 约 **479 MB**（2,393 张）。
页数比早期预估少很多：159 份里 128 份是 PDF（2,393 页），31 份是 XML/TXT/EPUB（1,790 个 ~3,000 字伪页，无页图）；
总计 4,183 页。设计里“2–3 GB”的上限按大页数/高 dpi 预留，仍建议留 6 GB。

---

## 2. 生产路径与环境变量

| 项 | 生产值 |
| --- | --- |
| 原文归档 | `/opt/sevenkitchen/knowledge-sources`（700/root，只读） |
| 页级 JSON | `/var/lib/sevenkitchen/kb/page-layer` |
| 页图 | `/var/lib/sevenkitchen/kb/page-images` |
| 后端 `.env` | `KB_PAGE_IMAGE_ROOT=/var/lib/sevenkitchen/kb/page-images` |
| 可选记录 | `KB_PAGE_LAYER_DIR=/var/lib/sevenkitchen/kb/page-layer`（导入脚本用 `--dir`，该变量只作记录） |
| 数据库 | 沿用后端 `DATABASE_URL` |

目录权限：

```bash
sudo install -d -o sevenkitchen -g sevenkitchen -m 750 /var/lib/sevenkitchen/kb
sudo install -d -o sevenkitchen -g sevenkitchen -m 750 /var/lib/sevenkitchen/kb/page-layer
sudo install -d -o sevenkitchen -g sevenkitchen -m 750 /var/lib/sevenkitchen/kb/page-images
```

> 本地开发的默认页图根是 **相对 backend cwd 的** `../docs/knowledge-base/page-images`
> （`npm run kb:v3:smoke` / `npm test` 都在 `backend/` 下跑）。在别的 cwd 跑脚本时，
> 显式设置 `KB_PAGE_IMAGE_ROOT` 为绝对路径。

---

## 3. 首次导入（一次性 root job）

在**部署了本分支代码的目录**（后端工作目录）执行。先做磁盘检查，不足 6 GB 就停：

```bash
df -h /var/lib/sevenkitchen/kb
# 小于 6 GB 可用 → 停止，先清盘/扩容
```

### 3.1 解析（root，读受保护原文）

```bash
cd /opt/sevenkitchen/SevenKitchen
sudo python3 docs/knowledge-base/tools/build-page-layer.py \
  --archive /opt/sevenkitchen/knowledge-sources \
  --out /var/lib/sevenkitchen/kb/page-layer \
  --force
```

预期：`parsed=159 skipped=0 failed=0`；`page-layer/` 159 个 JSON。
非 PDF（XML/TXT/EPUB）按 ~3,000 字切伪页，`imagePath=null`。

### 3.2 渲染页图（root）

```bash
cd /opt/sevenkitchen/SevenKitchen
sudo python3 docs/knowledge-base/tools/render-page-images.py \
  --archive /opt/sevenkitchen/knowledge-sources \
  --layer /var/lib/sevenkitchen/kb/page-layer \
  --out /var/lib/sevenkitchen/kb/page-images \
  --dpi 110
```

预期：`rendered=<PDF 页数> skipped=0 failed=0`（本机 2,393）。
渲染是断点续渲：已存在的页图跳过；重复跑安全。

### 3.3 交给后端用户

```bash
sudo chown -R sevenkitchen:sevenkitchen /var/lib/sevenkitchen/kb
sudo chmod -R 750 /var/lib/sevenkitchen/kb
sudo find /var/lib/sevenkitchen/kb -type f -exec chmod 640 {} \;
```

最后一行把文件从 750 收窄到 640（目录保持 750），避免同组外可执行/可写。

### 3.4 导入数据库（后端用户）

```bash
cd /opt/sevenkitchen/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/import-page-layer.ts \
  --dir /var/lib/sevenkitchen/kb/page-layer
```

预期：`imported=159 skipped=0 failed=0`。导入按 `sourceId` 整本重建、可重跑；
每个文件一个事务（大文档 120s 超时），页 200/批、块 1,000/批。

### 3.5 校验

```bash
cd /opt/sevenkitchen/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/import-page-layer.ts \
  --dir /var/lib/sevenkitchen/kb/page-layer --dry-run
```

有数据后核对四张表（本机基线：4,183 页 / 48,376 块 / 604 目录 / 159 书）：

```sql
SELECT count(*) FROM kb_source;  -- 159
SELECT count(*) FROM kb_page;    -- 本机 4,183
SELECT count(*) FROM kb_block;   -- 本机 48,376
SELECT count(*) FROM kb_toc;     -- 本机 604
```

也可以直接用 Prisma/psql 只读查询；不要手写 SQL 改库（规则见 `AGENTS.md`）。

---

## 4. 增量：只重做一份文档

原文更新/新增后，只处理该 `sourceId`（= `source-layer/<docId>.json` 的文件名）：

```bash
# 1) 解析这一份（root）
sudo python3 docs/knowledge-base/tools/build-page-layer.py \
  --archive /opt/sevenkitchen/knowledge-sources \
  --out /var/lib/sevenkitchen/kb/page-layer \
  --only <sourceId> --force

# 2) 只渲染这一份（root）
sudo python3 docs/knowledge-base/tools/render-page-images.py \
  --archive /opt/sevenkitchen/knowledge-sources \
  --layer /var/lib/sevenkitchen/kb/page-layer \
  --out /var/lib/sevenkitchen/kb/page-images \
  --only <sourceId> --dpi 110

# 3) chown 这一份产物
sudo chown -R sevenkitchen:sevenkitchen \
  /var/lib/sevenkitchen/kb/page-layer/<sourceId>.json \
  /var/lib/sevenkitchen/kb/page-images/<sourceId>

# 4) 只导入这一份（后端用户）
cd /opt/sevenkitchen/SevenKitchen/backend
npx ts-node -r tsconfig-paths/register scripts/knowledge-v3/import-page-layer.ts \
  --dir /var/lib/sevenkitchen/kb/page-layer --only <sourceId>
```

新增文档还要先把 docId 加进 `docs/knowledge-base/source-layer/`（稳定 ID、manifest、SHA256 校验），
再跑上面的步骤。导入是幂等的：同一 `sourceId` 重复导入会先删旧页/块/目录再重建。

> 渲染脚本的 `--only` 只按页级 JSON 的 `sourceId` 匹配；若该文档是非 PDF（无页图），第 2 步会 0 渲染，正常。

---

## 5. 冒烟（真实库，每次导入后/部署后）

```bash
cd /opt/sevenkitchen/SevenKitchen/backend
npm run kb:v3:smoke
```

9 步：文档数、目录、`find phosphorus` 命中 17–22 节、`read p17–21`（5 页/锚点/页图/base64/文本）、
`nextCursor` 续读、负样本 0 命中且无“未覆盖”、无文字层页可读、越界 `PAGE_OUT_OF_RANGE`、
`find` 20 次 p95 < 300ms。

通过线：退出码 0，报告 `docs/knowledge-base/eval/kb-v3-smoke.md` 结论 `PASS`。
本机基线（2026-11-12）：9/9 PASS；`find` p50 19.9ms / p95 26.4ms。
报告里“表块未检测到（页图仍在，不算失败）”是允许的（borderless 表，见 §8）。

`KB_PAGE_IMAGE_ROOT` 必须指向页图根；不设时用相对 backend cwd 的
`../docs/knowledge-base/page-images`。生产务必显式设置。

## 6. 结构基准（reference caller，不是模型调用次数）

```bash
cd /opt/sevenkitchen/SevenKitchen/backend
npm run kb:v3:bench
```

6 题，输出 `docs/knowledge-base/eval/kb-v3-call-benchmark.md`。
本机基线（2026-11-12）：

| 题 | 场景 | 调用次数 | 页数 |
| --- | --- | ---: | ---: |
| Q1 | 已知文档 | 1（`read`） | 5 |
| Q2 | 未知位置 | 2（`find`+`read`） | 5 |
| Q3 | 表题 | 2（`find`+`read`） | 3 |
| Q4 | 图片型文档 | 1（`read`） | 1 |
| Q5 | 负样本 | 1（`find`，0 命中） | 0 |
| Q6 | 整章（`tocId`） | 1（`read`，catalog 是 setup） | 15 |

**这个数字不是模型的调用次数。** 它只证明接口“一次能给多页”；Agent 实测必须由调用方冻结
模型/提示词/业务工具后另行 A/B（设计 §9.3）。

---

## 7. 回滚

- **新表可重建**：`kb_source/kb_page/kb_block/kb_toc` 与索引都能由 `page-layer/` 重新导入；
  `page-layer/` 还能由原文重新解析。索引（`to_tsvector` / `pg_trgm`）是派生结构。
- **旧表已删**：`source_*`、`knowledge_citation_anchor` 和 387 条结论已随 v3 删除（迁移 `20261112120000_drop_legacy_kb`）。
  回滚只能回**代码版本**（`git revert` / 部署上一个提交），**不会**把旧表和结论数据恢复回来；
  需要旧数据只能从数据库备份或 git 历史人工恢复，不保证可用。
- 回滚代码后，健康分析等依赖结论的功能仍不可用；这是设计 §3 的既定结果。
- 页图/页级产物不用回滚：它们不参与旧代码路径，可保留供 v3 再次上线。

出现数据问题时优先重建：删除 4 张 `kb_*` 表 → 重新跑迁移 → 按 §3 解析/渲染/导入。
不要手写 SQL 改单页/单块。

---

## 8. 已知限制（上线前必须知道）

1. **扫描件只能按目录/页读**：无文字层文档（本机 1 份：`wsava-nutrition-Muscle-Condition-Score-Cat`）
   `find` 命中不了，但 `catalog` 能看到、`read` 能返回页图。不要让调用方把“0 命中”说成“知识库未覆盖”。
2. **borderless 表没有 `table` 块**：表格检测靠线，无框线表可能只留正文块；页图始终存在，
   `read` 照样能看表。SACN5-37 p17–21 就是这种情况（p24 的磷表有文字命中，但没有 table 块）。
   不要为了出 table 块去猜外框，也不要把表格转成 JSON。
3. **中文查询由调用方翻译**：知识库只做字面检索；中文查英文原文可能 0 命中。CJK 走 ILIKE 兜底，
   但不等于跨语言检索。调用方应先把问题翻成英文内容词（如 `phosphorus`、`"vitamin k"`）。
4. **页图体积**：本机 2,393 张 / 479 MB；设计按 2–3 GB 预留。生产磁盘至少留 6 GB，
   页图不进 git、不进 nginx 站点根。
5. **非 PDF 无页图**：XML/TXT/EPUB 切伪页后只有文本，`imagePath` 为 null；`read` 返回文本，不返回图。
6. **`find` 排序是词频/罕见度**：同一主题的“推荐量表页”可能排在章节首页前面（如 phosphorus 的 p24 排在 p17 前），
   这是字面索引的正常行为；`read` 仍可按页码读章节首页。
7. **单次 `read` 默认预算 20,000 token**：超预算会截断并给 `nextCursor`；整章阅读按 1–3 次调用设计，
   不要假设一次返回全书。
