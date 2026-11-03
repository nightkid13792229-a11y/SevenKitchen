# 标准原料统一营养数据录入重构设计

## 背景

当前项目已经明确：

- 标准原料、DIY SKU、采购SKU 三类对象要解耦
- 食材类原料与补剂类原料要共用一套统一营养数据结构
- 后续希望为犬猫食谱设计、营养平衡、配方评估等能力铺路

但当前后台中的“统一营养数据”录入方式仍然偏自由表格式，存在以下问题：

- 录入结构不稳定，缺少固定的营养分组
- 营养数据缺少明确的“原始口径”和“换算上下文”
- 食材与补剂虽然共用字段，但录入体验仍然不像专业营养建模工具
- 后续如果要支持类似 ADF / PDD 的食谱设计能力，当前结构过于松散

本轮希望参考 ADF 的录入方式，但不照搬其复杂原料背景信息，而是聚焦在“统一营养数据的录入结构、录入口径、字段分组和治理方式”。

## 本轮目标

1. 重构标准原料的统一营养数据录入方式
2. 为食材和补剂提供完全一致的一套固定模板
3. 一次性铺完整营养素架构，但允许大部分字段留空
4. 支持按原始口径录入，再由系统统一换算
5. 以系统预设营养素字典为主，同时允许少量自定义营养项

## 本轮非目标

- 不重构原料背景信息为 ADF 那种完整的原料档案模型
- 不在本轮细化订单侧、DIY 侧或用户侧的营养展示交互
- 不要求本轮一次性补齐所有历史原料的营养数据
- 不在本轮实现完整的食谱设计与营养计算功能

## 核心设计原则

### 1. 所有标准原料共用同一套固定模板

食材类和补剂类原料不再拆成两套不同的营养录入页面。

统一模板的价值：

- 录入认知统一，方便培训和维护
- 后续食谱设计能力可以直接基于标准原料营养档案
- 数据治理时不需要处理两套异构营养模型

### 2. 第一版一次性铺完整营养素架构

第一版就提供以下固定页签：

- 宏量
- 矿物质
- 维生素
- 脂肪酸
- 氨基酸

说明：

- 这五个页签在所有标准原料上都存在
- 字段可以留空，但架构必须一次性定稳
- 第一版不做“只给食材显示部分页签”或“只给补剂显示部分页签”的差异化模板

### 3. 录入时保留原始口径，系统统一换算

营养数据允许按真实来源口径录入，例如：

- 每100g
- 每100ml
- 每1g
- 每1ml
- 每1粒 / 每1片 / 每1勺 / 每1份

系统内部需要根据辅助参数进行统一换算，以便后续计算和对比。

这样做的原因：

- 食材类原料通常天然适合每100g / 每100ml
- 补剂类原料很多真实来源就是按每粒、每勺或每份标注
- 强迫补剂先人工换算成每100g 会显著增加录入门槛和出错率

### 4. 以系统预设营养素字典为主，允许少量自定义项

营养数据的主体必须使用系统预设字典，以保证：

- 字段命名稳定
- 单位稳定
- 后续食谱设计、营养计算、报表统计稳定

同时保留一个“自定义营养项”区域，用于容纳：

- 暂未纳入主字典的新营养素
- 特殊活性成分
- 某些供应商独有但暂时无法标准化的补充信息

自定义营养项不能污染核心营养素字典。

## 后台页面结构

统一营养数据采用：

`顶部固定区 + 五个固定营养页签 + 自定义营养项`

### 一、顶部固定区

顶部固定区不是录“营养素本身”，而是录“这份营养数据的上下文”。

它的职责是回答四个问题：

1. 这份数据原本按什么口径给出
2. 系统靠什么把它换算成统一口径
3. 这份数据从哪儿来
4. 这份数据当前是否可信、最近何时更新

建议拆成四组：

#### 1. 原始录入口径

- `rawBasisType`
  - 每100g
  - 每100ml
  - 每1g
  - 每1ml
  - 每1粒 / 每1片 / 每1勺 / 每1份
- `sampleState`
  - 生
  - 熟
  - 冻干
  - 风干
  - 粉末
  - 油
  - 浓缩液
- `isEdiblePortionBasis`
  - 是否按可食部录入

字段意义：

- `rawBasisType` 决定整份营养数据的原始计量基准
- `sampleState` 用来区分同一种原料在不同物理状态下的营养差异
- `isEdiblePortionBasis` 主要服务食材类原料，区分“整件口径”和“可食部口径”

