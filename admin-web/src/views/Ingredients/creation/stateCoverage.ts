/**
 * ① 起手站的「生熟清单」默认值。
 *
 * 这张表是产品规则，必须与后端 `domain/ingredient-creation/state-coverage.ts`
 * **完全一致**：① 站按它预填清单，④ 站终检按同一套规则判断「必需项是否缺失」。
 * 两边一旦漂移，页面会让用户少建一份档案，终检却仍按旧规则报缺失。
 *
 * 只在纯映射里取默认值；类别判不准时由人选择，不做关键词猜测。
 */
import type {
  CoverageCategory,
  PreparationState
} from '@/types/ingredientCreation'

/** 一份原料的「要建几份档案」清单：必需与建议。 */
export interface StateCoverage {
  required: PreparationState[]
  suggested: PreparationState[]
}

export interface CoverageCategoryOption {
  value: CoverageCategory
  label: string
  hint: string
}

/** 生在前、熟在后：所有清单、检索顺序都从这里派生。 */
const STATE_ORDER: readonly PreparationState[] = ['RAW', 'COOKED']

/**
 * 与后端 state-coverage.ts 逐字一致：
 * - 肉 / 内脏 / 水产 / 蛋：必需生、建议熟
 * - 根茎淀粉类蔬菜：必需熟、建议生
 * - 其他：都不预设，人工勾
 */
const DEFAULT_STATE_COVERAGE: Readonly<
  Record<CoverageCategory, StateCoverage>
> = {
  MEAT_ORGAN: { required: ['RAW'], suggested: ['COOKED'] },
  STARCHY_VEGETABLE: { required: ['COOKED'], suggested: ['RAW'] },
  OTHER: { required: [], suggested: [] }
}

/** 与后端一致：肉类默认生，根茎淀粉类默认熟，其他默认生。 */
const DEFAULT_PRIMARY_STATE: Readonly<
  Record<CoverageCategory, PreparationState>
> = {
  MEAT_ORGAN: 'RAW',
  STARCHY_VEGETABLE: 'COOKED',
  OTHER: 'RAW'
}

/**
 * 类别文案是产品契约：`MEAT_ORGAN` 必须写全「肉/内脏/水产/蛋」。
 * 只写「肉/内脏」会让用户把虾和鸡蛋归到「其他」，静默丢掉「必需生」的要求。
 */
export const COVERAGE_CATEGORY_OPTIONS: readonly CoverageCategoryOption[] = [
  {
    value: 'MEAT_ORGAN',
    label: '肉/内脏/水产/蛋',
    hint: '猪牛羊禽、肝心胗、鱼虾贝、蛋都选这里'
  },
  {
    value: 'STARCHY_VEGETABLE',
    label: '根茎淀粉类蔬菜',
    hint: '土豆、红薯、山药、南瓜等'
  },
  {
    value: 'OTHER',
    label: '其他',
    hint: '判不准就选这里，生熟清单自己勾'
  }
]

const CATEGORY_LABELS: Readonly<Record<CoverageCategory, string>> =
  Object.fromEntries(
    COVERAGE_CATEGORY_OPTIONS.map((item) => [item.value, item.label])
  ) as Record<CoverageCategory, string>

const STATE_LABELS: Readonly<Record<PreparationState, string>> = {
  RAW: '生',
  COOKED: '熟'
}

/** 按类别给出默认生熟清单；每次返回新对象与新数组。 */
export function resolveStateCoverage(
  category: CoverageCategory
): StateCoverage {
  const defaults = DEFAULT_STATE_COVERAGE[category]
  return {
    required: [...defaults.required],
    suggested: [...defaults.suggested]
  }
}

/** 按类别给出默认主档案状态（最终由人在 ① 站确认）。 */
export function resolveDefaultPrimaryState(
  category: CoverageCategory
): PreparationState {
  return DEFAULT_PRIMARY_STATE[category]
}

/**
 * 把「必需 + 建议」合并成要检索 / 要建档的状态列表。
 *
 * 顺序固定先生后熟并去重；② 站按这个列表分别发起生、熟两次候选检索。
 */
export function resolveCoverageStates(
  coverage: StateCoverage
): PreparationState[] {
  return STATE_ORDER.filter(
    (state) =>
      coverage.required.includes(state) || coverage.suggested.includes(state)
  )
}

export function getCoverageCategoryLabel(category: CoverageCategory): string {
  return CATEGORY_LABELS[category] ?? '其他'
}

export function getPreparationStateLabel(state: PreparationState): string {
  return STATE_LABELS[state] ?? '生'
}
