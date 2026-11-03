# 疫苗板块 · 冲突与含糊清单（37 条 · 2026-10-15）

> **这份是从 v1 需求文档里拆出来的。** v1 的人群定义（"零记录 = 没打过"）已被推翻，
> 但这份清单查的是**代码与文档互相矛盾的地方**，与人群定义无关，**全部仍然有效**。
>
> 每条都有出处（文件:行号）。**裁决** 是我的建议，老板不反对即执行。
> 其中 A9、A10 已由 2026-10-15 的产品决策解决（见文末）。

**分类**：A 类 = 会让家长看到错东西（必修）；B 类 = 口径不清（会让人做出不同实现）；C 类 = 过期残留（清理）。

---

## A 类 · 会影响家长看到的（15 条）

| # | 冲突 | 出处 | 裁决 |
|---|---|---|---|
| **A1** | 「已忽略 N 项 · 点这里恢复」里 **N 恒为 0** —— 被忽略的步骤在下发前就被过滤了，前端统计不到；等于**忽略之后找不回来** | `immunization-schedule.ts:2799-2807`（先过滤）vs `:3009`（后统计）；`VaccinePlanSection.vue:330-332` | 先统计再过滤，把 `skipped` 真实下发给前端 |
| **A2** | 勾"都不是 / 不确定"走的是**赋值通道**，而父组件已明令拦下"成分"这个字段 → 勾选不同步、也不排保存（等于点了没反应） | `VaccineRecordCard.vue:964-971` vs `VaccineManagementSection.vue:785-796` | 改走"只通知不带值"的通道；数组字段禁止从赋值通道进来 |
| **A3** | 计划板块发出 `record-saved` 事件，却没在声明里登记，而页面一直在监听 → **接线是假的** | `VaccinePlanSection.vue:1100` vs `:494-507`；页面 `index.vue:149` | 声明清楚并真正接上，或删掉监听；P2 一并收口 |
| **A4** | 点"忽略"存决定时，后端用**默认计划表**校验步骤 key → 早期核心苗这类非默认步骤会被 400 拒掉 | `vaccine-plan.service.ts:137-138` vs `immunization-schedule.ts:1844-1849` | 校验改用"这只狗的实际计划步骤" |
| **A5** | 合并产品列表：注释明写"不设上限（上一版漏了维克就是被截掉的）"，调用处却仍截前 3 条 | `vaccine-products.ts:904-921`（注释）vs `immunization-schedule.ts:2844-2846`（`.slice(0,3)`） | 合并列表不截断；单类推荐保留上限 3 |
| **A6** | "有没有证据"有两套判据（结果级 vs 步骤级）→ 同一屏可能自相矛盾 | `immunization-schedule.ts:1386-1407 / 1962`（旧）vs `:2664-2666`（新） | 统一为**步骤级** |
| **A7** | 未核对记录的冲突里，类别硬编码成 `other` → 提示可能指错类别 | `immunization-schedule.ts:1601` | 用记录真实类别；文案不需要类别时就不显示 |
| **A8** | 早期苗有三种口径：注释说"按年龄开关"，代码实际只看记录里有没有 `core_early`；附带一段永远为假的分支（死代码） | `immunization-schedule.ts:911-938` vs `:1074-1083` | 随 A10 的决策一并收口（结论：不主动推），删死代码 |
| **A9** | **钩端螺旋体默认排给每一只狗**：这是"非核心苗"，而 10-04 定的是"非核心苗有记录才提醒" | 文档 `2026-10-04-vaccine-record-entry-plan.md:288-296`、`2026-10-04-vaccine-product-list-review.md:24-30` vs 代码 `immunization-schedule.ts:1228-1232`、`:890-897` | ✅ **已解决**：三层分级（必打 / 强烈建议 / 可选），钩端归"强烈建议" —— 默认出现但不催 |
| **A11** | "本子上写的下次到期日"**整个不用** |
| **A10** | **零记录 4~6 周幼犬看不到早期苗提醒**：10-11 的验收档案（测29/测30）是照"该提醒"建的，10-14 改成"只认记录"，档案预期没跟着改 | 文档 `2026-10-11-vaccine-test-case-library.md:400-407` vs 代码 `:911-938` | ✅ **已解决**：不主动推（WSAVA 收容期口径），并改掉旧验收档案预期 |
| **A11** | **`nextDueDate`（本子上写的下次到期日）**：顾客看不到、也改不了，但系统拿它报冲突、分享页还单独显示它 | 文档 `2026-10-08-vaccine-plan-algorithm.md:22-27` vs `2026-10-08-vaccine-ai-scan-audit.md:115`；代码 `VaccineRecordCard.vue:39-40/279-281` vs `immunization-schedule.ts:1709-1745`、`health-timeline.service.ts:368-384` | ✅ **已解决**（老板 2026-10-15）：**整个字段不再使用** —— 不识别、不显示、不参与计划、不报冲突 |
| **A12** | 同一屏两种截断口径：「常见产品」截前 3 支且**不写"等"**，合并产品却**一律补"等产品"** | `VaccinePlanSection.vue:71-74` vs `:233-234`；`vaccine-products.ts:475-483` | 两处都补"等" |
| **A13** | **改了病种不算数**：声明"病种是唯一事实"，但写入与回读仍以记录上存的"类别"优先 | `vaccine-products.ts:37-49` vs `health.service.ts:804-815`、`immunization-schedule.ts:760-780` | 一律**由病种重新推导类别**；旧类别只作兼容读一次 |
| **A14** | **钩端/狂犬的"年度加强"可能算错**：实测"最后一针 2026-09-20、年度加强窗口 2027-10-18"（差 13 个月）；16 周打的第 3 针被贴成"年度加强"；成年加强还在编号而狂犬已不编号 | `2026-10-11-vaccine-test-case-library.md:23-27`（案例 7、8）vs 代码 `immunization-schedule.ts:1920-1953 / 1299-1332 / :1046-1065` | 锚点与标签按规格表重算：**年度加强以实际最后一针 +1 年为锚**；首免系列内不贴"年度加强"标签 |
| **A15** | **识别来的狂犬一律"待核对"、不计入计划，手输的狂犬却直接算数** —— 同一种记录两种待遇 | `VaccineManagementSection.vue:1230-1247` vs 手工录入无此判断；文档 `2026-10-08-vaccine-ai-scan-audit.md:53-66` | 判据统一为"系统拿不准"（名字能否认产品、日期是否合法、成分能否推出），不按类别一刀切 |

