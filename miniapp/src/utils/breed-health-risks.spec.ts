import { describe, expect, it } from 'vitest'
import {
  canRequestBreedHealthRisks,
  getBreedHealthAttentionLabel,
  getBreedHealthSourceTypeLabel,
  isBreedHealthRiskEndpointUnavailable,
  normalizeBreedHealthRiskResponse,
  resolveBreedHealthRiskEmptyText,
} from './breed-health-risks'

describe('breed-health-risks helpers', () => {
  it('maps attention priorities to product labels', () => {
    expect(getBreedHealthAttentionLabel('KEY_ATTENTION')).toBe('重点关注')
    expect(getBreedHealthAttentionLabel('RECOMMENDED_AWARENESS')).toBe(
      '建议了解',
    )
    expect(getBreedHealthAttentionLabel('SUPPLEMENTAL_AWARENESS')).toBe(
      '补充了解',
    )
    expect(getBreedHealthAttentionLabel('UNKNOWN')).toBe('补充了解')
  })

  it('maps source types to readable Chinese labels', () => {
    expect(getBreedHealthSourceTypeLabel('OFA_CHIC')).toBe(
      'OFA/CHIC 健康筛查资料',
    )
    expect(getBreedHealthSourceTypeLabel('BREED_CLUB')).toBe('犬种俱乐部资料')
    expect(getBreedHealthSourceTypeLabel('VETERINARY_LITERATURE')).toBe(
      '兽医/研究机构资料',
    )
    expect(getBreedHealthSourceTypeLabel('UNKNOWN')).toBe('其他资料')
  })

  it('normalizes wrapped backend responses into safe display data', () => {
    const normalized = normalizeBreedHealthRiskResponse({
      data: {
        breed: { id: 'breed-1', name: '金毛' },
        risks: [
          {
            id: 'risk-1',
            conditionId: 'condition-1',
            conditionName: '髋关节发育不良',
            category: '骨骼关节',
            attentionPriority: 'KEY_ATTENTION',
            oneLineSummary: '该品种资料中较常被提及。',
            commonSigns: ['后肢跛行'],
            sourceCount: 1,
            sources: [
              {
                sourceType: 'OFA_CHIC',
                sourceName: 'OFA CHIC',
                title: 'Breed screening recommendation',
                url: 'https://ofa.org/diseases/',
                accessedAt: '2026-05-17',
              },
            ],
          },
        ],
      },
    })

    expect(normalized.breedName).toBe('金毛')
    expect(normalized.risks[0].attentionLabel).toBe('重点关注')
    expect(normalized.risks[0].sources[0].sourceName).toBe('OFA CHIC')
    expect(normalized.risks[0].sources[0].sourceTypeLabel).toBe(
      'OFA/CHIC 健康筛查资料',
    )
  })

  it('only requests standard breeds', () => {
    expect(
      canRequestBreedHealthRisks({ breedId: 'breed-1', customBreedName: '' }),
    ).toBe(true)
    expect(
      canRequestBreedHealthRisks({
        breedId: '00000000-0000-0000-0000-000000000000',
        customBreedName: '串串',
      }),
    ).toBe(false)
    expect(
      canRequestBreedHealthRisks({ breedId: '', customBreedName: '' }),
    ).toBe(false)
  })

  it('uses cautious empty-state copy', () => {
    expect(resolveBreedHealthRiskEmptyText('mixed')).toContain(
      '混血/手动填写品种',
    )
    expect(resolveBreedHealthRiskEmptyText('no-data')).toContain('暂未收录')
    expect(resolveBreedHealthRiskEmptyText('unavailable')).toContain(
      '资料库正在同步',
    )
  })

  it('detects backend versions that do not expose the health risk endpoint yet', () => {
    expect(
      isBreedHealthRiskEndpointUnavailable(
        new Error('Cannot GET /api/v1/dogs/breeds/breed-1/health-risks'),
      ),
    ).toBe(true)
    expect(
      isBreedHealthRiskEndpointUnavailable(
        new Error('GET /api/v1/dogs/breeds/breed-1/health-risks 404'),
      ),
    ).toBe(true)
    expect(
      isBreedHealthRiskEndpointUnavailable(new Error('未找到该品种')),
    ).toBe(false)
  })
})
