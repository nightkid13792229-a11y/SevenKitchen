import { describe, expect, it } from 'vitest'
import {
  buildDogOverviewBasicFacts,
  buildDogOverviewEnergySection,
  buildDogOverviewFeedingFacts,
  buildDogOverviewHealthFacts,
  hasDietReminderChanges,
  getBcsChoiceOptions,
  getFeedingImpactExplanation,
  buildDogOverviewHealthSummary,
  resolveDogBreedLabel,
  resolveDogBreedName,
} from './dog-profile-overview'

describe('dog-profile-overview', () => {
  const now = new Date('2026-04-06T00:00:00.000Z')

  it('builds basic facts with size, age, life stage, weight, and neutered status', () => {
    const facts = buildDogOverviewBasicFacts(
      {
        birthday: '2023-04-06T00:00:00.000Z',
        currentWeightKg: 5,
        isNeutered: true,
      },
      {
        totalDer: 466.4,
        treatDeduction: 14,
        finalFoodKcal: 452.4,
        calcDetails: {
          weightKg: 5,
          ageMonths: 36,
          lifeStage: 'ADULT',
          stageFactor: 1.6,
          bcsMultiplier: 1,
          isNeutered: true,
          activityLevel: 'NORMAL',
          treatPercentage: 3,
        },
      },
      {
        breedSizeCategory: 'SMALL',
      },
      now,
    )

    expect(facts).toEqual([
      { label: '体型', value: '小型犬' },
      { label: '年龄', value: '3岁' },
      { label: '生命阶段', value: '成年期' },
      { label: '体重', value: '5kg' },
      { label: '是否绝育', value: '已绝育' },
    ])
  })

  it('builds feeding facts with bcs, activity, meals, and treat assessment', () => {
    const facts = buildDogOverviewFeedingFacts(
      {
        bcsScore: 5,
        activityLevel: 'NORMAL',
        mealsPerDay: 2,
        treatInputMode: 'ESTIMATE_LEVEL',
        treatLevel: 'LOW',
      },
      {
        totalDer: 466.4,
        treatDeduction: 14,
        finalFoodKcal: 452.4,
        calcDetails: {
          weightKg: 5,
          ageMonths: 36,
          lifeStage: 'ADULT',
          stageFactor: 1.6,
          bcsMultiplier: 1,
          isNeutered: true,
          activityLevel: 'NORMAL',
          treatPercentage: 3,
        },
      },
    )

    expect(facts).toEqual([
      { label: 'BCS体态评分', value: '5分（标准）' },
      { label: '活动水平', value: '每日散步1-2小时，正常活动量' },
      { label: '每日餐数', value: '2餐/天' },
      { label: '零食评估', value: '较少零食' },
    ])
  })

  it('shows meals when overview form stores mealsPerDay as a string', () => {
    const facts = buildDogOverviewFeedingFacts(
      {
        bcsScore: 5,
        activityLevel: 'LOW',
        mealsPerDay: '3' as unknown as number,
        treatInputMode: 'ESTIMATE_LEVEL',
        treatLevel: 'MODERATE',
      },
      null,
    )

    expect(facts).toEqual([
      { label: 'BCS体态评分', value: '5分（标准）' },
      { label: '活动水平', value: '偶尔散步，每日运动少于30分钟' },
      { label: '每日餐数', value: '3餐/天' },
      { label: '零食评估', value: '适中零食' },
    ])
  })

  it('maps exact treat kcal back to a qualitative treat assessment in overview', () => {
    const facts = buildDogOverviewFeedingFacts(
      {
        bcsScore: 4,
        activityLevel: 'NORMAL',
        mealsPerDay: 2,
        treatInputMode: 'EXACT_KCAL',
        manualTreatKcal: 18,
      },
      {
        totalDer: 300,
        treatDeduction: 18,
        finalFoodKcal: 282,
        calcDetails: {
          weightKg: 5,
          ageMonths: 36,
          lifeStage: 'ADULT',
          stageFactor: 1.6,
          bcsMultiplier: 1,
          isNeutered: true,
          activityLevel: 'NORMAL',
          treatPercentage: 6,
        },
      },
    )

    expect(facts.at(-1)).toEqual({ label: '零食评估', value: '适中零食' })
  })

  it('builds energy section with the same three energy cards as the create flow', () => {
    const energySection = buildDogOverviewEnergySection(
      {
        name: 'Seven',
        birthday: '2023-04-06T00:00:00.000Z',
        currentWeightKg: 5,
      },
      {
        rer: 291.5,
        totalDer: 466.4,
        treatDeduction: 14,
        finalFoodKcal: 452.4,
        isTreatCapped: false,
        calcDetails: {
          weightKg: 5,
          ageMonths: 36,
          lifeStage: 'ADULT',
          stageFactor: 1.6,
          bcsMultiplier: 1,
          isNeutered: true,
          activityLevel: 'NORMAL',
          treatPercentage: 3,
        },
      },
      now,
    )

    expect(energySection?.metrics.map(metric => metric.label)).toEqual([
      '总能量需求',
      '零食能量',
      '每日主食热量',
    ])
    expect(energySection?.metrics.some(metric => metric.label.includes('饭量'))).toBe(false)
    expect(energySection?.note.title).toBe('喂食建议说明')
    expect(energySection?.badges).toEqual([])
  })

  it('builds a compact health summary for the secondary entry card', () => {
    const summary = buildDogOverviewHealthSummary({
      medicalRecords: [{ chiefComplaint: '腹泻' }],
      checkupRecords: [{ checkupType: '年度体检' }, { checkupType: '皮肤检查' }],
      allergyRecords: [],
      pickyFoods: '西兰花',
    })

    expect(summary).toBe('病史1条 · 体检2条 · 过敏0条 · 已填写挑食提醒')
  })

  it('builds health facts for the overview card without relying on legacy allergyFoods', () => {
    const facts = buildDogOverviewHealthFacts({
      medicalRecords: [{ chiefComplaint: '腹泻' }, { chiefComplaint: '皮肤红点' }],
      checkupRecords: [{ checkupType: '年度体检' }],
      allergyRecords: [{ allergen: '鸡肉' }],
      allergyFoods: '鸡肉',
      pickyFoods: '西兰花',
    })

    expect(facts).toEqual([
      { label: '病史记录', value: '2条' },
      { label: '体检记录', value: '1条' },
      { label: '过敏记录', value: '1条' },
      { label: '饮食提醒', value: '已填写挑食提醒' },
    ])
  })

  it('detects diet reminder changes from saved content', () => {
    expect(hasDietReminderChanges('西兰花、胡萝卜', '西兰花、胡萝卜')).toBe(false)
    expect(hasDietReminderChanges('西兰花、胡萝卜 ', '西兰花、胡萝卜')).toBe(false)
    expect(hasDietReminderChanges('', '')).toBe(false)
    expect(hasDietReminderChanges('南瓜', '')).toBe(true)
    expect(hasDietReminderChanges('', '南瓜')).toBe(true)
  })

  it('maps growth life stage to a localized label in overview facts', () => {
    const facts = buildDogOverviewBasicFacts(
      {
        birthday: '2025-10-01T00:00:00.000Z',
        currentWeightKg: 3.7,
        isNeutered: false,
      },
      {
        totalDer: 386.4,
        treatDeduction: 11.6,
        finalFoodKcal: 374.8,
        calcDetails: {
          weightKg: 3.7,
          ageMonths: 6,
          lifeStage: 'GROWTH',
          stageFactor: 2.5,
          bcsMultiplier: 1,
          isNeutered: false,
          activityLevel: 'LOW',
          treatPercentage: 3,
        },
      },
      {
        breedSizeCategory: 'SMALL',
      },
      new Date('2026-04-07T00:00:00.000Z'),
    )

    expect(facts).toContainEqual({ label: '生命阶段', value: '生长期' })
  })

  it('falls back to breed metadata when profile response does not include breedName', () => {
    expect(resolveDogBreedName(
      {
        breedId: 'breed-1',
        breedName: '',
        customBreedName: '',
      },
      [{ id: 'breed-1', name: '雪纳瑞（迷你）' }],
    )).toBe('雪纳瑞（迷你）')

    expect(resolveDogBreedLabel(
      {
        breedId: 'breed-1',
        breedName: '',
        customBreedName: '',
      },
      [{ id: 'breed-1', name: '雪纳瑞（迷你）' }],
    )).toBe('雪纳瑞（迷你）')
  })

  it('builds direct bcs choice options with score state and multiplier hints', () => {
    expect(getBcsChoiceOptions()).toEqual([
      { value: 1, label: '1分', status: '偏瘦', detail: '体况系数 ×1.4' },
      { value: 2, label: '2分', status: '偏瘦', detail: '体况系数 ×1.4' },
      { value: 3, label: '3分', status: '略瘦', detail: '体况系数 ×1.2' },
      { value: 4, label: '4分', status: '标准', detail: '体况系数 ×1.0' },
      { value: 5, label: '5分', status: '标准', detail: '体况系数 ×1.0' },
      { value: 6, label: '6分', status: '偏胖', detail: '体况系数 ×0.9' },
      { value: 7, label: '7分', status: '偏胖', detail: '体况系数 ×0.8' },
      { value: 8, label: '8分', status: '肥胖', detail: '体况系数 ×0.7' },
      { value: 9, label: '9分', status: '肥胖', detail: '体况系数 ×0.6' },
    ])
  })

  it('builds detailed energy impact explanations for feeding inputs', () => {
    expect(getFeedingImpactExplanation('bcs')).toEqual({
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
    })
    expect(getFeedingImpactExplanation('activity')).toEqual({
      title: '活动水平如何影响热量',
      summary: '活动水平会通过活动系数影响总能量需求。运动越多，所需热量越高。',
      items: [
        { label: '休息', detail: '按 ×0.8 计算，适用于几乎不运动或静养。' },
        { label: '低活动', detail: '按 ×0.9 计算，适用于偶尔散步、活动量较低。' },
        { label: '正常活动', detail: '按 ×1.0 计算，作为常规基准。' },
        { label: '高活动', detail: '按 ×1.2 计算，适用于每天运动较多的狗狗。' },
        { label: '工作犬', detail: '按 ×1.5 计算，适用于高强度训练或工作场景。' },
      ],
    })
    expect(getFeedingImpactExplanation('treat')).toEqual({
      title: '零食如何影响热量',
      summary: '零食热量会先从每日总能量需求中预留出来，因此零食越多，主食热量越少。',
      items: [
        { label: '不给零食', detail: '按 0% 预留，主食可使用全部热量。' },
        { label: '较少零食', detail: '按 3% 预留，适合偶尔给小零食。' },
        { label: '适中零食', detail: '按 6% 预留，适合每天都有少量零食。' },
        { label: '较多零食', detail: '按 10% 预留，也是当前安全上限。' },
      ],
    })
  })
})
