/**
 * 健康管理页顶部 Banner 的"狗狗基本信息"（2026-10-01）。
 *
 * 老板要求：Banner 左侧放头像 + 名字，右侧显示**年龄、性别、品种、体重**四项。
 * 为什么把算法单独放一个文件：这四项各自都有"数据缺失"的情况
 * （没填生日、没选品种、没称过体重），缺哪项就不显示哪项 ——
 * 这种规则写在模板里既不好读也测不到，放这儿可以逐条测。
 */
import { calculateDogAgeText, resolveDogBreedName } from './dog-profile-overview'

export interface HealthHeroFact {
  label: string
  value: string
}

/** 与建档页、爱犬概览页保持同一套说法（弟弟 / 妹妹），不要在这里另起一套 */
const GENDER_LABELS: Record<string, string> = {
  MALE: '弟弟',
  FEMALE: '妹妹',
}

/** 体重文案：12kg / 12.5kg；不是有效数字就返回空串（不显示这一项） */
export function formatHealthHeroWeight(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : value
  const weight = typeof text === 'number' ? text : Number(text)

  if (!Number.isFinite(weight) || weight <= 0) {
    return ''
  }

  return Number.isInteger(weight) ? `${weight}kg` : `${weight.toFixed(1)}kg`
}

/**
 * 生成 Banner 右侧要显示的基本信息。
 *
 * 顺序固定为 年龄 → 性别 → 品种 → 体重（老板点名的顺序），
 * 缺数据的项直接跳过，不显示"未填写"这类占位 —— Banner 是门面，不放大段空白。
 */
export function buildHealthHeroFacts(
  profile: Record<string, any> | null | undefined,
  options: { now?: Date } = {},
): HealthHeroFact[] {
  const facts: HealthHeroFact[] = []
  const now = options.now ?? new Date()

  const ageText = calculateDogAgeText(profile?.birthday, now)
  if (ageText) {
    facts.push({ label: '年龄', value: ageText })
  }

  const gender = String(profile?.gender || '').trim().toUpperCase()
  const genderLabel = GENDER_LABELS[gender]
  if (genderLabel) {
    facts.push({ label: '性别', value: genderLabel })
  }

  const breedName = resolveDogBreedName(profile)
  if (breedName) {
    facts.push({ label: '品种', value: breedName })
  }

  const weightText = formatHealthHeroWeight(profile?.currentWeightKg)
  if (weightText) {
    facts.push({ label: '体重', value: weightText })
  }

  return facts
}
