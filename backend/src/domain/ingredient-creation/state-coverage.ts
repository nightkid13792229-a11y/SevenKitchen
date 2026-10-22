import type { PreparationState } from './preparation-state';

/**
 * 起手页让人选的原料类别。类别由调用方给定，这里**不做关键词猜测**：
 * 判不准就留空让人选（设计文档第五节 ①：「类别判不准就留空让人选，不硬猜」）。
 *
 * - `MEAT_ORGAN`：肉、内脏、水产、蛋
 * - `STARCHY_VEGETABLE`：根茎 / 淀粉类蔬菜
 * - `OTHER`：其它，不预设生熟
 */
export type CoverageCategory =
  | 'MEAT_ORGAN'
  | 'STARCHY_VEGETABLE'
  | 'OTHER';

/**
 * 一份原料的「生熟清单」默认值。
 *
 * `required` 只表达「建议一定要有这一份」，**不阻断保存**——缺失时页面只提醒，
 * 人可以「登记例外」放行或继续找；是否拦截由终检决定（设计文档决定 #5，2026-10-22）。
 */
export interface StateCoverage {
  required: PreparationState[];
  suggested: PreparationState[];
}

interface StateCoverageDefaults {
  required: readonly PreparationState[];
  suggested: readonly PreparationState[];
}

const DEFAULT_STATE_COVERAGE: Readonly<
  Record<CoverageCategory, StateCoverageDefaults>
> = {
  MEAT_ORGAN: { required: ['RAW'], suggested: ['COOKED'] },
  STARCHY_VEGETABLE: { required: ['COOKED'], suggested: ['RAW'] },
  OTHER: { required: [], suggested: [] },
};

const DEFAULT_PRIMARY_STATE: Readonly<
  Record<CoverageCategory, PreparationState>
> = {
  MEAT_ORGAN: 'RAW',
  STARCHY_VEGETABLE: 'COOKED',
  OTHER: 'RAW',
};

/**
 * 按类别给出默认生熟清单。纯映射：只看类别，不看原料名。
 *
 * 每次返回全新对象与全新数组，调用方随意修改都不会污染下一次调用。
 */
export function resolveStateCoverage(
  category: CoverageCategory,
): StateCoverage {
  const coverage = DEFAULT_STATE_COVERAGE[category];
  return {
    required: [...coverage.required],
    suggested: [...coverage.suggested],
  };
}

/**
 * 按类别给出默认主档案状态：优先取清单里 `required` 的那一份；
 * 没有必需项（`OTHER`）时默认生。
 */
export function resolveDefaultPrimaryState(
  category: CoverageCategory,
): PreparationState {
  return DEFAULT_PRIMARY_STATE[category];
}
