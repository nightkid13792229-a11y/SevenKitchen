import { describe, expect, it } from 'vitest'
import {
  getCreateBasicFieldKeys,
  getCreateFeedingFieldKeys,
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
})
