import { describe, expect, it } from 'vitest'
import {
  getCreateBasicFieldKeys,
  getCreateFeedingFieldKeys,
  isCreateBasicStepReady,
  isCreateFeedingStepReady,
  shouldShowCreateWeightManagementEntry,
} from './dog-profile-create-view'

describe('create step boundaries', () => {
  it('keeps weight and neuter in basic info instead of feeding', () => {
    expect(getCreateBasicFieldKeys()).toContain('currentWeightKg')
    expect(getCreateBasicFieldKeys()).toContain('isNeutered')
    expect(getCreateFeedingFieldKeys()).not.toContain('currentWeightKg')
    expect(getCreateFeedingFieldKeys()).not.toContain('isNeutered')
  })

  it('never shows weight-management entry during initial creation', () => {
    expect(shouldShowCreateWeightManagementEntry()).toBe(false)
  })

  it('treats invalid weight as incomplete basic create input', () => {
    expect(
      isCreateBasicStepReady({
        name: '七七',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2021-01-01',
        currentWeightKg: 'abc',
        isNeutered: false,
      }),
    ).toBe(false)
  })

  it('keeps feeding readiness focused on actual feeding fields', () => {
    expect(
      isCreateFeedingStepReady({
        bcsScore: 5,
        activityLevel: 'NORMAL',
        mealsPerDay: '2',
        treatLevel: 'LOW',
        currentWeightKg: 'abc',
      }),
    ).toBe(true)
  })
})
