# 青口贝缺失营养字段补源第一轮

生成时间：2026-05-18T03:18:17.101Z

## 结论

- 同物种可直接补入候选：0 条
- 近似物种候选：0 条
- 仅参考来源：0 条
- 暂无可信原始值：7 条

本轮没有找到可直接补入青口贝 NZFCD 主/次档案的同物种缺失字段原始值。USDA 与 CNF 能补到维生素 B5、胆碱（仅生）、以及多数氨基酸，但对象是 blue mussel / common mussel，不是 Perna canaliculus，只能作为近似物种补源候选。

## 当前 NZFCD 档案

| 档案 | 角色 | 状态 | 食物名 |
| --- | --- | --- | --- |
| NZFCD:T1024 | PRIMARY | 生 | Mussel, green, meat, fresh, raw |
| NZFCD:T1026 | SECONDARY | 熟 | Mussel, green, meat, boiled |

## 近似物种候选

| 档案 | 字段 | 候选来源 | 值 | 单位 | 说明 |
| --- | --- | --- | ---: | --- | --- |

## 仍缺来源

| 档案 | 字段 | 说明 |
| --- | --- | --- |
| NZFCD:T1024 | 氯 (minerals.chloride) | 氯 暂未在 NZFCD、USDA/CNF 近似贻贝候选中找到可用原始值。 |
| NZFCD:T1024 | 维生素 B7 (vitamins.vitaminB7) | 维生素 B7 暂未在 NZFCD、USDA/CNF 近似贻贝候选中找到可用原始值。 |
| NZFCD:T1024 | 牛磺酸 (aminoAcids.taurine) | 牛磺酸 暂未在 NZFCD、USDA/CNF 近似贻贝候选中找到可用原始值。 |
| NZFCD:T1026 | 氯 (minerals.chloride) | 氯 暂未在 NZFCD、USDA/CNF 近似贻贝候选中找到可用原始值。 |
| NZFCD:T1026 | 维生素 B7 (vitamins.vitaminB7) | 维生素 B7 暂未在 NZFCD、USDA/CNF 近似贻贝候选中找到可用原始值。 |
| NZFCD:T1026 | 胆碱 (vitamins.choline) | 胆碱 暂未在 NZFCD、USDA/CNF 近似贻贝候选中找到可用原始值。 |
| NZFCD:T1026 | 牛磺酸 (aminoAcids.taurine) | 牛磺酸 暂未在 NZFCD、USDA/CNF 近似贻贝候选中找到可用原始值。 |

## 来源判断

- NZFCD T1024/T1026：同物种青口贝主来源，但不包含氯、B5、B7、胆碱、完整氨基酸谱。B1 是原始值 0，不是缺失。
- USDA 174216/174217：官方食品成分库，blue mussel raw/cooked，可作为近似物种候选，不自动并入。
- CNF 3115/3116：加拿大官方食品成分库，blue mussel raw/boiled-or-steamed；与 USDA 高度一致，更适合作为交叉核对，不是独立的青口贝同物种来源。
- 产品粉、提取物、供应商页面：加工状态不同，只可作为 SKU/补剂或产品 COA 参考，不建议补入鲜/熟食材档案。

## 建议

1. 不自动把 USDA/CNF 的 blue mussel 数据写入青口贝主档案。
2. 如果配方设计短期需要完整氨基酸谱，可以新增“近似物种补源”审核入口，由你确认后仅对缺失字段生效。
3. 氯、B7、熟制胆碱、牛磺酸建议暂不补；后续优先找实验室检测、供应商 COA，或同物种 Perna canaliculus 原始研究数据。

## 外部依据

- NZFCD FOODfiles 2024：官方说明 2024 版包含 2,857 种食品，标准版 87 个组件，完整版最多 434 个组件，但并非每个食物都有所有组件。
- USDA FoodData Central：本地下载数据中的 174216 / 174217。
- Canadian Nutrient File 2015：官方 CSV 下载数据中的 3115 / 3116。
