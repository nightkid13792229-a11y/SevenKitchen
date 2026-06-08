interface RecommendationCalcDetails {
  weightKg: number
  lifeStage: string
  stageFactor: number
  bcsMultiplier: number
  isNeutered: boolean
  activityLevel: string
  treatPercentage?: number
}

interface RecommendationSummaryInput {
  dogName?: string
  ageText?: string
  lifeStageLabel?: string
  weightKg?: number | null
  rer?: number | null
  totalDer?: number | null
  treatDeduction?: number | null
  finalFoodKcal?: number | null
  isTreatCapped?: boolean
  calcDetails?: RecommendationCalcDetails | null
}

const LIFE_STAGE_LABELS: Record<string, string> = {
  GROWTH: '生长期',
  PUPPY: '幼犬期',
  ADULT: '成年期',
  SENIOR: '老年期',
  PREGNANCY: '妊娠期',
  LACTATION: '哺乳期',
}

export interface RecommendationEnergyCard {
  label: string
  value: string
  summary: string
  details: string[]
  emphasis?: 'default' | 'strong'
}

export interface RecommendationSummaryViewModel {
  heading: string
  meta: string[]
  cards: RecommendationEnergyCard[]
  note: {
    title: string
    body: string
  }
}

function formatKcal(value: number | null | undefined, fallback = 'N/A') {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1)} kcal`
    : fallback
}

function formatWeight(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }

  return `${value}kg`
}

function normalizeLifeStageLabel(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  return LIFE_STAGE_LABELS[value] || value
}

function getActivityLevelText(activityLevel: string): string {
  const texts: Record<string, string> = {
    LOW: '低活动量',
    NORMAL: '正常活动量',
    HIGH: '高活动量',
    RESTING: '静养',
    WORKING: '工作犬强活动',
  }

  return texts[activityLevel] || activityLevel
}

function getBcsText(bcsMultiplier: number): string {
  if (bcsMultiplier >= 1.1) return '偏瘦，建议适度增加热量'
  if (bcsMultiplier === 1.0) return '标准体态'
  if (bcsMultiplier < 1.0 && bcsMultiplier >= 0.6) return '偏胖，建议适度减少热量'
  return '按当前体况系数估算'
}

function getStageFactorBase(details: RecommendationCalcDetails): string {
  const stage = details.lifeStage

  if (stage === 'PUPPY') {
    return `${details.stageFactor.toFixed(1)}（幼犬期，按月龄和体型估算）`
  }

  if (stage === 'ADULT') {
    return details.isNeutered ? '1.6（已绝育成年犬基准）' : '1.8（未绝育成年犬基准）'
  }

  if (stage === 'SENIOR') {
    return '1.4（老年犬基准）'
  }

  if (stage === 'PREGNANCY') {
    return '3.0（妊娠期基准）'
  }

  if (stage === 'LACTATION') {
    return '4.0（哺乳期基准）'
  }

  return `${details.stageFactor.toFixed(2)}（按当前生命阶段估算）`
}

function getActivityMultiplier(activityLevel: string): string {
  const multipliers: Record<string, string> = {
    RESTING: '0.8',
    LOW: '0.9',
    NORMAL: '1.0',
    HIGH: '1.2',
    WORKING: '1.5',
  }

  return multipliers[activityLevel] || '1.0'
}

function buildTotalEnergyCard(input: RecommendationSummaryInput): RecommendationEnergyCard {
  const details = input.calcDetails

  return {
    label: '总能量需求',
    value: formatKcal(input.totalDer),
    summary: '基础代谢 × 生命阶段/活动量 × 体况调整',
    emphasis: 'default',
    details: details
      ? [
          `基础代谢 RER：${formatKcal(input.rer)}`,
          `生命阶段基准：${getStageFactorBase(details)}`,
          `活动量调整：× ${getActivityMultiplier(details.activityLevel)}（${getActivityLevelText(details.activityLevel)}）`,
          `体况调整：× ${details.bcsMultiplier.toFixed(1)}（${getBcsText(details.bcsMultiplier)}）`,
        ]
      : ['根据当前档案估算每日总能量需求。'],
  }
}

function buildTreatEnergyCard(input: RecommendationSummaryInput): RecommendationEnergyCard {
  const details = input.calcDetails
  const treatPercentage = details?.treatPercentage ?? 0

  return {
    label: '零食能量',
    value: formatKcal(input.treatDeduction, '0.0 kcal'),
    summary: '按当前零食设置，从总能量需求中预留',
    emphasis: 'default',
    details: details
      ? [
          `零食占比：${treatPercentage}%`,
          `估算公式：${formatKcal(input.totalDer)} × ${treatPercentage}%`,
          input.isTreatCapped ? '当前零食热量超过安全上限，已自动按 10% 上限收敛。' : '当前零食热量按现有设置直接估算。',
        ]
      : ['未设置零食时，默认按 0 kcal 处理。'],
  }
}

function buildFoodEnergyCard(input: RecommendationSummaryInput): RecommendationEnergyCard {
  return {
    label: '每日主食热量',
    value: formatKcal(input.finalFoodKcal),
    summary: '总能量需求 - 零食能量',
    emphasis: 'strong',
    details: [
      `主食热量 = ${formatKcal(input.totalDer)} - ${formatKcal(input.treatDeduction, '0.0 kcal')}`,
      '先按这个主食热量开始喂养，再结合体重和体态变化逐步微调。',
    ],
  }
}

export function buildRecommendationSummary(input: RecommendationSummaryInput): RecommendationSummaryViewModel {
  return {
    heading: input.dogName?.trim() || '喂食建议',
    meta: [
      input.ageText?.trim() || '',
      normalizeLifeStageLabel(input.lifeStageLabel?.trim() || ''),
      formatWeight(input.weightKg),
    ].filter(Boolean),
    cards: [
      buildTotalEnergyCard(input),
      buildTreatEnergyCard(input),
      buildFoodEnergyCard(input),
    ],
    note: {
      title: '喂食建议说明',
      body: '以上热量为首次喂养参考值。不同狗狗的实际日能量需求会因吸收情况、运动变化、环境和健康状态而有所差异，因此结果可能偏高或偏低。建议先按当前方案喂养，并持续观察体重和体态变化，再逐步调整喂食量。',
    },
  }
}