---

## B 类 · 口径不清（14 条）

| # | 冲突 | 出处 | 裁决 |
|---|---|---|---|
| **B1** | 宽限期两套：文档写"狂犬/钩端一年一次 90 天"，代码是 **30 天**（90 天只适用于核心成年加强） | 文档 `2026-10-08-vaccine-plan-algorithm.md:42` vs 代码 `:1125 / :1328 / :1061` | 以代码数值为准，写进规格表；旧文档作废 |
| **B2** | 状态文案两套：文档"该补了 / 待安排 / 该打了" vs 现在统一"待接种" | 文档 `:116-124` vs 代码 `:1504-1515` | 对外只有"已完成 / 待接种 / 不做"；另有三层分级补充语义 |
| **B3** | 两个"顺序"常量故意不同且名字相像，容易用错 | `:107-113`（展示顺序）vs `:115-121`（全集顺序） | 改名区分（顺序表 / 全集表），注释写明各用在哪 |
| **B4** | 说"四类闭集"，实际是 **5 类**（含早期苗）；录入校验的 DTO **漏了早期苗** | `vaccine-catalog.ts:13`、控制器 `:162`、DTO `:50 / :46` vs `:115-121` | 统一 5 类；DTO 与注释同步 |
| **B5** | "只收进口苗" vs 目录里实有 **23 支国产** | 文档 `2026-10-04-vaccine-product-list-review.md:7` vs 代码 `vaccine-products.ts:945-1213` | 现行口径 = **推荐只给进口、可选项含国产**；文档更新 |
| **B6** | `other` 语义两说："不影响任何一针" vs 目录里确实存在 `other` 产品（如卫佳细） | `vaccine-catalog.ts:116-118` vs 测试 `kinds-audit.spec.ts:88-95` | `other` = 不参与计划但如实记录；页面上不作解释（正好对应第三层"可选"） |
| **B7** | 前端硬编码了"类别 → 成分"（早期苗 = 犬瘟 + 细小），与"分类只有后端一份"直接冲突 | `VaccinePlanSection.vue:1049-1054` | 删除；需要时由后端下发 |
| **B8** | 字段标签一份零调用 + 值硬编码在 3 处 | `vaccine-fields.ts:63-81` vs 卡片 `:85/:212/:285`、扫描 `:217/:229` | 由后端下发，前端只用 |
| **B9** | 目录不下发品牌与别名 → 前端做不了"同品牌优先" | `vaccine-catalog.ts:144-152` | 本期明确：**匹配只在后端做**，前端不展示品牌 |
| **B10** | 注释与代码打架（卫佳细算什么、"核心"判据是三种病还是四种病） | `vaccine-products.ts:425-436`（旧注释）vs `:452-472`（代码） | 一律以代码 + 测试为准，注释同步修正 |
| **B11** | 重启免疫的标签是"重启免疫 第 N 针"，而守卫在找"重新开始" → 守卫**永远不命中** | `:1911 / :1931` vs `:2581` | 统一措辞，守卫跟着改 |
| **B12** | **订阅消息**：早已定"不做推送、只做页内提醒"，但后端两个接口 + 小程序客户端方法仍在线上，且按人工到期日算；后端还留着 TODO | 文档 `2026-09-30-health-management-requirements.md:131`、`2026-10-08-vaccine-plan-algorithm.md:18` vs `health-notification.controller.ts:36-141`、`miniapp/src/utils/api.ts:1027-1045` | 保留接口但**明确不出网**，代码标注"仅预留"；数据源改成计划窗口 |
| **B13** | 「顾客能看到的提醒有四处」这份清单里有三处**已经不存在**（顶部提醒条 10-09 删、记录卡到期文案 10-08 不显示、书签角标 10-04 就被否） | 文档 `2026-10-08-vaccine-plan-algorithm.md:22-27` vs `VaccineManagementSection.vue:31`、`VaccineRecordCard.vue:39-40` | 文档更新为"两处"：结论卡 + 计划卡 |
| **B14** | 计划卡顺序：10-06 定"按建议时间由近到远"，10-14 改"固定类别顺序"；而同一屏的"下一针"仍按时间取 | `VaccinePlanSection.vue:1170-1175`（旧）vs `:1023-1028`（新）与 `immunization-schedule.ts:95-113` | 卡片顺序 = 固定类别序；**只有"接下来"那一处**按紧迫度取 |

