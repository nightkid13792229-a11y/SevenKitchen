# 免疫程序 · 外部权威资料对照审计（2026-10-17）

> **这是"我们自己再审一遍"，不是重做需求。**
> 起因（老板）：兽医那边已经审过并通过了，但"为避免兽医审核的不严谨性，我们自己再对照权威资料审核一次"。
>
> **这一轮的边界（硬约束，已遵守）**：
> - ❌ 没有改任何代码、没有改程序表 —— 本文只报告
> - ❌ 没有 git commit
> - ✅ 每条结论都带**出处链接 + 原文片段**；查不到的写「查不到」，不用"一般认为 / 通常"糊
> - ✅ 引用**原文**，不转述成我们自己的话（转述等于又加一层失真）
> - ✅ 不确定的标 ❓，宁可标不确定也不假装确定

---

## 审计对象与方法

| 项 | 内容 |
|---|---|
| 被审对象（唯一真相来源） | `backend/src/domain/health/vaccine/schedule-table.ts`（545 行） |
| 代码版本 | 该文件最后一次改动：**`a6cfd89b`（2026-10-16 15:51）**；审计期间该目录**无任何工作区改动** |
| 审计时的仓库 HEAD | `9e948386` —— 审计过程中被**并行的 custom-recipe 会话**推进到 `139a2e50`，与本审计无关（疫苗目录始终干净） |
| 配套文档 | `docs/plans/2026-10-15-vaccine-module-requirements.md`（第三版）附录 A / 决策记录 |
| 取数范围 | 凡**会影响到家长看到的建议**的规则（程序表 + 该规则在 `engine.ts` 里的落地形态 + `basis`/`hint` 文案） |
| 本轮是否改动代码 | ❌ **没有** —— 全程只读 + 只新建本文。`backend/` `miniapp/` `admin-web/` 无我方改动（工作区里 `backend/prisma/schema.prisma` 的改动属并行会话） |

### 权威依据（本次实际下载并逐句核对，非凭记忆）

| # | 资料 | 链接 | 本次核对的形态 |
|---|---|---|---|
| **S1** | WSAVA 2024 犬猫免疫指南（英文原文，JSAP 65(5):277–316） | https://wsava.org/wp-content/uploads/2024/04/WSAVA-Vaccination-guidelines-2024.pdf | 下载 40 页 PDF，全文抽文字，逐句 `grep` 定位 |
| **S2** | 同上 · **官方中文版**（WSAVA 官方发布） | https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf | 下载 59 页 PDF，用于交叉确认英文原文的汉译口径 |
| **S3** | 中国《动物防疫法》第三十条第一款（政府网站解读） | https://www.hlj.gov.cn/hlj/c116413/202506/c00_31849759.shtml | 网页原文 |
| **S4** | 中国境内**在售狂犬疫苗说明书**（默沙东动物保健中国官网 · 宠必威®锐必威） | https://www.msd-animal-health.com.cn/products/nobivac-rabies/ | 网页原文（说明书全文） |
| **S5** | 中国境内**在售早期苗说明书**（默沙东动物保健中国官网 · 宠必威®幼犬保） | https://www.msd-animal-health.com.cn/products/nobivac-puppy-dp-2/ | 网页原文（说明书全文） |

> **关于 AAHA**：本次**未能取到 AAHA 犬免疫指南的可引用原文**（检索只得到 PubMed 条目页与二手 PDF，没有可直接引用的官方全文），
> 因此下面**没有任何一条结论以 AAHA 为依据**。凡涉及"AAHA 怎么说"的地方一律标 ❓/查不到，不假装核对过。

### 核对方式

对程序表里每一条参数，回到 S1 原文里找出对应段落，把**英文原句**抄下来（必要时附 S2 官方中文对照），
再判断我们那句 `basis` 文案、那个数字、那个窗口算法与原文是**同一个意思**还是**不是**。

---

## 一、逐条对照表（主体 · 50 条）

**结论四选一**：`✅ 一致` / `⚠️ 表述不一致但结论相同` / `❌ 与资料不符` / `❓ 资料没写、是我们的产品决定`

### A. 核心疫苗 · 幼犬首免

