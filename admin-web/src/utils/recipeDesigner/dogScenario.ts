import type { FediafDogScenario } from '@/types/recipeDesigner'

/**
 * 从「爱犬档案详情」推断食谱设计器的默认阶段（FediafDogScenario）。
 *
 * 背景：营养师从定制订单进入设计器时，参考爱犬已经确定了，
 * 但「默认阶段」仍是空的，只能自己再去狗档案里查一遍生命阶段。
 * 这里只在**有足够数据**时给出建议值；数据不足一律返回 undefined，
 * 不按品种/年龄去猜（后端仍会按自己的规则计算配方营养标准）。
 */
export interface DogScenarioCalcDetailsLike {
  ageMonths?: number | null
  /** 部分后端版本会返回更精确的周龄；有则优先使用 */
  ageWeeks?: number | null
  lifeStage?: string | null
  effectiveLifeStage?: string | null
  energyStage?: string | null
  activityLevel?: string | null
  activityBasis?: string | null
}

export interface DogScenarioProfileLike {
  birthday?: string | Date | null
  activityLevel?: string | null
  lifeStageOverride?: string | null
}

export interface DogScenarioDetailLike {
  profile?: DogScenarioProfileLike | null
  calcResult?: {
    calcDetails?: DogScenarioCalcDetailsLike | null
  } | null
  /** 兼容极少数仍返回 { data: ... } 的旧调用方/测试数据 */
  data?: DogScenarioDetailLike | null
}

export interface DogStageScenarioInput {
  lifeStage?: string | null
  ageMonths?: number | null
  ageWeeks?: number | null
  birthday?: string | Date | null
  activityLevel?: string | null
}

const DAYS_PER_MONTH = 30.4375
const DAYS_PER_WEEK = 7
const EARLY_GROWTH_MAX_WEEKS = 14

function normalizeCode(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
}

function toFiniteNumber(value?: number | string | null): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function firstCode(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const code = normalizeCode(value)
    if (code && code !== 'NONE') return code
  }
  return undefined
}

/**
 * 计算周龄：优先用后端给出的精确周龄，其次由生日推算，
 * 最后才退回 calcDetails.ageMonths（该字段是向下取整的月龄，精度较低）。
 */
function resolveAgeWeeks(input: DogStageScenarioInput, now: Date): number | null {
  const explicitWeeks = toFiniteNumber(input.ageWeeks)
  if (explicitWeeks !== null) return Math.max(0, explicitWeeks)

  if (input.birthday) {
    const birthday = new Date(input.birthday)
    const birthdayTime = birthday.getTime()
    if (Number.isFinite(birthdayTime)) {
      const diffDays = (now.getTime() - birthdayTime) / (1000 * 60 * 60 * 24)
      if (diffDays >= 0) return diffDays / DAYS_PER_WEEK
    }
  }

  const ageMonths = toFiniteNumber(input.ageMonths)
  if (ageMonths !== null) {
    return (Math.max(0, ageMonths) * DAYS_PER_MONTH) / DAYS_PER_WEEK
  }

  return null
}

/**
 * 纯映射：生命阶段 + 周龄/月龄 + 活动量 → FEDIAF 默认阶段。
 *
 * 与后端 dog-stage.service 的口径保持一致：
 * - 幼犬以 14 周为界
 * - 老年犬按低能量需求（95ME）
 * - 成犬按活动量：RESTING/LOW → 95ME，其余 → 110ME
 */
export function resolveFediafScenarioFromDogStage(
  input: DogStageScenarioInput,
  now: Date = new Date()
): FediafDogScenario | undefined {
  const lifeStage = normalizeCode(input.lifeStage)
  if (!lifeStage) return undefined

  switch (lifeStage) {
    case 'PREGNANCY':
    case 'PREGNANCY_EARLY':
    case 'PREGNANCY_LATE':
    case 'LACTATION':
    case 'REPRODUCTION':
      return 'REPRODUCTION'

    case 'SENIOR':
    case 'ADULT_SENIOR':
    case 'LOW_ACTIVITY_ADULT_OR_SENIOR':
      return 'ADULT_MER_95'

    case 'PUPPY_UNDER_14_WEEKS':
    case 'EARLY_GROWTH_UNDER_14_WEEKS':
      return 'EARLY_GROWTH_REPRODUCTION'

    case 'PUPPY_14_WEEKS_PLUS':
    case 'LATE_GROWTH_FROM_14_WEEKS':
      return 'LATE_GROWTH'

    case 'PUPPY':
    case 'GROWTH':
    case 'PUPPY_GROWTH_CURVE': {
      const ageWeeks = resolveAgeWeeks(input, now)
      if (ageWeeks === null) return undefined
      return ageWeeks < EARLY_GROWTH_MAX_WEEKS
        ? 'EARLY_GROWTH_REPRODUCTION'
        : 'LATE_GROWTH'
    }

    case 'HIGH_ACTIVITY_ADULT':
      return 'ADULT_MER_110'

    case 'ADULT':
    case 'ADULT_YOUNG':
    case 'ADULT_MIDDLE':
    case 'ADULT_INTACT': {
      const activityLevel = normalizeCode(input.activityLevel)
      if (!activityLevel) return undefined
      if (activityLevel === 'RESTING' || activityLevel === 'LOW') {
        return 'ADULT_MER_95'
      }
      if (
        activityLevel === 'NORMAL' ||
        activityLevel === 'HIGH' ||
        activityLevel === 'WORKING'
      ) {
        return 'ADULT_MER_110'
      }
      return undefined
    }

    default:
      return undefined
  }
}

/**
 * 从 dogApi.getDetail 的返回体推断默认阶段。
 * 支持 { profile, calcResult } 以及旧版 { data: { profile, calcResult } }。
 */
export function resolveDogScenarioFromDetail(
  detail: DogScenarioDetailLike | null | undefined,
  now: Date = new Date()
): FediafDogScenario | undefined {
  const root = detail?.data ?? detail
  if (!root) return undefined

  const profile = root.profile ?? null
  const calcDetails = root.calcResult?.calcDetails ?? null
  const lifeStage = firstCode(
    calcDetails?.effectiveLifeStage,
    calcDetails?.lifeStage,
    calcDetails?.energyStage,
    profile?.lifeStageOverride
  )
  if (!lifeStage) return undefined

  return resolveFediafScenarioFromDogStage(
    {
      lifeStage,
      ageMonths: calcDetails?.ageMonths,
      ageWeeks: calcDetails?.ageWeeks,
      birthday: profile?.birthday,
      activityLevel: firstCode(
        calcDetails?.activityLevel,
        calcDetails?.activityBasis,
        profile?.activityLevel
      )
    },
    now
  )
}
