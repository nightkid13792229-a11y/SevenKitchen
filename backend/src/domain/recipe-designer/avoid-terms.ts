/**
 * 从自由文本里抽“不吃/忌口”的食材词（2026-11-19）。
 *
 * 背景：订单的备注（“不吃发物，牛、羊、鸡、鸡蛋不吃”）和病历医嘱
 * （“不吃牛羊鸡肉和鸡蛋”）都是自由文本，没有任何结构化字段。
 * 评估只查结构化过敏记录时，这类忌口完全拦不住。
 *
 * 这里只做**保守的关键词兜底**：命中就给一条“请确认”的提醒，
 * 不当作硬拦。真正的判断仍由营养师和模型看原文完成。
 */

/** 常见肉/蛋/奶/谷物词。单字词用于匹配“鸡胸肉”“牛肉”这类写法。 */
const AVOID_TERMS = [
  '牛',
  '羊',
  '鸡',
  '鸭',
  '鹅',
  '猪',
  '兔',
  '鱼',
  '虾',
  '蟹',
  '蛋',
  '奶',
  '乳',
  '小麦',
  '玉米',
  '大豆',
  '麸质',
  '花生',
];

/**
 * 含某个字但不是那个食材的词。
 *
 * 例：牛磺酸是氨基酸、乳化是工艺、蛋白质是营养指标、牛奶不是牛肉。
 * 匹配前先从文本里剔除这些词，避免“牛磺酸”被当成“牛”。
 */
const TERM_EXCLUSIONS: Record<string, string[]> = {
  牛: ['牛磺酸', '牛奶'],
  乳: ['乳化'],
  蛋: [
    '蛋白质',
    '粗蛋白',
    '高蛋白',
    '低蛋白',
    '蛋白粉',
    '动物蛋白',
    '植物蛋白',
    '优质蛋白',
  ],
};

/** 判断一个原料名是否真的命中某个忌口词（剔除牛磺酸/乳化等假阳性）。 */
export function itemMatchesAvoidTerm(itemName: string, term: string): boolean {
  let scrubbed = String(itemName ?? '');
  for (const exclusion of TERM_EXCLUSIONS[term] ?? []) {
    scrubbed = scrubbed.split(exclusion).join('');
  }
  return scrubbed.includes(term);
}

/** 从多段文本里抽出清单里出现的忌口词（去重，保持清单顺序）。 */
export function extractAvoidTerms(
  texts: ReadonlyArray<string | null | undefined>,
): string[] {
  const text = texts
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    )
    .join('\n');
  if (!text) return [];

  return AVOID_TERMS.filter((term) => {
    let scrubbed = text;
    for (const exclusion of TERM_EXCLUSIONS[term] ?? []) {
      scrubbed = scrubbed.split(exclusion).join('');
    }
    return scrubbed.includes(term);
  });
}
