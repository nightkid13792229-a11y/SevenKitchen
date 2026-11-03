# 已发布食谱补剂目标重算清单（2026-10-22）

## 范围

- 已发布食谱：97 份；
- 有补剂目标且需要更新的食谱项：87 条；
- 目标值发生变化的项：103 条；
- 无法重算/跳过的目标：362 条（营养档案为空、目标字段无值或无法解析有效克重）。

## 变更字段分布

- `minerals.iodine`: 16
- `vitamins.choline`: 10
- `minerals.copper`: 12
- `minerals.zinc`: 16
- `minerals.calcium`: 16
- `minerals.phosphorus`: 11
- `vitamins.vitaminD`: 2
- `minerals.iron`: 9
- `vitamins.vitaminE`: 4
- `vitamins.vitaminB2`: 2
- `derived.caP`: 5

## 处理规则

- 保留原 `fieldPath` / label / unit；
- 只按 `contribution / assessment.totalWeightG × 1000` 更新 `targetValuePerKg`；
- 同步更新兼容的 `nutrientTargetKey/Value`；
- 已交付订单的 delivery snapshot 不变；
- 跳过的历史项不伪造数值，后续纳入人工审核。

## 影响

- 后续订单计价与批量生产用量会随新目标值变化；
- 这是业务已确认接受的价格变化。
