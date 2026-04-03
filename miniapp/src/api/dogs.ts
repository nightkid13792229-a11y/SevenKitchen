import { request } from '../utils/api'

export interface DogProfileFormValue {
  name: string
  breedId: string
  customBreedName?: string
  birthday: string
  gender: string
  isNeutered: boolean
  currentWeightKg: string
  bcsScore: number
  activityLevel: string
  lifeStageOverride: string
  sizeClassOverride: string | null
  mealsPerDay: string
  treatInputMode: string
  treatLevel: string
  manualTreatKcal: string
  allergyFoods: string
  pickyFoods: string
  medicalRecords?: any[]
  checkupRecords?: any[]
  allergyRecords?: any[]
}

export const dogApi = {
  list: () => request({ url: '/dogs', method: 'GET' }),
  detail: (dogId: string) => request({ url: `/dogs/${dogId}`, method: 'GET' }),
  breeds: () => request({ url: '/dogs/breeds', method: 'GET' }),
  preview: (data: Record<string, any>) =>
    request({ url: '/dogs/calc-preview', method: 'POST', data }),
  create: (data: Record<string, any>) => request({ url: '/dogs', method: 'POST', data }),
  update: (dogId: string, data: Record<string, any>) =>
    request({ url: `/dogs/${dogId}`, method: 'PUT', data }),
}
