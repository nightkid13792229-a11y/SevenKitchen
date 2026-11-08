# CKD 章节目录与覆盖地图

**用途**：CKD 试点的知识库结构层，不回答临床问题、不替代原文。

## 文件

| 文件 | 内容 |
|---|---|
| `section-catalog.json` | 5 份 CKD 文档的文档/章节级元数据，机器可读 |
| `section-catalog.md` | 同一份目录，给人看 |
| `coverage-map.md` | CKD 主题 → 文档/章节覆盖；列出未覆盖主题 |

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

## 已知限制

- 主题是从章节标题/正文关键词统计出来的，只表示“这段文字提到过”，不表示“讲清楚了”；
- 物种/分期是从标题和正文判断的；跨物种/跨分期的章节会标 `both` 或列出多个分期；
- 碘在 5 份 CKD 文档中没有出现（覆盖地图“未覆盖主题”），这是 **知识库来源缺口**，不是食物营养数据问题；
- 权威性只区分 guideline / textbook / reference，**不做临床冲突裁决**。