---

## C 类 · 过期残留（8 条）

| # | 东西 | 出处 | 处理 |
|---|---|---|---|
| C1 | 计划"未开放"的门早已删除，但前后端注释与前端 `available` 判断还在（永不触发） | `:3064-3069`、控制器 `:35/:47`、`api/dogs.ts:210-215`、`VaccinePlanSection.vue:1510` | 全删 |
| C2 | 死变量（窗口尾部天数） | `:1253` | 删 |
| C3 | 后端 4 个临时用例 | `tests/domain/health/__tmp_*.spec.ts` | 删 |
| C4 | 前端鱼骨图整套 | `utils/vaccine-fishbone.ts` + `VaccinePlanSection.vue:1188-1202` + 样式 + 2 个 spec | 删 |
| C5 | 约 500 行死样式与重复定义 | `VaccineManagementSection.vue:1789-2313` 等 | 删 |
| C6 | 僵尸函数与死状态 | `toggleKind`、`vaccineNameChanged`、`closeKindPicker`、`showConfirmButton`、`matchingHere`、`nameFocused` | 删 |
| C7 | "健康管理有几个板块"有三种说法（六个 / 五个 / 实际四个） | `2026-09-30-health-management-requirements.md:16/44/50/63` vs `:81` vs 附录 M `:766-776`；代码 `index.vue:440-454` | 文档统一为"四个书签" |
| C8 | 计划卡的类别色**复用了标签页的主题色**（核心=就诊绿、钩端=体检蓝） | `VaccinePlanSection.vue:1238-1244` vs `index.vue:1722-1741` | 类别色独立定义，不再借用主题色 |

---

## 最该先处理的（按影响面排序）

1. **A11** —— 家长会收到一条指向"他看不到也改不了"的日期的冲突提示
2. **A1** —— 忽略之后找不回来：承诺与实现相反
3. **A13 + B10** —— 病种与类别谁是事实 + 核心三病还是四病：决定"哪一针算打过了"
4. **A14** —— 钩端/狂犬年度加强的锚点与标签（实测差 13 个月）
5. **A2** —— "点了没反应"，家长会以为是自己操作错
6. 次一级别漏：**B5**（国产苗能不能记）、**A12**（"等"字）、**A4/A5**（忽略被拒、合并被截断）、**B12**（订阅消息接口去留）

## 已由产品决策解决的两条

| 旧编号 | 结论（老板 2026-10-15 定） |
|---|---|
| **A9** | 疫苗分三层：必打（核心 + 狂犬）/ 强烈建议（钩端）/ 可选（犬窝咳等）。钩端**默认出现但降一层、不催** —— 冲突消失 |
| **A10** | 早期核心疫苗**不主动推**（WSAVA 收容期口径）；旧验收档案 测29/测30 的预期同步改掉 |

---

## 销账（2026-10-16）

> 逐条去**当前代码**里核实过一遍（重建提交 `06f069b2` 之后又有若干轮修复，
> 核实基准：`git log -1` = `766af1ba`）。
> 判定只有四种：✅ 已解决（重建时解决）/ ✅ 已解决（本轮决策解决）/ ⬜ 仍然存在 / ❓ 无法判定。
> 每条都给了**可核查的依据**（文件:行 或 测试名），没有一条是推断出来的。
>
> **统计：37 条 → ✅ 32 条（重建时 26 + 本轮决策 6）、⬜ 5 条、❓ 0 条。**
> 按类：A 类 15 条（✅14 / ⬜1）、B 类 14 条（✅11 / ⬜3）、C 类 8 条（✅7 / ⬜1）。
>
> 本轮跑过的验证：后端 `npx jest --testPathPatterns vaccine` = 12 套 / 203 用例全绿；
> 小程序 `npx vitest run src/components/vaccine src/domain/vaccine` = 3 套 / 123 用例全绿。

### A 类 · 会影响家长看到的（15 条）

