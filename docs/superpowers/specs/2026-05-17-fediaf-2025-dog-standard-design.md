# FEDIAF 2025 犬标准嵌入设计

## 背景

SevenKitchen 正在建设类似 ADF 和 PDD 的宠物食谱设计能力。这个能力依赖三类底座：

- 可信的标准原料营养档案
- 可追溯的营养标准库
- 能把配方营养汇总结果与标准要求稳定匹配的计算规则

当前项目已经具备 `Ingredient.nutritionProfile`、`NutritionFood`、`NutritionFoodMapping` 和标准原料统一营养模板。数据库里也存在旧的 `nutrition_standard_fediaf` 表，但代码检索显示它目前只被 Prisma schema、旧 seed 脚本、历史 migration 和旧设计文档引用，运行时后端、管理端和小程序没有读取它。本轮可以用新的版本化标准库替代，并通过 Prisma migration 删除旧表和旧 seed 脚本。

## 本轮目标

1. 只嵌入 FEDIAF 2025 犬标准。
2. 由 Codex 将官方指南中的犬标准表格结构化，并通过 seed 自动导入数据库。
3. 覆盖核心推荐表和 Annex 7.8 汇总表。
4. 在 Web 管理后台提供只读可视化审核页面。
5. 后台允许审核标记和审核备注，但不允许直接修改官方标准值。
6. 建立营养素字典和映射层，保证 FEDIAF 标准能和现有原料营养规格匹配。
7. 为后续配方评估、AI Agent 自动设计和小程序结果展示预留接口边界。

## 非目标

- 不嵌入猫标准。
- 不实现完整食谱自动平衡算法。
- 不实现 AI Agent 自动生成配方。
- 不开放小程序端标准管理入口。
- 不做后台手动导入新标准入口。
- 不允许后台直接编辑官方标准数值。

## 数据范围

来源使用 FEDIAF 官方 2025 指南 PDF：

- 标题：FEDIAF Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs, Publication September 2025
- 官方页面：https://europeanpetfood.org/self-regulation/nutritional-guidelines/
- PDF：https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf

本轮结构化以下犬相关表格：

### 核心推荐表

- Table III-3a：Complete dog food，per 100g dry matter，PDF 页脚第 15 页
- Table III-3b：Complete dog food，per 1000 kcal ME，PDF 页脚第 16 页
- Table III-3c：Complete dog food，per MJ ME，PDF 页脚第 17 页

核心推荐表作为官方源数据，用于标准溯源、复核和长期维护。

### Annex 7.8 汇总表

- Table VII-17a：早期生长 `<14周` + 繁殖，PDF 页脚第 73 页
- Table VII-17b：晚期生长 `≥14周`，PDF 页脚第 74 页
- Table VII-17c：成年犬 MER 110 kcal/kg BW^0.75，PDF 页脚第 75 页
- Table VII-17d：成年犬 MER 95 kcal/kg BW^0.75，PDF 页脚第 76 页

Annex 7.8 作为实际配方校验优先读取的计算表。它按生命周期和维持能量需求整理，更适合食谱设计器和 AI Agent 使用。

## 核心设计决策

### 1. 使用新版本化标准库替代旧表

旧的 `nutrition_standard_fediaf` 表只支持单版本、单物种和成人/幼犬两组值，无法表达 FEDIAF 2025 的多口径、多生命周期、MER 95/110、核心表与 Annex 表关系、脚注和最大值类型。

本轮新增版本化标准库，并删除旧的 `nutrition_standard_fediaf` Prisma model、数据库表和旧 seed 脚本。

### 2. 官方标准值只读，审核信息单独保存

后台审核页面不直接改标准值。审核动作写入独立审核表，记录：

- 未审核
- 已审核
- 有疑问
- 需修正
- 审核备注
- 审核人
- 审核时间

如果结构化数据需要修正，由开发侧更新 seed 数据并重导对应版本。

### 3. FEDIAF 名称不直接参与计算

FEDIAF 表格里的营养素名称、单位和组合项必须先映射到项目内部营养素字典，再参与配方计算。

这样可以避免 USDA、CFCT、FEDIAF 和后台原料档案各自使用不同名称导致计算不稳定。

## 数据模型设计

### 标准版本

新增标准版本表，用于记录一个标准版本的元信息。

建议字段：

- 标准代码：`FEDIAF_2025`
- 标准名称：`FEDIAF 2025`
- 物种：`DOG`
- 发布年月：`2025-09`
- 来源标题
- 来源 URL
- PDF URL
- 导入批次
- 导入状态
- 是否启用
- 导入时间

