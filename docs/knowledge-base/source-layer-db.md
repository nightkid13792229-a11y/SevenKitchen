# 原文层入库与服务封装

**日期**：2026-11-02
**范围**：只做到"后端能调用"，**不含 Agent 工具接入**（那部分由别人做）

---

## 一、建了什么

### 6 张表（迁移 `20261102000000_knowledge_source_layer`）

| 表 | 内容 | 行数（本地） |
|---|---|---:|
| `source_document` | 文档（来源 ID、路径、页数、字符数） | 160 |
| `source_section` | 章节（标题、页码、排序） | 6,091 |
| `source_paragraph` | **段落**（正文、页码、所属章节） | **27,909** |
| `source_table` | 表格（表题、列名、行数据、校验） | 484 |
| `source_figure` | 图片（路径、页码、图注） | 592 |
| `knowledge_citation_anchor` | 出处锚点（条目 → 文档/小节/段落/表） | 1,235 |

迁移是**手写的 SQL**，没有用 `prisma migrate diff` 自动生成——
自动生成的脚本会把别的会话未提交的改动一起带进来（比如删掉 `procurement_sku` 的外键），不能直接跑。

### 导入脚本

`backend/scripts/import-knowledge-source-layer.ts`

- **幂等**：整表清空后重建。这些是从原文档派生的数据，没有人工编辑内容，重跑就是重新生成。
- 数据源：`docs/knowledge-base/{source-layer,tables,figure-index.csv,citation-anchors.json}`
- 本地实测：160 文档 / 6,091 章节 / 27,909 段落 / 484 表格 / 592 图片 / 1,235 锚点

### 查询服务

`backend/src/application/knowledge-base/source-layer.service.ts`

| 方法 | 干什么 |
|---|---|
| `getScope()` | 库里有什么（文档/段落/表格/图片数） |
| `listDocuments(sourceId?)` | 列文档 |
| `searchParagraphs(query, opts)` | 在原文里搜段落（可按文档/来源收窄） |
| `getParagraph(id)` | 取某一段 |
| `getParagraphContext(id, before, after)` | 取这段的上下文 |
| `getSection(sectionId)` | 取小节信息 |
| `searchTables(query)` | 按表题找表 |
| `getTable(id)` | 取整张表 |
| `getFigure(id)` | 取图 |
| `getEntryAnchors(entryId)` | 某条知识的全部出处锚点 |
| `getEntryEvidence(entryId)` | **出处 + 原文一起取**（核对用） |

已在 `app.module.ts` 注册，但**没有暴露 HTTP 接口**——只给内部服务调用。

---

## 二、怎么验证的

**单元测试**：`tests/application/knowledge-base/source-layer.service.spec.ts`（7 条）
锁的是接口形状与边界：空查询不打库、limit 有上限、上下文窗口正确、出处能把段落和表格一起带出来。

**端到端实测**（连本地库）：

```
范围: { documents: 160, paragraphs: 27909, tables: 484, figures: 592 }
搜索结果: acvim-ACVIM-2016-犬猫尿石症治疗与预防共识-p00018 ...

出处条数: 2
 - 小动物临床营养学（第5版）/ 第40章 草酸钙结石 [paragraph]
   原文: Protein Ingestion of foods that contain high quantities of animal protein may contribute t...
```

**全量测试**：506 个套件 / 5,520 个用例全过。

---

## 三、几个设计取舍

| 决定 | 理由 |
|---|---|
| **条目留在代码里，不进库** | 条目是人写的结论、改动要 review；放 TS 里有类型检查更安全。库里只用 `entryId` 软关联 |
| **检索块不存库** | 从段落派生，重跑 10 秒；存了反而要同步 |
| **中文检索用 `contains` 而非全文索引** | 中文没有词边界，trigram 之外的办法效果都不稳；两万多段顺序扫描够快 |
| **迁移手写** | 自动 diff 会夹带别的会话的改动 |

---

## 四、还没做的

1. **HTTP 接口**：目前只有服务方法，没有 controller。如果前端或外部要查，需要加。
2. **Agent 工具接入**：明确由别人做。
3. **图片文件的服务化**：`source_figure.path` 指向 `docs/knowledge-base/figures/*.jpg`，
   目前后端不提供静态访问，需要时再定。
4. **生产部署**：迁移和导入都只在本地跑过。

---

## 五、生产要注意的

- 部署时 `prisma migrate deploy` 会自动建这 6 张表。
- **导入脚本要单独跑**（迁移只建表，不灌数据）：
  `npx ts-node -r tsconfig-paths/register scripts/import-knowledge-source-layer.ts`
- 生产库会多约 **40 MB**。
