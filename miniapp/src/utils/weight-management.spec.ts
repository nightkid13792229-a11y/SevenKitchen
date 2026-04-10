import { describe, expect, it } from 'vitest'
import {
  buildInitialWeightRecordPayload,
  buildProfileWeightRecordPayload,
  formatWeightChangeText,
  formatWeightRecordDateTick,
  findPreferredDogIndex,
  getWeightSyncSignalKey,
  getWeightSyncValueKey,
  getWeightChartDateTickIndexes,
  shouldDefaultSyncCurrentWeightRecord,
  shouldPersistProfileWeightRecord,
} from './weight-management'

describe('weight-management', () => {
  const dogs = [
    { id: 'dog-1', name: 'Seven' },
    { id: 'dog-2', name: 'Milo' },
    { id: 'dog-3', name: 'Coco' },
  ]

  it('returns the index of the preferred dog when it exists', () => {
    expect(findPreferredDogIndex(dogs, 'dog-2')).toBe(1)
  })

  it('returns -1 when the preferred dog is missing', () => {
    expect(findPreferredDogIndex(dogs, 'dog-9')).toBe(-1)
  })

  it('returns -1 when no preferred dog id is provided', () => {
    expect(findPreferredDogIndex(dogs, '')).toBe(-1)
    expect(findPreferredDogIndex(dogs, null)).toBe(-1)
  })

  it('builds a stable storage key for weight sync notifications', () => {
    expect(getWeightSyncSignalKey('dog-2')).toBe('dog-weight-sync:dog-2')
  })

  it('builds a stable storage key for synced weight values', () => {
    expect(getWeightSyncValueKey('dog-2')).toBe('dog-weight-sync-value:dog-2')
  })

  it('builds an initial profile weight record payload for dog creation', () => {
    expect(buildInitialWeightRecordPayload({
      recordDate: '2026-04-07',
      weightKg: 6.7,
    })).toEqual({
      recordDate: '2026-04-07',
      weightKg: 6.7,
      note: '建档初始体重',
      syncedToProfile: true,
    })
  })

  it('marks profile weight changes as historical records when the value actually changes', () => {
    expect(shouldPersistProfileWeightRecord({
      previousWeightKg: 6.7,
      nextWeightKg: 5,
    })).toBe(true)
  })

  it('does not create a history record when profile weight stays the same', () => {
    expect(shouldPersistProfileWeightRecord({
      previousWeightKg: 6.7,
      nextWeightKg: 6.7,
    })).toBe(false)
  })

  it('builds a synced profile weight record payload for overview saves', () => {
    expect(buildProfileWeightRecordPayload({
      recordDate: '2026-04-07',
      weightKg: 5,
    })).toEqual({
      recordDate: '2026-04-07',
      weightKg: 5,
      note: '档案体重更新',
      syncedToProfile: true,
    })
  })

  it('defaults sync-to-profile on when the new record is the latest and changes current weight', () => {
    expect(shouldDefaultSyncCurrentWeightRecord({
      currentWeightKg: 6.7,
      newWeightKg: 5,
      recordDate: '2026-04-07',
      latestRecordDate: '2026-04-06',
    })).toBe(true)
  })

  it('defaults sync-to-profile off when the record does not change the current weight or is older than the latest history', () => {
    expect(shouldDefaultSyncCurrentWeightRecord({
      currentWeightKg: 6.7,
      newWeightKg: 6.7,
      recordDate: '2026-04-07',
      latestRecordDate: '2026-04-06',
    })).toBe(false)

    expect(shouldDefaultSyncCurrentWeightRecord({
      currentWeightKg: 6.7,
      newWeightKg: 5,
      recordDate: '2026-04-05',
      latestRecordDate: '2026-04-06',
    })).toBe(false)
  })

  it('formats chart date ticks as month/day labels', () => {
    expect(formatWeightRecordDateTick('2026-04-07')).toBe('4/7')
    expect(formatWeightRecordDateTick('2026-12-01')).toBe('12/1')
  })

  it('formats weight changes as percentages relative to the previous record', () => {
    expect(formatWeightChangeText(6, 5)).toBe('↑20%')
    expect(formatWeightChangeText(5.4, 6)).toBe('↓10%')
    expect(formatWeightChangeText(5.625, 5)).toBe('↑12.5%')
  })

  it('keeps stable or invalid percentage changes neutral', () => {
    expect(formatWeightChangeText(5, 5)).toBe('→')
    expect(formatWeightChangeText(5, 0)).toBe('→')
  })

  it('renders a small set of evenly spaced date ticks for dense charts', () => {
    expect(getWeightChartDateTickIndexes(0)).toEqual([])
    expect(getWeightChartDateTickIndexes(1)).toEqual([0])
    expect(getWeightChartDateTickIndexes(4)).toEqual([0, 1, 2, 3])
    expect(getWeightChartDateTickIndexes(10)).toEqual([0, 3, 6, 9])
  })
})
