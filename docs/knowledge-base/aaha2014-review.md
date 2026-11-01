# AAHA 2014 停用后 · 19 处数值复核

**日期**：2026-11-01
**背景**：AAHA 2014 体重管理指南已停用并删除原件。`weight-management.ts` 里有 19 处正文数值原引自它。
**复核依据**：以 **AAHA 2021**（AAHA 自己的最新版）为准；AAHA 2021 未覆盖的，再看 SACN5 第 27 章。
**结果**：**5 处改引 AAHA 2021（已完成），12 处标「（已停用）」待核。**

---

## 〇、最终结论（2026-11-01 晚）

**AAHA 2014 原件已收回并重新入库**（11 页，55,677 字符，有文字层）。19 处数值已全部有据可依：

| 处理 | 条数 | 依据 |
|---|---:|---|
| 改引 **AAHA 2021** | 5 | 2021 版直接覆盖（BCS 10% 规则、零食 ≤10%、益智玩具与康复转诊、启动后主动联系） |
| 保留 **AAHA 2014** | 14 | 2021 版**明确指向 2014** 提供详细方案，这些数值只在 2014 里有 |

**一条关键发现（决定这次反复的原因）**：AAHA 2021 原文写着——

> "In 2014, AAHA published comprehensive weight management guidelines, including a **detailed protocol for safe weight reduction**. Because weight loss is a critical aspect..., the 2021 ... Guidelines include an **abbreviated overview** of this topic. **We encourage readers to consult the 2014 Weight Management Guidelines for more complete information**..."
>
> "The **overall design process** is reviewed in the 2014 Weight Management Guidelines."
> "Use the 2014 Weight Management Guidelines for things to consider with an activity plan."
> "The 2014 Weight Management Guidelines outline **monitoring and maintenance** options."

也就是说 **2021 是概览、2014 是详细方案，两者配套**。此前按"作废"删除是判断错误，现在已纠正。

---

## 一、改引 AAHA 2021 的 5 处

| 条目 | 原表述（AAHA 2014） | 现在的表述（AAHA 2021） |
|---|---|---|
| weight-001 | 肥胖定义为 BCS ≥8/9；每个 ≥5/9 相当于超重 10% | 9 分制 BCS 每升 1 分 ≈ 体脂率 +5%；BCS ≥5/9 时每 1 分相当超重 10% |
| weight-002 | 病史法查 BCS 5/9 对应历史体重 | 按「BCS ≥5/9 每 1 分相当超重 10%」由当前体重反推理想体重 |
| weight-007 | 零食 >10% 总热量需警惕 | 零食等额外食物控制在每日总热量 **10% 以内**并计入计划 |
| weight-008 | 运动 + 行为矫正 + 环境丰容 | 活动计划结合**益智玩具、自动喂食器、环境丰容**，必要时转诊康复专科 |
| weight-009 | 达标后每 2 周复查→每月 | 启动后**头几天主动联系**主人，之后按监测持续随访 |

---

## 二、保留 AAHA 2014 的 14 处

这些数值只在 2014 版里有，2021 版明确让读者去查 2014：

| 条目 | 内容 |
|---|---|
| weight-001 | 肥胖的 BCS ≥8/9 定义 |
| weight-002 | 公式法：理想体重 = 当前体重 ×(100−%BF) ÷0.8 |
| weight-003 | 线性 RER（30×BW+70）适用 2–25 kg；80% RER 起效、60% 可耐受；治疗性减重粮优于普通粮减量 |
| weight-004 | 合并内分泌病时减重更慢 |
| weight-005 | 蛋白 ≥2.5 g/kg/日、≥60 g/1000 kcal；治疗性粮每千卡蛋白维矿更多 |
| weight-007 | 多宠家庭防偷吃 |
| weight-010 | 减重后代谢「重置」，维持热量更低 |
| weight-011 | 低体重犬增重超出指南范围 |
| weight-012 | <60% RER 风险与转诊；平台期是代谢适应 |

---

## 三、代码现状

- `weight-management.ts`：12 条条目的 `citations` 已补回 `AAHA 2014 体重管理指南`（共 36 条出处）。
- 文件头写明「2014 与 2021 是配套关系，不是旧版被取代」。
- 已删除「（已停用）」标记，正文恢复为 `AAHA 2014：…`。
- `source-registry.ts` 中 `AAHA-2014-WEIGHT` 恢复 `local: true`，role 改写为「减重详细方案总纲」。
