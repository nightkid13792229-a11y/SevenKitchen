import { buildRecommendationSummary } from './dog-recommendation-summary'

const LIFE_STAGE_LABELS: Record<string, string> = {
  GROWTH: '生长期',
  PUPPY: '幼犬期',
  ADULT: '成年期',
  SENIOR: '老年期',
  PREGNANCY: '妊娠期',
  LACTATION: '哺乳期',
}

const SIZE_LABELS: Record<string, string> = {
  SMALL: '小型犬',
  MEDIUM: '中型犬',
  LARGE: '大型犬',
  GIANT: '巨型犬',
}

const ACTIVITY_LEVEL_LABELS: Record<string, string> = {
  RESTING: '休息',
  LOW: '低活动',
  NORMAL: '正常活动',
  HIGH: '高活动',
  WORKING: '工作犬',
}

const ACTIVITY_LEVEL_DESCRIPTIONS: Record<string, string> = {
  RESTING: '几乎不运动，主要时间休息',
  LOW: '偶尔散步，每日运动少于30分钟',
  NORMAL: '每日散步1-2小时，正常活动量',
  HIGH: '每日运动2-4小时，经常跑步或玩耍',
  WORKING: '高强度训练或工作犬场景',
}

const TREAT_LEVEL_LABELS: Record<string, string> = {
  NONE: '不给零食',
  LOW: '较少零食',
  MODERATE: '适中零食',
  HIGH: '较多零食',
}

export interface DogOverviewProfile {
  breedId?: string | null
  breedName?: string | null
  customBreedName?: string | null
  name?: string
  birthday?: string
  currentWeightKg?: number | null
  lifeStageOverride?: string | null
  isNeutered?: boolean | null
  bcsScore?: number | null
  activityLevel?: string | null
  mealsPerDay?: number | string | null
  treatInputMode?: string | null
  treatLevel?: string | null
  manualTreatKcal?: number | null
  sizeClassOverride?: string | null
  medicalRecords?: any[] | null
  checkupRecords?: any[] | null
  allergyRecords?: any[] | null
  allergyFoods?: string | null
  pickyFoods?: string | null
}

export interface DogOverviewCalcDetails {
  weightKg?: number
  ageMonths?: number
  lifeStage: string
  stageFactor: number
  bcsMultiplier: number
  isNeutered: boolean
  activityLevel: string
  treatPercentage?: number
}

export interface DogOverviewCalcResult {
  rer?: number | null
  totalDer?: number | null
  finalFoodKcal?: number | null
  treatDeduction?: number | null
  isTreatCapped?: boolean
  calcDetails?: DogOverviewCalcDetails | null
}

interface OverviewLifeStageInfo {
  label: string
  detail: string
}

export interface OverviewFactItem {
  label: string
  value: string
}

export interface OverviewRecommendationMetric {
  label: string
  value: string
  hint?: string
  emphasis?: 'default' | 'strong'
}

export interface OverviewHealthFact {
  label: string
  value: string
}

export interface OverviewEnergySectionData {
  badges: string[]
  metrics: OverviewRecommendationMetric[]
  note: {
    title: string
    body: string
  }
}

export type FeedingImpactExplanationType = 'bcs' | 'activity' | 'treat'

export interface BcsChoiceOption {
  value: number
  label: string
  status: string
  detail: string
}

export interface FeedingImpactExplanation {
  title: string
  summary: string
  items: Array<{
    label: string
    detail: string
  }>
}

interface BuildBasicFactsOptions {
  breedSizeCategory?: string | null
}

export interface DogOverviewBreedOption {
  id: string
  name: string
}

export function calculateDogAgeText(birthday?: string, now = new Date()) {
  if (!birthday) {
    return ''
  }

  const birth = new Date(birthday)
  if (Number.isNaN(birth.getTime())) {
    return ''
  }

  const months = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 30)))
  if (months < 12) {
    return `${months}个月`
  }

  return `${Math.floor(months / 12)}岁`
}

function formatWeight(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }

  return Number.isInteger(value) ? `${value}kg` : `${value.toFixed(1)}kg`
}

