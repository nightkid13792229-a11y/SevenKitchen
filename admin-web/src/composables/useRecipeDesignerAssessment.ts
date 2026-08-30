/**
 * 本地即时营养评估
 * 基于后端移植的纯函数 assessRecipeDraft，在浏览器内即时计算，
 * 避免每次编辑都请求服务器评估（小程序端卡顿根因之一）。
 */
import { shallowRef } from 'vue'
import { assessRecipeDraft } from '@/utils/recipeDesigner/assessment'
import type {
  DesignRecipeAssessmentInput,
  DesignRecipeAssessmentResult
} from '@/utils/recipeDesigner/assessment'
import type { NutritionProfile } from '@/utils/recipeDesigner/nutritionProfileTypes'
import { recipeDesignerApi } from '@/api/recipeDesigner'
import type {
  AssessmentTarget,
  DesignerItem,
  DraftAssessmentInputs,
  FediafDogScenario
} from '@/types/recipeDesigner'

export interface LocalAssessmentEngineItem {
  id: string
  name: string
  ingredientType?: string | null
  weightG: number
  nutritionProfile: NutritionProfile | null
}

/** 按草稿缓存评估输入（targets + 服务端归一化后的营养档案），避免重复请求 */
const inputsCache = new Map<string, DraftAssessmentInputs>()

const targetsCache = new Map<string, AssessmentTarget[]>()

export function useRecipeDesignerAssessment() {
  const loadingInputs = shallowRef(false)
  const inputsError = shallowRef<string | null>(null)

  async function loadInputs(draftId: string, scenario: FediafDogScenario): Promise<void> {
    const cached = inputsCache.get(draftId)
    if (cached) {
      targetsCache.set(draftId, cached.targets)
      return
    }
    loadingInputs.value = true
    inputsError.value = null
    try {
      const inputs = await recipeDesignerApi.getAssessmentInputs(draftId)
      inputsCache.set(draftId, inputs)
      targetsCache.set(draftId, inputs.targets)
    } catch (error: any) {
      inputsError.value = error?.message || '评估数据加载失败'
    } finally {
      loadingInputs.value = false
    }
  }

  /** 添加/删除原料后刷新（新原料的档案在服务端归一化） */
  async function refreshInputs(draftId: string): Promise<void> {
    inputsCache.delete(draftId)
    targetsCache.delete(draftId)
    loadingInputs.value = true
    inputsError.value = null
    try {
      const inputs = await recipeDesignerApi.getAssessmentInputs(draftId)
      inputsCache.set(draftId, inputs)
      targetsCache.set(draftId, inputs.targets)
    } catch (error: any) {
      inputsError.value = error?.message || '评估数据加载失败'
    } finally {
      loadingInputs.value = false
    }
  }

  function clearInputs(draftId: string) {
    inputsCache.delete(draftId)
    targetsCache.delete(draftId)
  }

  function getTargets(draftId: string): AssessmentTarget[] {
    return targetsCache.get(draftId) ?? []
  }

  function buildEngineItems(draftId: string, items: DesignerItem[]): LocalAssessmentEngineItem[] {
    const cached = inputsCache.get(draftId)
    const profileByItemId = new Map<string, NutritionProfile | null>()
    if (cached) {
      for (const inputItem of cached.items) {
        profileByItemId.set(inputItem.id, (inputItem.nutritionProfile as NutritionProfile | null) ?? null)
      }
    }
    return items
      .filter((item) => item.includeInAssessment !== false)
      .map((item) => ({
        id: item.id,
        name:
          item.name ||
          item.ingredientName ||
          item.ingredient?.name ||
          item.nutritionFoodName ||
          item.nutritionFood?.displayNameZh ||
          item.nutritionFood?.name ||
          item.nutritionProfileDisplayName ||
          '',
        ingredientType: item.ingredientType ?? item.ingredient?.type ?? null,
        weightG: Number(item.weightG ?? 0),
        nutritionProfile: profileByItemId.get(item.id) ?? null
      }))
  }

  function compute(
    scenario: FediafDogScenario,
    draftId: string,
    items: DesignerItem[]
  ): DesignRecipeAssessmentResult | null {
    const targets = targetsCache.get(draftId)
    if (!targets || targets.length === 0) return null
    try {
      const input: DesignRecipeAssessmentInput = {
        scenario,
        items: buildEngineItems(draftId, items) as DesignRecipeAssessmentInput['items'],
        targets
      }
      return assessRecipeDraft(input)
    } catch {
      return null
    }
  }

  return {
    loadingInputs,
    inputsError,
    loadInputs,
    refreshInputs,
    clearInputs,
    getTargets,
    compute
  }
}
