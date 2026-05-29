export interface NutritionReviewOption {
  label: string
  value: string
  aliases?: string[]
}

export const NUTRITION_PREPARATION_STATE_OPTIONS: readonly NutritionReviewOption[] = [
  { label: '生', value: 'RAW', aliases: ['生食', '生重', 'raw'] },
  { label: '熟', value: 'COOKED', aliases: ['熟食', '熟重', 'cooked'] },
  { label: '干', value: 'DRIED', aliases: ['干重', 'dried'] },
  { label: '冻干', value: 'FREEZE_DRIED', aliases: ['freeze dried', 'freeze-dried'] },
  { label: '风干', value: 'AIR_DRIED', aliases: ['air dried', 'air-dried'] },
  { label: '粉', value: 'POWDER', aliases: ['粉末', 'powder'] },
  { label: '罐头', value: 'CANNED', aliases: ['罐装', 'canned'] },
  { label: '油脂', value: 'OIL', aliases: ['油', 'oil'] },
  { label: '浓缩物', value: 'CONCENTRATE', aliases: ['浓缩', 'concentrate'] },
  { label: '待确认', value: 'UNKNOWN', aliases: ['未知', 'unknown'] }
] as const

export const NUTRITION_EDIBLE_PORTION_OPTIONS: readonly NutritionReviewOption[] = [
  { label: '标准可食部', value: 'STANDARD_EDIBLE_PORTION', aliases: ['可食部'] },
  { label: '整体', value: 'WHOLE', aliases: ['整只', 'whole'] },
  { label: '肉', value: 'MEAT_ONLY', aliases: ['meat'] },
  { label: '胸肉', value: 'BREAST_MEAT', aliases: ['breast'] },
  { label: '腿肉', value: 'THIGH_MEAT', aliases: ['thigh'] },
  { label: '肝脏', value: 'ORGAN_LIVER', aliases: ['肝', 'liver'] },
  { label: '去皮', value: 'SKINLESS', aliases: ['skinless'] },
  { label: '带皮', value: 'SKIN_ON', aliases: ['skin on', 'skin-on'] },
  { label: '去骨', value: 'BONELESS', aliases: ['boneless'] },
  { label: '带骨', value: 'BONE_IN', aliases: ['bone in', 'bone-in'] },
  { label: '去皮去骨', value: 'SKINLESS_BONELESS', aliases: ['去骨去皮', 'skinless boneless'] },
  { label: '去壳', value: 'SHELLED', aliases: ['去壳/去皮', 'shelled'] },
  { label: '带壳', value: 'SHELL_ON', aliases: ['shell on', 'shell-on'] },
  { label: '沥干', value: 'DRAINED', aliases: ['drained'] },
  { label: '待确认', value: 'UNKNOWN', aliases: ['未知', 'unknown'] }
] as const

export const NUTRITION_PROCESSING_OPTIONS: readonly NutritionReviewOption[] = [
  { label: '未加工', value: 'UNPROCESSED', aliases: ['无加工', 'unprocessed'] },
  { label: '无盐', value: 'UNSALTED', aliases: ['unsalted'] },
  { label: '加盐', value: 'SALTED', aliases: ['salted'] },
  { label: '未强化', value: 'UNFORTIFIED', aliases: ['非强化', 'unfortified'] },
  { label: '强化', value: 'FORTIFIED', aliases: ['fortified'] },
  { label: '非紫外线照射', value: 'NON_UV_EXPOSED', aliases: ['未经紫外线照射', 'not uv exposed'] },
  { label: '紫外线照射', value: 'UV_EXPOSED', aliases: ['uv exposed'] },
  { label: '烟熏', value: 'SMOKED', aliases: ['smoked'] },
  { label: '冷冻', value: 'FROZEN', aliases: ['frozen'] },
  { label: '待确认', value: 'UNKNOWN', aliases: ['未知', 'unknown'] }
] as const

export function resolveReviewOptionValue(
  options: readonly NutritionReviewOption[],
  value?: string | null,
  label?: string | null
): string {
  const direct = findReviewOption(options, value)
  if (direct) return direct.value

  const byLabel = findReviewOption(options, label)
  return byLabel?.value ?? ''
}

export function resolveReviewOptionLabel(
  options: readonly NutritionReviewOption[],
  value?: string | null,
  fallbackLabel?: string | null
): string {
  const option = findReviewOption(options, value) ?? findReviewOption(options, fallbackLabel)
  return option?.label ?? ''
}

function findReviewOption(
  options: readonly NutritionReviewOption[],
  value?: string | null
): NutritionReviewOption | undefined {
  const normalized = normalizeReviewText(value)
  if (!normalized) return undefined

  return options.find((option) => {
    if (normalizeReviewText(option.value) === normalized) return true
    if (normalizeReviewText(option.label) === normalized) return true
    return option.aliases?.some((alias) => normalizeReviewText(alias) === normalized)
  })
}

function normalizeReviewText(value?: string | null): string {
  return (value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}
