# CFCT OCR 结构化入库流程

## 目标

把本地扫描版《中国食物成分表》先转成可审计的 OCR 中间数据，再解析为结构化 CFCT 来源行。OCR 阶段不直接覆盖标准原料营养档案；经人工复核后的 JSON 才进入 `nutrition_source_record`。

## 流程

1. OCR PDF 页，生成逐页 JSONL：

```bash
cd /Users/zhaochen/Documents/SevenKitchen/.worktrees/ingredient-nutrition-governance/backend
npm run ocr:cfct-pages -- \
  --pdf '/Users/zhaochen/Documents/Seven/宠物学习资料/书籍/杨月欣 - 中国食物成分表 标准版 第6版 第1册 (2018, 北京大学医学出版社) - libgen.li.pdf' \
  --volume '第六版 第一册' \
  --start-page 120 \
  --end-page 140 \
  --orientation right \
  --output reports/cfct-v1-p120-p140.jsonl
```

2. 解析 OCR JSONL，生成结构化 JSON 和 CSV 审核报告：

```bash
npm run import:cfct-ocr-source -- \
  --ocr-input reports/cfct-v1-p120-p140.jsonl \
  --structured-output reports/cfct-v1-p120-p140-structured.json \
  --report-output reports/cfct-v1-p120-p140-report.csv
```

也可以一步完成 OCR 和结构化：

```bash
npm run import:cfct-ocr-source -- \
  --pdf '/absolute/path/to/cfct.pdf' \
  --volume '第六版 第一册' \
  --start-page 120 \
  --end-page 140 \
  --orientation right \
  --ocr-output reports/cfct-v1-p120-p140.jsonl \
  --structured-output reports/cfct-v1-p120-p140-structured.json \
  --report-output reports/cfct-v1-p120-p140-report.csv
```

3. 人工审核 `structured.json` 或 `report.csv`，重点修正 OCR 误差，例如相似汉字、漏列、错位、`Tr`、页方向错误。

4. 审核完成后，可以在管理后台进入 `原料管理 > 营养档案 > CFCT 入库`，上传或粘贴 `structured.json`，在表格中修正后导入。

也可以用命令行导入已审核 JSON：

```bash
npm run import:cfct-private:apply -- \
  --input=/absolute/path/to/reviewed-cfct-rows.json
```

## 质量控制

- OCR 原始结果保留在 JSONL 的 `observations`、`fullText` 和置信度中。
- 结构化行会记录 `sourcePdf`、`ocrPage`、`ocrLine`、`rawOcrText`、`qualityFlags`。
- 主表和续表会通过 `foodCode` 合并；`sourceSegments` 会分别保留主表行和续表行的页码、行号、原始 OCR 文本和置信度。
- 默认不允许 OCR 结果直接 `--apply` 入库；如果确实要跳过人工审核，需要显式追加 `--allow-auto-import`。
- 常见 CFCT 横向表格需要 `--orientation right`；封面、目录等普通竖向页通常用默认 `up`。
- 第 1 册第 120-122 页校准结果：横向表格用 `--orientation right` 解析 3 页，生成 45 条结构化行，其中 36 条可自动结构化，9 条因续表缺列或宏量校验异常进入复核。

## 续表合并口径

- 主表页识别 `食物编码/食物名称/食部/水分/能量` 结构，录入水分、能量、蛋白质、脂肪、碳水化合物、不溶性膳食纤维，以及硫胺素、核黄素。
- 续表页识别 `烟酸/维生素C/维生素E/钙/磷/钾/钠/镁/铁/锌/硒/铜/锰` 结构，按相同 `foodCode` 合并回主表行。
- 续表中的烟酸、维生素 C 和矿物质直接进入标准营养字段；维生素 E 分型值暂存为 `unmappedNutrients`，不自动折算成标准维生素 E，避免天然/合成和不同生育酚口径混用。
- 如果续表行缺列，合并后的主表行会带 `CONTINUATION_INCOMPLETE`，需要人工复核；如果只有续表行但找不到主表行，会带 `MISSING_PRIMARY_ROW`。

## 全书表格覆盖

已核查第六版上下册目录和 OCR 页段，本阶段纳入结构化流程的表格如下：

- 表一：能量和食物一般营养成分。作为主表，优先按 `foodCode` 合并。
- 表二：食物氨基酸含量。按 `foodCode` 合并，mg/100g 转为 g/100g 写入氨基酸字段；丙氨酸、天冬氨酸、丝氨酸等当前标准结构未覆盖的项保留在 `unmappedNutrients`。
- 表三：食物脂肪酸含量。脂肪酸总量表中的饱和、单不饱和、多不饱和脂肪酸写入脂肪酸字段；细分脂肪酸当前先保留为待复核来源。
- 表四：常见食物碘含量。没有 CFCT 主表 `foodCode`，先生成待审核来源行，碘写入 `minerals.iodine`。
- 表五：食物中维生素含量。5-1 叶酸写入 `vitamins.vitaminB9` 待审核；5-2 胆碱、生物素、泛酸按 `foodCode` 合并；5-3 USDA 胆碱表没有 CFCT 主表 `foodCode`，先生成待审核来源行。
- 表六：植物化学物。植物甾醇、胡萝卜素、叶黄素/玉米黄素、异黄酮等不属于当前犬配方核心营养字段，暂不自动写入标准营养字段，后续如需要可扩展为自定义营养项或专题来源。
- 第二册表六：常见食物嘌呤含量。嘌呤不是当前标准营养字段，先保留 `cfctPurineTotalMg` 待审核。
- 第二册表七：DHA 和 EPA。没有 CFCT 主表 `foodCode`，先生成待审核来源行；DHA/EPA 从 g/100g 转为 mg/100g 写入脂肪酸字段。

附录、DRIs、GI、食物样品描述、参考文献等用于追溯或检索，不直接作为营养档案主数据入库。

## 最新合并结果

使用已存在 OCR JSONL 重新生成全部 29 个批次，并执行 `structure-cfct-full-source.ts --merge-only` 后：

- 完整中间库：`backend/reports/cfct-full/cfct-v6-full-structured.json`
- 可自动入库：`backend/reports/cfct-full/cfct-v6-full-auto-ready.json`
- 待人工复核：`backend/reports/cfct-full/cfct-v6-full-needs-review.json`
- 审核摘要：`backend/reports/cfct-full/cfct-v6-full-review-summary.json`

当前合并摘要：

- 总结构化来源行：3893
- 可自动入库行：192
- 待审核行：3701
- 第一册：1771 行，其中 162 行可自动入库
- 第二册：2122 行，其中 30 行可自动入库

关键新增营养覆盖：

- 氨基酸字段来源：746 行
- 脂肪酸/DHA/EPA 字段来源：1316 行
- 胆碱、维生素 B5、维生素 B7 来源：410 行
- 碘来源：449 行
- 叶酸来源：220 行
- 嘌呤待审核来源：314 行

注意：序号型表格没有稳定的 CFCT 主表编码，且 OCR 双栏页面存在错位风险，因此全部保持待审核状态；只有人工确认后才允许写入项目数据库。
