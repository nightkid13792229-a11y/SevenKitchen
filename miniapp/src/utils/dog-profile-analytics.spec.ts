import { describe, expect, it } from 'vitest'
import { buildDogProfileEventPayload } from './dog-profile-analytics'

describe('dog-profile-analytics', () => {
  it('builds a stable payload for feeding edit calc success', () => {
    expect(
      buildDogProfileEventPayload('dog_profile_calc_succeeded', {
        mode: 'edit',
        dogId: 'dog-1',
        moduleName: 'feeding_info',
        calcStatus: 'success',
      }),
    ).toEqual({
      eventName: 'dog_profile_calc_succeeded',
      mode: 'edit',
      dogId: 'dog-1',
      moduleName: 'feeding_info',
      calcStatus: 'success',
    })
  })
})
