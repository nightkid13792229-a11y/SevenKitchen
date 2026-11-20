/**
 * 建档流程状态的单测：两步（建档 → 上架），能不能进只看产物。
 */
import { describe, expect, it } from 'vitest'
import {
  FLOW_STORAGE_KEY,
  canEnter,
  clearSnapshot,
  emptyFlowState,
  goTo,
  loadSnapshot,
  saveSnapshot,
  type SimpleStorage,
  type SupplementFlowState
} from './supplementFlowState'

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

function savedState(): SupplementFlowState {
  return {
    ...emptyFlowState(),
    saved: { ingredientId: 'i', nutritionFoodId: 'f', evidenceId: 'e' }
  }
}

describe('canEnter', () => {
  it('第 1 步永远能进', () => {
    expect(canEnter(emptyFlowState(), 1)).toBe(true)
  })

  it('没写入成功，不能进上架', () => {
    expect(canEnter(emptyFlowState(), 2)).toBe(false)
    expect(canEnter(savedState(), 2)).toBe(true)
  })

  it('进不去就原地不动', () => {
    const state = emptyFlowState()
    expect(goTo(state, 2)).toBe(state)
  })
})

describe('快照', () => {
  it('能存能读（含选品依据）', () => {
    const storage = memoryStorage()
    const state = { ...savedState(), step: 2 as const, selectionNote: '形态=无机盐' }
    saveSnapshot(state, storage)
    expect(loadSnapshot(storage)?.step).toBe(2)
    expect(loadSnapshot(storage)?.selectionNote).toBe('形态=无机盐')
  })

  it('坏数据当没有', () => {
    const storage = memoryStorage()
    storage.setItem(FLOW_STORAGE_KEY, '{not json')
    expect(loadSnapshot(storage)).toBeNull()
    storage.setItem(FLOW_STORAGE_KEY, JSON.stringify({ step: 9 }))
    expect(loadSnapshot(storage)).toBeNull()
  })

  it('老快照（三步/四步）直接丢弃，不炸在 undefined 上', () => {
    const storage = memoryStorage()
    storage.setItem(FLOW_STORAGE_KEY, JSON.stringify({ step: 3, nutrientLabel: '铜' }))
    expect(loadSnapshot(storage)).toBeNull()
  })

  it('清除后读不到', () => {
    const storage = memoryStorage()
    saveSnapshot(emptyFlowState(), storage)
    clearSnapshot(storage)
    expect(loadSnapshot(storage)).toBeNull()
  })
})
