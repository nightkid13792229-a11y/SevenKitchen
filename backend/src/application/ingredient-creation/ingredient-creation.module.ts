import { Module } from '@nestjs/common';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';

/**
 * 「AI 辅助新建标准原料」应用模块。
 *
 * 阶段一只包含草稿服务；任务 8 会在这里挂控制器，并把候选 / 终检 / 提交服务补齐。
 */
@Module({
  providers: [IngredientCreationDraftService],
  exports: [IngredientCreationDraftService],
})
export class IngredientCreationModule {}
