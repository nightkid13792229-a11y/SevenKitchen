import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  SupplementCreationDraft as PrismaSupplementCreationDraft,
  SupplementCreationDraftStatus,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  computeDraftCompleteness,
  type DraftCompleteness,
} from './supplement-draft-completeness';
import {
  emptySupplementDraftPayload,
  normalizeSupplementDraftPayload,
  type SupplementDraftPayload,
} from './supplement-draft.types';

/** 草稿详情：数据库整行 + 完成度。 */
export interface SupplementDraftView {
  id: string;
  createdBy: string;
  status: SupplementCreationDraftStatus;
  schemaVersion: number;
  name: string;
  payload: SupplementDraftPayload;
  aiSnapshot: Prisma.JsonValue | null;
  manualFields: string[];
  verification: Prisma.JsonValue | null;
  finalizedIngredientId: string | null;
  finalizedNutritionFoodId: string | null;
  finalizedEvidenceId: string | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completeness: DraftCompleteness;
}

/** 列表摘要：不带 payload，只给列表页需要的东西。 */
export interface SupplementDraftSummary {
  id: string;
  name: string;
  updatedAt: Date;
  completeness: DraftCompleteness;
}

/**
 * 自动保存/人工编辑的入参。
 *
 * 只允许这五个字段：`status`/`finalized*` 是服务端状态，前端传了也不写。
 * `payload` 用 `unknown`：入库前一定会过 `normalizeSupplementDraftPayload`，
 * 前端/旧草稿的残缺形状都不该让服务抛类型错。
 */
export interface UpdateSupplementDraftInput {
  name?: string;
  payload?: unknown;
  manualFields?: string[];
  expectedUpdatedAt?: string;
  aiSnapshot?: unknown;
}

/** 最终写入事务里回填到草稿上的三个正式记录 id。 */
export interface SupplementDraftFinalizedIds {
  ingredientId: string;
  nutritionFoodId: string;
  evidenceId: string;
}

/**
 * 补剂服务端草稿 CRUD。
 *
 * 草稿是「AI 起草 → 人审核」的中间态：只写自己的 `supplement_creation_draft`，
 * 不碰正式原料/营养/证据。最终写入由 `SupplementFinalizeService` 在事务里调
 * `markFinalized`，写完后核验报告通过 `saveVerification` 落回草稿。
 *
 * 所有按 id 的操作都带 `createdBy`：草稿是创建人私有的，别人的 id 一律
 * 按「不存在」处理（404），不泄露草稿是否存在。
 */
@Injectable()
export class SupplementDraftService {
  constructor(private readonly prisma: PrismaService) {}

  /** 新建空草稿：本人、DRAFT、空载荷。 */
  async create(
    createdBy: string,
    input: { name?: string } = {},
  ): Promise<SupplementDraftView> {
    const payload = normalizeSupplementDraftPayload(
      emptySupplementDraftPayload(),
    );

    const draft = await this.prisma.supplementCreationDraft.create({
      data: {
        createdBy,
        status: 'DRAFT',
        name: input.name ?? '',
        payload: payload as unknown as Prisma.InputJsonValue,
        manualFields: [],
      },
    });

    return this.toView(draft);
  }

  /**
   * 我的未完成草稿，按最近编辑倒序。
   *
   * 列表要算完成度所以必须取 payload，但返回值只给摘要 —— 调用方（HTTP 层）
   * 不会把整份草稿带进列表响应。
   */
  async list(createdBy: string): Promise<SupplementDraftSummary[]> {
    const drafts = await this.prisma.supplementCreationDraft.findMany({
      where: { createdBy, status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, updatedAt: true, payload: true },
    });

    return drafts.map((draft) => ({
      id: draft.id,
      name: draft.name,
      updatedAt: draft.updatedAt,
      completeness: computeDraftCompleteness(
        normalizeSupplementDraftPayload(draft.payload),
      ),
    }));
  }

  /** 读自己的草稿；别人的草稿 404。 */
  async get(id: string, createdBy: string): Promise<SupplementDraftView> {
    return this.toView(await this.requireOwned(id, createdBy));
  }