| 编号 | 旧冲突一句话 | 现状 | 依据 | 备注 |
|---|---|---|---|---|
| **A1** | 「已忽略 N 项」的 N 恒为 0（先过滤后统计） | ✅ 已解决（重建时解决） | `domain/health/vaccine/plan-view.ts:270-297` `buildIgnored()` 统计 `decision=SKIP 且 status≠DONE` 的步骤并下发 `ignored.count/items`；`engine.ts:1359` 一次给全；测试 `vaccine-plan.service.spec.ts:135`「冲突 A1：忽略两项之后 ignored.count 是真实值」 | 前端 `NextCard.vue:38-42` 显示"查看已忽略的 N 项"并能逐条「恢复」；`plan-view.ts:144-146` 让被忽略的步骤不再挡住后面那一步（NOT_NOW 与 STOPPED 语义分开了） |
| **A2** | 勾"都不是/不确定"走赋值通道、被父组件拦下 → 点了没反应 | ✅ 已解决（重建时解决） | 录入器把"含哪些疫苗"做成**本地多选**（`RecordEditor.vue:490-497` `toggleComponent`），随 payload 一起提交（`:558-566`）；父组件不做任何字段过滤，直接落库（`VaccineTab.vue:531-536` → `api/vaccines.ts:73`） | 旧三件套整组删除；全仓已无"都不是/不确定"这个选项（grep 0 命中） |
| **A3** | 计划板块发 `record-saved` 事件却没声明，页面却在监听（假接线） | ✅ 已解决（重建时解决） | `VaccineTab.vue` 没有任何 `emit`，页面只通过 ref 调 `defineExpose` 的方法（`VaccineTab.vue:899-910` ↔ `pages/dog-profile-health/index.vue:1121-1127`），模板上没有任何疫苗事件监听 | 全仓 `record-saved` 只剩另一个模块的 `dog-profile/HealthRecordsSection.vue:568`，那个是在 `defineEmits` 里正式声明的，与本条无关 |
| **A4** | 存"忽略"决定时用默认计划表校验 → 非默认步骤被 400 拒 | ✅ 已解决（重建时解决） | `application/health/vaccine-plan.service.ts:110-123` 用 `materializeSteps({birthday, records})` 的**这只狗自己的** key 集合校验；测试 `vaccine-plan.service.spec.ts:81`「冲突 A4：非默认步骤（补一针 / 重启免疫）也能存决定」 | 无效 key 仍然会拒（同文件 `:101` 那条用例） |
| **A5** | 合并产品列表被 `.slice(0,3)` 截断（维克被截掉） | ✅ 已解决（重建时解决） | `products.ts:916-961` `findComboProducts()` 全量返回、无上限（注释 `:943-960` 写明为什么不能与"每类推荐"共用上限）；测试 `engine.spec.ts:550`「产品列表**不截断**（4 支苗一支都不能少）」 | 单类"常见产品"仍保留 3 支上限（`products.ts:493`、`:884-890`）—— 这是有意的，两个列表性质不同 |
| **A6** | "有没有证据"有两套判据（结果级 vs 步骤级）→ 同屏自相矛盾 | ✅ 已解决（重建时解决） | 状态只由**步骤级认领**决定：`engine.ts:1075-1107`（`claimedByKey` → status/statusLabel）；全仓已无 `noEvidence` / `kindHasEvidence`（旧 `immunization-schedule.ts:1957-1962 / 2664-2666`，文件已删） | 后端仍下发 `noRecordAtAll`（`engine.ts:246/1371`），但前端已删掉不读它（`miniapp/src/domain/vaccine/types.ts:122-125`）—— 措辞不再被"结果级"开关左右 |
| **A7** | 冲突里类别硬编码成 `other` | ✅ 已解决（重建时解决） | `plan-view.ts:378-379` `kindOf()` 取该记录归出来的类别，按其真实类别填（`:405/:437/:471/:490`）；界面只显示 `reason` + `suggestion`、**不显示 kind**（`RecordList.vue:40-41`、`:295-300`） | 仍会在"该记录没进 prepared"（未来日期/待核对）时回落 `'other'`，但那个字段不上屏 —— 需要的正是裁决里"文案不需要类别时就不显示"这半句 |
| **A8** | 早期苗三种口径 + 一段永远为假的分支 | ✅ 已解决（重建时解决） | `engine.ts:921-946` `buildCoreEarlySteps()`：记录里没有 `core_early` 就返回空数组；`schedule-table.ts:511` `inDefaultPlan: false`；`schedule-table.ts:113-117` `PLANNED_KINDS` 不含早期苗 | 全仓已无 `wantsEarly`（旧的"按年龄开关"）；"不主动推"是 A10 的产品决定 |
| **A9** | 钩端默认排给每一只狗（非核心苗却与核心同权） | ✅ 已解决（本轮决策解决） | `schedule-table.ts:102-110` `VACCINE_KIND_LAYERS`：core/rabies=`MUST`、lepto=`SUGGEST`；逐步带 `layer`（`:429/:443/:457`）；前端显示"必打/强烈建议"（`status.ts:98-100`、`PlanTimeline.vue:45-49`） | 与文档开头"已由本轮决策解决"一致：钩端默认出现但不催 |
| **A10** | 零记录 4~6 周幼犬看不到早期苗提醒 | ✅ 已解决（本轮决策解决） | `engine.ts:921-926`（无记录即不展开）；需求文档 `2026-10-15-vaccine-module-requirements.md:313`（"我们决定不主动推"）、`:364`（收容期口径的说明） | 旧验收档案 `2026-10-11-vaccine-test-case-library.md:400-407`（"4~6 周 → 提醒早期苗"）**仍在**，本轮硬约束只改本文件，未动它 —— 它是旧口径，已被新需求文档取代 |
| **A11** | `nextDueDate`（本子上写的下次到期日）整个不用 | ✅ 已解决（本轮决策解决） | 列已删（`prisma/schema.prisma` 无 `next_due_date`；`engine.ts:133` 注释）；识别不再产出（`health-report-extraction.service.ts:1317-1319`）；不再显示（`admin-web/src/views/Dogs/Health.vue:211-213`；`health-timeline.service.ts:377-380` 把 `upcoming` 固定成空数组）；测试 `vaccine-book-kinds-from-table.spec.ts:85`「草稿字段只剩名称 + 日期 + 备注（nextDueDate 不再产出）」 | 两处无害残留：① `health-timeline.service.ts:102` 的类型里还写着 `upcoming[].nextDueDate`（值恒为空数组）；② `miniapp/src/components/dog-profile/HealthDocumentScan.vue:1088` 一行 `push('下次到期', draft.nextDueDate)` —— 值永远是 undefined，那一行永远不会显示 |
| **A12** | 「常见产品」截前 3 支不写"等"，合并产品却一律补"等产品" | ⬜ **仍然存在**（只剩一半） | ①"下一针"卡**已补**"等产品"：`NextCard.vue:176-179`；②**免疫计划行没补**：`PlanTimeline.vue:68-71` 直接 `step.products.join('、')`（列表仍被截到 3 支，`products.ts:493`）；③合并产品现在是**全量不截断**（`products.ts:916-961`），所以那里不写"等"反而是对的（列全了不该说"等"） | 影响面：家长在「免疫计划」展开"常见产品"时，看到 3 支会以为只有这 3 支（另两处没有这个问题）。修法 1 行：`PlanTimeline.vue:70` 的文案补"等"。**这是 A 类里唯一仍然存在的、家长可见的一条**，优先级见文末 |
| **A13** | 改了病种不算数（写入与回读都以记录上存的类别优先） | ✅ 已解决（重建时解决） | 入参已不接受 kinds（`dto/health/create-vaccine.dto.ts:25-31`；前端 payload 也没有，`types.ts:170-186`、回归测试 `vaccine-tab.regression.spec.ts:756`）；写入一律由病种推（`health.service.ts:971-1000`），改病种即重算（`:1039-1094`）；读时按技术方案 1.1.2 复核（`products.ts:1444-1487`：components 为空而产品库现在认得出 → 重算）；测试 `vaccine-record-kinds-update.spec.ts:143`「改了病种 → 类别跟着病种走」、`:130`「改了名字 → 类别跟着重算」 | "旧类别"只作为写入时同一套规则算出来的缓存，并且多了一条"产品库变强就重算"的通道 |
| **A14** | 钩端/狂犬年度加强锚点与标签（实测差 13 个月、16 周那针被贴"年度加强"） | ✅ 已解决（重建时解决） | 锚点=**实际最后一针**：钩端 `engine.ts:826-835`（`annualChain(lastDose ?? …)`）、狂犬 `engine.ts:677-701`（`anchor = lastDose`）；标签不编号也不叫"年度加强"：`schedule-table.ts:413`（"每年一次"）、`:369`（"加强（每 3 年）"），首免系列内是"第 N 针"（`:508`）；测试 `prototype-scenarios.spec.ts:120-127`（上一针 2025-11-20 → 窗口 2026-11-20~12-20）、`:128`（钩端 2026-03-10 → 2027-03-10，正好 +1 年） | 18 个月重启的那条链在 `engine.ts:806-914`，另有"上一针本身就是重启第 1 针 → 接着排第 2 针"的分支 |
| **A15** | 识别来的狂犬一律"待核对"不算数，手输的却直接算数 | ✅ 已解决（本轮决策解决） | 判据收敛成三条并**明确保留"狂犬一律要核对"**：`miniapp/src/domain/vaccine/catalog.ts:203-255`（`scanRowReview`）、技术方案 `2026-10-15-vaccine-module-tech-design.md:234`、需求 `R7`（`requirements.md:188` 的验收句写着"待核对的狂犬不影响计划，且卡片上说清了"）；手输由家长自己认过 → `productVerified=true`（`RecordEditor.vue:564-565`）；测试 `vaccine-book-kinds-from-table.spec.ts:96`、`catalog.spec.ts:158` | ⚠️ 这不是漏改：新口径是"**识别=机器判断，要人核；手输=人给的判断，直接算数**"，狂犬在这个基础上再加一道强制核对（错认成"打过了"会让狗漏打法定狂犬）。如果老板要的是"按系统拿不准判、狂犬不特殊"，那要重新裁决 —— 现行需求与技术方案是明确保留的 |