function formatKcal(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }

  return `${value.toFixed(1)} kcal/天`
}

function parseMealsPerDay(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

export function resolveDogBreedName(
  profile: DogOverviewProfile | null | undefined,
  breeds: DogOverviewBreedOption[] = [],
) {
  const customBreedName = String(profile?.customBreedName || '').trim()
  if (customBreedName) {
    return customBreedName
  }

  const breedName = String(profile?.breedName || '').trim()
  if (breedName) {
    return breedName
  }

  const breedId = String(profile?.breedId || '').trim()
  if (!breedId) {
    return ''
  }

  return breeds.find(breed => breed.id === breedId)?.name || ''
}

export function resolveDogBreedLabel(
  profile: DogOverviewProfile | null | undefined,
  breeds: DogOverviewBreedOption[] = [],
) {
  return resolveDogBreedName(profile, breeds) || '未填写品种'
}

function getLifeStageLabel(lifeStage?: string | null) {
  if (!lifeStage) {
    return ''
  }

  return LIFE_STAGE_LABELS[lifeStage] || lifeStage
}

function getSizeLabel(sizeCategory?: string | null) {
  if (!sizeCategory) {
    return ''
  }

  return SIZE_LABELS[sizeCategory] || sizeCategory
}

function getActivityLevelLabel(activityLevel?: string | null) {
  if (!activityLevel) {
    return ''
  }

  return ACTIVITY_LEVEL_LABELS[activityLevel] || activityLevel
}

function getActivityLevelDescription(activityLevel?: string | null) {
  if (!activityLevel) {
    return ''
  }

  return ACTIVITY_LEVEL_DESCRIPTIONS[activityLevel] || getActivityLevelLabel(activityLevel)
}

function getBcsStatusText(score?: number | null) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return ''
  }

  if (score <= 2) return '偏瘦'
  if (score === 3) return '略瘦'
  if (score <= 5) return '标准'
  if (score <= 7) return '偏胖'
  return '肥胖'
}

export function getBcsChoiceOptions(): BcsChoiceOption[] {
  return [
    { value: 1, label: '1分', status: '偏瘦', detail: '体况系数 ×1.4' },
    { value: 2, label: '2分', status: '偏瘦', detail: '体况系数 ×1.4' },
    { value: 3, label: '3分', status: '略瘦', detail: '体况系数 ×1.2' },
    { value: 4, label: '4分', status: '标准', detail: '体况系数 ×1.0' },
    { value: 5, label: '5分', status: '标准', detail: '体况系数 ×1.0' },
    { value: 6, label: '6分', status: '偏胖', detail: '体况系数 ×0.9' },
    { value: 7, label: '7分', status: '偏胖', detail: '体况系数 ×0.8' },
    { value: 8, label: '8分', status: '肥胖', detail: '体况系数 ×0.7' },
    { value: 9, label: '9分', status: '肥胖', detail: '体况系数 ×0.6' },
  ]
}

function buildAgeDetailFromMonths(ageMonths?: number, lifeStage?: string | null) {
  if (typeof ageMonths !== 'number' || !Number.isFinite(ageMonths)) {
    return ''
  }

  if (lifeStage === 'PUPPY' || ageMonths < 12) {
    return `${ageMonths}个月`
  }

  return `${Math.floor(ageMonths / 12)}岁`
}

function resolveLifeStageInfo(
  profile: DogOverviewProfile | null | undefined,
  calcResult: DogOverviewCalcResult | null | undefined,
  now = new Date(),
): OverviewLifeStageInfo | null {
  const calcDetails = calcResult?.calcDetails
  if (calcDetails?.lifeStage) {
    return {
      label: getLifeStageLabel(calcDetails.lifeStage),
      detail: buildAgeDetailFromMonths(calcDetails.ageMonths, calcDetails.lifeStage) || calculateDogAgeText(profile?.birthday, now),
    }
  }

  if (profile?.lifeStageOverride && profile.lifeStageOverride !== 'NONE') {
    return {
      label: getLifeStageLabel(profile.lifeStageOverride),
      detail: calculateDogAgeText(profile.birthday, now),
    }
  }

  const ageText = calculateDogAgeText(profile?.birthday, now)
  return ageText
    ? {
        label: '',
        detail: ageText,
      }
    : null
}