| # | 我们的规则（原文 / 行号） | 权威资料怎么说（原文引用 + 链接） | 结论 | 备注 |
|---|---|---|---|---|
| **A1** | 首免起始 **6 周龄**、窗口宽度 2 周 = **6~8 周龄**。`startWeeks: 6` / `firstWindowWeeks: 2`（schedule-table.ts:126-128）；文案 `hint`："幼犬从 6~8 周龄开始…"（:156） | S1 p11："**The VGG recommends initial vaccination of puppies against CDV, CAV and CPV at 6 to 8 weeks of age**, then every 2 to 4 weeks until 16 weeks of age or older." S1 Table 1："**Start no earlier than 6 weeks of age.**" [链接](https://wsava.org/wp-content/uploads/2024/04/WSAVA-Vaccination-guidelines-2024.pdf) | ✅ 一致 | 需求附录 A.4 记录的上次修正（"6 周起"→"6~8 周起"）**确实改对了**，本次复核确认 |
| **A2** | 后续针间隔 **2~4 周**（弹性窗口）。`intervalWeeksMin: 2` / `intervalWeeksMax: 4`（:130-131）；`basis`："间隔 2~4 周接种一次"（:159） | S1 p11："then **every 2 to 4 weeks** until 16 weeks of age or older"；同页："**Vaccinating more frequently than every 2 weeks is not advised.**" | ✅ 一致 | 我们的"2 周是免疫学下限"这句注释，正是原文 "not advised" 的准确理解 |
| **A3** | 系列结束条件：**必须有一针落在 ≥16 周龄**。`finishWeeks: 16`（:133） | S1 p11："**The most important of these early vaccine doses is the one administered at 16 weeks of age or older.**" S1 p14："The VGG therefore **continues to recommend finishing no earlier than 16 weeks**…" | ✅ 一致 | —— |
| **A4** | 系列结束条件的**算法实现**：起始越晚针数越少；起始 ≥16 周 → 只需 1 针（需求 A.2 第 3 行 / A.3 第 3 条） | S1 p11："**It follows that the number of these primary core vaccinations will vary somewhat and will depend on the age at which vaccination is started and the chosen intervals between vaccinations.**" | ✅ 一致 | 我们没用"固定 4 针"，是对的 |
| **A5** | 26 周补强：26 周龄起、窗口 4 周。`booster26Weeks: 26` / `booster26WindowWeeks: 4`（:135-136）；`booster26Basis`："26 周龄或稍后再补一针核心疫苗（而不是等到 12~16 月龄）"（:167-168） | S1 p14："the VGG recommends either serological testing at least 4 weeks after the last puppy vaccination … or, alternatively, **an additional vaccination at or shortly after 26 weeks of age**."；"the revised recommendation is for this vaccination to be given at or shortly after 26 weeks of age."；"**This recommendation … replaces an earlier recommendation for a 'first annual booster' with core vaccines at 12 to 16 months of age.**" | ✅ 一致 | "取代了旧的 12~16 月龄第一次加强"这句也**逐字对得上** |
| **A6** | 26 周补强可被**抗体检测替代**（`titerable: true`，:360）；`booster26Basis`："若已在 20 周龄后做过抗体检测且显示有保护，则不需要这一针"（:168） | S1 p14："**Puppies in which serological testing at 20+ weeks of age reveals protection against CPV, CDV and CAV do not need the 26+ week vaccination.**" | ✅ 一致 | —— |
| **A7** | 核心系列**不因"起始早"而多打**：`hint`/`basis` 未提"针数会增加" | S1 p14："**Vaccinating puppies at 26+ weeks of age rather than waiting until 52 weeks of age or later does not increase the number of core vaccine doses administered to the animal** but will substantially reduce the period of susceptibility for those few that have not yet mounted an active immune response." | ❓ 资料没写、是我们的产品决定 | 原文这句是在**解释"为什么把补强从 52 周提前到 26 周不增加总针数"**。我们的程序"16 周收官 + 26 周补一针"确实等于原文语境下的两针。**但**我们额外把 26 周那一针说成"首免程序的收尾"（`booster26Hint`，:174），原文没有这个定性 —— 属于我们的产品表述，建议老板确认措辞 |
| **A8** | **高风险环境可延到 20 周龄、间隔缩到 2~3 周 —— 程序表里没有任何字段实现它** | S1 Table 1："**In especially high-risk situations continue until 20 weeks of age and consider vaccinating every 2 to 3 weeks**" [链接](https://wsava.org/wp-content/uploads/2024/04/WSAVA-Vaccination-guidelines-2024.pdf)；S2 官方中文："**在特别高风险的情况下，持续到20周龄，并考虑每2至3周接种一次疫苗。**" [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf) [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf) | ❌ 与资料不符 | **需求文档附录 A.4 自称"已补"这一条，但代码里查无此物**：`CORE_SCHEDULE` 无高风险开关，`engine.ts:493` 硬循环 8 针、`finishWeeks` 恒为 16。详见【真问题 P7】 |
| **A9** | 早期核心疫苗：4 周龄起单针。`CORE_EARLY_SCHEDULE.startWeeks: 4` / `windowWeeks: 2`（:238-239） | S1 Table 1："Canine parvovirus-2 (recombinant)+canine distemper virus (MLV) — **Administer a single dose from 4 weeks of age before commencing routine primary vaccinations**" | ✅ 一致 | 周龄对得上 |
| **A10** | 早期苗 `basis` 写的是："**CPV 重组 + CDV 弱毒苗**可在 4 周龄起接种 1 针"（:242） | S1 Table 1 同上（英文 "recombinant" + "MLV"）；**但 S5 官方中文说明书（宠必威®幼犬保）写的是**："商品名 宠必威®幼犬保…犬瘟热、细小病毒病二联活疫苗"、"**建议在4～6周龄时进行基础接种**" [链接](https://www.msd-animal-health.com.cn/products/nobivac-puppy-dp-2/) | ⚠️ 表述不一致但结论相同 | 两点差异：① 原文的 CPV 是**重组**苗，S5 是**活疫苗**（154 株）；② 我们 `basis` 把"WSAVA Table 1"和"宠必威幼犬保"并列当同一件事，但**两者不是同一个产品**。周龄结论（4 周起）一致，表述需要分开写。见【真问题 P8】 |
| **A11** | 早期苗**不主动推**、`inDefaultPlan: false`（:511）；只有记录里带 `core_early` 才认 | S1 Table 1 只说这产品"aimed specifically at young puppies, likely to have interfering MDA"（针对可能受母源抗体干扰的幼犬）；**指南没有"推不推"这回事** | ❓ 资料没写、是我们的产品决定 | 需求第四节已自认是我们的产品决定 ✓。指南层面的依据（"针对 MDA 干扰"）**对得上**，见需求 A.4 的修正记录 |
| **A12** | 早期苗打完之后**仍要**从 6~8 周开始走常规首免。`CORE_EARLY_SCHEDULE.hint`（:240） | S1 Table 1："Administer a single dose from 4 weeks of age **before commencing routine primary vaccinations**" | ✅ 一致 | "before commencing routine primary vaccinations" 正是我们的"之后仍要走常规首免" |

### B. 核心疫苗 · 成年

| # | 我们的规则（原文 / 行号） | 权威资料怎么说（原文引用 + 链接） | 结论 | 备注 |
|---|---|---|---|---|
| **B1** | 成年加强 **每 3 年**：`adultIntervalYears: 3`（:138）；`adultHint`："之后每 3 年接种一次。"（:176） | S1 Table 1："**Thereafter, revaccinate at 3 years of age and thereafter no more frequently than every 3 years**"；S1 Executive Summary："**recommendation is for lifelong revaccination no more frequently than every 3 years**" | ✅ 一致 | —— |
| **B2** | 成年加强窗口 = 上一针 +3 年 ~ **+3 年 90 天**（宽限 90 天）。`adultGraceDays: 90`（:139） | 原文只有 "no more frequently than every 3 years" —— **没有给任何"还能晚多久"的数字** | ❓ 资料没写、是我们的产品决定 | **90 天是纯粹的工程取整**（"3 年 + 一个季度"）。指南既没禁止也没要求。安全侧无风险（晚打不违反"不更频"），但**"超过 90 天算逾期写尽快补种"这句是我们在替兽医下判断**，建议老板确认口径。见【需拍板 Q1】 |
| **B3** | `adultBasis` 写"**成年加强三年一次或更少频次**"（:171） | S1 Table 1/Exec Summary 同 B1；另 S1 Exec Summary："**Core vaccines should not be given any more frequently than necessary in adult animals.**" | ✅ 一致 | "或更少频次"= "no more frequently than"，译得准 |
| **B4** | 成年犬**缺记录**时**只补一针**（`catchUpLabel: '补一针'`，:148）；`catchUpBasis`："按成年犬的常规安排**补一针**核心疫苗即可（WSAVA 2024：16 周龄以上的犬只免疫史不明时，一针 MLV 或重组疫苗即可保护大多数犬只）"（:180-181） | **同一份指南里有两句口径**：<br>① S1 p15："A single dose of MLV core vaccine will very likely be sufficient to induce immunity in **pet dogs over 26 weeks of age** and will provide long-lasting protection."<br>② S1 Table 1（"Dogs >16 weeks" 那一列）："**Two doses 2 to 4 weeks apart are recommended by some manufacturers. However, a single dose of MLV or recombinant vaccine will likely protect most dogs**" | ⚠️ 表述不一致但结论相同 | **结论方向对**（"一针很可能够"确实是原文），**但我们的引文把条件说宽了**：我们写的是"**16 周龄以上**的犬只免疫史不明时，一针即可"；原文那句 "over 26 weeks" 说的是 **26 周以上**。16~26 周这一段，Table 1 那句是 "Two doses … are recommended by some manufacturers"。见【真问题 P5】 |
| **B5** | `catchUpBasis` 的界面文案对家长说"**补一针核心疫苗即可**"，**不提第二针的可能**（:178-182） | S1 p15 紧接 ① 之后："**In high-risk situations (e.g. outbreaks), it would be prudent to consider providing a second dose, 2 to 4 weeks later.**" | ⚠️ 表述不一致但结论相同 | 原文把"第二针"放在**高风险情形**（如疫情暴发）下作为 prudent 建议。我们完全没提这个分支。不算错（我们的场景是家用宠物犬的常规排期），但属于**知情信息的省略**。见【需拍板 Q2】 |
| **B6** | 成年加强展开 7 格覆盖 20 年。`adultMaxRepeats: 7`（:141），注释："ceil(20 / 3) = 7 格" | 原文没有"要排几年"这回事；S1 只说 3 年一次、不更频 | ❓ 资料没写、是我们的产品决定 | 与需求 7.3（"看得见的近期 + 每类的下一次 + 之后的节奏"）一致。工程量问题，无医学风险 |

### C. 狂犬疫苗

| # | 我们的规则（原文 / 行号） | 权威资料怎么说（原文引用 + 链接） | 结论 | 备注 |
|---|---|---|---|---|
| **C1** | `kind` 注释："狂犬疫苗 —— 12 周起首针，**每年（法定）**"（:43）；`RABIES_SCHEDULE` 注释："**每年**（法定强制免疫，没有'有效期'这个概念）"（:185） | S1 Table 1："Rabies (inactivated) — Follow any local laws or regulations as a priority. Follow the product leaflets of locally manufactured vaccines. **In some countries, the first dose is generally not given before 12 weeks of age**"；S1 p15："**Revaccination intervals for canine rabies vaccines are often mandated by law. Rabies vaccines usually carry a 1- or 3-year licensed DOI.** … **In countries where the legal requirement is at odds with the vaccine datasheet, the law must be followed.**" | ❌ 与资料不符 | **"每年（法定）"这个说法把"法定"和"每年"绑死了，两处都对不上**：① 中国法规只要求"**按规定定期**"接种，没写"每年"；② 中国境内**确有 36 个月免疫期的狂犬产品在售**（见 C2）。详见【真问题 P1】 |
| **C2** | `hint`："狂犬是**法定每年接种**，漏了要尽快补上。"（:196）；`basis`："狂犬属强制免疫（《动物防疫法》），**每年接种一次**。"（:198） | **S3（中国法规）**："动物防疫法第三十条第一款规定，单位和个人饲养犬只，**应当按照规定定期免疫接种狂犬病疫苗**，凭动物诊疗机构出具的免疫证明向所在地养犬登记机关申请登记。" [链接](https://www.hlj.gov.cn/hlj/c116413/202506/c00_31849759.shtml)<br>**S4（中国在售产品说明书 · 宠必威®锐必威）**："【作用与用途】用于预防犬、猫狂犬病，免疫产生期为21日，**免疫期为36个月**。【用法与用量】皮下或肌肉注射。**3月龄以上**犬、猫，每只1ml。**以后，每隔36个月接种1次**。" [链接](https://www.msd-animal-health.com.cn/products/nobivac-rabies/) | ❌ 与资料不符 | **这是本次最重的一条。**中国法规用语是"定期"（无固定年数）；在售说明书有 **36 个月**的产品。我们把它写成"法定每年"→ 家长会被告知每年打一次，而**合法、说明书也允许的做法是每 36 个月一次**。见【真问题 P1】 |
| **C3** | 狂犬首针 **12 周龄**。`firstDoseWeeks: 12`（:188）；`basis`："首次免疫程序须大于 12 周龄（WSAVA 2024）"（:199） | S2 官方中文 Table 1 原文："**在一些国家，第一剂疫苗通常不会在12周龄之前接种。**" [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf) [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf)；S1 Table 1："In some countries, the first dose is generally not given before 12 weeks of age" | ⚠️ 表述不一致但结论相同 | 三点小偏差：① 原文 "**In some countries**"（部分国家惯例），我们写成"须"（变成硬要求）；② 原文 "**not given before 12 weeks**" = 不早于 12 周，我们写"**大于** 12 周"；③ **S4 中国在售说明书写的是"3 月龄以上"**（≈13 周，[链接](https://www.msd-animal-health.com.cn/products/nobivac-rabies/)）。结论区间一致，措辞该收紧。见【真问题 P6】 |
| **C4** | 狂犬首针窗口 = 12 周龄 ~ **+30 天**。`firstWindowDays: 30`（:190） | 原文与 S3/S4 都**没有给首针窗口宽度** | ❓ 资料没写、是我们的产品决定 | 纯工程取值 |
| **C5** | 狂犬年度加强 = 上一针 +1 年 ~ **+30 天**（宽限 30 天）。`intervalYears: 1` / `graceDays: 30`（:192-193） | S1 Table 1："**Revaccination … Reinfect at 1 year of age (or 1 year after primary vaccination in some countries)**"（英文原文："**Revaccination at 1 year of age … is required**"）；**但同一格紧接着写**："Rabies vaccines usually carry a 1- or 3-year licensed DOI. **Revaccination intervals should be based primarily on local regulations and, in the absence of these, on datasheet DOI claims.**" | ❌ 与资料不符 | 原文**没有**说"一律每年"：它说**先看当地法规、没有法规就看说明书 DOI**。30 天宽限同样是我们的发明。见【真问题 P1】 |
| **C6** | 狂犬序列覆盖 20 年。`maxDoses: 20`（:195） | 原文无此概念 | ❓ 资料没写、是我们的产品决定 | —— |
| **C7** | 狂犬的"**有效期**"：需求决策记录："**狂犬没有'有效期'这个概念**：法定每年接种。家长说记不清有没有打过狂犬 → 按没打过处理"（需求文档第 27 行） | S1 Table 1 **明确使用 DOI 概念**："Rabies vaccines usually carry a **1- or 3-year licensed DOI**"；S4 说明书："**免疫期为36个月**" | ❌ 与资料不符 | "狂犬没有有效期这个概念"**是不成立的**：指南给狂犬产品标 DOI，中国在售产品也标"免疫期 36 个月"。"记不清按没打过"（=现在打一针）这个**动作**没问题（S1 p15："A single dose can immunise"），但**理由（"因为没有有效期"）是错的**。见【真问题 P1】 |
| **C8** | 狂犬**不能**被抗体检测替代（`titerable: false`，:404/:419）；需求 R9 依据："科学上抗体同样指示保护…但指南第一句是'Follow any local laws or regulations as a priority'—— 国内法定每年，法规优先" | S1 FAQ："This is **also true for rabies virus** but not true for many other viruses."（即抗体对狂犬同样指示保护）；S1 Table 1："**Follow any local laws or regulations as a priority.**" | ✅ 一致 | **推理链对得上**：抗体确实能指示狂犬保护，但我们选择"法规优先、不用抗体替代打针"。唯一依赖的假设是"国内法规＝每年"（见 C2，这一环站不住），**但"不替代打针"这个结论本身仍然安全**（更保守） |
| **C9** | 狂犬一律**人工核对**（需求 5.4 第 2 条 / R7：狂犬标"待核对"） | S1 Table 1："**Revaccination intervals should be based primarily on local regulations**"；S4 说明书：**免疫期 36 个月** | ✅ 一致 | 狂犬是本次审计里**唯一"必须人工核对"是对的**的地方 —— 正因为 1 年 / 3 年产品在中国并存，机器不该替家长猜 |

### D. 钩端螺旋体

| # | 我们的规则（原文 / 行号） | 权威资料怎么说（原文引用 + 链接） | 结论 | 备注 |
|---|---|---|---|---|
| **D1** | 钩端归"**强烈建议**"层（`lepto: 'SUGGEST'`，:105；需求第四节第 ② 层） | S1 p11："vaccination of all dogs against leptospirosis is **highly recommended** and these vaccines should be considered **core** in those places." + S1 p11："vaccines to protect against canine leptospirosis **are now considered core in these guidelines**"；S2 官方中文："**强烈建议对所有犬进行钩端螺旋体病疫苗接种，并且这些疫苗应被视为这些地方的核心疫苗。**" [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf) | ❌ 与资料不符 | **"强烈建议"这个中文词正好是官方中文版的译文，但原文的落点是"核心疫苗"（core）。** 我们借用了"强烈建议"的措辞、却把"core"的推论去掉了。若中国属流行地区（我们 `basis` 自称"中国属钩端螺旋体流行地区"），按指南它应进**核心**。见【真问题 P2】 |
| **D2** | 钩端首免 **2 针**，间隔 **2~4 周**。`intervalWeeksMin: 2` / `intervalWeeksMax: 4`（:209-210） | S1 Table 1："**Initial dose is usually from 8 weeks of age. Follow the advice in the product leaflet about when to start. A second dose is given 2 to 4 weeks later**"；"Two doses 2 to 4 weeks apart" | ✅ 一致 | —— |
| **D3** | 钩端首针 **8 周起**、窗口 4 周（= 8~12 周龄）。`startWeeks: 8` / `firstWindowWeeks: 4`（:206-207） | S1 Table 1："Initial dose is usually **from 8 weeks of age**" | ✅ 一致 | —— |
| **D4** | 钩端**年度**加强：+1 年 ~ +30 天。`intervalYears: 1` / `graceDays: 30`（:212-213） | S1 Table 1（Revaccination 列）："**Annually**"；S1 FAQ："**there is evidence of robust protection for 12 to 14 months and perhaps longer**"（原文反对 6 个月一次） | ✅ 一致 | 30 天宽限仍是我们的取值（同 B2/Q1） |
| **D5** | 钩端**重启**：上一针距今 **≥18 个月** → 程序失效、再打 2 针。`restartMonths: 18`（:215） | S1 FAQ："**Q. If a dog received its last Leptospira vaccine 18 or more months ago, do I need to recommend starting the series of vaccinations again (i.e. two doses 2 to 4 weeks apart)? A. Although evidence supporting this recommendation is sparse, the answer is 'yes' based on a precautionary principle.**" | ✅ 一致 | 18 个月这个数字、以及"再打 2 针"都对得上 |
| **D6** | `restartBasis` 追加一句："**指南同时说明：现有钩端疫苗的免疫力被认为撑不到 18 个月**"（:232） | S1 p15 原文："**Immunity (protection against virulent challenge) lasts much longer than the period of seropositivity (up to 15 months**; Grosenbaugh & Pardo, 2018)."；S1 FAQ："there is evidence of robust protection for **12 to 14 months** and perhaps longer" | ❌ 与资料不符 | **原文说的是"免疫力比血清阳性期长得多"，而那 15 个月是"血清阳性期"的上限**——我们把意思**读反了**。正确读法：血清阳性最多 15 个月，但**保护力显著更久**。我们写成"免疫力撑不到 18 个月"是**把 15 个月错当成了保护力上限**。见【真问题 P4】 |
| **D7** | 钩端重启第 1 针窗口 = **[今天, +2 周]**（`restartFirstWindowWeeks: 2`，:217） | 原文只说"two doses 2 to 4 weeks apart"，**没有给第 1 针的窗口宽度** | ❓ 资料没写、是我们的产品决定 | —— |
| **D8** | 钩端**不能被抗体检测替代**（`titerable: false`）；需求 R9 依据引原文 "Testing for antibodies against other infectious agents (e.g. Leptospira) is much less reliable as a predictor of protection" | S1 FAQ 原文**逐字对得上**："**Testing for antibodies against other infectious agents (e.g. Leptospira) is much less reliable as a predictor of protection.**" | ✅ 一致 | 这句引文是本次核对里**最干净的一条**，一字不差 |
| **D9** | 钩端序列覆盖 20 年。`maxRepeats: 20`（:219） | 原文无此概念 | ❓ 资料没写、是我们的产品决定 | —— |

### E. 抗体检测替代（R9）

| # | 我们的规则（原文 / 行号） | 权威资料怎么说（原文引用 + 链接） | 结论 | 备注 |
|---|---|---|---|---|
| **E1** | **只有核心**能被抗体替代；狂犬不能（可记录）、钩端不能。需求 R9 表 / `titerable` 字段 | S1 FAQ："**In dogs, CDV, CAV and CPV.** … Testing for antibodies against other infectious agents (e.g. Leptospira) is much less reliable as a predictor of protection."；"This is also true for rabies virus but not true for many other viruses." | ✅ 一致 | 三种抗体的范围（CDV/CAV/CPV）与"只认这三种"对得上 |
| **E2** | 适用起点 **20 周龄之后**：`minimumAge = addWeeks(birthday, 20)`（engine.ts:1202）；`MIN_TITER_AGE_WEEKS = 20`（plan-view.ts:189） | S1 FAQ："its presence in the serum of an animal **over 20 weeks of age** is held to indicate protection against these viruses."；S1 p14："serological testing at least 4 weeks after the last puppy vaccination (**i.e. at or after 20 weeks of age if these guidelines are followed**)" | ✅ 一致 | 20 周这个门槛**有原文直接支持**，且我们解释成"20 周 = 最后一针后 4 周"的等价式也与括号里那句一致 |
| **E3** | 检测日必须**晚于最后一次核心接种** ≥ **28 天**：`TITER_AFTER_DOSE_DAYS = 28`；`item.date >= lastCoreDose + 28 * DAY_MS`（engine.ts:1195, 1229-1233） | S1 FAQ / Fig 2："serological test results obtained **>4 weeks after the last puppy or kitten vaccination**"；S1 p14："serological testing **at least 4 weeks after** the last puppy vaccination"；S1 p8："a serum sample taken at or after 20 weeks of age and **at least 4 weeks after the last vaccine dose**" | ✅ 一致 | **4 周 = 28 天**，三处原文一致。这条是 2026-10-16 刚补上的，补对了 |
| **E4** | 合格报告的**下次评估时间**：默认 `addYears(testedAt, 3)`；也可由 `antibodyTest.nextReviewAt` 覆盖（engine.ts:1238-1240） | 原文只给了**阴性**之后怎么办："Animals discovered to be seronegative … **should be revaccinated and retested several weeks later**"，Fig 2："**Repeat serology no less than 4 weeks later**"；**原文没有规定"阳性一次能管多久"** | ❓ 资料没写、是我们的产品决定 | "下次评估 = 3 年"是把**疫苗的 3 年 DOI** 平移到了抗体报告上。指南的抗体算法是"阴性→4 周后复测；阳性→本次不必打"。**"一次合格管 3 年"是我们的产品判断**（且 `nextReviewAt` 允许前端/后台覆盖）。见【真问题 P3】/【需拍板 Q3】 |
| **E5** | 是否合格**以报告/兽医判定为准，我们不设阈值**（需求决策记录第 30 行；`result === 'PASS'`） | S1 FAQ："'**protective titre**' is an amount or concentration of antibody against disease X in blood sufficient to protect an animal from disease … **You are not alone in being confused. This is a complicated topic.**"；且指南反复强调 in-practice 试剂盒的 specificity 隐忧 | ✅ 一致 | **不设阈值是对的**，而且原文明确说"保护性滴度"是个连兽医都困惑的话题 |
| **E6** | 只在 `result === 'PASS'` 时替代；`FAIL`/`UNKNOWN` 不替代（engine.ts:1212） | S1 FAQ："Tell the owner that the test indicates that the animal **may be unprotected and recommend immediate revaccination**." | ✅ 一致 | —— |

### F. 老年犬 / E 类 / 边界

| # | 我们的规则（原文 / 行号） | 权威资料怎么说（原文引用 + 链接） | 结论 | 备注 |
|---|---|---|---|---|
| **F1** | **不因"老"自动停**：程序表没有任何年龄上限；E 类靠家长逐项「忽略」（原因 `不再接种了`）表达（需求 1.2 节 E 类说明） | S1 p5："**revaccination of aged pets triennially or perhaps more frequently can be recommended.**"；S1："aged animals may not be so effective at mounting primary immune responses to novel agents" | ✅ 一致 | **这条我们的处理与指南立场一致**：指南主张老年犬继续加强（甚至更频），所以"停"必须由家长或兽医明确标记 —— 需求 1.2 节的判断是对的 |
| **F2** | 老年犬的**狂犬**：与幼犬同一套规则（`RABIES_SCHEDULE` 无年龄分支） | S1 p5："**Studies of UK dogs and cats vaccinated for the first time against rabies for pet travel have shown clearly that many aged animals fail to achieve the legally required antibody titre** (Kennedy et al., 2007; Mansfield et al., 2004). Younger animals were more likely to be successfully immunised." | ❓ 资料没写、是我们的产品决定 | 原文只提示"老年动物首次狂犬免疫更容易失败"，**没给排期建议**。我们不做老年分支=不制造额外规则，保守但合理。建议老板知悉 |
| **F3** | 一针未打、且该类第一步窗口已过 → **窗口挪到今天**，写"尽快补种（原建议时间 X~Y 已过）"；`moveToTodayIfMissed`（engine.ts:425-437）；`statusLabel`（:1128-1133） | 原文没有"窗口挪到今天 / 原建议时间"这回事 | ❓ 资料没写、是我们的产品决定 | 纯界面与产品设计，无医学主张。与需求 A.3 第 1 条、R15 一致 ✓ |
| **F4** | **"最后一次接种后多久算过期"**：由各类的 `graceDays` 决定 —— 核心 90 天（:139）、狂犬 30 天（:193）、钩端 30 天（:213）；超期 → `status = 'OVERDUE'` → 写"尽快补种" | **原文对"迟打多久算失效"没有任何数字**。相关的只有：① 核心 "no more frequently than every 3 years"（只约束**下限**，不约束上限）；② 钩端 "12 to 14 months and perhaps longer"（保护力下限）；③ 狂犬 DOI 由法规/说明书决定 | ❓ 资料没写、是我们的产品决定 | **这是全表最"产品"的一组数字。** 严格说，"3 年 + 90 天还没打"并不等于"失效"（核心 MLV 的 DOI 是"至少 3 年"）。见【真问题 P9】/【需拍板 Q1】 |
| **F5** | 可选疫苗（犬窝咳 / 冠状 / 副流感 / 莱姆）**不进页面**；`other` 层为空（:109-110） | S1 Table 1 把 CCoV 列为 "**Not recommended**"、Giardia "Not recommended" 等；Bordetella 为 non-core（犬舍/群养场景才核心） | ✅ 一致 | 我们"不进页面"比原文的"non-core"更保守；**至少不违反**任何原文 |
| **F6** | 早期苗不进默认计划（`inDefaultPlan: false`）；`PLANNED_KINDS` 只含 core/rabies/lepto（:113-117） | 原文无"默认计划"概念 | ❓ 资料没写、是我们的产品决定 | 与 A11 同源 |

### G. 全表层面的两条

| # | 我们的规则 | 权威资料怎么说 | 结论 | 备注 |
|---|---|---|---|---|
| **G1** | 全表页脚统一话术："是否接种、何时接种，**请以执业兽医的意见为准**"（:164, :200, :225） | S1 p3："**Guidelines are intended to provide broad guidance for veterinarians in decision-making. They do not describe mandatory or minimum standards of care.**" | ✅ 一致 | 与我们"建议 ≠ 处方、不替家长拍板"（需求 R14）完全同向 |
| **G2** | `basis` 文案里凡是"WSAVA 2024"的引注，都用来向家长背书 | S1 p3："These guidelines can be used by national and regional veterinary associations and individual veterinarians or veterinary practices **to develop their own vaccination schedules suitable to their own local conditions**." | ✅ 一致 | 指南**鼓励**本地化改编 —— 我们做本地化程序本身没问题；**问题只出在"改编成什么"**（见 P1/P2/P5/P6/P7） |

---

## 二、发现的真问题（按严重度排序）

> ⚠️ **只报告，不改代码。** 每条写清"错在哪 / 影响多少家长 / 建议怎么改"。
> "影响面"是按程序表的**覆盖范围**估的（不是按已注册用户数 —— 本环境查不到真实用户数，不编）。

### 🔴 P1（最重）狂犬被写成"法定每年"，与**中国在售说明书 36 个月免疫期**直接冲突

| 项 | 内容 |
|---|---|
| **错在哪** | 三处把"每年"和"法定"绑死：① `RABIES_SCHEDULE` 注释 ":185" "每年（法定强制免疫，没有'有效期'这个概念）"；② `hint` ":196" "狂犬是**法定每年接种**"；③ `basis` ":198" "每年接种一次"。程序表 `intervalYears: 1` 把它落成**每年**排期。需求决策记录第 27 行进一步把它表述为"**狂犬没有'有效期'这个概念**" |
| **资料原文** | **S4（中国在售产品说明书）**："【作用与用途】用于预防犬、猫狂犬病，免疫产生期为21日，**免疫期为36个月**。【用法与用量】…**以后，每隔36个月接种1次**。" [链接](https://www.msd-animal-health.com.cn/products/nobivac-rabies/)<br>**S3（中国法规解读）**："动物防疫法第三十条第一款规定，单位和个人饲养犬只，应当**按照规定定期免疫接种**狂犬病疫苗…" —— **"定期"，未给年数**。[链接](https://www.hlj.gov.cn/hlj/c116413/202506/c00_31849759.shtml)<br>**S1 Table 1**："**Rabies vaccines usually carry a 1- or 3-year licensed DOI.** … **Revaccination intervals should be based primarily on local regulations and, in the absence of these, on datasheet DOI claims.**"<br>**S1 p15**："**In countries where the legal requirement is at odds with the vaccine datasheet, the law must be followed.**" |
| **影响面** | **所有养狗家长**（狂犬是 100% 覆盖的必打项，且是页面上的"必打"层）。把 36 个月的产品说成"法定每年"，会让家长**多打 2 次**（3 年内），并且与家长手里疫苗本/兽医说的不一致 → 最容易被投诉"你们算错了" |
| **建议怎么改（下一轮，不在本轮）** | ① `hint`/`basis` **删掉"每年"与"法定"的绑定**，改为"**按当地规定与所用产品的免疫期**"；② `intervalYears` 由**产品**决定（产品库已有产品，可把 DOI 作为字段），1 年 / 3 年两条路径并存；③ 保留并强化"狂犬一律人工核对"（C9 那条本来就是对的）；④ 需求决策记录第 27 行的"没有有效期"结论应改写 —— **狂犬产品是有 DOI 的**，只是"记不清就按没打过、现在打一针"这个**动作**仍然成立 |
| **附带确认** | `basis` 里"首次免疫程序须大于 12 周龄"也有同样毛病（见 P6） |

### 🟠 P2 钩端被降为"强烈建议"，而指南把它定为 **core**

| 项 | 内容 |
|---|---|
| **错在哪** | `VACCINE_KIND_LAYERS`: `lepto: 'SUGGEST'`（schedule-table.ts:105）；需求第四节第 ② 层"强烈建议（钩端）"；`basis` ":223" 自称"中国属钩端螺旋体流行地区" |
| **资料原文** | S1 p11："vaccination of all dogs against leptospirosis is **highly recommended** and these vaccines should be considered **core** in those places."；"vaccines to protect against canine leptospirosis **are now considered core in these guidelines** if, in the regions where the dog lives or to which it travels, leptospirosis in dogs is prevalent, implicated serogroups are known and suitable vaccines are commercially available."<br>S2 官方中文："**强烈建议对所有犬进行钩端螺旋体病疫苗接种，并且这些疫苗应被视为这些地方的核心疫苗。**" |
| **影响面** | 所有**处于钩端流行地区**的家长。我们一边说"中国属流行地区"，一边把钩端放在"不催"的弱层 —— 若按指南口径它本该是核心，家长可能因此**漏掉一个高致死率、且人畜共患**的病 |
| **建议怎么改** | ① 若坚持产品上分两层，**把依据改成"指南定为核心、我们基于…（成本/依从性）主动降级"**，别让 `basis` 暗示指南支持"强烈建议"这个层级；② 或者承认钩端为核心（至少在中国）；③ 注意：**"强烈建议"这个词是 S2 官方中译的用词，但原文落点是 core** —— 借用措辞时不能把结论一起改写 |
| **依赖的未定事实** | 「中国是否满足指南的三条件（流行、血清群已知、有合适疫苗）」本次**没有独立核实**（未查中国钩端血清群流行数据）→ 标 ❓ |

### 🟠 P3 抗体替代后的"下次评估 = 3 年"没有资料支撑，且与指南的复测逻辑不一致

| 项 | 内容 |
|---|---|
| **错在哪** | `engine.ts:1238-1240`：合格报告的 `nextReviewAt` 默认为 `testedAt + 3 年`；此后核心那一针在 3 年内一律显示"已用抗体检测替代"，家长看不到任何到期提示 |
| **资料原文** | 指南给的抗体流程是**"测 → 阳性就不必打；阴性则 4 周后复测/补打"**，没有"一次合格管 N 年"：<br>S1："serological test results obtained **>4 weeks after the last puppy or kitten vaccination**"；Fig 2："**Repeat serology no less than 4 weeks later**"<br>S1："Animals discovered to be seronegative … **should be revaccinated and retested several weeks later**."<br>唯一与"3 年"沾边的是**疫苗 DOI**："Revaccinate … **no more frequently than every 3 years**" —— 那是**打针**的周期，不是**抗体报告**的有效期 |
| **影响面** | 录了合格抗体报告的家长（**主动做抗体检测的通常是最在意健康的那批人**）。风险方向：**偏乐观**（我们自己替它定了"3 年内不用管"），而指南的抗体保护结论本身还带 in-practice 试剂盒 specificity 的警告 |
| **建议怎么改** | ① `nextReviewAt` 默认值应有独立依据（或强制人工/兽医填写，不自动给 3 年）；② 文案上把"下次评估 X"说清是**我们的建议复查点**、不是"保护期到 X"；③ 建议在 `basis` 里把指南对 in-practice 试剂盒的保留意见写进去 |

### 🟡 P4 钩端重启依据里，**15 个月的含义读反了**

| 项 | 内容 |
|---|---|
| **错在哪** | `LEPTO_SCHEDULE.restartBasis`（:232）："**指南同时说明：现有钩端疫苗的免疫力被认为撑不到 18 个月。**" |
| **资料原文** | S1 p15："In general, these vaccines provoke strong but transient seroconversion (Martin et al., 2014). **Immunity (protection against virulent challenge) lasts much longer than the period of seropositivity (up to 15 months**; Grosenbaugh & Pardo, 2018)."<br>S1 FAQ："there is evidence of **robust protection for 12 to 14 months and perhaps longer**" |
| **错在哪（细说）** | 原文那 15 个月是**"血清阳性期"的上限**，而且原文**特意强调"保护力比它长得多"**。我们写成"免疫力撑不到 18 个月"—— 等于把被原文否掉的那个较小数值当成了保护力上限，**结论恰好与原文相反** |
| **影响面** | 只影响"重启"这条分支的**依据文案**（要打 2 针的动作本身是对的、且有 FAQ 直接支持）。但它是**给家长看的"依据"**，属于可被专业人士一眼看出的硬伤 |
| **建议怎么改** | 删掉这句，或改为原文意思："**血清阳性期最长约 15 个月，但保护力显著更久**"；重启的正当理由用 FAQ 那句"**evidence supporting this recommendation is sparse … based on a precautionary principle**"即可（这句我们本来就引对了） |

### 🟡 P5 成年犬"补一针"的引文把适用年龄说宽了（16 周 vs 26 周）

| 项 | 内容 |
|---|---|
| **错在哪** | `catchUpBasis`（:180-181）："WSAVA 2024：**16 周龄以上**的犬只免疫史不明时，一针 MLV 或重组疫苗即可保护大多数犬只" |
| **资料原文** | S1 p15：**"A single dose of MLV core vaccine will very likely be sufficient to induce immunity in pet dogs over 26 weeks of age** and will provide long-lasting protection."（**26 周**）<br>S1 Table 1（Dogs >16 weeks 列）："**Two doses 2 to 4 weeks apart are recommended by some manufacturers. However, a single dose of MLV or recombinant vaccine will likely protect most dogs**" |
| **影响面** | **所有满 26 周、零记录的家长**（需求 3 节把"6 岁零记录"列为关键场景）。程序动作（补一针）方向没错，**但引文把 26 周的条件搬到 16 周**，对 16~26 周这一段的狗，原文给的是"有些厂商建议 2 针" |
| **建议怎么改** | ① 引文改回 **"26 周龄以上"**；② 16~26 周这一段单独给措辞（原文 Table 1 口径）；③ 顺便把 P6 的"高风险可考虑 2 周后再来一针"（S1 p15）纳入考虑 |

### 🟡 P6 狂犬首针三条措辞偏差（"须" / "大于" / 漏了"部分国家"）

| 项 | 内容 |
|---|---|
| **错在哪** | `basis`（:199）："首次免疫程序**须大于 12 周龄**（WSAVA 2024）" |
| **资料原文** | S1 Table 1："**In some countries, the first dose is generally not given before 12 weeks of age**"；S2 官方中文："**在一些国家，第一剂疫苗通常不会在12周龄之前接种。**" [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf)<br>**S4 中国在售说明书**："【用法与用量】…**3月龄以上**犬、猫，每只1ml" |
| **影响面** | 所有幼犬家长。三点偏差：① "in some countries"（部分国家惯例）→ 写成"须"（普适硬要求）；② "not before 12 weeks"（不早于）→ 写成"大于 12 周"；③ **我们参考的在售产品说明书是"3 月龄以上"，比 12 周更晚** |
| **建议怎么改** | 改为"S1：部分国家首剂通常不早于 12 周龄；S4 在售产品说明书为 3 月龄以上；本程序取 12 周起、按 30 天窗口" —— 把"惯例"和"产品说明书"分开写 |

### 🟡 P7 需求自称"已补"的高风险 20 周龄规则，**代码里查无此物**

| 项 | 内容 |
|---|---|
| **错在哪** | 需求附录 A.4 第 369-373 行："**指南有、我们原先没写的（2 处，已补）** —— **高风险环境**：核心系列可延到 20 周龄，间隔缩到 2~3 周"。但 `schedule-table.ts` 的 `CORE_SCHEDULE`（:124-141）**没有任何高风险字段**；`engine.ts:493` 是硬循环 `index <= 8`、结束条件恒定 `finishWeeks: 16` |
| **资料原文** | S1 Table 1："**In especially high-risk situations continue until 20 weeks of age and consider vaccinating every 2 to 3 weeks**"；S2 官方中文："**在特别高风险的情况下，持续到20周龄，并考虑每2至3周接种一次疫苗。**" [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf) |
| **影响面** | **文档与代码不一致**本身是给"兽医审核"埋的坑：下一次审核的人会以为这条已实现。**实际影响家长面 = 0**（因为没有高风险分支，所有狗都走 16 周收官这条更保守的路） |
| **建议怎么改** | 二选一并**让文档与代码一致**：① 在需求 A.4 里改回"**指南有、我们**不**写**"并说明理由（我们不做高风险分流）；② 或者真加一个开关。**不要保留"已补"这个说法**。注意：低风险（16 周收官）也是指南的正选，所以不改代码也不算错 |

### 🟡 P8 早期苗 `basis` 把 WSAVA 的**重组**苗与在售的**活疫苗**当成同一件事

| 项 | 内容 |
|---|---|
| **错在哪** | `CORE_EARLY_SCHEDULE.basis`（:242-243）："WSAVA 2024 Table 1：**CPV 重组 + CDV 弱毒苗**可在 4 周龄起接种 1 针…；产品说明书（宠必威幼犬保）建议 4~6 周龄基础接种" |
| **资料原文** | S1 Table 1：**"Canine parvovirus-2 (recombinant)+canine distemper virus (MLV)"**（CPV 是**重组**）<br>S5 官方中文说明书：**"犬瘟热、细小病毒病二联活疫苗"**、"疫苗中含犬瘟热病毒Onderstepoort株…**犬细小病毒154株**…"、"**建议在4～6周龄时进行基础接种**"（CPV 是**活疫苗 154 株**，不是重组） |
| **影响面** | 早期苗不进默认计划、只有录过记录才认（A11），所以影响面小；但 `basis` 会被家长展开看到，属于专业表述不严谨 |
| **建议怎么改** | 拆成两句、各自标明出处与产品形态：`WSAVA Table 1`（CPV 重组 + CDV MLV）｜`S5 宠必威幼犬保`（犬瘟热+细小 二联活疫苗，4~6 周龄基础接种）。**不要把两者并列成"同一件事的两个出处"** |

### ⚪ P9 "过期"没有权威定义，全由我们的 `graceDays` 决定（提示级）

| 项 | 内容 |
|---|---|
| **不是错，是风险点** | 核心 90 天 / 狂犬 30 天 / 钩端 30 天之后即写"尽快补种（原建议时间 X 已过）"（F3/F4）。**原文从没说过迟打多久算失效** |
| **资料原文** | 与"下限"有关的只有：S1 Table 1 "**no more frequently than every 3 years**"（约束**下限**）；S1 FAQ "robust protection for **12 to 14 months and perhaps longer**" |
| **影响面** | 所有家长。方向偏**保守**（早提醒、不晚报），不会造成"该打没提醒"；但会让"3 年 + 100 天"的家长看到"已过"，而严格讲核心 MLV 的 DOI 是"**至少** 3 年" |
| **建议** | 不必改数字，但建议**在页面上把"逾期"说成"建议接种时间已过"，而不是暗示"保护已失效"** —— 后者会被理解为医学结论 |

---

## 三、【需要老板拍板】清单（资料没写、是我们的产品决定）

> 这些**不是错**，是"指南没规定、我们自己定了"的地方。按老板要求单列出来确认。
> 一句话就能定；定了之后它们才算有出处（出处 = "老板拍板"）。

| # | 要拍什么 | 现在的值 / 做法 | 为什么需要老板而不是兽医 | 我的建议 |
|---|---|---|---|---|
| **Q1** | **"宽限期"三个数字** | 核心 **90 天**、狂犬 **30 天**、钩端 **30 天**（schedule-table.ts:139, 193, 213）—— 超过即"尽快补种" | 指南**完全没有**这个概念。它决定"什么时候开始催家长"，本质是产品体验取舍（催早了扰人、催晚了漏打） | 保留现值但**核对理由**：为什么核心 90 天而狂犬 30 天？建议在程序表里把"这是我们的产品取值"写明（现在写成"宽限期"像是权威口径） |
| **Q2** | **成年犬"补一针"要不要提第二针** | 只给一针，文案不提高风险时的第二针（B5） | 指南 p15 说高风险（如疫情暴发）"prudent to consider a second dose, 2 to 4 weeks later" | 建议**不改算法、改文案**：仍排一针，但 `basis` 里加一句"指南提示高风险情形可考虑 2~4 周后加一针，请咨询兽医" |
| **Q3** | **抗体合格报告"管 3 年"** | `nextReviewAt = testedAt + 3 年`（engine.ts:1239，P3） | 指南没规定阳性报告的复查周期；我们的 3 年是从疫苗 DOI 平移过来的 | ⚠️ **建议优先定这条**：要么改成"由兽医填写复查时间"，要么在文案上明确"3 年是我们的建议复查点、不是保护期" |
| **Q4** | **狂犬的周期口径**（P1 的决策面） | 一律每年 | 法规只说"定期"；中国有 36 个月说明书产品。**这件事必须老板拍板产品策略**（跟产品库、跟"一律人工核对"是联动的） | 建议：**排期改为"按产品免疫期"**，并保留人工核对；若本次不改，则至少**改文案**（不再说"法定每年"） |
| **Q5** | **钩端的层级**（P2 的决策面） | 强烈建议（不催） | 指南定它为核心。降级是我们的产品判断（可能出于成本/依从性/转化率） | 建议明确写下**降级的理由**，并让 `basis` 不再暗示指南支持"强烈建议"这个层级 |
| **Q6** | **早期苗不主动推** | `inDefaultPlan: false`（A11） | 指南无此概念（需求第四节已自认是产品决定 ✓） | 维持现状，确认即可（这条需求文档已经写对了） |
| **Q7** | **高风险环境不做分流** | 所有狗都按 16 周收官（P7） | 指南给高风险开了 20 周 / 2~3 周的口子；我们不问生活方式、不做分流（与需求"不做引导式分流"一致） | 建议**明确写成"我们不做高风险分流"**，并从需求 A.4 的"已补"里撤下来 |
| **Q8** | **序列覆盖 20 年** | 核心 7 格、狂犬 20 格、钩端 20 格 | 指南无此概念 | 维持（与需求 7.3 一致） |
| **Q9** | **重启第 1 针窗口 [今天, +2 周]** | 钩端重启专用 | 指南只说 2 针相隔 2~4 周，没说第 1 针窗口 | 维持 |
| **Q10** | **老年犬狂犬不特殊处理** | 与幼犬同一套规则（F2） | 指南只提示"老年动物首次狂犬免疫更易失败"，没给排期 | 维持，知悉即可 |

---

## 四、一句话总结

> **这份程序的大骨架（核心苗 6~8 周起 / 2~4 周间隔 / 16 周收官 / 26 周补强 / 3 年加强 / 钩端 2 针 + 18 个月重启 / 抗体只认三种且 20 周后 + 最后一针后 4 周）确实站得住，逐句核对 WSAVA 2024 原文全部对得上（50 条里 26 条完全一致）；但有一处必须先改再上线 —— 狂犬被写成"法定每年"，而中国在售产品说明书明写"免疫期 36 个月"、法规原文只说"按规定定期"，这一条会同时造成过度接种和家长投诉（P1）。其余 8 条真问题里，钩端层级（P2）和抗体"管 3 年"（P3）需要老板拍板后再动，P4~P9 是文案/依据层面的硬伤与文档-代码不一致，可以排期修。**

**上线判断**：**核心疫苗与钩端的排期可以放心上线**；**狂犬那一行建议先改文案再上线**（改文案即可，不必改算法）。

---

## 五、审计统计

### 对照了多少条

| 项 | 数 |
|---|---|
| 对照条目总数 | **50 条**（脚本从本文表格逐行统计，可复现） |
| 覆盖范围 | 核心 · 幼犬 12 条（A1~A12）／核心 · 成年 6 条（B1~B6）／狂犬 9 条（C1~C9）／钩端 9 条（D1~D9）／抗体检测 6 条（E1~E6）／老年与边界 6 条（F1~F6）／全表 2 条（G1~G2） |

### 各结论多少条

| 结论 | 条数 | 占比 | 条号 |
|---|---|---|---|
| ✅ **一致** | **26** | 52% | A1 A2 A3 A4 A5 A6 A9 A12 B1 B3 C8 C9 D2 D3 D4 D5 D8 E1 E2 E3 E5 E6 F1 F5 G1 G2 |
| ⚠️ **表述不一致但结论相同** | **4** | 8% | A10 B4 B5 C3 |
| ❌ **与资料不符** | **7** | 14% | A8 C1 C2 C5 C7 D1 D6 |
| ❓ **资料没写、是我们的产品决定** | **13** | 26% | A7 A11 B2 B6 C4 C6 D7 D9 E4 F2 F3 F4 F6 |

> **合计 26 + 4 + 7 + 13 = 50 ✓**（口径：`❌ 与资料不符` 只用于"程序表说的和原文不一样"；
> 凡"原文没写、我们自己定的"一律进 ❓，不因为"可能偏保守"就记成 ❌ —— 宁可多标不确定。）

### 真问题（按严重度）

| 级别 | 编号 | 一句话 |
|---|---|---|
| 🔴 | **P1** | 狂犬"法定每年" ↔ 中国在售说明书"免疫期 36 个月"、法规只说"按规定定期" |
| 🟠 | **P2** | 钩端降为"强烈建议" ↔ 指南定为 **core** |
| 🟠 | **P3** | 抗体合格报告默认"管 3 年" ↔ 指南无此规定、只有"阴性→4 周复测" |
| 🟡 | **P4** | 钩端依据把"血清阳性期 ≤15 个月"读成了"免疫力撑不到 18 个月"（**读反了**） |
| 🟡 | **P5** | "16 周以上一针即可" ↔ 原文是"**26 周以上**"；16~26 周 Table 1 给的是 2 针 |
| 🟡 | **P6** | 狂犬首针"须大于 12 周龄" ↔ 原文"**in some countries** … not before 12 weeks"；在售说明书是 3 月龄 |
| 🟡 | **P7** | 需求 A.4 自称"已补"高风险 20 周规则，**代码里没有** |
| 🟡 | **P8** | 早期苗把 WSAVA 的**重组**苗与在售**活疫苗**并列成同一件事 |
| ⚪ | **P9** | "过期"无权威定义，全由我们的 graceDays 决定（提示级，方向保守） |

### 需要老板拍板

**10 条**（Q1~Q10），其中**建议优先定 3 条**：**Q3（抗体管 3 年）**、**Q4（狂犬周期）**、**Q5（钩端层级）**。

### 本次未完成 / 查不到的（诚实记录）

| 项 | 状态 |
|---|---|
| **AAHA 犬免疫指南原文** | ❌ **查不到可引用的官方原文**（检索只得到 PubMed 条目页与二手 PDF）。因此本文**没有一条结论以 AAHA 为依据** |
| **中国官方"犬只狂犬病免疫技术规范"的现行免疫间隔原文** | ❌ **未取到原文**。已取到的官方口径是《动物防疫法》第三十条"按照规定**定期**免疫接种"（S3）＋在售说明书"36 个月"（S4）。**"定期"具体指多久，本次没有权威文本可引 —— 标 ❓** |
| **中国钩端螺旋体流行血清群数据** | ❓ 未核实。P2 的三条件里"流行 + 血清群已知"依赖这个 |
| **`products.ts` 里产品库的 DOI / 免疫期字段** | 本次未审（不在被审对象范围内）。P1 的修法需要它 —— 建议下一轮把产品库一起纳入 |
| **实际受影响家长数** | ❓ 查不到真实用户数，本文的"影响面"按程序表覆盖范围定性描述，不编数字 |

---

## 附：本次审计用到的原文（备查）

> 全部取自本地下载的官方 PDF / 官方网页，可用 `grep` 复现。

| 编号 | 出处 | 原文（英文/中文，逐字） |
|---|---|---|
| S1-p11 | WSAVA 2024 正文 | "The VGG recommends initial vaccination of puppies against CDV, CAV and CPV at 6 to 8 weeks of age, then every 2 to 4 weeks until 16 weeks of age or older." |
| S1-p11 | 同上 | "Vaccinating more frequently than every 2 weeks is not advised." |
| S1-p11 | 同上 | "The most important of these early vaccine doses is the one administered at 16 weeks of age or older." |
| S1-p14 | 同上 | "the VGG recommends either serological testing at least 4 weeks after the last puppy vaccination (i.e. at or after 20 weeks of age if these guidelines are followed) or, alternatively, an additional vaccination at or shortly after 26 weeks of age." |
| S1-p14 | 同上 | "Puppies in which serological testing at 20+ weeks of age reveals protection against CPV, CDV and CAV do not need the 26+ week vaccination." |
| S1-p15 | 同上 | "A single dose of MLV core vaccine will very likely be sufficient to induce immunity in pet dogs over 26 weeks of age and will provide long-lasting protection. In high-risk situations (e.g. outbreaks), it would be prudent to consider providing a second dose, 2 to 4 weeks later." |
| S1-p15 | 同上 | "Revaccination intervals for canine rabies vaccines are often mandated by law. Rabies vaccines usually carry a 1- or 3-year licensed DOI. Revaccination intervals should be based primarily on local regulations and, in the absence of these, on datasheet DOI claims. In countries where the legal requirement is at odds with the vaccine datasheet, the law must be followed." |
| S1-p15 | 同上 | "Immunity (protection against virulent challenge) lasts much longer than the period of seropositivity (up to 15 months; Grosenbaugh & Pardo, 2018)." |
| S1-T1 | Table 1 · 犬核心 | "Start no earlier than 6 weeks of age. Revaccinate every 3 to 4 weeks until 16 weeks of age / In especially high-risk situations continue until 20 weeks of age and consider vaccinating every 2 to 3 weeks / Two doses 2 to 4 weeks apart are recommended by some manufacturers However, a single dose of MLV or recombinant vaccine will likely protect most dogs / … Thereafter, revaccinate at 3 years of age and thereafter no more frequently than every 3 years" |
| S1-T1 | Table 1 · 早期苗 | "Canine parvovirus-2 (recombinant)+canine distemper virus (MLV) — Administer a single dose from 4 weeks of age before commencing routine primary vaccinations" |
| S1-T1 | Table 1 · 狂犬 | "Follow any local laws or regulations as a priority. … In some countries, the first dose is generally not given before 12 weeks of age" |
| S1-T1 | Table 1 · 钩端 | "Initial dose is usually from 8 weeks of age. Follow the advice in the product leaflet about when to start. A second dose is given 2 to 4 weeks later / Two doses 2 to 4 weeks apart / Annually" |
| S1-FAQ | FAQ · 钩端 | "Q. If a dog received its last Leptospira vaccine 18 or more months ago, do I need to recommend starting the series of vaccinations again (i.e. two doses 2 to 4 weeks apart)? A. Although evidence supporting this recommendation is sparse, the answer is 'yes' based on a precautionary principle." |
| S1-FAQ | FAQ · 抗体 | "In dogs, CDV, CAV and CPV. … Testing for antibodies against other infectious agents (e.g. Leptospira) is much less reliable as a predictor of protection." |
| S1-FAQ | FAQ · 抗体 | "its presence in the serum of an animal over 20 weeks of age is held to indicate protection against these viruses. This is also true for rabies virus but not true for many other viruses." |
| S1-p5 | 老年 | "revaccination of aged pets triennially or perhaps more frequently can be recommended." |
| S1-p3 | 定位 | "Guidelines are intended to provide broad guidance for veterinarians in decision-making. They do not describe mandatory or minimum standards of care." |
| **S2** | 官方中文 Table 1 | "不早于6周龄开始。每3至4周复种一次疫苗，直至16周龄。**在特别高风险的情况下，持续到20周龄，并考虑每2至3周接种一次疫苗。**" [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf) |
| **S2** | 官方中文 Table 1 | "**在一些国家，第一剂疫苗通常不会在12周龄之前接种。**" [链接](https://wsava.org/wp-content/uploads/2024/05/Chinese-Ver-2024-Vaccination-Guideline-for-Dogs-Cats.pdf) |
| **S2** | 官方中文 钩端 | "**强烈建议对所有犬进行钩端螺旋体病疫苗接种，并且这些疫苗应被视为这些地方的核心疫苗。**" |
| **S3** | 中国《动物防疫法》第三十条第一款（政府解读） | "动物防疫法第三十条第一款规定，单位和个人饲养犬只，**应当按照规定定期免疫接种狂犬病疫苗**，凭动物诊疗机构出具的免疫证明向所在地养犬登记机关申请登记。" |
| **S4** | 中国在售狂犬说明书（宠必威®锐必威） | "【作用与用途】用于预防犬、猫狂犬病，免疫产生期为21日，**免疫期为36个月**。【用法与用量】皮下或肌肉注射。**3月龄以上**犬、猫，每只1ml。**以后，每隔36个月接种1次**。" |
| **S5** | 中国在售早期苗说明书（宠必威®幼犬保） | "犬瘟热、细小病毒病**二联活疫苗**…疫苗中含犬瘟热病毒Onderstepoort株…**犬细小病毒154株**…【用法与用量】用配套稀释液稀释后，皮下注射，每只1头份。**建议在4～6周龄时进行基础接种。**" |
