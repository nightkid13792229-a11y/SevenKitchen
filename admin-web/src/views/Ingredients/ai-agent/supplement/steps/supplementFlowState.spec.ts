/**
 * 三步流程状态的单测：进得去进不去，只看产物。
 */
import { describe, expect, it } from 'vitest'
import {
  FLOW_STORAGE_KEY,
  canEnter,
  clearSnapshot,
  effectiveForm,
  emptyFlowState,
  goTo,
  loadSnapshot,
  saveSnapshot,
  type SimpleStorage,
  type SupplementFlowState
} from './supplementFlowState'
import type { SupplementDimensionsAdviceDto } from '@/types/ingredientCreation'

function memoryStorage(): SimpleStorage & { dump: Map<string, string> } {
  const dump = new Map<string, string>()
  return {
    dump,
    getItem: (key) => dump.get(key) ?? null,
    setItem: (key, value) => {
      dump.set(key, value)
    },
    removeItem: (key) => {
      dump.delete(key)
    }
  }
}

function withAdvice(): SupplementFlowState {
  const advice: SupplementDimensionsAdviceDto = {
    nutrientKey: 'minerals.copper',
    nutrientLabel: '铜',
    dimensions: [
      {
        key: 'FORM',
        label: '形态',
        candidates: [
          {
            key: 'coppersulfate',
            labelZh: '硫酸铜',
            dimension: 'FORM',
            status: 'EVIDENCED',
            citations: [],
            verdict: 'ACCEPTABLE',
            reason: '测试',
            market: null
          }
        ]
      }
    ],
    recommendation: { dimensionKey: 'FORM', candidateKey: 'coppersulfate' },
    gaps: []
  }
  return { ...emptyFlowState(), formAdvice: advice }
}

describe('canEnter', () => {
  it('没有形态结论，不能进第 2 步', () => {
    expect(canEnter(emptyFlowState(), 2)).toBe(false)
    expect(canEnter(withAdvice(), 2)).toBe(true)
  })

  it('推荐但没点过，也能进第 2 步（推荐即默认选中）', () => {
    expect(effectiveForm(withAdvice())?.candidateKey).toBe('coppersulfate')
  })

  it('没有选中商品，不能进第 3 步', () => {
    expect(canEnter(withAdvice(), 3)).toBe(false)
    expect(canEnter({ ...withAdvice(), chosenOfferUrl: 'u' }, 3)).toBe(true)
  })

  it('没写入成功，不能进第 4 步', () => {
    const state = { ...withAdvice(), chosenOfferUrl: 'u' }
    expect(canEnter(state, 4)).toBe(false)
    expect(
      canEnter(
        { ...state, saved: { ingredientId: 'i', nutritionFoodId: 'f', evidenceId: 'e' } },
        4
      )
    ).toBe(true)
  })

  it('进不去就原地不动', () => {
    const state = emptyFlowState()
    expect(goTo(state, 3)).toBe(state)
  })
})

describe('快照', () => {
  it('能存能读', () => {
    const storage = memoryStorage()
    const state = { ...withAdvice(), step: 2 as const }
    saveSnapshot(state, storage)
    expect(loadSnapshot(storage)?.step).toBe(2)
    expect(loadSnapshot(storage)?.formAdvice?.recommendation?.candidateKey).toBe('coppersulfate')
  })

  it('坏数据当没有', () => {
    const storage = memoryStorage()
    storage.setItem(FLOW_STORAGE_KEY, '{not json')
    expect(loadSnapshot(storage)).toBeNull()
    storage.setItem(FLOW_STORAGE_KEY, JSON.stringify({ step: 9 }))
    expect(loadSnapshot(storage)).toBeNull()
  })

  it('老快照缺字段时补默认值，不炸在 undefined 上', () => {
    const storage = memoryStorage()
    storage.setItem(FLOW_STORAGE_KEY, JSON.stringify({ step: 1, nutrientLabel: '锌' }))
    const restored = loadSnapshot(storage)
    expect(restored?.nutrientLabel).toBe('锌')
    expect(restored?.archive.servingNutrients).toEqual({})
  })

  it('清除后读不到', () => {
    const storage = memoryStorage()
    saveSnapshot(emptyFlowState(), storage)
    clearSnapshot(storage)
    expect(loadSnapshot(storage)).toBeNull()
  })
})
