import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CUSTOM_RECIPE_DRAFT_TTL_MS,
  clearCustomRecipeDraft,
  isCustomRecipeDraftExpired,
  loadCustomRecipeDraft,
  retainCustomRecipeChoicesAfterPayment,
  saveCustomRecipeDraft,
} from './custom-recipe-draft'

const storage = new Map<string, any>()

vi.stubGlobal('uni', {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: any) => storage.set(key, value),
})

describe('custom-recipe-draft', () => {
  beforeEach(() => storage.clear())

  const form = {
    dogId: 'dog-1',
    allergyText: '',
    allergies: [],
    reportDrafts: [
      {
        attachments: ['https://cos.example/report.jpg'],
        attachmentKeys: ['allergy-records/report.jpg'],
        testDate: '2026-10-01',
        testMethod: 'SERUM',
        ocrText: null,
        summary: null,
        results: [{ allergen: '鸡肉', level: 'POSITIVE' }],
      },
    ],
  }

  it('round-trips a draft per customer + dog', () => {
    saveCustomRecipeDraft('customer-a', 'dog-1', {
      form,
      hasFoodAllergy: true,
      weightGoalChoice: 'LOSS',
      prefilledAllergyText: '鸡肉',
    })

    const draft = loadCustomRecipeDraft('customer-a', 'dog-1')
    expect(draft?.form).toEqual(form)
    expect(draft?.hasFoodAllergy).toBe(true)
    expect(draft?.weightGoalChoice).toBe('LOSS')
    expect(draft?.prefilledAllergyText).toBe('鸡肉')
  })

  it('keeps an intentionally cleared text as an empty draft', () => {
    saveCustomRecipeDraft('customer-a', 'dog-1', {
      form: { ...form, allergyText: '' },
      hasFoodAllergy: true,
      weightGoalChoice: null,
      prefilledAllergyText: '鸡肉',
    })

    expect(loadCustomRecipeDraft('customer-a', 'dog-1')?.form.allergyText).toBe('')
  })

  it('clears one dog without touching another', () => {
    saveCustomRecipeDraft('customer-a', 'dog-1', {
      form,
      hasFoodAllergy: true,
      weightGoalChoice: null,
      prefilledAllergyText: '',
    })
    saveCustomRecipeDraft('customer-a', 'dog-2', {
      form: { ...form, dogId: 'dog-2' },
      hasFoodAllergy: false,
      weightGoalChoice: null,
      prefilledAllergyText: '',
    })

    clearCustomRecipeDraft('customer-a', 'dog-1')

    expect(loadCustomRecipeDraft('customer-a', 'dog-1')).toBeNull()
    expect(loadCustomRecipeDraft('customer-a', 'dog-2')?.form.dogId).toBe('dog-2')
  })

  it('treats drafts older than 7 days as expired', () => {
    const now = Date.now()
    expect(
      isCustomRecipeDraftExpired(
        {
          dogId: 'dog-1',
          updatedAt: now - CUSTOM_RECIPE_DRAFT_TTL_MS - 1,
          form,
          hasFoodAllergy: null,
          weightGoalChoice: null,
          prefilledAllergyText: '',
        },
        now,
      ),
    ).toBe(true)
    expect(
      isCustomRecipeDraftExpired(
        {
          dogId: 'dog-1',
          updatedAt: now,
          form,
          hasFoodAllergy: null,
          weightGoalChoice: null,
          prefilledAllergyText: '',
        },
        now,
      ),
    ).toBe(false)
  })

  it('付款后保留上次选择，但清掉上一单报告和附件草稿', () => {
    saveCustomRecipeDraft('customer-a', 'dog-1', {
      form: {
        ...form,
        targetGoal: 'LOSS',
        currentFoodMain: 'DRY',
        attachmentUrls: ['https://cos.example/attachment.jpg'],
        attachmentKeys: ['custom-recipe-sensitive-attachments/attachment.jpg'],
      },
      hasFoodAllergy: true,
      weightGoalChoice: 'LOSS',
      prefilledAllergyText: '鸡肉',
    })

    retainCustomRecipeChoicesAfterPayment('customer-a', 'dog-1')

    const draft = loadCustomRecipeDraft('customer-a', 'dog-1')
    expect(draft?.form.targetGoal).toBe('LOSS')
    expect(draft?.form.currentFoodMain).toBe('DRY')
    expect(draft?.form.reportDrafts).toEqual([])
    expect(draft?.form.attachmentUrls).toEqual([])
    expect(draft?.form.attachmentKeys).toEqual([])
    expect(draft?.hasFoodAllergy).toBe(true)
  })
})
