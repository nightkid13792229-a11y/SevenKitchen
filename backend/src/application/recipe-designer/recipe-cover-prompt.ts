export interface RecipeCoverIngredient {
  name: string;
  /** 「部位/状态/预处理」整串，原样传给模型，不拆分 */
  preparationMethod?: string | null;
  /** 用量占比（整份配方的百分比；调用方已归一化） */
  ratioPercent?: number | null;
}

export interface BuildRecipeCoverPromptInput {
  /** 仅用于日志/兼容旧入口；不再写进提示词，避免模型画标题 */
  recipeName?: string;
  /** 旧入口：没有部位/占比时只传名字 */
  foodNames?: string[];
  /** 新入口：系列封面的完整食材数据（只用于判断有没有蛋/兼容旧路径） */
  ingredients?: RecipeCoverIngredient[];
  /** 文本模型生成的英文画面描述；有它就不再往提示词里放原始食材名/百分比 */
  visualBrief?: string;
  /** DeepSeek 写的整段摄影 brief（含构图/光线/背景），直接作为图片提示词主体 */
  imageBrief?: string;
  /** 旧入口传过；现在不再写进提示词 */
  lifeStageLabels?: string[];
}

const MAX_PROMPT_LENGTH = 1000;

/**
 * 拼封面图的提示词（2026-10-27 老板口径）
 *
 * · 食材的「部位/状态/预处理」原样带上，不拆分；
 * · 状态是熟/干，也按「生 + 预处理」画（提示词里明确覆盖）；
 * · 只统一调色/光线，不规定角度、碗、背景，让模型自由发挥；
 * · 不出现任何文字；视觉分量大致按占比。
 */
export function buildRecipeCoverPrompt(
  input: BuildRecipeCoverPromptInput,
): string {
  const ingredients = (input.ingredients || []).filter(
    (item) => String(item?.name ?? '').trim(),
  );
  const foodNames = (input.foodNames || []).filter(Boolean);
  const hasEgg = (ingredients.length ? ingredients.map((i) => i.name) : foodNames)
    .some((name) => /蛋/.test(name));

  /**
   * DeepSeek 已经写好整段摄影 brief（2026-10-28）：
   * 它包含了主次、构图、光线、背景和全部食材；这里只追加固定的
   * 「无文字 / 生鲜 / 无补剂」护栏，不再套一层旧模板。
   */
  const imageBrief = String(input.imageBrief ?? '').trim();
  if (imageBrief) {
    const guard = [
      'No text, no words, no letters, no numbers, no labels, no captions, no infographic, no typography, no watermark, no logo, no packaging, no human hands.',
      'Only the ingredients described in the brief; no extra food or garnish. No boiled eggs. Keep every ingredient inside the frame; no cropped food.',
      'No cooked/seared/grilled/stewed look. No blood pools, no slime, no supplements or pills.',
      hasEgg ? '' : 'No egg.',
    ]
      .filter(Boolean)
      .join(' ');

    let brief = imageBrief;
    let prompt = `${brief} ${guard}`;
    // 智谱 prompt 上限 1000 字符：超了先从 brief 的最后一句开始丢
    while (prompt.length > MAX_PROMPT_LENGTH && brief.includes('. ')) {
      brief = brief.slice(0, brief.lastIndexOf('. '));
      prompt = `${brief} ${guard}`;
    }
    return prompt;
  }

  /**
   * 有画面描述时走固定模板：模板永远不变，只有 {{visualBrief}} 随配方变化。
   * 原始中文名和百分比一律不进来，模型就没有字可画。
   */
  const visualBrief = String(input.visualBrief ?? '').trim();
  if (visualBrief) {
    const assemble = (brief: string): string =>
      [
        'A commercial lifestyle food photograph of fresh dog meal ingredients arranged on a light oak kitchen table by a window:',
        `${brief}.`,
        'All ingredients are visible in separate groups, with the largest amounts closest to the front.',
        'A linen napkin, a small ceramic bowl and a few herbs sit softly out of focus in the background.',
        'Natural window light, warm neutral color grading, true-to-life colors, gentle contrast, shallow depth of field, editorial food photography.',
        'No text, no words, no letters, no numbers, no labels, no captions, no infographic, no typography, no watermark, no logo, no packaging, no human hands, no cooked/seared/grilled look, no blood pools, no slime.',
        hasEgg ? '' : 'No egg.',
      ]
        .filter(Boolean)
        .join(' ');

    let brief = visualBrief;
    let prompt = assemble(brief);
    // 智谱 prompt 上限 1000 字符：超了从画面描述的最后一段开始丢
    while (prompt.length > MAX_PROMPT_LENGTH && brief.includes('; ')) {
      brief = brief.slice(0, brief.lastIndexOf('; '));
      prompt = assemble(brief);
    }
    return prompt;
  }

  const sorted = ingredients
    .map((item) => ({
      name: String(item.name).trim(),
      preparationMethod: String(item.preparationMethod ?? '').trim(),
      ratioPercent: Number(item.ratioPercent),
    }))
    .sort((a, b) => (b.ratioPercent || 0) - (a.ratioPercent || 0));

  const build = (rows: typeof sorted): string => {
    const ingredientList = rows.length
      ? rows
          .map((row) => {
            const prep = row.preparationMethod
              ? `（${row.preparationMethod}）`
              : '';
            const ratio = Number.isFinite(row.ratioPercent)
              ? ` ${Math.round(row.ratioPercent)}%`
              : '';
            return `${row.name}${prep}${ratio}`;
          })
          .join('；')
      : '';

    const legacyList = !rows.length && foodNames.length
      ? foodNames.join(', ')
      : '';

    const sentences = [
      'Commercial food photography for a premium fresh dog food brand.',
      ingredientList
        ? `Show every ingredient below raw and freshly prepped, in its natural, recognizable form and correct cut, with the visual amount roughly matching its percentage: ${ingredientList}.`
        : '',
      legacyList
        ? `Show these ingredients raw and freshly prepped, in their natural, recognizable forms: ${legacyList}.`
        : '',
      ingredientList
        ? 'Even if a description mentions a cooked or dried state, show the ingredient raw and fresh.'
        : '',
      // 只做取景安全，不规定角度/碗/背景：陈列交给模型自由发挥
      'Arrange and style the scene freely for the most appetizing landscape composition; keep the ingredients inside the frame with a little breathing room.',
      'Clean, uncluttered setting. Soft natural daylight, warm neutral color grading, true-to-life colors, gentle contrast, consistent premium look.',
      'Ultra-detailed, fresh, appetizing, high-end commercial food photography.',
      'No text, no letters, no numbers, no labels, no logos, no watermarks, no packaging, no human hands.',
      'No cooked/seared/grilled/stewed look. No blood pools, no slime, no supplements or pills.',
      hasEgg ? '' : 'No egg.',
    ];

    return sentences.filter(Boolean).join(' ');
  };

  let prompt = build(sorted);
  // 智谱 prompt 上限 1000 字符；超了先丢占比最小的（列表已按占比降序）
  while (prompt.length > MAX_PROMPT_LENGTH && sorted.length > 0) {
    sorted.pop();
    prompt = build(sorted);
  }
  return prompt;
}
