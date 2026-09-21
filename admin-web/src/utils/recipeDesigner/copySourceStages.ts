import type { RecipeDesignerSeriesStage } from '../../types/recipeDesigner'

/**
 * 「复制其他阶段原料」可选的来源阶段。
 *
 * 规则与后端保持一致：只要该阶段**已经有原料来源**就能作为模板 ——
 * 有设计草稿（draftId）或已有正式版本（recipeId）都算；
 * 后端会优先用该阶段的设计草稿，没有草稿时才用已发布正式版本。
 *
 * 注意：不能只允许「有草稿且没有正式版本」的阶段。
 * 大部分成熟阶段都已经发布过，按旧规则会导致可选来源只剩个别的未发布阶段
 * （例如整条系列里只列出「繁殖期」），用户想从已发布的成熟阶段复制原料时无从选择。
 */
export function resolveCopySourceStages(
  stages: RecipeDesignerSeriesStage[] | undefined,
  targetLifeStage: string | undefined,
): RecipeDesignerSeriesStage[] {
  return (stages ?? []).filter(
    (stage) =>
      stage.lifeStage !== targetLifeStage &&
      Boolean(stage.draftId || stage.recipeId),
  )
}