#### 2. 换算辅助参数

- `ediblePortionRate` 可选
- `densityGPerMl` 可选
- `servingWeightG` 可选

字段意义：

- `ediblePortionRate` 用于按可食部换算
- `densityGPerMl` 用于 ml 与 g 之间换算
- `servingWeightG` 用于按粒、勺、份等计量单位换算到统一口径

说明：

- 不是所有原料都需要填写全部辅助参数
- 应按口径和原料类型按需展示或按需填写

#### 3. 数据来源

- `sourceType`
  - 检测报告
  - 标签
  - 文献
  - 供应商资料
  - 人工估算
- `sourceTitle`
- `sourceProvider`
- `attachments`

字段意义：

- 标记这份数据来自哪里
- 让后续数据回溯、复核、替换有据可查

#### 4. 数据治理信息

- `confidenceLevel`
  - 高
  - 中
  - 低
- `versionNote`
- `updatedAt`
- `normalizedBasisPreview` 只读展示

字段意义：

- `confidenceLevel` 用于表达数据可信程度
- `versionNote` 用于记录这次更新的来源或原因
- `normalizedBasisPreview` 用于告诉录入人系统最终会如何理解和换算这份数据

### 二、固定营养页签

所有标准原料共用五个固定页签。

#### 1. 宏量

建议纳入主字典的字段：

- 能量 `energyKcal`
- 水分 `moisture`
- 粗蛋白 `crudeProtein`
- 粗脂肪 `crudeFat`
- 灰分 `ash`
- 总碳水 `carbohydrate`
- 总膳食纤维 `fiber`
- 可溶性纤维 `solubleFiber` 可选
- 不溶性纤维 `insolubleFiber` 可选

说明：

- 这是最常录、最常查的一组
- 第一版应在 UI 上作为优先可见区

#### 2. 矿物质

建议纳入主字典的字段：

- 钙 `calcium`
- 磷 `phosphorus`
- 钾 `potassium`
- 钠 `sodium`
- 镁 `magnesium`
- 氯 `chloride`
- 铁 `iron`
- 锌 `zinc`
- 铜 `copper`
- 锰 `manganese`
- 硒 `selenium`
- 碘 `iodine`

第二层可扩展项：

- 硫 `sulfur`
- 铬 `chromium`
- 钼 `molybdenum`
- 氟 `fluoride`

#### 3. 维生素

建议纳入主字典的字段：

- 维生素 A `vitaminA`
- 维生素 D `vitaminD`
- 维生素 E `vitaminE`
- 维生素 K `vitaminK`
- 维生素 B1 `vitaminB1`
- 维生素 B2 `vitaminB2`
- 维生素 B3 `vitaminB3`
- 维生素 B5 `vitaminB5`
- 维生素 B6 `vitaminB6`
- 生物素 / B7 `vitaminB7`
- 叶酸 / B9 `vitaminB9`
- 维生素 B12 `vitaminB12`
- 胆碱 `choline`
- 维生素 C `vitaminC`

说明：

- 维生素 C 虽然在犬猫营养里不是所有场景都属于核心必需项，但应允许纳入主字典

#### 4. 脂肪酸

建议纳入主字典的字段：

- 饱和脂肪酸 `saturatedFattyAcids`
- 单不饱和脂肪酸 `monounsaturatedFattyAcids`
- 多不饱和脂肪酸 `polyunsaturatedFattyAcids`
- 亚油酸 `linoleicAcid`
- α-亚麻酸 `alphaLinolenicAcid`
- 花生四烯酸 `arachidonicAcid`
- EPA `epa`
- DPA `dpa`
- DHA `dha`

说明：

- 这一组对鱼油类、脂类补剂和后续脂肪酸平衡设计非常重要

#### 5. 氨基酸

建议纳入主字典的字段：

- 精氨酸 `arginine`
- 赖氨酸 `lysine`
- 蛋氨酸 `methionine`
- 胱氨酸 `cystine`
- 牛磺酸 `taurine`
- 色氨酸 `tryptophan`
- 苏氨酸 `threonine`
- 亮氨酸 `leucine`
- 异亮氨酸 `isoleucine`
- 缬氨酸 `valine`
- 苯丙氨酸 `phenylalanine`
- 酪氨酸 `tyrosine`
- 组氨酸 `histidine`
- 谷氨酸 `glutamicAcid` 可选
- 甘氨酸 `glycine` 可选
- 脯氨酸 `proline` 可选

说明：