function resolveAgeFact(
  profile: DogOverviewProfile | null | undefined,
  calcResult: DogOverviewCalcResult | null | undefined,
  now = new Date(),
): OverviewFactItem | null {
  const lifeStageInfo = resolveLifeStageInfo(profile, calcResult, now)
  const ageText = lifeStageInfo?.detail || calculateDogAgeText(profile?.birthday, now)
  if (!ageText) {
    return null
  }

  return {
    label: ageText.endsWith('个月') ? '月龄' : '年龄',
    value: ageText,
  }
}

function resolveTreatAssessment(
  profile: DogOverviewProfile | null | undefined,
  calcResult: DogOverviewCalcResult | null | undefined,
) {
  if (!profile) {
    return ''
  }

  const treatLevelLabel = TREAT_LEVEL_LABELS[resolveDogOverviewTreatLevel(profile, calcResult)] || ''
  if (!treatLevelLabel) {
    return '未填写'
  }

  return treatLevelLabel
}

function resolveTreatPercentage(
  profile: DogOverviewProfile | null | undefined,
  calcResult: DogOverviewCalcResult | null | undefined,
) {
  const calcPercentage = calcResult?.calcDetails?.treatPercentage
  if (typeof calcPercentage === 'number' && Number.isFinite(calcPercentage) && calcPercentage >= 0) {
    return calcPercentage
  }

  const manualTreatKcal = profile?.manualTreatKcal
  const totalDer = calcResult?.totalDer
  if (
    typeof manualTreatKcal === 'number' &&
    Number.isFinite(manualTreatKcal) &&
    manualTreatKcal >= 0 &&
    typeof totalDer === 'number' &&
    Number.isFinite(totalDer) &&
    totalDer > 0
  ) {
    return (manualTreatKcal / totalDer) * 100
  }

  return null
}

function resolveTreatLevelByPercentage(percentage: number | null) {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage <= 0) {
    return 'NONE'
  }

  if (percentage <= 4.5) {
    return 'LOW'
  }

  if (percentage <= 8) {
    return 'MODERATE'
  }

  return 'HIGH'
}

export function resolveDogOverviewTreatLevel(
  profile: DogOverviewProfile | null | undefined,
  calcResult: DogOverviewCalcResult | null | undefined,
) {
  if (!profile) {
    return ''
  }

  const explicitTreatLevel = String(profile.treatLevel || '').trim()
  if (explicitTreatLevel && TREAT_LEVEL_LABELS[explicitTreatLevel]) {
    return explicitTreatLevel
  }

  if (profile.treatInputMode === 'EXACT_KCAL') {
    return resolveTreatLevelByPercentage(resolveTreatPercentage(profile, calcResult))
  }

  return ''
}