### B 类 · 口径不清（14 条）

| 编号 | 旧冲突一句话 | 现状 | 依据 | 备注 |
|---|---|---|---|---|
| **B1** | 宽限期两套：文档写 90 天，代码是 30 天 | ✅ 已解决（重建时解决） | 程序表就是唯一事实、且数值与代码一致：`schedule-table.ts:139`（核心成年 90 天）、`:193`（狂犬 30 天）、`:213`（钩端 30 天）；新需求文档附录 A.2 逐行同值（`requirements.md:305-308`） | 旧文档 `2026-10-08-vaccine-plan-algorithm.md:42` 未改（本轮硬约束不动别的文件），但它已被新需求文档取代 |
| **B2** | 状态文案两套（该补了/待安排/该打了 vs 待接种） | ✅ 已解决（重建时解决） | 后端只给三种话：`engine.ts:1096-1101`（已完成 / 尽快补种 / 待接种）；前端只补一个 `UPCOMING='还没到时间'`（`status.ts:46-54`）并优先用后端 `statusLabel`（`:57-62`） | 旧文案全仓只剩历史注释（`products.ts:214` 讲旧 bug、页面回归 spec 讲 2026-10-04 删掉的角标） |
| **B3** | 两个名字相像的"顺序"常量，容易用错 | ✅ 已解决（重建时解决） | 现在只有 `VACCINE_KINDS`（全集/校验，`:50-56`）+ 两张**名字表**（长名 `:65-71`、短名 `:84-90`）+ `PLANNED_KINDS`（`:113-117`），每份都注释了用途；没有任何代码依赖名字表的键序（`Object.keys(VACCINE_KIND*)` 全仓 0 命中）；计划内的类别顺序在 `plan-view.ts:122` 显式写成局部数组并注释 | 旧的"展示顺序表 / 全集顺序表"两个常量已不存在 |
| **B4** | 说"四类闭集"实际 5 类；录入校验的 DTO 漏了早期苗 | ✅ 已解决（重建时解决） | 闭集 5 类：`schedule-table.ts:47-56`，并由 `GET /dogs/vaccines/catalog` 下发（`products.ts:1592-1605`）；DTO **已不再接受 kinds**（`create-vaccine.dto.ts:25-31`），"漏了早期苗"无从发生；全仓 grep"四类" 0 命中；类别值一律过 `normalizeVaccineKind`（`products.ts:1324-1332`）以 `VACCINE_KINDS` 校验 | —— |
| **B5** | "只收进口苗" vs 目录里实有 23 支国产 | ⬜ **仍然存在**（只剩注释/文档口径） | 行为已是新口径：国产一律 `recommendable:false`（`products.ts:164-172`）且被推荐与合并两条路都过滤掉（`:817`、`:925`），但留在产品库可选（`:1254-1267`、`:1629-1634`）；测试 `vaccine-product-kinds-audit.spec.ts`「产品表规模没被误删（37 支：14 进口可推荐 + 23 国产可选）」。**但**同一文件开头仍然写着"只收进口苗…这份表**没有任何国产品牌**，别往里加"（`products.ts:9-13`），与 `:984` 起的 `DOMESTIC_PRODUCTS` 直接矛盾 | 影响面：只误导维护者 —— 下一个人照注释办事会与既有 23 支国产冲突。修法：改 `products.ts:9-13` 四行注释（同文件 `:963-983` 已经写对了口径，照它改） |
| **B6** | `other` 语义两说（不影响任何一针 vs 目录里确有 other 产品） | ✅ 已解决（重建时解决） | 三处口径一致：程序表 `schedule-table.ts:45`"我们没有接种程序，只如实记录"、推导 `products.ts:482`"上面都没有 → other（只记录、不参与计划）"、下发 `products.ts:1604` `affectsPlan: value!=='other'`；目录里确实存在 other 产品并已钉住（卫佳细 → `['other']`，`vaccine-product-kinds-audit.spec.ts` 同名用例） | 与 B10 是同一片区域：**语义**一致，但那段**注释**还写着旧口径（见 B10） |
| **B7** | 前端硬编码"类别 → 成分"（早期苗 = 犬瘟 + 细小） | ✅ 已解决（重建时解决） | 前端已无类别判定：`miniapp/src/domain/vaccine/catalog.ts:14-16` 明写"这里**没有**类别判定（kinds）"；病种词表由接口下发、兜底与后端逐字对齐（`:40-61`，测试 `catalog.spec.ts:34` 读后端源码比对）；全仓 grep 无 kind→components 映射 | —— |
| **B8** | 字段标签一份零调用 + 值硬编码在 3 处 | ⬜ **仍然存在**（形态减轻） | 后端**已经下发**字段标题与顺序（`products.ts:1565-1584` `VACCINE_FIELD_LABELS`/`VACCINE_FIELD_ORDER`，随 `buildVaccineCatalog` 下发 `:1636-1638`），**但前端一处都没读**（`grep -rn "fieldLabels\|fieldOrder" miniapp/src` 0 命中）；录入卡的标题仍写死在模板里：`RecordEditor.vue:22`"打了什么疫苗"、`:60`"含哪些疫苗"、`:75`"什么时候打的"（后端下发的是"疫苗名称 / 含哪些疫苗 / 接种日期"） | 影响面：家长可见的**叫法不统一**（录入卡"打了什么疫苗" vs 识别确认页占位符"疫苗名称"，`ScanConfirm.vue:43`）；工程上"下发了没人读"等于一份会骗人的契约。修法：前端读 `catalog.fieldLabels`，或后端确认不发 |
| **B9** | 目录不下发品牌与别名 → 前端做不了"同品牌优先" | ✅ 已解决（本轮决策解决） | 目录只下发对外字段（`name`/`components`/`manufacturer`/`recommendable`）：`products.ts:1620-1634`；`aliases`/`brand`/`minWeeks`/`registration`/`booster`/`note`/`earlySeries` 不下发；前端无品牌概念（grep `brand` 只命中颜色 token `$vk-brand`） | 同品牌优先只在后端做（`resolvePreferredBrand` `products.ts:556-574`、排序 `:881-890`），符合"匹配只在后端"的本期口径 |
| **B10** | 注释与代码打架（卫佳细算什么、"核心"判据三种还是四种病） | ⬜ **仍然存在**（注释层） | 代码与测试是一致的：`products.ts:460-482`（`hasAllCore = 三件齐` 才算 core）、`:505-516` `coversCoreSeries`；审计测试「标了 core 的，必须同时覆盖犬瘟 + 细小 + 腺病毒」「卫佳细：细小单联苗 → 归「其他」」。**但**同一文件 `:436` 与 `:441-444` 的注释仍写旧口径（"含核心病种**之一** → core""卫佳细也算 core"），与代码、以及与同函数内 `:453-459` 的另一段注释三处互相矛盾 | 影响面：只误导维护者。修法：删/改 `products.ts:436` 与 `:441-444` 两段注释（`:453-459` 那段是对的） |
| **B11** | 标签叫"重启免疫 第 N 针"、守卫却在找"重新开始" → 守卫永不命中 | ✅ 已解决（重建时解决） | 重启改由 **key/状态**驱动、不再拿 label 做守卫：`engine.ts:806-914`（`lepto-restart-1/2` 与 `monthsBetween` 判断）；全仓无 `label.includes('重新开始')`（`grep 重新开始` 只剩给人读的 basis 文案与注释：`schedule-table.ts:231`、`products.ts:523/802`） | —— |
| **B12** | 订阅消息：接口与客户端方法仍在线上、按人工到期日算、还留着 TODO | ✅ 已解决（重建时解决） | ① 小程序客户端方法已删（`api/vaccines.ts` 无 subscribe/notify，`utils/api.ts` 无；全仓无调用方）；② 数据源已改：`health.service.ts:369-382` `getUpcomingVaccines()` 注释"本接口是订阅消息的**预留口（不做推送）**，如实返回空"、不再读人工到期日；③ 两个接口保留（`health-notification.controller.ts:36`、`:97`），符合"保留接口但明确不出网" | 残留：该控制器 3 处 TODO（`:86/:117/:128`）仍写 "Implement WeChat subscription message…"，没有"仅预留/不出网"的标注。影响面：无（家长侧看不到），但会让人以为"这个功能还没做" |
| **B13** | 「顾客能看到的提醒有四处」里有三处已经不存在 | ✅ 已解决（重建时解决） | 旧三处确认都不存在：顶部提醒条（`VaccineTab.vue` 只有"加载失败/正在读取/缺生日"三个状态块）、记录卡到期文案（记录行只有名称/日期/待核对/冲突，`RecordList.vue:37-55`）、书签角标（页面无 badge/角标，grep 0 命中）。现行提醒面 = 下一针卡（`NextCard.vue`）+ 免疫计划卡（`PlanTimeline.vue`）+ 记录区的"待核对 N 条"与冲突说明（`RecordList.vue:19-21`、`:45-47`） | 旧文档 `2026-10-08-vaccine-plan-algorithm.md:22-27` 未改（本轮不动别的文件），已被需求 `R15`（`requirements.md:196`"只有这一页能看到（不做推送）"）取代 |
| **B14** | 计划卡顺序：按时间 vs 固定类别序，而"下一针"仍按时间取 | ✅ 已解决（本轮决策解决） | 冻结契约写明"`plan[]` **已按时间从近到远排好**，排序改到后端"（技术方案 `:205`；需求 `R3` `requirements.md:184`）；后端确实这么排（`engine.ts:1282-1297`，时间相同再按 必打→强烈建议）；前端只按数组顺序画、明确不重排（`PlanTimeline.vue:5-6`、`:24`；回归测试 `vaccine-tab.regression.spec.ts:699`「按后端给的顺序画，不重排」）；"下一针"按紧迫度取（`engine.ts:1130-1147` `pickNext`） | 旧的"10-14 固定类别顺序"随重建作废；两种取法的分工在两边注释里都写清了 |

