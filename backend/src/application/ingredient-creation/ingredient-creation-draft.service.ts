import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  IngredientCreationDraft as PrismaIngredientCreationDraft,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  CreationStep,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
} from './ingredient-creation.types';

/**
 * 向导草稿服务。
 *
 * 草稿只服务向导本身，**永远不进入配方链路**；提交时的正式写入由
 * `IngredientCreationCommitService` 在事务里完成。
 */
@Injectable()
export class IngredientCreationDraftService {
  constructor(private readonly prisma: PrismaService) {}

  /** 起手：落一条 `step = INTAKE` 的空草稿（payload 由后续站点自己补）。 */
  async create(input: {
    name: string;
    type: 'FOOD';
    createdBy: string;
  }): Promise<IngredientCreationDraft> {
    const draft = await this.prisma.ingredientCreationDraft.create({
      data: {
        name: input.name,
        type: input.type,
        step: 'INTAKE',
        payload: {},
        createdBy: input.createdBy,
      },
    });

    return this.toView(draft);
  }

  async get(id: string): Promise<IngredientCreationDraft> {
    const draft = await this.prisma.ingredientCreationDraft.findUnique({
      where: { id },
    });
    if (!draft) {
      throw new NotFoundException(`Ingredient creation draft ${id} not found`);
    }

    return this.toView(draft);
  }

  /**
   * 保存某一站：推进当前站点，并把本站的 payload 片段浅合并进去。
   *
   * 读和写放在同一个事务里 —— 后到的站点不能基于旧 payload 覆盖前面站点的结果。
   */
  async patch(
    id: string,
    step: CreationStep,
    payload: Partial<IngredientCreationDraftPayload>,
  ): Promise<IngredientCreationDraft> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.ingredientCreationDraft.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundException(`Ingredient creation draft ${id} not found`);
      }

      const mergedPayload: IngredientCreationDraftPayload = {
        ...((existing.payload as IngredientCreationDraftPayload | null) ?? {}),
        ...payload,
      };

      const updated = await tx.ingredientCreationDraft.update({
        where: { id },
        data: {
          step,
          // Prisma 的 Json 输入类型不允许带 undefined 的接口，序列化后行为与 JSONB 一致
          payload: mergedPayload as unknown as Prisma.InputJsonValue,
        },
      });

      return this.toView(updated);
    });
  }

  private toView(
    draft: PrismaIngredientCreationDraft,
  ): IngredientCreationDraft {
    return {
      ...draft,
      step: draft.step as CreationStep,
      payload: (draft.payload as IngredientCreationDraftPayload | null) ?? {},
    };
  }
}
