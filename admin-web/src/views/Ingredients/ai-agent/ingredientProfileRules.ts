/**
 * Agent 审核页共用的原料档案规则：类别选项、营养字段目录、生熟排序与主档案选择。
 *
 * 这些规则原先放在旧六步向导目录（`creation/`）里；向导删除后，
 * 只把 Agent 页真正用到的部分搬到这里，口径保持不变：
 * 字段目录与后端 `nutrition-field-catalog.ts` 同序、同单位；
 * 主档案仍按「缝合主来源 → 类别默认状态 → 第一份」推断。
 */
import {
  INGREDIENT_NUTRITION_TAB_DEFINITIONS,
  type IngredientNutritionTabKey
} from '@/constants/ingredientNutrition'
import type {
  CoverageCategory,
  PreparationState,
  ProfileDraft
} from '@/types/ingredientCreation'

export interface CoverageCategoryOption {
  value: CoverageCategory
  label: string
  hint: string
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

/** 营养字段目录（与后端 `nutrition-field-catalog.ts` 同序、同单位）。 */
export interface ProfileFieldDefinition {
  fieldPath: string
  tabKey: IngredientNutritionTabKey
  fieldKey: string
  label: string
  unit: string
}

export const PROFILE_FIELD_DEFINITIONS: readonly ProfileFieldDefinition[] =
  INGREDIENT_NUTRITION_TAB_DEFINITIONS.flatMap((tab) =>
    tab.fields.map((field) => ({
      fieldPath: `${tab.key}.${field.key}`,
      tabKey: tab.key,
      fieldKey: field.key,
      label: field.label,
      unit: field.unit
    }))
  )

/** 与后端一致：肉类默认生，根茎淀粉类默认熟，其他默认生。 */
const DEFAULT_PRIMARY_STATE: Readonly<
  Record<CoverageCategory, PreparationState>
> = {
  MEAT_ORGAN: 'RAW',
  STARCHY_VEGETABLE: 'COOKED',
  OTHER: 'RAW'
}

const PREPARATION_STATE_ORDER: readonly PreparationState[] = ['RAW', 'COOKED']

/** 把档案按「先生后熟」排序；同状态保持原顺序。 */
export function sortProfilesByState<T extends Pick<ProfileDraft, 'preparationState'>>(
  profiles: readonly T[]
): T[] {
  return profiles
    .map((profile, index) => ({ profile, index }))
    .sort(
      (left, right) =>
        PREPARATION_STATE_ORDER.indexOf(left.profile.preparationState) -
          PREPARATION_STATE_ORDER.indexOf(right.profile.preparationState) ||
        left.index - right.index
    )
    .map(({ profile }) => profile)
}

function isValidCategory(category: unknown): category is CoverageCategory {
  return (
    category === 'MEAT_ORGAN' ||
    category === 'STARCHY_VEGETABLE' ||
    category === 'OTHER'
  )
}

/**
 * 收尾时选哪份做「主档案」：
 * 1. 缝合主来源对应哪份档案，就是哪份；
 * 2. 否则按类别的默认主状态；
 * 3. 都对不上时退回第一份。
 */
export function resolvePrimaryProfileIndex(
  profiles: readonly Pick<ProfileDraft, 'preparationState' | 'sourceRecordId'>[],
  input: {
    primarySourceRecordId?: string | null
    category?: CoverageCategory | null
  }
): number {
  if (profiles.length === 0) {
    return -1
  }

  const primarySourceRecordId = input.primarySourceRecordId
  if (primarySourceRecordId) {
    const bySource = profiles.findIndex(
      (profile) => profile.sourceRecordId === primarySourceRecordId
    )
    if (bySource >= 0) {
      return bySource
    }
  }

  if (isValidCategory(input.category)) {
    const preferredState = DEFAULT_PRIMARY_STATE[input.category]
    const byState = profiles.findIndex(
      (profile) => profile.preparationState === preferredState
    )
    if (byState >= 0) {
      return byState
    }
  }

  return 0
}
