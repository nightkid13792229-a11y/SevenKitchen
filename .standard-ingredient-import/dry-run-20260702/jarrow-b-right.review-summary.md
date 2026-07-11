# Jarrow Formulas B-Right 演练评审小结

## 当前结论

- 南美对虾已暂停，不纳入本次继续推进范围。
- B-Right 补剂 manifest 已按用户提供的正面图和 Supplement Facts 图补齐。
- 标签证据满足补剂演练要求：有包装正面、Supplement Facts、每份用量、净含量、活性营养素、单位和辅料。
- 该补剂不需要 USDA/CIQUAL 等食材营养库；补剂的主证据是具体产品包装和标签。
- 已按用户确认写入本地开发数据库；已生成生产包；已写入生产库。
- 人工审阅清单：`jarrow-b-right.local-review-checklist.md`。
- 用户已于 2026-07-02 核对营养信息，确认没有问题。
- 用户已要求进入生产包准备流程；已创建生产只读数据库用户、生成本地 `.env.production.readonly`、通过只读连接验证和 DB 对齐，并生成生产包。详见 `jarrow-b-right.production-package-readiness.md`。
- 生产执行前检查详见 `jarrow-b-right.production-apply-checklist.md`；生产 Apply 结果详见 `jarrow-b-right.production-apply-result.md`。

## 标签核对

- 产品：Jarrow Formulas B-Right B族维生素复合胶囊。
- 英文品名：Jarrow Formulas B-Right Optimized B-Complex。
- 规格：100 veggie capsules。
- 每份：1 capsule。
- 已记录活性成分：B1、B2、B3、B6、叶酸、B12、生物素、泛酸、胆碱、泛硫乙胺、肌醇。
- 单位核对：mg、mcg、mcg DFE、mg NE 已按标签保留；未把微克、毫克、克混用。
- B6 拆分备注：Pyridoxine HCl 25 mg + Pyridoxal 5-Phosphate 10 mg，总量 35 mg。
- 叶酸备注：680 mcg DFE，其中 400 mcg as 6S-5-MTHF。
- 未推断标签上没有给出的浓度或营养值。

## 本地重复检查

- 精确重复：0 条。
- 相似补剂：1 条，NOW FOODS B族维生素胶囊，属于同类不同品牌，不是同款重复。

## 审计状态

- `jarrow-b-right.precheck.audit.json`：正式 manifest 审计通过。
- `jarrow-b-right.local-apply.audit.json`：本地开发库写入成功。
- 本地新增原料 ID：`814a9199-f944-4c8f-b651-61f6e4eea765`。
- 本地 apply 审计显示：`dbAlignmentStatus = passing`，alignment id 为 `5543a5b1ca65`。
- 生产包确认已按用户要求打开，生产包已生成。
- 生产包目录：`jarrow-b-right-production-package`。

## 本地写入反查

- 原料类型：`SUPPLEMENT`。
- 品牌：Jarrow Formulas。
- 型号：B-Right Optimized B-Complex, 100 veggie capsules。
- 包装证据：已写入 `Ingredient.properties.packageEvidence`。
- 标签证据：已写入 `Ingredient.properties.supplementLabel`。
- 采购 SKU：0 条。
- 营养库映射：0 条。
- 标签分配：0 条。

## 验证

- `npm test -- --runInBand tests/application/standard-ingredient-import/local-ingredient-import.spec.ts tests/application/standard-ingredient-import/db-alignment.spec.ts tests/application/standard-ingredient-import/source-policy.spec.ts`
- 结果：3 个测试套件通过，35 条测试通过。

## 下一步

- 本次 B-Right 补剂已完成生产 Apply。
- 如需回滚：执行生产包中的 `down.sql`，它只删除 ID 为 `814a9199-f944-4c8f-b651-61f6e4eea765` 的记录。