export function getFeedingImpactExplanation(type: FeedingImpactExplanationType): FeedingImpactExplanation {
  const map: Record<FeedingImpactExplanationType, FeedingImpactExplanation> = {
    bcs: {
      title: 'BCS 如何影响热量',
      summary: 'BCS 会通过体况系数直接乘到总能量需求上。越偏瘦，系数越高；越偏胖，系数越低。',
      items: [
        { label: '1-2分 偏瘦', detail: '按 ×1.4 计算，会明显上调总能量需求。' },
        { label: '3分 略瘦', detail: '按 ×1.2 计算，会适度上调总能量需求。' },
        { label: '4-5分 标准', detail: '按 ×1.0 计算，保持基准热量。' },
        { label: '6分 偏胖', detail: '按 ×0.9 计算，会下调约 10% 的热量。' },
        { label: '7分 偏胖', detail: '按 ×0.8 计算，会下调约 20% 的热量。' },
        { label: '8分 肥胖', detail: '按 ×0.7 计算，会下调约 30% 的热量。' },
        { label: '9分 肥胖', detail: '按 ×0.6 计算，会下调约 40% 的热量。' },
      ],
    },
    activity: {
      title: '活动水平如何影响热量',
      summary: '活动水平会通过活动系数影响总能量需求。运动越多，所需热量越高。',
      items: [
        { label: '休息', detail: '按 ×0.8 计算，适用于几乎不运动或静养。' },
        { label: '低活动', detail: '按 ×0.9 计算，适用于偶尔散步、活动量较低。' },
        { label: '正常活动', detail: '按 ×1.0 计算，作为常规基准。' },
        { label: '高活动', detail: '按 ×1.2 计算，适用于每天运动较多的狗狗。' },
        { label: '工作犬', detail: '按 ×1.5 计算，适用于高强度训练或工作场景。' },
      ],
    },
    treat: {
      title: '零食如何影响热量',
      summary: '零食热量会先从每日总能量需求中预留出来，因此零食越多，主食热量越少。',
      items: [
        { label: '不给零食', detail: '按 0% 预留，主食可使用全部热量。' },
        { label: '较少零食', detail: '按 3% 预留，适合偶尔给小零食。' },
        { label: '适中零食', detail: '按 6% 预留，适合每天都有少量零食。' },
        { label: '较多零食', detail: '按 10% 预留，也是当前安全上限。' },
      ],
    },
  }

  return map[type]
}

export function buildDogOverviewBasicFacts(
  profile: DogOverviewProfile | null | undefined,
  calcResult: DogOverviewCalcResult | null | undefined,
  options: BuildBasicFactsOptions = {},
  now = new Date(),
) {
  if (!profile) {
    return []
  }

  const facts: OverviewFactItem[] = []
  const sizeLabel = getSizeLabel(profile.sizeClassOverride || options.breedSizeCategory)
  const ageFact = resolveAgeFact(profile, calcResult, now)
  const lifeStageInfo = resolveLifeStageInfo(profile, calcResult, now)
  const weightText = formatWeight(calcResult?.calcDetails?.weightKg ?? profile.currentWeightKg)
  const isNeutered = calcResult?.calcDetails?.isNeutered ?? profile.isNeutered

  if (sizeLabel) {
    facts.push({ label: '体型', value: sizeLabel })
  }

  if (ageFact) {
    facts.push(ageFact)
  }

  if (lifeStageInfo?.label) {
    facts.push({ label: '生命阶段', value: lifeStageInfo.label })
  }

  if (weightText) {
    facts.push({ label: '体重', value: weightText })
  }

  if (typeof isNeutered === 'boolean') {
    facts.push({ label: '是否绝育', value: isNeutered ? '已绝育' : '未绝育' })
  }

  return facts
}

export function buildDogOverviewFeedingFacts(
  profile: DogOverviewProfile | null | undefined,
  calcResult: DogOverviewCalcResult | null | undefined,
) {
  if (!profile) {
    return []
  }

  const facts: OverviewFactItem[] = []
  const bcsScore = profile.bcsScore
  const bcsStatus = getBcsStatusText(bcsScore)
  const activityLevel = getActivityLevelDescription(profile.activityLevel || calcResult?.calcDetails?.activityLevel || '')
  const mealsPerDayValue = parseMealsPerDay(profile.mealsPerDay)
  const mealsPerDay = mealsPerDayValue
    ? `${mealsPerDayValue}餐/天`
    : ''
  const treatAssessment = resolveTreatAssessment(profile, calcResult)

  if (typeof bcsScore === 'number' && Number.isFinite(bcsScore)) {
    facts.push({
      label: 'BCS体态评分',
      value: bcsStatus ? `${bcsScore}分（${bcsStatus}）` : `${bcsScore}分`,
    })
  }

  if (activityLevel) {
    facts.push({ label: '活动水平', value: activityLevel })
  }

  if (mealsPerDay) {
    facts.push({ label: '每日餐数', value: mealsPerDay })
  }

  if (treatAssessment) {
    facts.push({ label: '零食评估', value: treatAssessment })
  }

  return facts
}

