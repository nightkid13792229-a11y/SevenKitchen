# 补剂选品判断规则 · 草稿（待签字）

- 日期：2026-11-07
- 状态：**待老板逐条签字**。签完才写进 `backend/skills/ingredient-agent/`，才允许它驱动选品排序。
- 依据来源：本地知识库 `docs/knowledge-base/`（NRC 2006、FEDIAF 2025、SACN5、Merck、WSAVA/AAHA）。每条后面的 `Cxxxxxx` 是知识库里的段落号，可直接回查。
- 范围：**只回答"哪一瓶更适合狗"**。目录（《饲料添加剂品种目录》）不在这里，它只管标签名字。

## 0. 怎么读这份稿

每条规则标三种状态：

- **有出处**：知识库里有明确原文支持，签字只表示"同意按这条执行"
- **无出处，按经验**：库里的文献没说，靠我们的实践；签字表示"这是我们自己的规矩"
- **待定**：我拿不准，需要你直接给答案

---

## 1. 第一层：化学形态

### R1. 「螯合形态一定比离子型好」——**不成立，别写进规则**

NRC 2006 原文（C006782）：

> chelates (e.g., with methionine or lysine), have been reported to be **as bioavailable as** many inorganic forms of Zn such as zinc sulfate in many species.

即：锌的氨基酸络合物与硫酸锌**生物利用率相当**，不是更好。同一章的另一段（C006786）在幼犬上测到的结果更直接：

> apparent absorption of Zn appeared **highest when zinc sulfate** was the source of supplemental Zn.

**状态：有出处（且结论与常见说法相反）**

→ 我建议的规则：**形态只在有该营养素自己的证据时才作为排序依据；没有证据就并列，交给性价比。**

这条会直接影响现有三层里的第一层。请你确认：接受吗？还是要保留"螯合优先"作为一条经验规则（那就是"无出处，按经验"）。

### R2. 有些来源要直接排除，不是"差一点"

NRC（C006735）：

> Iron oxide and carbonate demonstrate **negligible bioavailability** and should **not be used** as dietary sources of Fe (AAFCO, 2001).

FEDIAF 2025：

> Owing to its low availability **copper oxide should not be considered as a copper source**.

**状态：有出处**

→ 规则：**氧化铁、碳酸亚铁、氧化铜直接判"不能用"**，与"贵/便宜"无关。这类是硬排除，和饲料级一样处理。

### R3. 微量元素的实际吸收会被同餐的其它成分拉低

FEDIAF 2025：

> bioavailability of trace elements is **reduced by a high content of certain minerals (e.g. calcium)**, the level of other trace elements (e.g. high zinc decreases copper absorption) and sources of **phytic acid**（谷物、豆类）.

**状态：有出处**

→ 规则：同营养素的不同产品比较时，**含量高不等于吸收多**；但这条只写进"提示"，不作为淘汰依据（我们管不了顾客怎么喂）。

## 2. 第二层：人用还是犬用

### R4. 一律先人用

老板定的（2026-11-06）。知识库里没有支持"犬用产品更优"的直接文献。

**状态：无出处，按经验**

→ 规则：饲料级 / 兽用 / 无零售包装 → **判"不能用"**。这不是性价比问题，是进不了我们的分装零售。

### R5. 什么情况下可以破例

老板原话："除非某一类的补剂有明确的研究指出，犬用的要优于人用的，我们才会考虑犬用的。比如某一类补剂，如果不上缓释技术的话，会严重的影响狗狗对营养素的吸收。"

**状态：待定**

→ 需要你补：**具体是哪几类？**（我的猜测是缓释烟酸、部分益生菌菌株、处方级关节补剂。）这条不补，破例的入口就是敞开的，谁都能说"我看到了研究"。

## 3. 第三层：性价比

### R6. 口径：每 1000mg 有效成分多少钱

- 鱼油：按 **EPA+DHA 合计**
- 矿物质：按 **元素量**，不按化合物总量（碳酸锌含锌 52%，葡萄糖酸锌只含约 14%，直接比克数会错三倍）
- 维生素：按 **IU 或 mg 按该字段的档案单位**

**状态：无出处，按经验 + 算术**

### R7. 前两层打平才比价

老板定的。已实现（`compareCandidates.ts`，有测试钉住"便宜的饲料级不能赢"）。

**状态：无出处，按经验**

## 4. 还需要你给答案的三处

1. **R1**：接受"螯合不必然更优"吗？（这条最影响现有界面）
2. **R5**：可以破例的补剂类别，具体是哪几类？
3. **鱼油的"够不够浓"**：知识库里没有"每粒低于多少 mg EPA+DHA 就不值得买"的阈值。要不要定一条（比如"每粒 EPA+DHA < 300mg 的不作为候选"）？定的话是经验规则；不定就纯比价。

---

## 5. 签字方式

在上面每条的"状态"后面写"同意"或改法即可。签完我做三件事：

1. 把 R1–R7 写进 `backend/skills/ingredient-agent/supplement-selection.md`，与现有三份食材 skill 同格式
2. 把"硬排除清单"（R2）落成数据，和目录白名单一样可维护
3. 选品对比屏接上这套规则：形态并列时自动落到比价，硬排除的直接出局并给理由