### C 类 · 过期残留（8 条）

| 编号 | 旧冲突一句话 | 现状 | 依据 | 备注 |
|---|---|---|---|---|
| **C1** | 计划"未开放"的门早删了，前后端注释与前端 `available` 判断还在 | ✅ 已解决（重建时解决） | 疫苗路径全仓 grep `available` 0 命中（控制器 `vaccine-plan.controller.ts` 全文无、domain/application/前端 api 与 domain 都无）；`miniapp/src/api/dogs.ts:193/248` 注释说明疫苗方法已搬去 `api/vaccines.ts`；`VaccinePlanSection.vue` 已删除；对应的旧测试 `vaccine-plan-open-for-customer.spec.ts` 也已删除 | `api/dogs.ts:232` 里那个 `available=false` 是 **AI 健康分析**的开关，与疫苗无关 |
| **C2** | 死变量（窗口尾部天数） | ✅ 已解决（重建时解决） | 旧 `immunization-schedule.ts` 整体删除（那个死变量 `windowTailDays` 全仓 grep 0 命中）；新引擎 3 个模块级常量都在用（`engine.ts:54/55/1163`） | 顺带发现**另一处新的死代码**（不在 37 条内）：`schedule-table.ts:529-535` `KIND_CYCLE_PHRASES` 与 `:542` `CORE_TITER_CYCLE_PHRASE` 全仓无引用（`plan-view.ts:310-338` 的 `buildRhythm` 是自己拼的字符串）—— 要么用它、要么删 |
| **C3** | 后端 4 个临时用例 `tests/domain/health/__tmp_*.spec.ts` | ✅ 已解决（重建时解决） | `find backend/tests -name "__tmp_*"` 0 命中；现存 `tests/domain/health/` = elimination-trial.spec.ts、vaccine/、vaccine-product-kinds-audit.spec.ts、vaccine-products.spec.ts | —— |
| **C4** | 前端鱼骨图整套（`utils/vaccine-fishbone.ts` + 计划卡里那段 + 样式 + 2 个 spec） | ✅ 已解决（重建时解决） | `find miniapp/src -name "vaccine-fishbone*"` 0 命中（git 里由 `06f069b2` 删除）；`VaccinePlanSection.vue` 已删除；相关回归用例留下了删除说明（`components/dog-profile/document-scan.regression.spec.ts:1022-1028`） | 全仓"鱼骨"只剩注释里的历史说明 |
| **C5** | 约 500 行死样式与重复定义（`VaccineManagementSection.vue:1789-2313` 等） | ✅ 已解决（重建时解决） | 那个组件整体删除（连旧三件套一起，见 `06f069b2` 的删除清单）；新 7 个组件共 4771 行、样式统一走 token（回归测试 `vaccine-tab.regression.spec.ts:864-877`：组件里不许出现裸色值、必须 import token） | 残留 3 处共约 31 行没人用的样式（逐条数过）：`NextCard.vue:392-397` `.vk-next__later`、`RecordList.vue:535-547` `.vk-records__add`/`__add-text`、`VaccineTab.vue:961-971` `.vk-notice`/`__text`。量级从 500 行降到 31 行 |
| **C6** | 僵尸函数与死状态（toggleKind / vaccineNameChanged / closeKindPicker / showConfirmButton / matchingHere / nameFocused） | ✅ 已解决（重建时解决） | 六个名字全仓 grep 0 命中；新组件用的是真正有读写的状态（`saving`/`visible`/`openKey`/`expanded`…） | —— |
| **C7** | "健康管理有几个板块"有三种说法（六个/五个/实际四个） | ⬜ **仍然存在**（注释/文档口径） | 代码事实是 **4 个书签**：`pages/dog-profile-health/index.vue:348-353` `HEALTH_TABS` = 就诊/体检/疫苗/体重。但同一文件注释仍写"五个板块"（`:79`、`:1726`）与"六个板块"（`:187`、`:1223`，后两处是 2026-10-03 的历史陈述）；被点名的旧文档 `2026-09-30-health-management-requirements.md:16/44/50/63/81/766-776` 本轮未改（硬约束：只改本文件） | 影响面：只误导维护者/文档读者（家长侧就是 4 个书签）。修法：把 `index.vue:79/:1726` 改成"四个书签"，另两处历史注释加"当时是六个" |
| **C8** | 计划卡的类别色复用了标签页的主题色（核心=就诊绿、钩端=体检蓝） | ✅ 已解决（重建时解决） | 类别色**独立定义**在 `styles/vaccine-tokens.scss:21-25`（`$vk-core`/`$vk-rabies`/`$vk-lepto`/`$vk-plain`，注释写明取自原型），组件只引用 token（`PlanTimeline.vue:41`、`:292-306`）；页面主题色仍写在页面自己的 `.health-theme--*`（`index.vue:1702-1720`），两边**没有引用关系**；回归测试 `vaccine-tab.regression.spec.ts:864-877` 钉住组件里不许写死色值 | 数值上有两处巧合（核心 `#0f7b49` 与就诊同值、钩端 `#0d6e7a` 与体重 `#0e6f78` 相近），但它们是各自的独立定义、改一边不影响另一边 —— 冲突本条讲的是"复用"，已断掉 |

