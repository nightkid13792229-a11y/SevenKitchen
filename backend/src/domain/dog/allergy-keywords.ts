/**
 * 过敏原来源合并
 *
 * 背景（2026-09-27）：系统里过敏信息一直有两个来源，而且**读的人各读各的**：
 *
 *  1. `dog.allergy_foods`（旧文本字段）
 *     —— 后台食谱设计器的「设计备注」在维护它，**顾客端没有任何输入框**
 *     —— 首页推荐食谱与 AI 配方**只看这一个**
 *  2. `allergy_record` 表（结构化记录）
 *     —— 顾客在健康档案 / 定制需求单里填的，是**顾客真正能填的那条路**
 *     —— 首页推荐与 AI 配方**完全读不到**
 *
 * 后果：顾客在健康档案里明确写了「对鸡肉过敏」，首页照样给他推荐含鸡肉的食谱。
 * 对一个「按过敏定制」的产品来说这是食品安全级缺陷。
 *
 * 这里把两个来源合并成一份统一的过敏原关键词列表，**两侧都读**：
 * 这样既补上了顾客那条路，也不会丢掉员工在备注里维护的内容。
 *
 * 后续（老板已定的 D1）：等结构化记录成为唯一入口后，再考虑废弃旧字段。
 * 在那之前必须「两边都读」，否则会出现「切过去以后员工的备注失效」的断档。
 */

/**
 * 过敏原分词。
 *
 * 旧文本字段是「一句话」，需要用分隔符拆开；
 * 结构化记录通常一条一个过敏原，但顾客可能一条里写「鸡肉、牛肉」，因此同样要拆。
 *
 * 分隔符集合与改造前 `recipes.controller.ts` 的 normalizeKeywordList 完全一致，
 * 以保证推荐打分的既有行为不发生意料外的变化。
 */
export function splitAllergyKeywords(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,，、;；\n\r]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 合并「旧文本过敏字段」与「结构化过敏记录」两侧的过敏原。
 *
 * 返回值已小写、去空白、按首次出现顺序去重。
 */
export function collectAllergyKeywords(params: {
  /** `dog.allergy_foods`：旧文本字段，员工设计备注在维护 */
  allergyFoods?: string | null;
  /** `allergy_record.allergen`：顾客在健康档案/定制单里填的结构化记录 */
  allergens?: Array<string | null | undefined> | null;
}): string[] {
  const fromLegacyField = splitAllergyKeywords(params.allergyFoods);
  const fromStructuredRecords = (params.allergens ?? []).flatMap((allergen) =>
    splitAllergyKeywords(allergen),
  );

  return Array.from(new Set([...fromLegacyField, ...fromStructuredRecords]));
}

/**
 * 把合并后的过敏原列表还原成 AI 提示词需要的字符串形式。
 *
 * AI 侧的字段历来是 `allergyFoods: string | null`，这里保持同样的形状，
 * 避免为了合并来源而改动提示词结构（那样会同时影响配方生成效果，风险更大）。
 */
export function formatAllergyKeywordsForAi(keywords: string[]): string | null {
  return keywords.length > 0 ? keywords.join('、') : null;
}