  /**
   * 自动保存：只写 name/payload/manualFields/aiSnapshot。
   *
   * `expectedUpdatedAt` 是乐观锁：与库里 `updatedAt` 的 ISO 时间不一致就 409，
   * 避免两个页面（或自动保存与 AI 重填）互相覆盖。
   */
  async update(
    id: string,
    createdBy: string,
    input: UpdateSupplementDraftInput,
  ): Promise<SupplementDraftView> {
    const draft = await this.requireOwned(id, createdBy);

    if (
      input.expectedUpdatedAt !== undefined &&
      input.expectedUpdatedAt !== draft.updatedAt.toISOString()
    ) {
      throw new ConflictException('草稿已被更新，请刷新后再试');
    }

    const data: Prisma.SupplementCreationDraftUpdateInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
    }
    if (input.payload !== undefined) {
      data.payload = normalizeSupplementDraftPayload(
        input.payload,
      ) as unknown as Prisma.InputJsonValue;
    }
    if (input.manualFields !== undefined) {
      data.manualFields = input.manualFields;
    }
    if (input.aiSnapshot !== undefined) {
      data.aiSnapshot = input.aiSnapshot as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.supplementCreationDraft.update({
      where: { id },
      data,
    });

    return this.toView(updated);
  }

  /**
   * 放弃草稿：软删除，保留审计。
   *
   * 只有 DRAFT 能放弃；重复放弃直接返回当前状态（幂等，不重复写库）。
   * 已写入（FINALIZED）的草稿不能再放弃 —— 它已经产生正式记录，放弃会误导人。
   */
  async discard(id: string, createdBy: string): Promise<SupplementDraftView> {
    const draft = await this.requireOwned(id, createdBy);

    if (draft.status === 'DISCARDED') {
      return this.toView(draft);
    }
    if (draft.status !== 'DRAFT') {
      throw new ConflictException('已写入的草稿不能放弃');
    }

    const discarded = await this.prisma.supplementCreationDraft.update({
      where: { id },
      data: { status: 'DISCARDED' },
    });

    return this.toView(discarded);
  }

  /**
   * 最终写入事务里把草稿置为 FINALIZED 并回填正式记录 id。
   *
   * 必须用调用方的 `tx`：草稿状态要和原料/营养/证据在同一个事务里提交，
   * 任何一步失败都整体回滚，草稿保留 DRAFT。
   */
  async markFinalized(
    tx: Prisma.TransactionClient,
    id: string,
    result: SupplementDraftFinalizedIds,
  ): Promise<void> {
    await tx.supplementCreationDraft.update({
      where: { id },
      data: {
        status: 'FINALIZED',
        finalizedIngredientId: result.ingredientId,
        finalizedNutritionFoodId: result.nutritionFoodId,
        finalizedEvidenceId: result.evidenceId,
        finalizedAt: new Date(),
      },
    });
  }

  /**
   * 写入后核验报告落库（只改 `verification`，`updatedAt` 由 Prisma 自动维护）。
   *
   * 只接受本人已写入的草稿：核验是「写完之后」的报告，草稿还没写入时
   * 没有可核验的正式记录，按不存在处理。
   */
  async saveVerification(
    id: string,
    createdBy: string,
    verification: unknown,
  ): Promise<SupplementDraftView> {
    const draft = await this.prisma.supplementCreationDraft.findFirst({
      where: { id, createdBy, status: 'FINALIZED' },
    });
    if (!draft) {
      throw new NotFoundException('草稿不存在');
    }

    const updated = await this.prisma.supplementCreationDraft.update({
      where: { id },
      data: { verification: verification as Prisma.InputJsonValue },
    });

    return this.toView(updated);
  }

  private async requireOwned(
    id: string,
    createdBy: string,
  ): Promise<PrismaSupplementCreationDraft> {
    const draft = await this.prisma.supplementCreationDraft.findFirst({
      where: { id, createdBy },
    });
    if (!draft) {
      throw new NotFoundException('草稿不存在');
    }

    return draft;
  }

  private toView(
    draft: PrismaSupplementCreationDraft,
  ): SupplementDraftView {
    const payload = normalizeSupplementDraftPayload(draft.payload);

    return {
      id: draft.id,
      createdBy: draft.createdBy,
      status: draft.status,
      schemaVersion: draft.schemaVersion,
      name: draft.name,
      payload,
      aiSnapshot: draft.aiSnapshot,
      manualFields: draft.manualFields,
      verification: draft.verification,
      finalizedIngredientId: draft.finalizedIngredientId,
      finalizedNutritionFoodId: draft.finalizedNutritionFoodId,
      finalizedEvidenceId: draft.finalizedEvidenceId,
      finalizedAt: draft.finalizedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      completeness: computeDraftCompleteness(payload),
    };
  }
}
