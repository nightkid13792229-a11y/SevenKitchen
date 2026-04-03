import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearDogProfileDraft,
  loadDogProfileDraft,
  saveDogProfileDraft,
} from './dog-profile-draft'

const storage = new Map<string, any>()

vi.stubGlobal('uni', {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: any) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
})

describe('dog-profile-draft', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('round-trips a create draft by customer id', () => {
    saveDogProfileDraft('customer-a', 'create', {
      step: 'feeding',
      form: { name: '七七', currentWeightKg: '11.5' },
    })

    expect(loadDogProfileDraft('customer-a', 'create')).toEqual({
      step: 'feeding',
      form: { name: '七七', currentWeightKg: '11.5' },
    })
  })

  it('clears an edit draft without touching other drafts', () => {
    saveDogProfileDraft('customer-a', 'edit:dog-1', {
      step: 'feeding',
      form: { currentWeightKg: '10.2' },
    })
    saveDogProfileDraft('customer-a', 'create', {
      step: 'basic',
      form: { name: '七七' },
    })

    clearDogProfileDraft('customer-a', 'edit:dog-1')

    expect(loadDogProfileDraft('customer-a', 'edit:dog-1')).toBeNull()
    expect(loadDogProfileDraft('customer-a', 'create')).toEqual({
      step: 'basic',
      form: { name: '七七' },
    })
  })
})