export function buildDogOverviewEnergySection(
  profile: DogOverviewProfile | null | undefined,
  calcResult: DogOverviewCalcResult | null | undefined,
  now = new Date(),
): OverviewEnergySectionData | null {
  if (!profile || !calcResult) {
    return null
  }

  const lifeStageInfo = resolveLifeStageInfo(profile, calcResult, now)
  const summary = buildRecommendationSummary({
    dogName: String(profile.name || '').trim() || '喂食建议',
    ageText: lifeStageInfo?.detail || calculateDogAgeText(profile.birthday, now),
    lifeStageLabel: lifeStageInfo?.label || '',
    weightKg: calcResult.calcDetails?.weightKg ?? profile.currentWeightKg,
    rer: calcResult.rer,
    totalDer: calcResult.totalDer,
    treatDeduction: calcResult.treatDeduction,
    finalFoodKcal: calcResult.finalFoodKcal,
    isTreatCapped: calcResult.isTreatCapped,
    calcDetails: calcResult.calcDetails
      ? {
          weightKg: calcResult.calcDetails.weightKg ?? profile.currentWeightKg ?? 0,
          lifeStage: calcResult.calcDetails.lifeStage,
          stageFactor: calcResult.calcDetails.stageFactor,
          bcsMultiplier: calcResult.calcDetails.bcsMultiplier,
          isNeutered: calcResult.calcDetails.isNeutered,
          activityLevel: calcResult.calcDetails.activityLevel,
          treatPercentage: calcResult.calcDetails.treatPercentage,
        }
      : null,
  })

  return {
    badges: calcResult.isTreatCapped ? ['零食已封顶'] : [],
    metrics: summary.cards.map(card => ({
      label: card.label,
      value: card.value,
      hint: card.summary,
      emphasis: card.emphasis,
    })),
    note: summary.note,
  }
}

export function buildDogOverviewHealthSummary(profile: DogOverviewProfile | null | undefined) {
  if (!profile) {
    return '查看病史、体检、过敏与挑食信息'
  }

  const medicalCount = Array.isArray(profile.medicalRecords) ? profile.medicalRecords.length : 0
  const checkupCount = Array.isArray(profile.checkupRecords) ? profile.checkupRecords.length : 0
  const allergyCount = Array.isArray(profile.allergyRecords) ? profile.allergyRecords.length : 0
  const hasPickyFoods = Boolean(String(profile.pickyFoods || '').trim())

  if (medicalCount === 0 && checkupCount === 0 && allergyCount === 0 && !hasPickyFoods) {
    return '查看病史、体检、过敏与挑食信息'
  }

  const parts = [
    `病史${medicalCount}条`,
    `体检${checkupCount}条`,
    `过敏${allergyCount}条`,
  ]

  if (hasPickyFoods) {
    parts.push('已填写挑食提醒')
  }

  return parts.join(' · ')
}

export function buildDogOverviewHealthFacts(
  profile: DogOverviewProfile | null | undefined,
): OverviewHealthFact[] {
  const medicalCount = Array.isArray(profile?.medicalRecords) ? profile!.medicalRecords!.length : 0
  const checkupCount = Array.isArray(profile?.checkupRecords) ? profile!.checkupRecords!.length : 0
  const allergyCount = Array.isArray(profile?.allergyRecords) ? profile!.allergyRecords!.length : 0
  const pickyFoods = String(profile?.pickyFoods || '').trim()

  return [
    { label: '病史记录', value: `${medicalCount}条` },
    { label: '体检记录', value: `${checkupCount}条` },
    { label: '过敏记录', value: `${allergyCount}条` },
    { label: '饮食提醒', value: pickyFoods ? '已填写挑食提醒' : '暂未填写' },
  ]
}

export function hasDietReminderChanges(
  currentPickyFoods?: string | null,
  savedPickyFoods?: string | null,
) {
  return String(currentPickyFoods || '').trim() !== String(savedPickyFoods || '').trim()
}
