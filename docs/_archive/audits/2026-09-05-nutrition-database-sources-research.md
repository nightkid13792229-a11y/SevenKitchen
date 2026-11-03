# 本地营养数据库批量导入工程 —— 官方数据源调研报告

- 调研日期：2026-09-05
- 项目背景：SevenKitchen（宠物鲜食・犬）。需把官方食品营养成分数据库批量导入本地 PostgreSQL（Prisma 管理），供"新增原料时本地秒级查询营养数据"使用。
- 现状锚点：本地 `nutrition_source_record` 表已有 291 条零星记录（272 条 USDA、12 条 CFCT、3 条 NEVO、3 条 NZFCD、1 条 TFDA），来源 key 沿用既有惯例（如 `USDA:170069`、`CFCT:043221`、`MEXT:04001`、`NZFCD:T1024`）。
- 调研范围：USDA FoodData Central（SR Legacy / Foundation）、CFCT、NZFCD/FOODfiles、MEXT 八訂、AUSNUT/AFCD、CNF、CoFID、Ciqual。
- 目标基准：营养数据按 **每 100 g** 存储；犬营养需求以 FEDIAF 指南覆盖为参照。
- 本报告**仅调研与成文**，未改动任何代码或数据库。

## 验证状态图例

| 标记 | 含义 |
|---|---|
| [✅已核实] | 已实际打开官方页面 / HTTP 200 / 官方页面明确写明 |
| [入口页] | 官方入口页面（URL 长期稳定），具体数据文件需在页面内点选或按日期后缀确认 |
| [模式直链/未验证] | 按官方命名规律推断的直链，需以页面当前日期/版本号为准 |
| [评估/待下载确认] | 基于官方资料与领域知识的估计值，需下载后复核 |

> 说明：本报告 **8 个数据库小节全部完成在线核验（✅）**：USDA / CFCT 为官方页面核验，MEXT（日本）、NZFCD（新西兰）、AFCD·AUSNUT（澳）、CNF 2026（加）、CoFID（英）、Ciqual（法）为**实测下载并解析官方原始文件**后成文（各节内均有验证状态标注与逐文件大小）。

---

## 一、结论速览

| # | 数据库 | 官方下载可得性 | 文件格式 | 食品数 | 营养覆盖（氨基酸/脂肪酸） | 许可（可否商用） | 每100g | 生熟/可食部 | 导入难度 | 一句话结论 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | USDA FoodData Central（SR Legacy / Foundation） | ✅ 直接下载 | CSV + JSON（关系型多文件） | SR Legacy ≈7,793（冻结）；Foundation 211+（持续扩充） | 全（氨基酸/脂肪酸以营养素行存在，非每食品全谱） | ✅ public domain 可商用 | ✅ | 食品名区分生熟；按每 100g 可食部 | 中 | **首选主库**，免费免注册、格式规范 |
| 2 | CFCT 中国食物成分表（第6版） | ❌ 无官方电子数据（仅纸质书） | 纸书（微信读书 DRM 电子书不可导出） | 两册 2,000+ 条 | 全（氨基酸 20 种、脂肪酸 45 种，分表仅部分食品） | ⚠️ 无开放许可，需向研究所+出版社书面授权 | ✅ | 食品名标加工状态；按每 100g 可食部 | 高 | 中文食材最全但**不可批量获取**，只按需手工录入 |
| 3 | NZFCD / FOODfiles（新西兰） | ✅ 直接下载（MSI 包，实测 200） | MSI 内含 xlsx + DSV | FOODfiles 2024 = 2,857 | 标准版 87 组分；完整版 434 组分（氨基酸稀疏 ≈16% 食品） | ⚠️ 站内 Terms：免费可商用但**不得修改数据、不可转让**（需法务复核） | ✅（可食部% 列） | ✅ 可食部%、生熟 State | 中 | 肉/水产数据质量高，条款限制需注意 |
| 4 | MEXT 日本八訂（増補2023） | ✅ 官方 Excel/PDF 直下（直链 HTTP 200 已验） | Excel（1 xlsx = 19 sheet，含 FAO/INFOODS 标签行；无 CSV） | 本編 2,478；増補2023 统合版 2,538 | 主表 51 营养列（含维生素 22/无机质 13）；氨基酸别册 1,954 食品、脂肪酸别册 1,919 食品 | ✅ 文部科学省利用規約（出典明記 + 加工注明即可商用，≈CC BY 4.0 口径） | ✅ | 廃棄率列 + 食品名含 生/ゆで/焼き 状态链；营养值即可食部基准 | 中 | 官方 Excel 实测核验；冬瓜/白萝卜/燕麦/南美白虾已收录，苋菜无 |
| 5 | 澳大利亚 AUSNUT / AFCD（FSANZ） | ✅ 官网 xlsx 直下（实测 200） | Excel 宽表（自带说明 tab） | AFCD R3 = 1,588（营养列上限 268）；AUSNUT 2023 = 3,741/58；2011-13 = 5,740/51（原文件已下架） | core 51/58 不含 AA 明细；AFCD R3 额外项含 AA/FA | ⚠️ CC BY 3.0 AU / DULA（CC BY-SA 3.0 AU）：内部用风险低、再分发需法务 | ✅（100g/100mL 双 basis） | 食态分列；可食部基准 | 中 | AUSNUT 2011-13 原文件已不在新站；现役 AUSNUT 2023 / AFCD R3 可直下 |
| 6 | 加拿大 CNF（2026 第14版） | ✅ Open Gov CSV 直下（ZIP≈26.7MB，实测 200） | CSV 关系型 9 文件（UTF-8 BOM） | **5,993 食品** | **173 营养素**：20 近似 + 27 矿物质 + 18 维生素 + **22 氨基酸类** + 脂肪酸明细 | ✅ OGL-C：官方明示"商用无需另行许可"（注明来源、不改数值） | ✅ | 每 100g 可食部；Refuse/Yield 在 Measure 文件 | 低–中 | 未停更；80% 食品带 USDA NDB 码（高同源），作 USDA 补充 + AA/FA 齐全且易导入 |
| 7 | 英国 CoFID（2021） | ✅ gov.uk assets 直链（实测 HEAD 200） | xlsx 单文件 15 sheet（数据自第 4 行） | ≈3,279 食品（主库 2,886 + old foods 393） | **275 数值列**（≈177 列/100g）；脂肪酸/维生素细分/单糖全；**⚠️ 无氨基酸表** | ✅ OGL v3.0 可商用 | ✅（酒精饮料按 100ml） | 生熟独立条目 + Edible proportion 列 | 中 | 字段最密的欧洲库但无氨基酸；FEDIAF 必需 AA 需与 CNF/MEXT 互补 |
| 8 | 法国 Ciqual（2025） | ✅ DOI 仓库直下（recherche.data.gouv.fr，实测 200） | **XML 规范化五表 + Excel（.xls/.xlsx）；无官方 CSV** | **3,484 × 74 构成素**（2020 版 3,185 × 67） | 脂肪酸链明细/单个糖/D2/D3/K1/K2 全；**无氨基酸** | ✅ Licence Ouverte（Open Licence 2.0）可商用、需署名 | ✅ | cru/cuit 独立条目；每 100g 可食部（无可食部比例列） | 低–中 | 语义最清晰的开放库（INFOODS 码）；FEDIAF 必需 AA 需与 CNF/MEXT 互补 |

---

## 二、项目约束与选择口径（本报告评估基准）

1. **存储口径**：营养值统一按"每 100 g 可食部"入库（与各官方库原生口径一致，避免换算漂移）；能量列 kcal 为主、kJ 视库保留。
2. **犬营养（FEDIAF）必需项**：能量；蛋白质（含必需氨基酸：精/组/异亮/亮/赖/蛋/苯丙/苏/色/缬，及半胱/酪氨酸的替代作用）；脂肪（亚油酸 LA、α-亚麻酸 ALA、EPA/DHA 建议）；矿物质（Ca、P、K、Na、Cl、Mg、Fe、Cu、Mn、Zn、I、Se）；维生素（A、D、E、K、B1、B2、烟酸、泛酸、B6、叶酸、B12、生物素、胆碱）。
3. **中文食材关切清单**（本项目实际用到/关注）：冬瓜、燕麦米/燕麦片、苋菜、南美白虾、白萝卜、小白菜/上海青、薏仁米、芋头、山药、鸭心/鸭胗、羊肚菌 等。
4. **商用边界**：数据用于**自有业务系统内部数据库**（配方营养计算），不是对外转售裸数据——这对多数官方库属于允许场景；但署名与"不得修改/再分发"类条款需在落库与对外功能中遵守（见第七节）。

---

## 三、分库详报

### 1. USDA FoodData Central（SR Legacy / Foundation）[✅ 本库已完成在线核验]

- **版本与更新状态**：FDC 主门户在线。**SR Legacy 为冻结数据集**（对应原 USDA SR28，2018-04 发布，进入 FDC 后不再更新，仅历史/科研延续）；**Foundation 为持续扩充数据集**（2019 上线 211 个，此后不定期新增批次；最新可考文档《Foundation Foods Documentation》2024-04 版）。
- **官方下载入口页 URL**：https://fdc.nal.usda.gov/download-datasets （[✅已核实]；旧 `.html` 路径 2020 年前后迁移，无需加后缀）。另有官方镜像归档：Ag Data Commons FoodData Central collection https://agdatacommons.nal.usda.gov/collections/FoodData_Central/6953745 及数据集条目页 https://agdatacommons.nal.usda.gov/articles/dataset/FoodData_Central/24668133。
- **直接下载 URL**：官方按"Full Download + 各数据集单独下载"提供，命名形态（[模式直链/未验证]，日期后缀随版本变化）：
  - 全量：`FoodData_Central_csv_YYYY-MM-DD.zip`、`FoodData_Central_json_YYYY-MM-DD.zip`
  - 单数据集：`FoodData_Central_sr_legacy_food_csv_*.zip`、`FoodData_Central_foundation_food_csv_*.zip`（各有同名 `.json.zip`）
  - 大小参考：完整 CSV 包数十 MB、完整 JSON 包数百 MB；SR Legacy / Foundation 单包 MB～数十 MB（[评估]，以下载页为准）。导入 SR Legacy + Foundation 只需取两个单数据集包。
