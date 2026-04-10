import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCachedDogs,
  removeDogFromCache,
  setCachedDogs,
} from './dog-cache'

const storage = new Map<string, any>()

vi.stubGlobal('uni', {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: any) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
})

describe('dog-cache', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('removes the deleted dog from cache without disturbing the others', () => {
    setCachedDogs([
      { id: 'dog-1', name: 'Seven' },
      { id: 'dog-2', name: 'Lucky' },
    ])

    removeDogFromCache('dog-1')

    expect(getCachedDogs()).toEqual([{ id: 'dog-2', name: 'Lucky' }])
  })
})
