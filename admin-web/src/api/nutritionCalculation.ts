import api from './index'
import type {
  FediafTargetLifeStage,
  FediafTargetSelectionResult,
  IngredientReadinessResult,
  NutrientMappingAuditResult
} from '@/types/nutritionCalculation'

export const nutritionCalculationApi = {
  getMappingAudit: (): Promise<NutrientMappingAuditResult> =>
    api.get('/admin/nutrition-calculation/fediaf-2025-dog/mapping-audit'),

  listIngredientReadiness: (): Promise<IngredientReadinessResult> =>
    api.get('/admin/nutrition-calculation/ingredients/readiness'),

  previewFediafTarget: (
    lifeStage: FediafTargetLifeStage
  ): Promise<FediafTargetSelectionResult> =>
    api.get('/admin/nutrition-calculation/fediaf-2025-dog/target', {
      params: { lifeStage }
    })
}
