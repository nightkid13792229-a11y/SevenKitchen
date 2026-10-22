import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 一次 AI 辅助创建的完整记账（设计文档第六节）。
 *
 * `proposals` 是每次 AI 出方案时的原始快照（INTAKE / CANDIDATES / MERGE / CHECK），
 * `changes` 是提交时逐字段比较出来的「AI 提案 vs 最终档案」差异与人登记的例外。
 */
export interface IngredientCreationAuditView {
  id: string;
  draftId: string;
  ingredientId: string;
  nutritionFoodIds: string[];
  proposals: Prisma.JsonValue;
  changes: Prisma.JsonValue;
  committedBy: string;
  committedAt: string;
}

/**
 * 创建记录只读服务。
 *
 * 审计由提交事务写入（`IngredientCreationCommitService`），这里只按原料读出来；
 * 一条原料理论上有且只有一次 AI 创建，取最近一条防止历史脏数据把页面弄乱。
 */
@Injectable()
export class IngredientCreationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async getByIngredientId(
    ingredientId: string,
  ): Promise<IngredientCreationAuditView> {
    const audit = await this.prisma.ingredientCreationAudit.findFirst({
      where: { ingredientId },
      orderBy: { committedAt: 'desc' },
    });

    if (!audit) {
      throw new NotFoundException(
        `Ingredient creation audit ${ingredientId} not found`,
      );
    }

    return {
      id: audit.id,
      draftId: audit.draftId,
      ingredientId: audit.ingredientId,
      nutritionFoodIds: audit.nutritionFoodIds,
      proposals: audit.proposals,
      changes: audit.changes,
      committedBy: audit.committedBy,
      committedAt: audit.committedAt.toISOString(),
    };
  }
}
