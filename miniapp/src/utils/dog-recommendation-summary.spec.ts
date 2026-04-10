import { describe, expect, it } from 'vitest'
import { buildRecommendationSummary } from './dog-recommendation-summary'

describe('dog-recommendation-summary', () => {
  it('builds create recommendation cards in the expected order without daily intake', () => {
    const summary = buildRecommendationSummary({
      dogName: '七七',
      ageText: '11个月',
      lifeStageLabel: '幼犬期',
      weightKg: 12,
      rer: 450.1,
      totalDer: 780.5,
      treatDeduction: 46.8,
      finalFoodKcal: 733.7,
      isTreatCapped: false,
      calcDetails: {
        weightKg: 12,
        lifeStage: 'PUPPY',
        stageFactor: 1.8,
        bcsMultiplier: 1,
        isNeutered: false,
        activityLevel: 'NORMAL',
        treatPercentage: 6,
      },
    })

    expect(summary.heading).toBe('七七')
    expect(summary.meta).toEqual(['11个月', '幼犬期', '12kg'])
    expect(summary.cards.map(card => card.label)).toEqual([
      '总能量需求',
      '零食能量',
      '每日主食热量',
    ])
    expect(summary.cards.some(card => card.label.includes('喂食量'))).toBe(false)
    expect(summary.cards[2]?.emphasis).toBe('strong')
  })

  it('provides a calibration note that frames the result as a first estimate', () => {
    const summary = buildRecommendationSummary({
      dogName: '七七',
      ageText: '11个月',
      lifeStageLabel: '幼犬期',
      weightKg: 12,
      totalDer: 780.5,
      treatDeduction: 46.8,
      finalFoodKcal: 733.7,
      calcDetails: {
        weightKg: 12,
        lifeStage: 'PUPPY',
        stageFactor: 1.8,
        bcsMultiplier: 1,
        isNeutered: false,
        activityLevel: 'NORMAL',
        treatPercentage: 6,
      },
    })

    expect(summary.note.title).toBe('喂食建议说明')
    expect(summary.note.body).toContain('首次喂养参考值')
    expect(summary.note.body).toContain('体重和体态变化')
  })

  it('normalizes growth life-stage labels into Chinese in recommendation meta', () => {
    const summary = buildRecommendationSummary({
      dogName: 'Star',
      ageText: '1岁',
      lifeStageLabel: 'GROWTH',
      weightKg: 12.5,
      totalDer: 780.5,
      treatDeduction: 46.8,
      finalFoodKcal: 733.7,
      calcDetails: {
        weightKg: 12.5,
        lifeStage: 'GROWTH',
        stageFactor: 1.8,
        bcsMultiplier: 1,
        isNeutered: false,
        activityLevel: 'NORMAL',
        treatPercentage: 6,
      },
    })

    expect(summary.meta).toEqual(['1岁', '生长期', '12.5kg'])
  })
})
