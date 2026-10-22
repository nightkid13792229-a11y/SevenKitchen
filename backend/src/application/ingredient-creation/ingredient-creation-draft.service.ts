import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  IngredientCreationDraft as PrismaIngredientCreationDraft,
  IngredientType,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  CreationStep,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  ProposalSnapshot,
  ProposalSnapshotKind,
} from './ingredient-creation.types';

/** `$queryRaw` 返回的是数据库原始行（snake_case），需要映射回服务结构。 */
type RawDraftRow = {
  id: string;
  name: string;
  type: IngredientType;
  step: string;
  payload: IngredientCreationDraftPayload | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

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
   * 合并由**一条 UPDATE** 在库内完成（`payload || $1::jsonb`），不做「先读后写」——
   * 默认隔离级别是 READ COMMITTED，读改写会让两个并发 patch 互相覆盖。
   */
  async patch(
    id: string,
    step: CreationStep,
    payload: Partial<IngredientCreationDraftPayload>,
  ): Promise<IngredientCreationDraft> {
    // 兜底：`proposalHistory` 只能由 `appendProposal` 追加，绝不接受 patch 覆盖。
    // 前端若把整份 payload 回传，HTTP DTO 会先剥一次，这里再剥一次。
    const safePayload = {
      ...payload,
    } as Partial<IngredientCreationDraftPayload>;
    delete (safePayload as Record<string, unknown>).proposalHistory;

    const rows = await this.prisma.$queryRaw<RawDraftRow[]>`
      UPDATE "ingredient_creation_draft"
      SET payload = payload || ${JSON.stringify(safePayload)}::jsonb,
          step = ${step},
          updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Ingredient creation draft ${id} not found`);
    }

    return this.mapRawDraft(row);
  }

  /**
   * 追加快照 AI 本轮给出的提案（设计文档第六节「AI 提案快照」）。
   *
   * 只追加、不覆盖：`proposalHistory` 在库内用 `||` 拼接，读改写会丢掉并发写入的快照。
   */
  async appendProposal(
    draftId: string,
    proposal: Record<string, unknown>,
    kind: ProposalSnapshotKind,
  ): Promise<void> {
    const entry: ProposalSnapshot = {
      ...proposal,
      kind,
      createdAt: new Date().toISOString(),
    };

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "ingredient_creation_draft"
      SET payload = jsonb_set(
            payload,
            '{proposalHistory}',
            coalesce(payload->'proposalHistory', '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb
          ),
          updated_at = now()
      WHERE id = ${draftId}
      RETURNING id
    `;

    if (rows.length === 0) {
      throw new NotFoundException(
        `Ingredient creation draft ${draftId} not found`,
      );
    }
  }

  private mapRawDraft(row: RawDraftRow): IngredientCreationDraft {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      step: row.step as CreationStep,
      payload: row.payload ?? {},
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
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
