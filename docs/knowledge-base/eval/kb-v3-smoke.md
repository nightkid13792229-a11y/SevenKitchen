# 知识库 v3 冒烟报告

- 生成时间：2026-11-11T16:23:37.087Z
- 仓库：`/Users/zhaochen/Documents/SevenKitchen/.worktrees/20261111-kb-v3`
- 目标文档：`sacn5-chapters-SACN5-37`
- `KB_PAGE_IMAGE_ROOT`：`(未设置，默认 ../docs/knowledge-base/page-images，相对 backend cwd)`
- 结论：PASS

| 步骤 | 结果 | 详情 |
| --- | --- | --- |
| catalog 文档数 | PASS | 文档数 159（集合 10 个） |
| SACN5-37 目录 | PASS | 目录 1 条；首条 "全文 1..46" p1–46 |
| find phosphorus 命中 17–22 节 | PASS | hits=5 top=p24 score=1.900；前 5 页=24,21,22,23,25 |
| read p17–21：5 页 / 锚点 / 页图 / base64 / 文本 | PASS | 5 页，锚点 sacn5-chapters-SACN5-37/p17..sacn5-chapters-SACN5-37/p21，表块未检测到（页图仍在，不算失败） |
| nextCursor 续读 | PASS | 续读 p18–p18（1 页） |
| 负样本 0 命中且无“未覆盖”字样 | PASS | "vitamin K" → hits=0，searched=1 文档 / 46 页 |
| 无文字层文档第 1 页可读 | PASS | wsava-nutrition-Muscle-Condition-Score-Cat p1 text=0 字，imagePath=wsava-nutrition-Muscle-Condition-Score-Cat/p0001.jpg |
| 页码 99999 → PAGE_OUT_OF_RANGE | PASS | code=PAGE_OUT_OF_RANGE |
| find 20 次 p50/p95/max（p95 < 300ms） | PASS | p50=19.9ms p95=26.4ms max=28.7ms |

> 本脚本读真实库、不调用模型；表块检测漏了不算失败（页图仍在）；
> 负样本 0 命中只表示“这组词没命中”，不表示“知识库未覆盖”该主题。