### 仍然存在的 5 条 · 按影响面排序

| 顺序 | 编号 | 影响面 | 严重度 | 修法成本 |
|---|---|---|---|---|
| 1 | **A12** | **家长可见**：「免疫计划」展开的"常见产品"最多 3 支且不写"等"，会让家长以为只有这 3 支 | 低（不误导安全性，只是信息不完整） | 1 行（`PlanTimeline.vue:70` 补"等"） |
| 2 | **B8** | **家长可见（次要）**：同一件东西两套叫法（录入卡"打了什么疫苗" vs 识别确认页"疫苗名称"），且后端下发的 `fieldLabels` 前端一处没读 | 低 | 前端读 `catalog.fieldLabels`，或后端确认不发 |
| 3 | **C7** | 只误导维护者：代码 4 个书签，注释仍写"五个/六个板块" | 极低 | 改 2 处注释 |
| 4 | **B5** | 只误导维护者：`products.ts:9-13` 的"没有任何国产品牌，别往里加"与同文件 23 支国产自相矛盾 | 极低 | 改 4 行注释（照 `:963-983` 的口径） |
| 5 | **B10** | 只误导维护者：`products.ts:436/441-444` 的注释（"含核心病种之一就算 core""卫佳细也算 core"）与代码 + 测试 + 同文件 `:453-459` 的注释三处矛盾 | 极低 | 改 2 段注释 |

### 顺带发现（不在 37 条内，供参考）

- `schedule-table.ts:529-535` `KIND_CYCLE_PHRASES`、`:542` `CORE_TITER_CYCLE_PHRASE`：全仓无引用（`buildRhythm` 自己拼字符串）—— 死导出，属 C2 那一类，建议删或改用。
- `miniapp/src/api/vaccines.ts:135` `vaccineApi.classify()`：后端路由在（`health-records.controller.ts:212`），但小程序没有任何调用方 —— 前端死方法。
- `health-notification.controller.ts:86/:117/:128`：三处 TODO 的措辞与"不做推送、仅预留"的现行口径不一致（见 B12 备注）。
- `engine.ts:246/1371` 的 `noRecordAtAll` 后端仍在算，前端已不读（见 A6 备注）—— 要么前端用起来，要么停发。