### 营养素字典

新增项目内部营养素字典，作为标准与原料营养数据之间的统一语言。

建议字段：

- 内部营养素代码，例如 `calcium`
- 字段路径，例如 `minerals.calcium`
- 中文名
- 英文名
- 分类：宏量、矿物质、维生素、脂肪酸、氨基酸、派生项
- 原料默认单位
- 标准默认单位
- 是否可直接从原料档案读取
- 是否为派生营养素

### 标准条目

每条标准条目表示一个营养素在某个来源表、生命周期、表达口径下的标准值。

建议字段：

- 标准版本 ID
- 内部营养素 ID
- FEDIAF 原始营养素名称
- 营养分类
- 来源表号：`III-3a`、`III-3b`、`III-3c`、`VII-17a` 等
- 来源类型：核心推荐表或 Annex 7.8
- PDF 页码
- 物种：犬
- 生命周期或场景：
  - 早期生长 `<14周`
  - 晚期生长 `≥14周`
  - 成年犬 MER 110
  - 成年犬 MER 95
  - 繁殖
- 表达口径：
  - 每 100g 干物质
  - 每 1000 kcal ME
  - 每 MJ ME
- 单位
- 最小值
- 最大值
- 推荐值
- 最大值类型：
  - legal max
  - nutritional max
  - unspecified
- 脚注编号
- 备注
- 排序

### 标准审核标记

审核标记与标准条目分离。

建议字段：

- 标准条目 ID
- 审核状态
- 审核备注
- 审核人
- 审核时间
- 更新时间

## 营养素映射设计

配方评估时，不使用 FEDIAF 原文名称直接匹配原料营养字段，而是通过内部营养素字典和映射规则。

### 直接映射

例子：

- FEDIAF `Calcium` -> `minerals.calcium`
- FEDIAF `Phosphorus` -> `minerals.phosphorus`
- FEDIAF `Vitamin A` -> `vitamins.vitaminA`
- FEDIAF `Linoleic acid` -> `fattyAcids.linoleicAcid`

### 组合映射

例子：

- `EPA + DHA` -> `fattyAcids.epa + fattyAcids.dha`
- `Methionine-cystine` -> `aminoAcids.methionine + aminoAcids.cystine`
- `Phenylalanine-tyrosine` -> `aminoAcids.phenylalanine + aminoAcids.tyrosine`

### 比值映射

例子：

- `Ca:P` -> `minerals.calcium / minerals.phosphorus`

### 单位换算

原料营养数据先按配方用量汇总，再换算到 FEDIAF 要求的口径：

- 每 1000 kcal ME
- 每 MJ ME
- 每 100g 干物质

单位换算覆盖：

- g、mg、μg
- kcal、kJ、MJ
- IU
- 比值

维生素 A、维生素 D、维生素 E 保留现有项目中已建立的单位换算规则，并在标准映射层明确标准侧默认单位。

## 导入设计

### 数据形态

FEDIAF 2025 犬标准以项目内结构化 seed 数据保存，而不是运行时解析 PDF。

结构化数据应包含：

- 标准版本元信息
- 内部营养素字典 seed
- FEDIAF 标准条目 seed
- 标准条目与内部营养素的映射
- 来源表号、PDF 页码、脚注和备注

### 导入脚本

导入脚本要求：

- 可重复运行
- 可以清空并重导 `FEDIAF_2025 + DOG` 这个版本的数据
- 不影响未来其他标准版本
- 不重复插入同一版本、同一来源表、同一营养素、同一生命周期、同一表达口径的条目
- 导入后输出条目总数和按来源表统计

### 校验规则

导入时执行基础校验：

- 每个标准条目必须绑定内部营养素字典，无法绑定的必须显式标记为待处理
- 同一来源表内排序稳定
- 单位必须在允许列表内
- 最小值和最大值不能同时缺失，除非该条目是备注型或比值型
- 最大值类型必须明确
- Annex 条目必须能记录对应来源表和生命周期

## Web 管理后台设计

新增入口：`营养标准 / FEDIAF 2025 犬标准`。

### 版本总览

展示：

- 标准名称
- 物种
- 来源 PDF
- 发布年月
- 导入时间
- 条目总数
- 按来源表统计
- 审核进度：未审核、已审核、有疑问、需修正

### 表格审核视图

支持筛选：

- 来源表：III-3a、III-3b、III-3c、VII-17a、VII-17b、VII-17c、VII-17d
- 表类型：核心推荐表、Annex 7.8
- 生命周期或场景
- 营养类别
- 审核状态
- 营养素搜索