- **文件格式与结构**：CSV（UTF-8，带引号）与 JSON 两种等价导出，均为**关系型多文件**：`food.csv`、`food_nutrient.csv`（长表）、`nutrient.csv`、`food_portion.csv`、`food_measure.csv`，另有 `food_attribute*.csv`、`food_calorie_conversion_factor.csv`、`food_nutrient_source/derivation.csv`、`sr_legacy_food.csv` / `foundation_food.csv`（类型映射、含 ndb_number）；Foundation 另有 **retention factor（生→熟保留因子）表**。
- **规模**：SR Legacy ≈**7,793** 个食品（2019 上线官方口径，实测 food.csv 行数与之一致）；Foundation 启动 **211** 个，最新 2026-04-30 数据包实测 **469** 个食品（其中 468 个带营养数据，1 个无营养行；该数字为本地批量导入工程实测，数据包文件名 `FoodData_Central_foundation_food_csv_2026-04-30.zip`）。营养素：**氨基酸与脂肪酸均以"营养素行"存在于 nutrient 字典与 food_nutrient 中**（SR Legacy 尤其全，如 Tryptophan、18:2 n-6 c,c、20:5 n-3、22:6 n-3 等均有 nutrient 定义），非每个食品全谱；单食品成分行数多至百级。
- **获取方式与许可**：完全免费、无需注册、无需 API key。SR Legacy/Foundation 为美国政府（USDA ARS）作品 → **public domain（17 U.S.C. §105）**，可自由再分发、可内置商用产品与内部库。署名非强制但官方建议注明 "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, [year]. fdc.nal.usda.gov"。⚠️ **Branded 数据集含品牌方数据、条款更严，不要并入内部库**。
- **生/熟与可食部标注**：无独立"生熟"布尔字段；SR Legacy 以**食品名/描述**区分（raw / cooked, boiled, drained / broiled / fried 等）；Foundation 以"as-consumed / raw 成对形态 + 食物分类 + retention factor"表达加工关系。**可食部**：营养值一律为"每 100 g 可食部分"基准（refuse 已剔除），portion/measure 表提供"1 cup→克"等份量换算。
- **营养基准与单位**：`food_nutrient.amount` = **每 100 g**；单位按 `nutrient.unit_name`：g / mg / µg，维生素另有 IU、RAE 等；能量以 **kcal** 为主。
- **中文食材覆盖（评估，部分带 FDC ID 线索）**：FDC 无中文，需自建中文别名映射。
  - 冬瓜：有 "Waxgourd, (chinese preserving melon), raw"（FDC 170069）及 cooked/boiled（FDC 170549）
  - 苋菜：有 "Amaranth leaves, raw"（FDC 168385）
  - 白萝卜：有 "Radishes, oriental, raw"（daikon 类）
  - 燕麦粒/燕麦片：有 Oats / Oat bran 系列条目
  - 南美白虾：SR Legacy **无物种级条目**，仅 "Shrimp, mixed species / farm raised"（raw FDC 174210、cooked FDC 171971）；物种级 vannamei 主要散见于 Branded（不建议导入）
  - 小白菜/上海青：有对应（现有记录即用 USDA:170390）
