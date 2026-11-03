# USDA 定向复核与入库跟进

生成时间：2026-05-18

## 已入库调整

| 标准原料 | 结果 | USDA FDC ID | 词条 | 档位 |
| --- | --- | --- | --- | --- |
| 冬瓜 | 已入库 | 170069 | Waxgourd, (chinese preserving melon), raw | 主档案，生 |
| 冬瓜 | 已入库 | 170475 | Waxgourd, (chinese preserving melon), cooked, boiled, drained, without salt | 次级档案，熟 |
| 黑木耳 | 已入库 | 169237 | Jew's ear, (pepeao), raw | 主档案，生 |
| 生蚝 | 已入库 | 175172 | Mollusks, oyster, eastern, farmed, raw | 主档案，生，人工养殖 |
| 生蚝 | 已入库 | 175173 | Mollusks, oyster, eastern, farmed, cooked, dry heat | 次级档案，熟，人工养殖 |

同时移除了以下旧映射，避免后续食谱误选：

- 黑木耳：移除 `USDA:168581`，因为该词条是 `Fungi, Cloud ears, dried`，与“鲜木耳”不一致。
- 生蚝：移除 `USDA:171978`、`USDA:171980`，因为这两个词条均为 eastern wild oyster。

## 已查找但暂不入库

| 标准原料 | USDA 查找结论 | 处理 |
| --- | --- | --- |
| 鹌鹑蛋 | 未找到 quail egg 的熟制词条；只找到普通鸡蛋熟制或鹌鹑肉。 | 不硬匹配，保留生档案。 |
| 豆腐 | 未找到默认 plain cooked tofu；存在 fried、salted/fermented、dried-frozen 等加工态。 | 不作为默认熟档案。 |
| 鹅肝 | 未找到 goose liver cooked；只找到鹅肉熟制或其他物种肝脏熟制。 | 不硬匹配。 |
| 鸭蛋 | 未找到 duck egg cooked；普通 egg cooked 不作为鸭蛋替代。 | 不硬匹配。 |
| 鸭肝 | 未找到 duck liver cooked；只找到鸭肉或其他物种肝脏熟制。 | 不硬匹配。 |
| 鸭胸 | 找到 duck breast cooked 词条 `171511`，但缺少磷等基础营养覆盖；通用 duck meat cooked 不是胸肉。 | 暂不入库。 |
| 羊肚菌（鲜） | 未找到 cooked morel。 | 不硬匹配。 |
| 金针菇 | 未找到 cooked enoki。 | 保留生档案，后续可转 CFCT/手工。 |
| 舞茸 | 未找到 cooked maitake。 | 保留生档案，后续可转 CFCT/手工。 |
| 青口贝 | 未找到 New Zealand green-lipped mussel；blue mussel 不作为默认替代。 | 暂无 USDA 主档案。 |
| 沙丁鱼 | 仅找到 fish oil sardine、罐头油浸/番茄汁沙丁鱼；未找到默认 raw/cooked sardine。 | 暂无 USDA 主档案。 |
| 鸭心 | 未找到 duck heart raw/cooked；其他物种心脏不替代。 | 暂无 USDA 主档案。 |
| 鸭胗 | 未找到 duck gizzard raw/cooked；鸡胗/火鸡胗不替代。 | 暂无 USDA 主档案。 |
| 薏仁米 | 未找到 coix seed、Job's tears、adlay。 | 暂无 USDA 主档案。 |
| 黄瓜 | 不需要熟档案；保留带皮主档案与去皮次级档案。 | 审计口径已调整。 |

## 最新审计状态

- 食材标准原料：114 条
- 已有 USDA 主档案：109 条
- 仍需重新查找/导入 USDA 候选：5 条：青口贝、沙丁鱼、鸭心、鸭胗、薏仁米
- 质量审计通过：99 条
- 质量审计需要人工决策：15 条
- 需要修复：0 条
- 建议拒绝或重新匹配：0 条

最新明细：

- `docs/reports/2026-05-18-usda-nutrition-ingestion-progress.csv`
- `docs/reports/2026-05-18-usda-nutrition-quality-audit.csv`
