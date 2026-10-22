import { describe, expect, it } from 'vitest'
import { createEmptyNutritionProfile } from '@/utils/recipeDesigner/nutritionProfileUtils'
import type { NutritionProfileV2 } from '@/utils/recipeDesigner/nutritionProfileTypes'
import {
  computeSupplementTargetConcentration,
  formatSupplementTargetConcentration,
  listSupplementTargetFieldCandidates,
  normalizeSupplementTargetDefinitions,
  readDefaultSupplementTargets,
  resolveSupplementTargetDefinition,
  resolveSupplementTargetFieldPath
} from '@/utils/recipeDesigner/supplementTargets'

function buildProfile(
  mutate: (profile: NutritionProfileV2) => void,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile()
  profile.meta.rawBasisType = 'PER_100_G'
  mutate(profile)
  return profile
}

describe('补剂目标营养素 · 营养字段选择', () => {
  it('只列出非空且大于 0 的字段', () => {
    const profile = buildProfile((draft) => {
      draft.macros.fiber = 90
      draft.macros.crudeProtein = 0
      draft.minerals.calcium = 200
    })

    const candidates = listSupplementTargetFieldCandidates(profile)
    const paths = candidates.map((candidate) => candidate.fieldPath)

    expect(paths).toContain('macros.fiber')
    expect(paths).toContain('minerals.calcium')
    expect(paths).not.toContain('macros.crudeProtein')
    expect(paths).not.toContain('macros.moisture')
    expect(candidates.find((item) => item.fieldPath === 'macros.fiber')?.valueText)
      .toContain('90')
  })

  it('包含派生组合字段（EPA + DHA），且只有在来源字段齐全时才出现', () => {
    const partialProfile = buildProfile((draft) => {
      draft.fattyAcids.epa = 100
    })
    expect(
      listSupplementTargetFieldCandidates(partialProfile).some(
        (candidate) => candidate.fieldPath === 'derived.epaDha'
      )
    ).toBe(false)

    const completeProfile = buildProfile((draft) => {
      draft.fattyAcids.epa = 100
      draft.fattyAcids.dha = 200
    })
    const derivedCandidate = listSupplementTargetFieldCandidates(
      completeProfile
    ).find((candidate) => candidate.fieldPath === 'derived.epaDha')

    expect(derivedCandidate).toBeTruthy()
    expect(derivedCandidate?.label).toBe('EPA + DHA')
    expect(derivedCandidate?.unit).toBe('mg')
    expect(derivedCandidate?.value).toBe(300)
    expect(derivedCandidate?.source).toBe('DERIVED')
  })

  it('兼容历史扁平字段表：档案里有值时仍能选出目标', () => {
    const candidates = listSupplementTargetFieldCandidates({
      fiber: { value: 90, unit: 'g' },
      calcium: 200
    })
    const paths = candidates.map((candidate) => candidate.fieldPath)

    expect(paths).toContain('macros.fiber')
    expect(paths).toContain('minerals.calcium')
  })

  it('比例类派生字段（钙磷比）不作为补剂目标', () => {
    const profile = buildProfile((draft) => {
      draft.minerals.calcium = 1000
      draft.minerals.phosphorus = 800
    })

    const paths = listSupplementTargetFieldCandidates(profile).map(
      (candidate) => candidate.fieldPath
    )
    expect(paths).not.toContain('derived.caP')
  })

  it('默认目标按字段目录归一化并去重，未知字段不展示', () => {
    const defaults = readDefaultSupplementTargets({
      defaultSupplementTargets: [
        { fieldPath: 'macros.fiber', label: '旧标签', unit: 'g' },
        { fieldPath: 'macros.fiber', label: '重复' },
        { fieldPath: 'unknown.field', label: '未知' },
        { fieldPath: 'derived.epaDha', label: 'EPA+DHA', unit: 'mg' }
      ]
    })

    expect(defaults).toEqual([
      { fieldPath: 'macros.fiber', label: '膳食纤维', unit: 'g' },
      { fieldPath: 'derived.epaDha', label: 'EPA + DHA', unit: 'mg' }
    ])
    expect(normalizeSupplementTargetDefinitions(defaults)).toHaveLength(2)
  })

  it('可以把评估指标 key 解析成 fieldPath，供智能添加预选', () => {
    expect(resolveSupplementTargetFieldPath('calcium')).toBe(
      'minerals.calcium'
    )
    expect(resolveSupplementTargetFieldPath('epaDha')).toBe('derived.epaDha')
    expect(resolveSupplementTargetFieldPath('未知指标')).toBeNull()
    expect(resolveSupplementTargetDefinition('derived.epaDha')).toEqual({
      fieldPath: 'derived.epaDha',
      label: 'EPA + DHA',
      unit: 'mg'
    })
  })
})

describe('补剂添加浓度 · 每 kg 配方', () => {
  it('按 目标营养素贡献量 ÷ 配方总重量 × 1000 计算', () => {
    const profile = buildProfile((draft) => {
      draft.macros.fiber = 90
    })

    // 补剂 20g，纤维 90g/100g → 18g；配方总重 1000g → 18g/kg
    const concentration = computeSupplementTargetConcentration(
      profile,
      'macros.fiber',
      20,
      1000
    )
    expect(concentration).toBe(18)
  })

  it('派生组合字段按来源字段求和后计算浓度', () => {
    const profile = buildProfile((draft) => {
      draft.fattyAcids.epa = 100
      draft.fattyAcids.dha = 200
    })

    // 10g 补剂 → EPA 10mg + DHA 20mg = 30mg；总重 500g → 60mg/kg
    const concentration = computeSupplementTargetConcentration(
      profile,
      'derived.epaDha',
      10,
      500
    )
    expect(concentration).toBe(60)
  })

  it('总重量未知 / 字段缺失时返回 null，不按 0 处理', () => {
    const profile = buildProfile((draft) => {
      draft.macros.fiber = 90
    })

    expect(
      computeSupplementTargetConcentration(profile, 'macros.fiber', 20, null)
    ).toBeNull()
    expect(
      computeSupplementTargetConcentration(profile, 'macros.fiber', 20, 0)
    ).toBeNull()
    expect(
      computeSupplementTargetConcentration(profile, 'minerals.zinc', 20, 1000)
    ).toBeNull()
    expect(
      computeSupplementTargetConcentration(null, 'macros.fiber', 20, 1000)
    ).toBeNull()
  })

  it('浓度展示带目标标签与单位', () => {
    expect(
      formatSupplementTargetConcentration(
        { fieldPath: 'derived.epaDha', label: 'EPA + DHA', unit: 'mg' },
        60
      )
    ).toBe('EPA + DHA 60 mg/kg')
    expect(
      formatSupplementTargetConcentration(
        { fieldPath: 'macros.fiber', label: '膳食纤维', unit: 'g' },
        null
      )
    ).toBe('膳食纤维 缺数据')
  })
})