- **导入难度**：**中**。多表关联（food→food_nutrient→nutrient→portion/measure，4~8 表 join）；双 ID 体系（fdc_id 与 ndb_number 并存）；UTF-8 带引号 CSV 需正规解析；需过滤 data_type 并按 nutrient 字典白名单抽取；跨数据集合并须归一 nutrient_id（如 kcal 在 208 与 1008 两个 ID 段）。仅导 SR Legacy + Foundation 规模可控（≈8k 食品，food_nutrient 行数十万级），PostgreSQL 秒级查询无压力。
- **坑点/备注**：①SR Legacy 大量"借用/推算(imputed/calculated)"值（derivation 表可辨），精确分析值以 Foundation 为准；②官方不定期重建全量包、日期后缀变化，建议固定版本并记录 publication_date；③description 含行政后缀（"Includes foods for USDA's Food Distribution Program"等）与重名，做中文别名匹配需清洗；④不同数据集同一营养素 ID 段不同，需先归一；⑤勿并入 Branded 数据。
- **参考 URL 清单**：[FDC Download Datasets](https://fdc.nal.usda.gov/download-datasets) · [FDC About](https://fdc.nal.usda.gov/about-us) · [FDC FAQs](https://fdc.nal.usda.gov/faq/) · [FDC 数据文档](https://fdc.nal.usda.gov/data-documentation/) · [Foundation Foods 文档](https://fdc.nal.usda.gov/Foundation_Foods_Documentation) · [Foundation Foods 文档 PDF (2024-04)](https://fdc.nal.usda.gov/docs/Foundation_Foods_Documentation_Apr2024.pdf) · [更新日志](https://fdc.nal.usda.gov/log) · [Future Updates](https://fdc.nal.usda.gov/future-updates) · [Ag Data Commons FDC collection](https://agdatacommons.nal.usda.gov/collections/FoodData_Central/6953745) · [Ag Data Commons FDC dataset](https://agdatacommons.nal.usda.gov/articles/dataset/FoodData_Central/24668133) · [data.gov FDC](https://catalog.data.gov/dataset/fooddata-central) · [data.gov SR Legacy Release](https://catalog.data.gov/dataset/usda-national-nutrient-database-for-standard-reference-legacy-release) · [NAL SR Legacy 营养表](https://www.nal.usda.gov/human-nutrition-and-food-safety/nutrient-lists-standard-reference-legacy-2018)

---

### 2. 中国食物成分表 CFCT（第6版标准版）[✅ 本库已完成在线核验]

- **版本与更新状态**：标准版第6版，**杨月欣主编、中国疾病预防控制中心营养与健康所编著，北京大学医学出版社出版**。规划三册：第一册（植物性食物）2018 年出版（ISBN 9787565916991，168 元，362 页）；第二册（动物性食物及制品）2019-08 出版（ISBN 9787565919787，186 元）；**第三册（加工食品）至今未见出版** [检索未发现]。另：2025-06 北大医学出版社新出同所编《中国动物性水产食物营养数据》（王竹、杨月欣主编，ISBN 9787565933370，128 元，163 种水产）[✅已核实]，可作水产原料补充源。
- **官方下载入口页 URL**：**无面向公众的官方批量数据下载入口**。相关官方页（均"有页面但无数据下载"）：营养与健康所官网 https://www.chinanutri.cn/ ；中国营养学会官方推荐页（书目+规模口径）https://www.cnsoc.org/latesachie/311911205.html ；出版社商品页（见 URL 清单）。唯一官方在线系统"预包装食品营养标签数据查询系统" https://nlc.chinanutri.cn/ 为市售标签数据、**非 CFCT 一般成分表**。
- **直接下载 URL**：**无官方批量电子数据文件**。唯一电子形态为微信读书付费正版电子书（第1册 https://weread.qq.com/web/bookDetail/fb632af0811e5d5e3g017c91 、第2册 https://weread.qq.com/web/bookDetail/654320e0811e38f00g01749a ），受 DRM 且表格以分栏/图片排布，不可导出为结构化批量数据 [评估]。网上 PDF 均为非官方扫描件。
- **文件格式与结构**：官方载体仅**纸质书两册**；第6版无随书光盘（2002/2004 旧版才有配套光盘/软件）。第6版按 INFOODS 国际规范统一了条目编码（如小白菜 "04-5-120"：大类-亚类-序号）、成分命名与表达。
- **规模**（官方推广口径）：两册一般营养成分条目约 **2,000+**（第一册 1,110 余条植物性 + 第二册 1,005 条；第二册另收录八类共 3,600+ 条、数据点 75,600+）；第二册营养素覆盖：**宏量 10 种、维生素 11 种、矿物质 10 种、氨基酸 20 种、脂肪酸 45 种**，另有嘌呤（490 种）等特表；氨基酸/脂肪酸分表仅对部分食物给出。
- **获取方式与许可**：购纸质书（两册合计约 354 元）。版权归属：**营养与健康所（编著/数据权）+ 北京大学医学出版社（出版权）**。无任何开源/开放许可；营养与健康所自称我国"唯一国家级食物成分数据库"，数据主要服务政府与科研、未向企业开放 [✅已核实其会议口径]。**商用判断**：手工录入自有内部数据库用于配方计算是行业通行做法，但整表受《著作权法》"汇编作品"保护，公开二次分发必侵权；商用前建议书面申请授权，对象为营养与健康所（食物营养评价室）及北大医学出版社（联系方式见下，两处邮箱/电话不一致、需先电话确认）：010-66237298 / ccdcnutrition@ninh.chinacdc.cn；另一官方联系页 010-67791292 / chinanutrition@chinacdc.cn。
- **生/熟与可食部标注**：按中国营养调查惯例：以"每 100 g 可食部"计（皮、骨、核等在"食部"扣除）；食品名直接标注加工/烹调状态（如"米饭（蒸）""猪肉（瘦）"）；第6版附编号食物图片与中英/中拉对照 [评估]。
- **营养基准与单位**：每 100 g 可食部；能量同时给 **kcal 与 kJ** 两列；维生素 A 已改 **μgRAE** 表达，与 INFOODS 对齐 [评估]。
- **中文食材覆盖（评估）**：**中文食材最全、唯一国家级库**：冬瓜、白萝卜、莲藕、苋菜、茼蒿、莴笋、燕麦米、南美白虾/对虾等中式市售形态基本只有 CFCT 有对应条目；USDA/MEXT 即使有近似条目（amaranth leaves、daikon、とうがん），品种、可食部定义与中式市售形态也不符。**短板是数据可得性差**（无官方电子数据/API/开放许可）。
- **导入难度**：**高**（若整库 2,000+ 条×约 30 列）。官方只卖纸质书、分栏印刷不可复制；全表 OCR 有数值错读风险（实锤案例：第6版第一册"野生蔬菜类 048004~048084"原书 kcal/kJ 印刷颠倒）。**替代路径**：①首选——只录本项目实际需要的 50~80 个常用原料（已有 12 条手工录入经验，成本低、可信度最高）；②坚持整库——购书→扫描/翻拍→双视觉大模型交叉识别（如 qwen-vl + kimi）→恒等式/值域/行数自动校验→人工定点复核（有开源参照 https://github.com/Sanotsu/china-food-composition-data ，约 1,677 条 JSON，**须逐条对照原书复核后再入库**）；③第三方整理（薄荷/食物库等 App、selectdataset、个人 Excel）只作校对参考、不作权威源，且商用授权不明。
- **坑点/备注**：①录入以第6版"标准版"口径为准（两册已统一编码）；②印刷书存在勘误级错误，OCR/录入结果须抽检原书；③微信读书电子书无法复制表格；④研究所对外邮箱两个版本（ccdcnutrition vs chinanutrition）、地址有新老之别，正式授权先电话确认；⑤研究所内部监测库（2020 年口径：十年新增 6,000+ 食物数据）比书全得多但不对外开放。
- **参考 URL 清单**：出版社第1册商品页 https://www.pumpress.com/home-shop/5514.html ；第2册商品页 https://www.pumpress.com.cn/home-shop/5999.html ；营养与健康所《中国食物成分数据库发展90年》 https://www.chinanutri.cn/xwzx_238/gzdt/202103/t20210311_224599.html ；营养与健康所 2025-09 获奖新闻 https://www.chinanutri.cn/xwzx_238/gzdt/202509/t20250929_312751.html （疾控中心转载 https://www.chinacdc.cn/gzdt/zsdw/202509/t20250929_312801.html ）；中国营养学会官方推荐页 https://www.cnsoc.org/latesachie/311911205.html ；营养标签系统·联系我们 https://nlc.chinanutri.cn/article/contactus.html ；北医 2025-06 新书单（水产数据新书） https://bynews.bjmu.edu.cn/zhxw/2025/b212b0386bbc40538c38627aa8a384c3.htm ；微信读书第1册 https://weread.qq.com/web/bookDetail/fb632af0811e5d5e3g017c91 、第2册 https://weread.qq.com/web/bookDetail/654320e0811e38f00g01749a ；第三方 OCR 参考（非官方） https://github.com/Sanotsu/china-food-composition-data ；数据倒卖站（非官方，勿购） https://www.selectdataset.com/dataset/32d772b0e5d320e3b2fa946388c0054b

---

### 3. NZFCD / FOODfiles（新西兰）[✅ 本库已完成在线核验]

- **版本与更新状态**：最新可下载全量数据集为 **New Zealand FOODfiles™ 2024 Version 01（2024-09 发布）**（官方口径：2026 年不发布下载文件、2027 年再评审）。在线 Search 库更新更快（2026 版在线库含 3,327 条 Food Record），但**仅在线检索、不入下载包**。运营主体已更名：Plant & Food Research 并入 **The Bioeconomy Science Institute**，与新西兰卫生部共同拥有 NZFCD。
- **官方下载入口页 URL**：https://www.foodcomposition.co.nz/foodfiles/ （[✅已核实 HTTP 200]；页面声明 2,857 foods / 87 标准组分 / 434 完整组分）
- **直接下载 URL**：https://www.foodcomposition.co.nz/downloads/foodfiles-2024-v1.msi （[✅已核实 HTTP 200]，48,361,472 B ≈ 46 MiB，2024-09-12；**无需注册**）。轻量替代：Concise 14 版 Excel https://www.foodcomposition.co.nz/downloads/concise-14-edition.xlsx （[✅已核实 HTTP 200]，671 KB，1,281 食品 × 38 组分）。
- **文件格式与结构**：官方只发 **Windows MSI 安装包**，内含 **xlsx（≈36 MB）** 与**波浪号分隔 DSV（≈25 MB，UTF-8）**。核心文件：DATA.AP（食品×组分矩阵表）、DATA.FT（列表式+逐值溯源/方法码）、NAME.FT（食品详情+**可食部%**+采样说明）、CODE.FT（组分清单/单位）、CSM.FT（常见份量+密度）、INGREDIENT.FT、NRF/WYF/CONVERSION FACTOR 表等 11 个数据文件 + 4 个 xlsx 更新说明；字段布局见数据手册 Section 3；FoodID（字母章节+数字，如 Q1042）为跨文件主键。
- **规模**：FOODfiles 2024 = **2,857 食品**；标准版 **87 核心组分**（能量/宏量/胆固醇/常见维生素矿物质/脂肪酸类别，绝大多数食品有值）；完整版最多 **434 组分**（≈57.2 万数据点，缺失记空值）。**含氨基酸**（仅完整版：mg/g 每 100g 及 mg/g N 多口径；约 460–477 食品有 AA 值 ≈16%，Taurine 仅 162 个——犬必需牛磺酸注意稀疏性）；含单项脂肪酸、重金属（砷/镉/铝）、VD3/25-OH-D3 等。
- **获取方式与许可**：免费、无需注册。许可 = 官网 **Terms of Use（FOODfiles™ Data Licensing）**，非 CC 开放许可：全球性、非独占、**不可转让**、免版税；条件——**不得修改数据任何部分**；在产品/服务中使用须 ①原样呈现、②在作品内 acknowledge 来源、③第三方经作品接触数据须明示受网站条款约束。→ 内部商用（自建数据库）可行，按原值入库+署名；但**"不得修改/不可转让"条款在嵌入商业软件前建议法务复核**。
- **生/熟与可食部标注**：好。NAME.FT 每条含 **可食部占比（Edible portion %）**、部位/状态（State）/成熟度/学名/采样说明；肉类章节 raw 与 cooked 分别收录；食谱类带 WYF（烹煮产率）与 NRF（营养素保留）系数。
- **营养基准与单位**：**每 100 g 可食部**；能量同时给 **kJ（ENERC）与 kcal（ENERC_KCAL）**，另有 FSANZ/INFOODS 含/不含纤维多口径变体（导入须选一，避免同能量多行）；脂肪酸另有 per 100g TFA、氨基酸另有 mg/g N；缺失记空值不填 0。
- **中文食材覆盖（评估，待下载检索确认）**：**低**。以新西兰/西方/太平洋食品为主，仅豆腐、酱油等零星亚洲项；对**牛/羊/鹿/禽/内脏/鱼贝**等鲜食主力肉源覆盖好，典型中式食材（皮蛋、鸭血、牛百叶、肉丸等）基本没有。
- **导入难度**：**中**。xlsx/DSV 本身解析"低"，难点：①macOS/Linux 需用 7-Zip/msitools 解 MSI；②标准版 vs 完整版决策（AA/单项脂肪酸仅在完整版且稀疏）；③能量多口径去重、空值≠0、FoodID 跨文件关联清洗。
- **坑点/备注**：①下载页残留 2021 版安装说明文字，实际文件是 2024 v1（以文件名 foodfiles-2024-v1.msi 为准）；②2026 年新增 92+510 条无整库下载，只能在线逐条取；③署名模板官方仍写 "Plant & Food Research and Ministry of Health"，现行运营方已改名 Bioeconomy Science Institute，致谢建议两者涵盖；④人食数据库用于犬粮属跨物种应用，超出设计用途，自行评估。
- **参考 URL 清单**：[FOODfiles™ 下载页](https://foodcomposition.co.nz/foodfiles/) | [Terms of use](https://www.foodcomposition.co.nz/terms/) | [FAQ](https://www.foodcomposition.co.nz/frequently-asked-questions/) | [About](https://www.foodcomposition.co.nz/about/) | [Concise Tables](https://www.foodcomposition.co.nz/foodfiles/concise-tables/) | [2024 数据手册 PDF](https://www.foodcomposition.co.nz/downloads/new-zealand-food-composition-database-2024-data-manual.pdf) | [2026 数据手册 PDF](https://www.foodcomposition.co.nz/downloads/new-zealand-food-composition-database-2026-data-manual.pdf) | [EuroFIR：NZFCD 2024 Release](https://www.eurofir.org/new-zealand-food-composition-database-2024-release/) | [Bioeconomy Science Institute](https://www.bioeconomyscience.co.nz/about-us)

---

### 4. MEXT 日本食品标准成分表（2020年版＝八訂）[✅ 本库已完成在线核验（含实测下载解析 Excel）]

- **版本与更新状态**：八訂 2020-12-25 公表（本編数据文件曾随 2021 正誤表更新）；其后官方以"**増補**"方式年度追加，最新为 **《日本食品標準成分表（八訂）増補2023年》**（2023-04-28 公表，食品扩至 **2,538** 种：新增 60 种、追加/更新共 107 种；2026-03-27 该页数据文件重新上传）。未检索到 2024/2025 年更新版。检索时注意"追補→増補"用词变化。
- **官方下载入口页 URL**：
  - 本編（八訂）下载页：https://www.mext.go.jp/a_menu/syokuhinseibun/mext_01110.html （[✅已核实 HTTP 200，实抓页面确认文件清单]）
  - 増補2023 下载页：https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html （[✅已核实 HTTP 200]）
  - 综合入口（各版本成分表 + DB）：https://www.mext.go.jp/a_menu/syokuhinseibun/index.htm [入口页]
  - 检索用 Web DB（**无全量导出**）：https://fooddb.mext.go.jp/ （帮助页 https://fooddb.mext.go.jp/help.html ）
- **直接下载 URL**（均在 `www.mext.go.jp/content/` 下，前缀 `20201225-mxt_kagsei-mext_01110_`=本編；HTTP 200 已逐条验证，括号内为实测大小）：
  - 本編**主数据 Excel（第2章 数据）**：`..._012.xlsx`（≈1.9 MB，实测 1,961,190 B，**已验证下载并解析**）；正文 PDF `..._011.pdf`（9.5 MB）；収載食品一覧 PDF `..._001.pdf`（451 KB）
  - **アミノ酸成分表編（独立别册）**：数据 Excel 第1表 `..._022.xlsx`（863 KB，实测 883,535 B）、第2表 `..._023.xlsx`（326 KB）、第3表 `..._024.xlsx`（301 KB）、第4表 `..._025.xlsx`（302 KB）
  - **脂肪酸成分表編（独立别册）**：数据 Excel 第1表 `..._032.xlsx`（1.4 MB，实测 1,418,812 B）、第2表 `..._033.xlsx`（846 KB）、第3表 `..._034.xlsx`（811 KB）
  - **増補2023 统合版（含全部 2,538 种食品的大文件）**：`/content/20260327-mxt_kagsei-mext-000029402_02.xlsx`（≈1.9 MB，实测 1,973,402 B，已验证下载解析）
  - 具体完整文件名以两个下载页为准（URL 形如 `https://www.mext.go.jp/content/20201225-mxt_kagsei-mext_01110_012.xlsx`）。
- **文件格式与结构**：一个 xlsx = **19 个 sheet**：`表全体` + 18 个按食品群分的 sheet（1 穀類…18 調理済み流通食品類），版式相同。表头为**多行合并单元格**（约第 2–12 行：标题/大分类/项目/子项目行 + **单位行** + **FAO/INFOODS Tagnames 行**如 REFUSE/ENERC/ENERC_KCAL/WATER/PROTCAA），第 13 行起为数据。主表**不含**氨基酸/脂肪酸明细（仅汇总列）；**无 CSV、无全食品单文件 CSV**，要 CSV 需自行转换（官方明确 DB 数据集不直接交付、以官网 Excel 为准）。
- **规模**（实测官方 Excel）：本編主表 **2,478 行食品**；**増補2023 统合版 2,538 行**。每行约 **63 列**、数值营养列约 51 + 能量 2（kJ 与 kcal 双列）：宏量（水分/蛋白×2 口径/脂质/胆固醇/碳水×6 含纤维/有机酸/灰分/酒精/食盐相当量）、**无机质 13**（Na K Ca Mg P Fe Zn Cu Mn I Se Cr Mo）、**维生素 22 列**（A 系 6、D、E 系 4、K、B1、B2、烟酸及当量、B6、B12、叶酸、泛酸、生物素、C）。**氨基酸**：别册第1表 = 可食部 100g 当たり、**1,954 种食品**（Ile/Leu/Lys/Met+Cys/Phe+Tyr/Thr/Trp/Val/His/Arg 等 18 项 + 合计，mg/100g）；**脂肪酸**：别册第1表 = 1,919 种食品、逐脂肪酸 4:0–22:6 细列 65 列。
- **获取方式与许可**：**免费、无需注册/申请**（官网直接下载）。官方 Q&A 明确：成分数据可转载、可用其开发 App。许可依据 = **《文部科学省ウェブサイト利用規約》** https://www.mext.go.jp/b_menu/1351168.htm （适用于 mext.go.jp 全域含 fooddb）：可复制、公衆送信、翻译改作、**商用自由**；数值数据/简单表图明确不属于著作权对象；要求**注明出处** + 编辑加工时注明加工事实。与政府標準利用規約（兼容 CC BY 4.0）口径一致。Excel 内无利用規約 sheet。
- **生/熟与可食部标注**：食品名含完整状态链（全角空格分段），如「とうがん 果実 生／ゆで」「バナメイえび 養殖 天ぷら」；料理成品与 18 群"調理済み流通食品類"单列。**廃棄率列存在**（单位 %，实测 530 种食品 >0；含义=相对购入（未去废）重量的不可食部分占比，用于采购量→可食部换算）；**表内所有营养值本身就是"可食部 100g 当たり"基准**，廃棄率只是辅助换算列，导入时两者都要保留。
- **营养基准与单位**：一切数值 = **可食部 100 g 基准**；能量 **kJ 与 kcal 双列**（八訂改用"単糖当量"法计算能量，与七訂不可直接对比）；缺失值符号：**"-"**=未測定、**"Tr"**=痕量，**不能当 0 处理**。
- **中文食材覆盖（✅ 已按官方 Excel 实测检索）**：冬瓜「とうがん」（果実 生/ゆで）**已收录**；燕麦「えんばく/オートミール」（01004 等）**已收录**；白萝卜「だいこん」（根 皮つき/皮なし・生/ゆで/葉等 23 条）**已收录**；**南美白虾「バナメイえび」（養殖 生・天ぷら）已收录**（八訂已入）；**苋菜「ひゆ」未收录**（0 条，仅谷物"アマランサス 玄穀"）。注：以上为直接检索官方 Excel 结果，非估计。
- **导入难度**：**中**。数据规整（唯一键、单位行 + FAO/INFOODS Tagnames 双保险），但需处理：①多行合并表头、各 sheet 起始行不同、表头行数随版本变化；②"Tr"/"-"/空值与字符串混排、食品名含全角空格与分类符号（＜＞（））；③本編与増補2023 列序差一列（増補统合版首列多"食品群"）——**建议直接以増補2023 统合版 xlsx（2,538 种）为主源导入**，再与本編对照列头；④氨基酸/脂肪酸为独立文件、独立表结构、食品子集不同（1,954/1,919），按"食品番号+索引番号"关联；⑤廃棄率>0 的采购量换算在业务层实现。现有 `MEXT:04001`（红小豆）、`MEXT:10047`（沙丁鱼）等 key 与本库食品番号体系一致。
- **坑点/备注**：①能量取 **kJ（ENERC）** 与 **kcal（ENERC_KCAL）** 双列勿错取；②"Tr/-(未測定)"需独立编码，I/Se/Cr/Mo/生物素等微量欠测面大；③营养值全为可食部基准，与"带皮/带骨采购量"混用需廃棄率换算；④官方不提供统合 CSV/API 导出（Q&A 第 3-4 条明言）；⑤日文食品名无学名列，中文别名映射需自建表；⑥増補2023 统合版是否含 2021 正誤表的增补未逐一核对；⑦加工食品数值为"日本标准品"概值非具体商品实测，用于宠物配方需自行判断。
- **参考 URL 清单**：本編下载页 https://www.mext.go.jp/a_menu/syokuhinseibun/mext_01110.html ；増補2023 下载页 https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html ；文部科学省利用規約 https://www.mext.go.jp/b_menu/1351168.htm ；食品成分 DB https://fooddb.mext.go.jp/ 、廃棄率・可食部说明 https://fooddb.mext.go.jp/nutman/nutman_01.html ；官方 Q&A PDF（Tr/-、转载、DB 数据集说明） https://www.mext.go.jp/a_menu/syokuhinseibun/__icsFiles/afieldfile/2019/01/15/1357804_001.pdf （七訂时期版，一般性说明仍适用）；増補2023 佐证 https://dietitian.or.jp/trends/2023/286.html ；八訂 2,478 佐证 https://cir.nii.ac.jp/crid/1521417756142911616

---

### 5. 澳大利亚 AUSNUT（2011-13 / 2023）/ AFCD（FSANZ）[✅ 本库已完成在线核验]

- **版本与更新状态**：FSANZ 现役两套定位不同的库（均活跃维护）：① **AFCD（Australian Food Composition Database）**＝面向大众/行业的"参考库"（NUTTAB 2010 后继，data.gov.au 原话 "previously called NUTTAB"），2025-12-23 刚发布 **Release 3（1,588 食品）**；② **AUSNUT**＝配合国家膳食调查的"调查用"库，最新 **AUSNUT 2023**（2025-08 发布，3,741 食品/58 营养素 + 1,350 膳食补充剂）。**AUSNUT 2011-13**（配合 2011-13 Australian Health Survey，2014 发布）是上一代：5,740 食品、每食品 51 项营养值（FAO INFOODS 官方成功案例数字）。
- **官方下载入口页 URL**（[✅已核实 HTTP 200]）：AUSNUT 数据文件页 https://www.foodstandards.gov.au/science-data/food-nutrient-databases/ausnut/data-files （现只列 **AUSNUT 2023** 的 16 个 xlsx + 2023↔2011-13 对照文件）；AFCD 数据文件页 https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files 、About https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/about-afcd ；**AUSNUT 2011-13 官方登记/分发入口（data.gov.au）** https://www.data.gov.au/data/en/dataset/ausnut-2011-13 ；在线检索工具 https://afcd.foodstandards.gov.au/ 。
- **直接下载 URL**：
  - **AUSNUT 2023 全量包**（16 个 Excel 的 ZIP，页面标注 11.3 MB）：https://www.foodstandards.gov.au/sites/default/files/2026-03/AUSNUT%202023%20-%20All%20Files_0.zip
  - **AFCD Release 3 直链**（[✅已核实 200 并下载解构]）：Nutrient profiles https://www.foodstandards.gov.au/sites/default/files/2025-12/AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx （≈2.1 MB）、Food Details …/2025-12/AFCD%20Release%203%20-%20Food%20Details.xlsx （≈1.1 MB），另有 Nutrient details / Recipes / Food group / Reference List（见 data-files 页）
  - **AUSNUT 2011-13 原始 xlsx 已不在改版后 FSANZ 站直接提供**（data.gov.au 资源仍指向旧页、旧链 302 到 2023 hub）→ 需要原文件须走 data.gov.au 联系 FSANZ（fooddata@foodstandards.gov.au）或存档。**建议实际导入优先考虑 AUSNUT 2023 / AFCD R3**。
- **文件格式与结构**：Excel（.xlsx）系列，每库自带说明 tab。AFCD R3 实测：Nutrient profiles 为**宽表**（Public Food Key + Classification + Food Name + **268 个营养列**，列名内嵌单位如 "Protein (g)"），按 **All solids & liquids per 100 g** 与 **Liquids only per 100 mL** 两个 sheet 分列；Food Details 含 Analysed/Unanalysed Portion、氮与脂肪系数、比重等；Recipes 配 retention/weight change factors。AUSNUT 2011-13 同构（xlsx）。
- **规模**：AUSNUT 2011-13 = **5,740 食品 × 51 营养值**（+2,000+ 膳食补充剂 × 35；含部分澳原住民野生食品）；AUSNUT 2023 = 3,741 食品/58 营养素；AFCD R3 = 1,588 食品、每食品 58–268 项。**51/58 项 core 不含氨基酸明细与个别脂肪酸**（AFCD 文档口径：氨基酸/有机酸/个别脂肪酸属"额外至多 210 项"）——若宠物原料需 AA/FA 全谱，AFCD R3 更合适。
- **获取方式与许可**：官网免费直下、无申请门槛。版权 © FSANZ。**AUSNUT 2011-13** 官方声明页（.../monitoringnutrients/ausnut/disclaimer，[✅已核实 200]）按 **CC BY 3.0 AU** 提供：可商业/非商业复制分发改编，须署名 "© Food Standards Australia New Zealand"；另有覆盖 AFCD+AUSNUT+NUTTAB 等的 **FSANZ Data User Licence Agreement**（.../monitoringnutrients/afcd/datauserlicenceagreement，[✅已核实 200]，基于 **CC BY-SA 3.0 AU**）：可复制/整合/改编/分发，但分发**衍生库须同许可** + 附带声明；含 USDA SR、英国 McCance-Widdowson（Crown copyright）、NZ FOODfiles 等**第三方数据**且 FSANZ 不作权利担保。→ 判断：**内部商用（数值导入自家库、不分发衍生数据集）风险低**；一旦对外再分发需法务确认 ShareAlike/署名义务。
- **生/熟与可食部标注**：食品按**食态分列独立记录**（如 "Grape, raw"、"Chicken, broiler, thigh, meat and skin, stewed"），raw/boiled/roasted 各自成条；AFCD 用 Analysed Portion / Unanalysed Portion 字段；AUSNUT 用 Food measures 文件（份量+密度）支持"常见份量→克"。营养值以**可食部**为基准。
- **营养基准与单位**：**每 100 g（固/半固）或每 100 mL（液体）可食部**；能量单位 **kJ**（如 "Energy with dietary fibre, equated (kJ)"）；维生素/矿物质 g/mg/µg 并按官方等值表达（RE/DFE/烟酸当量）。
- **中文食材覆盖（评估，需下载后检索确认）**：以西方膳食为主（乳、肉及部位、谷物、蔬果、品牌麦片）；中式食材极少（多为西化中餐 chow mein/chop suey）；宠物常用原料（鸡牛羊肉部位与内脏、常见鱼、薯米蔬果）大多应可命中。
- **导入难度**：**中**。xlsx 宽表结构化高、无编码坑；需处理：①100g/100mL 双 sheet 分存或加 basis 列；②营养列单位嵌在表头（"Protein (g)"），2011-13(51)/2023(58)/AFCD(268) 列集不同——**以官方 Nutrient details 建 code↔名称↔单位映射表再入库，勿硬编码列序**；③主键为字符串 Public Food Key；④空白缺失清洗为 NULL。
- **坑点/备注**：FSANZ 改版后大量旧路径（/monitoringnutrients 等）302 到新 hub，勿引旧 URL 作下载源；AUSNUT 2023 食品数少于 2011-13 是因只收 Intake24 调查食品+配方成分；AFCD "268 营养素"是上限、多数食品远少且有缺失；人食数据仅供原料营养参考。
- **参考 URL 清单**：[AUSNUT 总页](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/ausnut) | [AUSNUT 数据文件页](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/ausnut/data-files) | [AUSNUT 2011-13 @ data.gov.au](https://www.data.gov.au/data/en/dataset/ausnut-2011-13) | [AUSNUT 2011-13 版权声明](https://www.foodstandards.gov.au/science-data/monitoringnutrients/ausnut/disclaimer) | [AFCD About（R3）](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/about-afcd) | [AFCD 数据文件页](https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files) | [FSANZ DULA](https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement) | [AFCD 在线检索](https://afcd.foodstandards.gov.au/) | [AUSNUT 2023 全量 ZIP](https://www.foodstandards.gov.au/sites/default/files/2026-03/AUSNUT%202023%20-%20All%20Files_0.zip) | [AFCD R3 Nutrient profiles xlsx](https://www.foodstandards.gov.au/sites/default/files/2025-12/AFCD%20Release%203%20-%20Nutrient%20profiles.xlsx) | [FAO INFOODS AUSNUT 2011-13 案例（规模出处）](http://www.fao.org/fileadmin/templates/food_composition/documents/regional/success_stories/Australia.pdf)

---

### 6. 加拿大 Canadian Nutrient File (CNF) [✅ 本库已完成在线核验]

- **版本与更新状态**：**未停止更新**。现行版为 **CNF 2026（官方第 14 版）**，2026-05/06 发布（Open Gov 门户标注 2026-06-03 上线）；此前长期最新的是 **CNF 2015**（2015→2026 间隔约 11 年，Health Canada 无固定更新频率，旧文件仍在 Open Gov 门户保留）。数据源定位（2026 guide 原文）：加国本土分析 **SNAP-CAN**（2007 年起）+ **改编自 USDA National Nutrient Database for Standard Reference** + 第三方数据。
- **官方下载入口页 URL**（[✅已核实]）：CNF 2026 数据集页 https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109 （open.canada.ca 对非浏览器直连有 WAF，被拒时可开镜像 https://ouvert.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109 ，[✅已核实 200]）；CNF 2015 数据集页 https://open.canada.ca/data/en/dataset/089885f9-ed53-44e6-854a-14d21a1ec2e0 （镜像 https://ouvert.canada.ca/data/en/dataset/089885f9-ed53-44e6-854a-14d21a1ec2e0 ）。
- **直接下载 URL**：**CNF 2026 全量 ZIP** https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/019f2a90-e3a9-489d-b6e1-f74f4ba1d006/download/cnf_fcen_all-files-data_2026.zip （[✅HEAD 实测 200，≈26.7 MB]）；也可按文件单独下（9 个 CSV，如 `food_name.csv`、`nutrient_name.csv`、`nutrient_amount.csv`）；配套文档：Users' Guide 2026（…/86483321-…/download/canadian-nutrient-file_users-guide_2026.pdf，[✅实测 200]，958 KB）、结构与文件内容说明 2026（…/e0cafc22-…/download/canadian-nutrient-file_database-structure-and-file-content-description_2026.pdf，[✅实测 200]，704 KB）。CNF 2015 zip 直链在 2015 数据集页（canada.ca content/dam 路径，本次环境未实测）。
- **文件格式与结构**：**CSV（"Excel-compatible CSV"，官方原话，非旧版定长 ASCII）关系型多文件**，共 9 个文件：Food Name、Nutrient Amount、Measure Weight Conversion + 支持表（Food Source、CNF Food Group、Nutrient Name、Nutrient Source、Measure Type、Measure Name），用 4 位整数 Food_Code / Nutrient_Code join（实测 CSV 带 **UTF-8 BOM、CRLF、标准引号转义**）。Nutrient Amount 每条含均值、**标准误、样本数 n、来源码、最后更新日期**；Food Name 含英/法双语名、别名、来源码、**USDA_NDB_Code** 列、23 个食品组。
- **规模**（2026 实测）：**5,993 个食品**；**173 个营养素字段**（含 INFOODS Tagname 列）。覆盖实测：20 项近似组分（能量 kcal 与 kJ 双列、水、蛋白、脂肪、碳水、纤维、酒精等）＋ 27 矿物质 ＋ 18 维生素 ＋ **22 项氨基酸类**（Tryptophan 501～Serine 518、Hydroxyproline 521 等，数值编码沿用 USDA SR 体系）＋ 大量**脂肪酸明细**（胆固醇、饱和/单不饱和/多不饱和/反式及异构体、植物固醇）＋ fructans 等。单位 g/mg/µg/IU/烟酸当量（实测分布 116 Gram/30 mg/23 µg/2 能量/1 IU/1 NE）。每食品并非全 173 项都有值（缺失＝无数据 ≠ 0，官方明确）。
- **获取方式与许可**：免费直下、无需申请。**Open Government Licence – Canada（OGL-C）** ＋ CNF 2026 guide "Copyright Guidelines" 原文：数据 **"may be downloaded and used for both commercial and non-commercial use, without further permission"**，要求：注明来源（Canadian Nutrient File, Health Canada, 2026）、**不得修改营养数值本身**（可改用 100 g 以外份量表达）、不得暗示背书、as-is 免责；联系 cnf.users@hc-sc.gc.ca。→ **宠物食品公司内部商用（含对外查询但数值不改、注明来源）按此文字可行**。
- **生/熟与可食部标注**：名称描述含状态/烹调/部位/剔骨信息（实测例 "Chicken, broiler, thigh, meat and skin, stewed"）；营养值为**每 100 g 可食部**（guide 原文：apple 去核、鸡腿去骨）；**Refuse（不可食部）与 Yield（烹制产率）放 Measure 文件**；份量换算公式 N = V×W/100（2026 版直接给份量克重）。
- **营养基准与单位**：**每 100 g 可食部**；氨基酸与脂肪酸以 g/100g（脂肪酸按游离脂肪酸计）；胆固醇 mg/100g；能量同时有 **kcal(208) 与 kJ(268)** 双行；缺失＝空值非 0。
- **中文食材覆盖（评估，需下载后检索确认）**：以加/北美西式食物为主，中式食材极少（实测仅 "Chinese dish, chow mein, chicken"、"Chop suey" 等西化中餐）；宠物常用原料（家禽/红肉部位与内脏、乳、常见鱼、谷物蔬果）大多应可命中，中式内脏部位/亚洲鱼种/药食同源大概率缺失（可利用 Alternate_Description 检索）。
- **导入难度**：**低–中**。CSV 干净（UTF-8 BOM、字段稳定、附字段说明书），主键关系清晰，按 Food_Code + Nutrient_Code 关系导入；nutrient_amount 为长表（行数十万级）建议 COPY/批量导入 + code 索引；保留 Tagname/单位/样本数/来源码便于溯源。坑：能量 kcal/kJ 双行并存；每食品营养素集合不一勿假设满值；若并行导入 2015 旧版注意字段语义变化（2026 guide 附录 A 有对照）与编码探测。
- **坑点/备注**：与 USDA 关系可直接量化：营养码沿用 **USDA SR 数值编码体系**（203=protein、501=Tryptophan、601=cholesterol…）并带 INFOODS Tagname；Food Name 带 **USDA_NDB_Code**，**实测 5,993 食品中 4,798 条（80.1%）有 USDA NDB 码**——与 USDA 高同源，作为第二主库边际价值有限，但作 USDA 的补充（加国本土 SNAP-CAN 分析 + 另类部位/份量表）与格式最简单的"氨基酸/脂肪酸齐全"库之一仍有价值。注意 open.canada.ca 直连被 WAF 拦（浏览器或 ouvert 镜像可绕）。
- **参考 URL 清单**：[CNF 2026 数据集页](https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109) | [CNF 2026 ouvert 镜像](https://ouvert.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109) | [CNF 2026 全量 ZIP](https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/019f2a90-e3a9-489d-b6e1-f74f4ba1d006/download/cnf_fcen_all-files-data_2026.zip) | [CNF 2026 Users' Guide PDF](https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/86483321-6c76-4a5f-9061-04b9a0a48a8d/download/canadian-nutrient-file_users-guide_2026.pdf) | [CNF 2026 结构说明 PDF](https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/e0cafc22-f564-4524-b82a-9ad7554f57ef/download/canadian-nutrient-file_database-structure-and-file-content-description_2026.pdf) | [CNF 2015 数据集页](https://open.canada.ca/data/en/dataset/089885f9-ed53-44e6-854a-14d21a1ec2e0) | [Health Canada CNF 2015 下载页](https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/nutrient-data/canadian-nutrient-file-2015-download-files.html) | [FAO 目录：(Canada, 2015) CNF](https://www.fao.org/food-composition/tables-and-databases/detail/(canada--2015)-canadian-nutrient-file/en)

---

### 7. 英国 CoFID（McCance and Widdowson）[✅ 本库已完成在线核验（含实测下载解析 xlsx）]

- **版本与更新状态**：最新整库为 **CoFID 2021**（2021-03-19 发布，PHE 名义；此前 2008/2015/2019）。官方现行维护方为 Quadram Institute 旗下 **FNNBRI**（原 Food Databanks），其数据页明示"最近更新为 2021"，提供两个入口：Excel 整库下载（指向 gov.uk）与可搜索网站（逐条修正可能领先 2021 Excel）。【核验日期 2026-09-05，gov.uk 页面 HTTP 200，非归档】
- **官方下载入口页 URL**：https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid （[✅已核实 HTTP 200]；名义发布方 PHE 已解散但页面仍由 gov.uk 托管，UKGWA 有 2024-09 快照）；FNNBRI 入口 https://fnnbri.quadram.ac.uk/data/ ；可搜索版 https://quadram.ac.uk/UKfoodcomposition/ （对脚本返回 403 反爬，浏览器可开）。
- **直接下载 URL**（[✅ 全部 HEAD 200，实测字节]）：
  - 主工作簿：https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx （4,629,542 B ≈ 4.42 MB；注意文件名扩展名前**有两个点**）
  - old foods 补充：https://assets.publishing.service.gov.uk/media/60538ba4e90e07527f645f88/CoFID_oldFoods.xlsx （649,329 B）
  - 用户指南 PDF（37 页）：https://assets.publishing.service.gov.uk/media/60538e66d3bf7f03249bac58/McCance_and_Widdowsons_Composition_of_Foods_integrated_dataset_2021.pdf
- **文件格式与结构**：单个 **.xlsx，15 张 sheet**（List + Notes/Factors + 各成分表），每表前 3 行为表头（第 1 行全称、第 2 行缩写、第 3 行小写），**数据自第 4 行**；食品代码跨表同序可按 Food Code join。实测主工作簿 **2,886 个唯一食品代码**；old-foods 393 个 → **合计 ≈3,279**（官方 FNNBRI 口径 ">3,000"，非 3,600）。
- **规模**（实测解析原文件）：数值列共 **275 列**（脂肪酸以"每 100g 食品 / 每 100g 脂肪酸"双基准重复，其中 ≈177 列为每 100g 食品基准）。覆盖：宏量（水/蛋白/脂肪/碳水+**单糖明细**：葡萄糖/果糖/蔗糖/乳糖/麦芽糖/半乳糖/淀粉/低聚糖/酒精/NSP 与 AOAC 双口径纤维）、能量 **kcal+kJ**、胆固醇、**12 无机物（含 Cl）**、17 维生素 + 18 项细分（类胡萝卜素、25-OH-D3、生育酚/三烯酚等）、脂肪酸按链长明细（SFA 27/MUFA 25/PUFA 36 × 双基准）、植物甾醇 10 项、有机酸 2 项。**⚠️ 无氨基酸表**（FAO 文档明示：氨基酸为 4th edition 时代独立旧文件，需另行向 FSA/FDNC 索取）。
- **获取方式与许可**：免费直下、无需注册。**OGL v3.0**（数据 © Crown copyright 2021），**可商用（含企业内部库）与再分发**；须注明来源（官方建议引用 PHE 2021 CoFID 或 FNNBRI 搜索版）并附 OGL 链接、不歪曲数据。https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- **生/熟与可食部标注**：生/熟及烹调以**独立条目 + 食品名**区分（raw/boiled/grilled…）；含废料食物名带 "weighed with waste"（带骨/带皮），且 **1.2 Factors 表有 Edible proportion（可食部比例）列**、比密度列、氮/甘油换算系数列，可把毛重折算可食部。
- **营养基准与单位**：一律 **每 100 g 食品**（唯一例外：酒精饮料按 100 ml）；能量 kcal+kJ 双列（系数：蛋白 4/脂肪 9/可利用碳水 3.75/酒精 7 kcal·g⁻¹）——能量为**计算值**；缺失 "-"、微量 "Tr"、"存在但无可靠值" "N"。
- **中文食材覆盖（评估，含实测抽查）**：以英国市场食材为主。实测有 Chinese cabbage、pak choi、mooli（白萝卜）、ginger、sesame、干香菇、个别中式外卖菜等零星条目；莲藕/冬瓜/芋头/木耳/豆豉/腊味/枸杞等基本缺失。
- **导入难度**：**中**。15 张 sheet 宽表、每表 3 行表头（自第 4 行取值并拼接表头）、脂肪酸双基准冗余需取舍、文本占位符（-,Tr,N）需清洗、部分列稀疏；建议只取 per-100g-food 子集并按 Food Code join；openpyxl/pandas 可直接解析。
- **坑点/备注**：①页面名义发布方 PHE 已解散，gov.uk 若未来迁移可依 UKGWA/FNNBRI 找回，下载后建议本地留存副本并记录版本与校验值；②主工作簿 + old foods 两文件合计才是完整 CoFID；③**氨基酸不在库内**（做 FEDIAF 必需 AA 计算需与其它库互补）；④脂肪酸双基准勿混；⑤能量是计算值非直接分析值；⑥单条修正以可搜索网站为准。
- **参考 URL 清单**：[gov.uk CoFID 页](https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid) | [主工作簿 xlsx](https://assets.publishing.service.gov.uk/media/60538b91e90e07527df82ae4/McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx) | [old foods xlsx](https://assets.publishing.service.gov.uk/media/60538ba4e90e07527f645f88/CoFID_oldFoods.xlsx) | [用户指南 PDF](https://assets.publishing.service.gov.uk/media/60538e66d3bf7f03249bac58/McCance_and_Widdowsons_Composition_of_Foods_integrated_dataset_2021.pdf) | [FNNBRI 数据页](https://fnnbri.quadram.ac.uk/data/) | [UK 食品成分搜索站](https://quadram.ac.uk/UKfoodcomposition/) | [FNNBRI 发布新闻](https://fnnbri.quadram.ac.uk/2019/03/new-searchable-uk-composition-of-foods-website-available/) | [FAO 注册页（CoFID 2021）](https://www.fao.org/food-composition/tables-and-databases/detail/(united-kingdom--2021)-mccance-and-widdowson-s-the-composition-of-foods-integrated-dataset/en) | [FAO 版 CoFID 用户文档](https://www.fao.org/uploads/media/British_FCDB_cof_user_doc.pdf) | [OGL v3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)

---

### 8. 法国 ANSES Ciqual [✅ 本库已完成在线核验（含实测下载解析 XML）]

- **版本与更新状态**：最新版为 **"Table Ciqual 2025"（2025-11-19 发布）：3,484 个食品 × 74 个构成素**（实测 alim/const XML 一致；相对 2020 新增约 300 食品与 7 个维生素构成素、约 11.3 万条数据）。上一版 2020-07-07 实测为 **3,185 × 67**（官方页面某段描述文字写"3 484"与文件不符，以文件实测为准）。预设的"2,800+ 食品、60+ 构成素"偏低。
- **官方下载入口页 URL**：**现役官方仓库（recherche.data.gouv.fr，已取代 data.gouv.fr 旧页并声明"ANNULE ET REMPLACE"）**：https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY （DOI：https://doi.org/10.57745/RDMHWY ，[✅已核实并实际下载]）；旧 data.gouv.fr 页（仍可下 2020 版）：https://www.data.gouv.fr/fr/datasets/5369a15fa3a729239d2065b7/ ；门户站（SPA 查询/下载）：https://ciqual.anses.fr/ 。
- **直接下载 URL**（2025 版经 `https://entrepot.recherche.data.gouv.fr/api/access/datafile/{fileId}`，[]内为 fileId/实测大小）：`alim_2025_11_03.xml` [666252] 1,581,031 B；`const_2025_11_03.xml` [666246] 17,955 B；`compo_2025_11_03.xml`（营养值长表）[666249] 69,243,149 B；`alim_grp_2025_11_03.xml` [666250]；`sources_2025_11_03.xml` [666248]；doc FR PDF [666748] 4,236,848 B；`Table Ciqual 2025_FR….xls` [666245] 4,489,728 B 与同内容 **.xlsx** [666260] 1,541,998 B。**重要更正：官方机器可读格式是 XML（alim/const/compo/sources/alim_grp 规范化结构）+ Excel，没有官方 CSV**（网上 aliments.csv 等为第三方转换）。2020 旧版直链（[✅ HTTP 200]）：https://ciqual.anses.fr/cms/sites/default/files/inline-files/Table%20Ciqual%202020_FR_2020%2007%2007.xls 与 `…/XML_2020_07_07.zip`（另有 *_ENG_* 英文版）。
- **文件格式与结构**：Excel = 宽表（3,484 食品行 × 74 构成素列 + 组别/学名/Jones 系数列 + 「codes INFOODS」sheet，.xls 与 .xlsx 同内容）；**官方推荐编程用 XML 五件套**：alim（食品字典，含法/英名）— const（构成素字典，含 INFOODS code 与法/英名）— compo（每 [食品×构成素] 一行：teneur/min/max/code_confiance A–D/source_code）— sources（来源文献）— alim_grp（分类），可直接三表 JOIN 进 PostgreSQL。编码注意：2020 XML 为 **windows-1252**、2025 XML 为 **UTF-8（带 BOM）**。
- **规模**：**3,484 × 74**（2025 实测；2020 为 3,185 × 67）。构成素覆盖：能量 **kcal 与 kJ 并存**（EU 法规 1169/2011 与 N×Jones 两种算法共 4 行）、水/灰分/盐/12 矿物质、蛋白质（Jones 与 ×6.25 两种）、碳水与**单个糖**（果糖/半乳糖/葡萄糖/乳糖/麦芽糖/蔗糖）、淀粉/多元醇/膳食纤维、脂肪与**脂肪酸链明细**（4:0…22:6，含棕榈/油酸/亚油酸/ALA/ARA/EPA/DHA）、胆固醇、维 A 系列、维 D 及 **D2/D3 细分**、维 E 及 α-生育酚、**维 K1/K2**、维 C、B 族（B1 B2 B3 B5 B6 B12 B9 含叶酸/DFE/富集叶酸细分）、酒精、有机酸。**⚠️ 无氨基酸构成素**（2025 亦无变化）。
- **获取方式与许可**：免费开放（OpenData）。许可 **Licence Ouverte（fr-lo / Open Licence 2.0 体系，非 ODbL）**，文档明示可自由复用、**可商用（含企业内部使用）**；条件：不篡改/不曲解、注明来源与版本（标准署名 "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual"，详细版附 DOI https://doi.org/10.57745/RDMHWY ）。https://www.data.gouv.fr/fr/licences
- **生/熟与可食部标注**：生/熟以**独立食品条目**区分（实测 "Chou chinois pé-tsaï, cru / sauté-poêlé"、"Pomme de terre, bouillie/cuite à l'eau"）。**所有值一律按每 100 g 可食部（partie comestible，去骨/芯）**——因此官方 XML/Excel **无"可食部比例/废弃"列**（食品定义本身即可食部基准，与 CoFID 不同）。
- **营养基准与单位**：每 100 g 可食部；单位写死在构成素名（"g/100 g"、"mg/100 g"、"µg/100 g"）并与 INFOODS tagname 对应；3 位有效数字；缺失 "-"（全表约 30%，维 K2 缺失率达 95%）、"traces"、"<10" 文本；仅 XML 带 A–D 置信度与数据来源码。
- **中文食材覆盖（评估，含实测抽查）**：以法国/欧盟市场为主。实测有 chou chinois pé-tsaï（大白菜）、pak choï/bok choy、gingembre、tofu 系列、大量 soja 制品、亚洲面条（米粉/蛋面/方便面）、sésame、海苔/裙带菜、nems/春卷、新增照烧汁等；但莲藕/冬瓜/芋头/木耳/豆豉/鱼露/老抽/花椒/陈皮/腊味等中式原料基本缺失，且条目多为法国预包装/素食化产品。
- **导入难度**：**低–中**。官方 XML 为规范化长表（alim/const/compo 三字典 JOIN），语义清晰、带 INFOODS 标识，比 CoFID 易解析；compo 69 MB（约 26 万行级）需流式解析；脏点：文本占位（"-"/"traces"/"<10"）、单位嵌在构成素名（建议改用 const_code + INFOODS 映射）、2020 版编码 windows-1252、老 .xls 需 xlrd（直接用 2025 .xlsx/XML 即可）。
- **坑点/备注**：①别再引 data.gouv.fr 旧页 2020 版当"当前版"——**用 DOI 10.57745/RDMHWY 的 2025 版**；②2025 仓库仅法文 Excel（英文用 XML 内嵌名，需要英文 Excel 可用 2020 ENG 版）；③单糖/脂肪酸明细/D2/D3/K1/K2 是**独立构成素**，做宠物营养扩展别当单值；④compo 的 teneur 可能是 "<10"/"traces"，转 numeric 前需过滤；⑤保留 source_code/code_confiance 便于溯源；⑥署名带 "Anses. 2025" + 版本/DOI 满足 Licence Ouverte。
- **参考 URL 清单**：[DOI 仓库页](https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY) | [DOI](https://doi.org/10.57745/RDMHWY) | [旧 data.gouv 页（2020）](https://www.data.gouv.fr/fr/datasets/5369a15fa3a729239d2065b7/) | [Ciqual 门户](https://ciqual.anses.fr/) | [ANSES Ciqual 介绍页](https://www.anses.fr/en/content/ciqual-nutritional-composition-table) | [2025 新版发布新闻](https://www.anses.fr/en/content/new-enhanced-and-more-representative-version-ciqual-table) | [Licence Ouverte](https://www.data.gouv.fr/fr/licences)

---

## 四、犬营养（FEDIAF）必需营养素覆盖对照

FEDIAF《Nutritional Guidelines for Complete and Complementary Pet Food for Cats and Dogs》（官方页 https://europeanpetfood.org/self-regulation/nutritional-guidelines/ ，近年版本 2021 / 2024 / 2025）对犬全价粮的营养需求涵盖：能量、蛋白质（必需氨基酸 10 种 + 半胱/酪氨酸代偿）、脂肪（亚油酸等必需脂肪酸、EPA/DHA 建议）、矿物质（Ca、P、K、Na、Cl、Mg、Fe、Cu、Mn、Zn、I、Se）、维生素（A、D、E、K、B1、B2、烟酸、泛酸、B6、叶酸、B12、生物素、胆碱）。

| 需求大类 | USDA SR Legacy | USDA Foundation | CFCT | NZFCD FOODfiles 2024 | MEXT 八訂 | AUSNUT/AFCD | CNF | CoFID | Ciqual |
|---|---|---|---|---|---|---|---|---|---|
| 能量（kcal/kJ） | ✅ kcal | ✅ | ✅ kcal+kJ | ✅ kJ+kcal | ✅ kcal+kJ | ✅ | ✅ | ✅ | ✅ kcal+kJ |
| 宏量（蛋白/脂肪/碳水/纤维） | ✅ | ✅ | ✅ | ✅（87 组分含） | ✅ | ✅ | ✅ | ✅ | ✅ |
| 维生素全谱 | ✅ | ✅ | ✅ | ✅（标准版） | ✅ | ✅ | ✅ | ✅ | ✅ |
| 矿物质（含 I、Se 等） | ✅ | ✅ | ✅ | ✅ | ✅（含 I、Se、Cr、Mo） | ✅ | ✅ | ✅ | ✅ |
| 氨基酸 | ◑ 营养素行存在（非每食品全谱） | ◑ | ✅ 20 种（分表仅部分食品） | ◑ 仅完整版且 ≈16% 食品（牛磺酸更稀疏） | ◑ 别册 1,954/2,538 食品（18 项 AA + 合计，mg/100g） | ◑ core 51/58 不含；AFCD R3 额外项含 | ◑ 22 项氨基酸（USDA 编码，逐食品覆盖不等） | ❌ 无（4th ed 独立旧文件需另索） | ❌ 无 |
| 脂肪酸（含 LA/ALA/EPA/DHA 线索） | ✅ 营养素行存在 | ◑ | ✅ 45 种（分表部分食品） | ✅ 单项脂肪酸（完整版） | ◑ 别册 1,919/2,538 食品逐脂肪酸 4:0–22:6 + 主表 FA 汇总列 | ◑ AFCD R3 含；AUSNUT core 不含明细 | ✅ 大量脂肪酸明细（含异构体/植物固醇） | ✅ 链长明细（SFA/MUFA/PUFA 双基准） | ✅ 脂肪酸系列 |
| 氯 Cl | ◑ 部分食品 | ◑ | ◑ | ◑ | ◑ | ◑ | ◑ | ✅ 12 无机物含 Cl | ◑ |

> ✅=覆盖良好；◑=部分/稀疏（值非每个食品都有）；❌=基本无。按"能否支撑 FEDIAF 全项计算（含必需氨基酸）"排序：**USDA SR Legacy、CFCT、MEXT 八訂、CNF 2026、NZFCD FOODfiles** 依次靠前；其中 CFCT 数据不可批量获取、NZFCD/CNF 氨基酸按食品稀疏、CoFID 与 Ciqual **无氨基酸**——实际可用性需结合第六节推荐清单取舍。

## 五、中文食材覆盖对照（针对本项目关注食材）

| 食材 | USDA SR Legacy | MEXT 八訂（实测） | NZFCD | Ciqual/CoFID/CNF | CFCT |
|---|---|---|---|---|---|
| 冬瓜 | ◑ Waxgourd raw/cooked (FDC 170069/170549) | ✅ とうがん 果実 生/ゆで | ❌ | ❌/❌/❌ | ✅（权威） |
| 燕麦米/燕麦片 | ✅ Oats / Oat bran | ✅ えんばく/オートミール (01004) | ◑ | ◑ | ✅ |
| 苋菜 | ◑ Amaranth leaves raw (168385) | ❌ 未收录（实测 0 条，仅谷物"アマランサス"） | ❌ | ❌ | ✅ |
| 南美白虾 | ❌ 仅 mixed species shrimp（无物种级） | ✅ バナメイえび 養殖（生・天ぷら） | ❌ | ❌ | ✅ |
| 白萝卜 | ◑ Radishes, oriental (daikon) | ✅ だいこん（根 生/ゆで、葉等 23 条） | ❌ | ◑ | ✅ |
| 小白菜/上海青 | ✅ (USDA:170390) | ◑ 近似品种 | ❌ | ◑ | ✅ |
| 山药/芋头/薏仁等 | ◑/✅ | ◑ 山药・芋头（ながいも・さといも）按章节推定有；薏仁待确认 | ❌ | ◑ | ✅ |

> 结论：**没有单一外库能替代 CFCT 对中式食材的覆盖**。现实策略 = 外库（USDA+MEXT 为主）覆盖通用食材 + 中式特有食材走 CFCT 按需手工补录（沿用现有 12 条流程）。

---

## 六、推荐导入清单（按性价比排序）

**评估维度**：下载可得性（免注册直连）、格式易解析、营养字段完整度（FEDIAF 必需项）、中文食材覆盖、许可合规成本。

| 序 | 库 | 建议角色 | 核心理由 | 注意事项 |
|---|---|---|---|---|
| **1** | **USDA FoodData Central —— SR Legacy + Foundation（一并导入）** | **必选主库** | public domain 可商用；CSV 关系型格式规范；SR Legacy ≈7,793 食品（冻结稳定）+ Foundation 高质量分析值（retention factor 利于生熟换算）；氨基酸/脂肪酸以营养素行存在；**现有 272 条 USDA 记录与既有映射流程直接衔接**；USDA:xxxx key 已贯通 | 多表 join 需一次性建好导入管道；归一 nutrient_id（208/1008 等）；勿并入 Branded |
| **2** | **MEXT 八訂 ＋ 増補2023（日本）** | **强推荐第二库** | ✅已实测核验：直链 HTTP 200、Excel 下载解析成功；免费、文部科学省利用規約（出典明記 + 加工注明即可商用，≈CC BY 4.0）；**増補2023 统合版 2,538 食品（单 xlsx 主源）**，主表 51 营养列 + **氨基酸别册 1,954 食品 / 脂肪酸别册 1,919 食品**；**廃棄率列（可食部）**、每 100g kcal+kJ；对中日共通食材（冬瓜/白萝卜/燕麦/南美白虾）是 USDA 之外最有效的**中文食材补充**；现有 `MEXT:xxxxx` key 已使用 | 多行合并表头解析；"Tr/-"独立编码；日文列名与食品名别名映射；建议以増補2023 统合版为主源 |
| **3** | **NZFCD / FOODfiles 2024** | **推荐（肉/水产专项补充）** | 免费直下（MSI≈46 MiB，实测 200）；2,857 食品；**每记录可食部%、raw/cooked State、WYF/NRF 系数**；新西兰牛羊鹿禽内脏鱼贝质量高（与鲜食主力肉源贴合）；87/434 组分覆盖宏量维生素矿物质+脂肪酸 | 条款限制多（不得修改/不可转让，需法务复核）；MSI 需在 mac/Linux 解包；AA 数据稀疏 |
| **4** | **CNF 2026（加拿大）** | **备选/第四库（AA+FA 齐全且易导入）** | ✅已实测核验：CSV 关系型 9 文件、UTF-8 BOM 干净；**5,993 食品、173 营养素（含 22 项氨基酸类 + 脂肪酸明细）**——FEDIAF 必需 AA 友好；OGL-C 官方明示"商用无需另行许可"（注明来源+不改数值）；80% 食品带 USDA NDB 码可作主库交叉验证 | 与 USDA 80% 同源 → 边际价值有限，建议排 USDA/MEXT/NZFCD 之后；open.canada.ca 有 WAF，用 ouvert 镜像下载 |
| — | CoFID 2021（英国） | 欧洲市场备选 | OGL v3 可商用；≈3,279 食品、**275 数值列**（维生素细分/脂肪酸链明细/单糖最密） | **无氨基酸表**（FEDIAF 必需 AA 需与 CNF/MEXT 互补）；xlsx 15 sheet+3 行表头解析；两文件（主库+old foods）合计才完整 |
| — | Ciqual 2025（法国） | 管道试点/欧洲备选 | ✅已实测核验：XML 规范化五表（INFOODS 码）+ Excel，语义清晰；Licence Ouverte 可商用；3,484×74（脂肪酸/单糖/D2/D3/K1/K2 全） | **无氨基酸**；compo 69 MB 流式解析；法文标签；若只想先跑通导入管道，它比 CoFID 更好解析 |
| — | AUSNUT·AFCD（澳大利亚） | 不建议首批 | AFCD R3 仅 1,588 食品（营养上限 268 但多数食品缺失多）；AUSNUT 2023 为调查口径；AUSNUT 2011-13 原文件已下架（5,740×51 也最旧） | DULA（CC BY-SA 3.0 AU）再分发需法务确认 |
| — | CFCT | **不整库导入** | 无官方电子数据 | 只按需手工补录中式特有食材（见第三节 CFCT 替代路径①） |

**推荐先导入 2-4 个**：**USDA（SR Legacy + Foundation）→ MEXT 八訂（増補2023）→ NZFCD FOODfiles 2024**；第 4 个名额建议取 **CNF 2026**（AA/FA 齐全、CSV 最易导、商用无忧，唯与 USDA 高同源）；若项目还需要欧洲市场食材做参考，可再加 **CoFID**（字段最密但无氨基酸）或先用 **Ciqual**（XML 语义最清晰）跑通导入管道。

**实施节奏建议**（不在本次范围内，供下一步参考）：
1. 先用一个库（建议 USDA SR Legacy）打通"下载→解析→建表→查询"全链路并复核若干已知值（如与现有 272 条 USDA 记录比对，冬瓜/树莓等 LOW 完整性条目优先验证）；
2. 再加 MEXT 八訂（重点处理廃棄率→可食部与日文别名）；
3. 每个库入库时记录 `source`、`source_version/publication_date`、`unit`、`basis(每100g)` 字段，保证 291 条历史数据与新批量数据可同表共存、可追溯；
4. CFCT 保持手工补录通道，仅在中式食材无外库条目时录入。

---

## 七、版权与合规注意事项（内部商用数据库）

1. **各库许可一览**：USDA SR Legacy/Foundation = public domain（自由）；MEXT = 文部科学省利用規約（出典明记+加工注明即可，≈CC BY 4.0）；CoFID = OGL v3.0；Ciqual = Licence Ouverte/Open Licence 2.0；CNF = Open Government Licence – Canada（官方明示"商用无需另行许可"，注明来源+不改数值）；AUSNUT/AFCD = CC BY 3.0 AU / FSANZ DULA（CC BY-SA 3.0 AU，含 USDA/McCance-Widdowson/NZ 等第三方数据）；NZFCD/FOODfiles = 站内 Terms（不得修改/不可转让，**建议法务复核**）；CFCT = 无开放许可（需书面授权）。
2. **"内部数据库自用"通常是合规场景**，但共同底线是：入库**不篡改数值**（可加自己的字段/别名，不改原始值）、在对外成品（食谱/产品）中**注明数据来源**、**不把裸数据作为独立数据产品转售/分发**。
3. USDA 之外各库数据多来自政府资助项目，署名模板各异（NZFCD 官方署名模板见其 FAQ；CoFID 需附 OGL 声明；Ciqual 需按 Licence Ouverte 注明 "Anses. 2025. Table de composition nutritionnelle des aliments Ciqual" + 版本 DOI https://doi.org/10.57745/RDMHWY ），入库时应在 nutrition_source_record 里一并记录引用信息。
4. 涉及犬粮跨物种应用：所有"人食"成分库（USDA/NZFCD/CoFID/Ciqual 等）数值基于人食用状态与可食部，用于犬配方时需自行评估差异（如生肉 vs 熟食、骨/皮处理）。

---

## 八、修订记录

- 2026-09-05 v1：成稿。USDA / CFCT / NZFCD 已在线核验（✅）；MEXT、AUSNUT/AFCD、CNF、CoFID、Ciqual 五库小节为"官方入口页 + [待核验]"版本。
- 2026-09-05 v2：MEXT 小节已回填为实测核验版（✅，子代理实测下载并解析官方 Excel：直链 HTTP 200、本編 2,478 食品、増補2023 统合版 2,538 食品、氨基酸别册 1,954、脂肪酸别册 1,919、许可=文部科学省利用規約≈CC BY 4.0、中文食材实测检索）；同步更新速览表/FEDIAF 覆盖表/中文食材表/推荐清单/许可一览。
- 2026-09-05 v3：澳大利亚（第 5 节）与加拿大 CNF（第 6 节）回填为实测核验版：AUSNUT 2011-13 原文件已从 FSANZ 新站下架（需 data.gov.au 联系索取），现役 AUSNUT 2023（3,741 食品/58 营养素）与 AFCD Release 3（1,588 食品、营养列上限 268、xlsx 直链已下载解构）；**CNF 未停更**，现行 CNF 2026 第14版（5,993 食品/173 营养素含 22 氨基酸类+脂肪酸明细、CSV 关系型 9 文件、ZIP≈26.7MB 实测 200、OGL-C 商用免另行许可、80.1% 食品带 USDA NDB 码）；同步更新速览表/FEDIAF 覆盖表/推荐清单/许可一览/推荐语。
- 2026-09-05 v4（终版）：英国 CoFID（第 7 节）与法国 Ciqual（第 8 节）回填为实测核验版，**8 库全部核验完成**：CoFID 2021（gov.uk assets 直链实测 200 并下载解析：≈3,279 食品/275 数值列，**无氨基酸表**——修正 v1 预设）；Ciqual 2025（官方仓库迁移至 recherche.data.gouv.fr DOI 10.57745/RDMHWY，实测 **3,484×74**、官方格式为 **XML+Excel、无官方 CSV**——修正 v1 预设）；同步修正速览表/FEDIAF 覆盖表（CoFID/Ciqual 氨基酸=❌）/推荐清单（第 4 库改荐 CNF 2026，CoFID 与 Ciqual 降为欧洲备选/试点）/许可一览/署名模板。报告完成。
- 2026-09-05 v5：补全 v4 唯一保留的 [待下载确认] 项——USDA Foundation 最新总数以本地批量导入实测为准（2026-04-30 包 469 个食品）；与 SR Legacy 7,793 一起已全量入库本地营养库。
- 2026-09-05 v6：推荐清单第 4 库 CNF 2026 已实际导入本地营养库（5,993 食品，0 失败；营养素编号经 USDA nutrient_nbr→FDC id 对照表翻译后复用项目 USDA 字段映射，含犬用维生素 A/E 换算；OGL-C 署名保留）。至此本地库共 19,607 条（USDA/CNF/NZFCD/MEXT 四主库 + 零星）。