- 第一版主字典应优先收纳犬猫食谱设计中最常用的关键氨基酸
- 部分扩展氨基酸可保留为字典扩展项或自定义项

### 三、自定义营养项

自定义营养项单独成区，不混入固定五页签。

建议字段：

- `name`
- `value`
- `unit`
- `rawBasisType`
- `note`

适用场景：

- 暂未进入主字典的营养素
- 特殊活性成分
- 某些过渡期字段

限制原则：

- 自定义项不参与第一版的核心食谱设计计算
- 自定义项不能替代主字典中已有字段

## 录入交互规则

### 1. 固定模板，不做食材/补剂差异化页面

无论原料类型是食材还是补剂，都进入同一套营养录入模板。

差异只体现在：

- 默认展示提示
- 部分辅助字段是否更常用
- 某些字段优先高亮

而不体现在页面结构分叉。

### 2. 第一版不做复杂必填规则

第一版不建议建立复杂的“类型 × 页签 × 字段”的强校验矩阵。

建议只做三层引导：

- 核心字段优先显示
- 所有字段允许空值
- 缺少关键营养项时给出提示，而不是强拦截

这样可以在保证架构完整的同时，降低录入压力。

### 3. 固定单位，用户只录数值

主字典中的每个营养素字段应预先定义单位。

例如：

- 蛋白质、脂肪等默认 `g`
- 钙、磷、钠、碘等默认 `mg`
- 部分维生素默认 `IU`、`mg` 或 `μg`

录入时：

- 用户主要填写数值
- 系统展示字段名 + 预设单位
- 避免同一营养素被录成多种单位

### 4. 系统提供统一换算预览

当用户按原始口径录入时，系统应在页面上展示：

- 原始口径
- 相关辅助参数
- 内部统一口径的换算结果预览

目标不是本轮就做复杂公式编辑器，而是先减少单位理解偏差。

## 数据模型建议

建议将 `nutritionProfile` 从“自由营养素列表”升级成“结构化营养档案对象”。

建议结构如下：

```ts
type IngredientNutritionProfile = {
  meta: {
    rawBasisType: 'PER_100_G' | 'PER_100_ML' | 'PER_1_G' | 'PER_1_ML' | 'PER_SERVING'
    sampleState?: 'RAW' | 'COOKED' | 'FREEZE_DRIED' | 'AIR_DRIED' | 'POWDER' | 'OIL' | 'CONCENTRATE'
    isEdiblePortionBasis?: boolean
    ediblePortionRate?: number
    densityGPerMl?: number
    servingWeightG?: number
    sourceType?: 'LAB_REPORT' | 'LABEL' | 'LITERATURE' | 'SUPPLIER' | 'MANUAL_ESTIMATE'
    sourceTitle?: string
    sourceProvider?: string
    attachments?: string[]
    confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW'
    versionNote?: string
  }
  macros: Record<string, number | null>
  minerals: Record<string, number | null>
  vitamins: Record<string, number | null>
  fattyAcids: Record<string, number | null>
  aminoAcids: Record<string, number | null>
  customItems: Array<{
    name: string
    value: number
    unit: string
    rawBasisType?: string
    note?: string
  }>
}
```

说明：

- 本轮重点是结构方向，不强制要求后端字段名必须完全按上面命名
- 但整体数据模型应从“松散列表”转向“固定分组对象 + 自定义补充项”

## 对现有后台的改造建议

当前后台中的“统一营养数据”板块建议调整为：

1. 将顶部固定区提升到营养板块顶部
2. 将当前自由列表式录入替换为固定页签录入
3. 将每个页签内的字段做成固定营养素字典表单
4. 将“自定义营养项”放在最后单独管理
5. 在页面上增加统一口径说明和换算预览

## 实施优先级建议

### 第一阶段

- 定义统一营养素字典
- 定义 `nutritionProfile` 结构
- 完成后台固定页签改造
- 完成原始口径与辅助换算字段建模

### 第二阶段

- 增强换算预览
- 增加关键营养素缺失提示
- 对接后续食谱设计或营养计算能力

## 结论

本轮统一营养数据重构建议采用：

- 固定模板
- 固定五页签
- 顶部固定上下文字段
- 原始口径录入 + 系统统一换算
- 主字典为主 + 自定义营养项补充

这套方案兼顾了当前落地成本和后续扩展能力：

- 不必现在就把所有历史营养数据补齐
- 但架构已经足够支撑后续更专业的食谱设计能力
- 同时避免了为食材和补剂维护两套不同营养模型