表格展示：

- 营养素
- 内部营养素代码
- 分类
- 生命周期或场景
- 表达口径
- 单位
- 最小值
- 最大值
- 推荐值
- 最大值类型
- 来源表号
- PDF 页码
- 脚注
- 审核状态

### 条目详情

点击条目后展示：

- FEDIAF 原始名称
- 内部营养素映射
- 来源表和页码
- 脚注和备注
- 值和单位
- 审核历史

### 审核动作

允许：

- 标记已审核
- 标记有疑问
- 标记需修正
- 填写审核备注

不允许：

- 直接修改标准值
- 直接修改单位
- 直接修改生命周期
- 直接修改内部映射

## API 设计

新增后端接口服务，供管理后台和未来配方评估使用。

### 管理后台接口

- 获取标准版本总览
- 获取标准条目列表
- 获取标准条目详情
- 更新审核标记

### 未来计算接口

本轮可以预留服务边界，暂不暴露完整配方评估页面。

未来需要支持：

- 按标准版本、物种、生命周期获取计算标准
- 按内部营养素代码获取标准条目
- 获取 Annex 7.8 的配方校验目标
- 输出某个配方的缺口、超标、缺数据结果

## 与现有模块的关系

### 原料营养档案

`Ingredient.nutritionProfile` 和 `NutritionFood.nutritionData` 继续作为原料营养来源。后续配方计算优先读取已确认、已映射的营养档案。

### 食谱标准标签

现有 `NutritionStandard` 枚举继续承担食谱标签作用。本轮新增 `FEDIAF_2025`，旧食谱不自动切换。

### 小程序

本轮不在小程序展示完整标准表。后续小程序只展示结果：

- 食谱采用标准：FEDIAF 2025
- 是否达标
- 主要缺口或风险摘要
- 营养报告链接

### AI Agent

AI Agent 后续只能通过标准 API 和营养素映射读取目标要求，不能绕过审核标记，也不能直接修改标准值。

## 删除旧表设计

实施时删除：

- Prisma model `NutritionStandardFediaf`
- 数据库表 `nutrition_standard_fediaf`
- 旧 seed 脚本 `backend/prisma/seed-nutrition-standards.ts`

保留：

- 历史 migration 文件，不修改已存在 migration
- 历史文档，不作为运行时依据
- 食谱标签中的旧标准枚举，避免破坏旧食谱展示

## 测试与验收

### 后端测试

- 标准版本查询返回 FEDIAF 2025 犬版本
- 标准条目列表可按来源表、生命周期、营养类别、审核状态筛选
- 审核标记只更新审核表，不修改标准值
- 删除旧 `NutritionStandardFediaf` 后后端编译通过
- 导入脚本重复运行不会产生重复数据
- 营养素映射可处理直接项、组合项和比值项

### 管理端测试

- 页面能展示版本总览
- 表格能按来源表和生命周期筛选
- 审核状态能保存并刷新展示
- 标准值字段不可编辑
- 新增 `FEDIAF_2025` 后食谱标准选项展示正常

### 数据验收

- III-3a、III-3b、III-3c 条目数与结构化源数据一致
- VII-17a、VII-17b、VII-17c、VII-17d 条目数与结构化源数据一致
- 每条数据保留来源表号和 PDF 页码
- 含脚注的条目保留脚注编号或备注
- 审核总览统计与条目状态一致

## 风险与控制

### PDF 表格抽取错误

控制方式：

- 结构化数据保留来源表号和页码
- 后台提供审核标记
- 导入脚本输出来源表统计
- 首轮上线前由人工抽样核对关键营养素

### 单位不一致

控制方式：

- 标准侧单位不直接进入计算
- 通过内部营养素字典和单位换算层转换
- 组合项和比值项使用显式规则

### 旧标准标签混淆

控制方式：

- 明确区分食谱标签 `FEDIAF_2025` 和标准库版本
- 旧食谱不自动迁移
- 后续重新评估的食谱才选择新标准

## 结论

本轮采用版本化标准库方案。FEDIAF 2025 犬核心推荐表作为官方源数据，Annex 7.8 作为计算优先表。后台提供只读审核工作台和审核标记，不直接修改官方值。旧 `nutrition_standard_fediaf` 表和旧 seed 脚本在实施中删除，新能力通过营养素字典和映射层连接到现有原料营养档案，为后续配方设计器、AI Agent 和小程序营养报告打基础。
