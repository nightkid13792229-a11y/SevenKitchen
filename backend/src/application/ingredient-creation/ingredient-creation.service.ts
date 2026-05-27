import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  AddIngredientCreationMessageInput,
  CreateIngredientCreationJobInput,
  IngredientCreationUserContext,
  UpdateIngredientCreationDraftInput,
  UpdateIngredientCreationDraftProfileInput,
} from './ingredient-creation.types';
import { IngredientCreationAgentService } from './ingredient-creation-agent.service';

const PROFILE_ORDER_BY = [
  { role: 'asc' as const },
  { sortOrder: 'asc' as const },
];

const JOB_INCLUDE = {
  messages: { orderBy: { createdAt: 'asc' as const } },
  draft: {
    include: {
      profiles: { orderBy: PROFILE_ORDER_BY },
    },
  },
} satisfies Prisma.IngredientCreationJobInclude;

const DRAFT_INCLUDE = {
  profiles: { orderBy: PROFILE_ORDER_BY },
} satisfies Prisma.IngredientCreationDraftInclude;

const CONFIRM_DRAFT_INCLUDE = {
  job: true,
  profiles: { orderBy: PROFILE_ORDER_BY },
} satisfies Prisma.IngredientCreationDraftInclude;

const PROFILE_WITH_DRAFT_INCLUDE = {
  draft: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.IngredientCreationDraftProfileInclude;

const EDITABLE_DRAFT_STATUSES = new Set(['DRAFT', 'READY_FOR_REVIEW']);
const EXISTING_DRAFT_MESSAGE = '已有草稿，请编辑或拒绝后重新创建任务';

function trimRequired(value: string, message: string): string {
  const next = value.trim();
  if (!next) {
    throw new BadRequestException(message);
  }
  return next;
}

function assertAdmin(user: IngredientCreationUserContext): void {
  if (user.role !== 'ADMIN') {
    throw new ForbiddenException('需要管理员权限');
  }
}

function assertCanReadJob(
  job: { createdBy: string },
  user: IngredientCreationUserContext,
): void {
  if (user.role === 'ADMIN') {
    return;
  }
  if (job.createdBy !== user.userId) {
    throw new ForbiddenException('只能查看自己创建的任务');
  }
}

function assertEditableDraftStatus(status: string): void {
  if (!EDITABLE_DRAFT_STATUSES.has(status)) {
    throw new BadRequestException('当前草稿状态不能继续编辑');
  }
}

function setIfDefined<T extends Record<string, unknown>, K extends keyof T>(
  data: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    data[key] = value;
  }
}

function assertHasPatch(data: object, message: string): void {
  if (Object.keys(data).length === 0) {
    throw new BadRequestException(message);
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function defaultPurchaseUnit(baseUnit: string): string {
  if (baseUnit === 'ML') {
    return 'ml';
  }
  if (baseUnit === 'PCS') {
    return 'pcs';
  }
  return 'g';
}

function getSinglePrimaryProfile<T extends { role: string }>(
  profiles: T[],
): T {
  const primaryProfiles = profiles.filter(
    (profile) => profile.role === 'PRIMARY',
  );
  if (primaryProfiles.length !== 1) {
    throw new BadRequestException('确认入库必须且只能包含一个主营养档案');
  }
  return primaryProfiles[0]!;
}

function assertUniqueNutritionFoodIdentities(
  profiles: Array<{ sourceFoodName: string; sourceType: string | null }>,
): void {
  const identities = new Set<string>();
  for (const profile of profiles) {
    const dataSource = profile.sourceType ?? 'MANUAL';
    const identity = `${profile.sourceFoodName}|${dataSource}|1`;
    if (identities.has(identity)) {
      throw new BadRequestException(
        '草稿包含重复营养档案，请先合并或删除重复档案',
      );
    }
    identities.add(identity);
  }
}

@Injectable()
export class IngredientCreationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly agentService?: IngredientCreationAgentService,
  ) {}

  async createJob(input: CreateIngredientCreationJobInput) {
    const requestText = trimRequired(input.requestText, '新增食材需求不能为空');

    return this.prisma.ingredientCreationJob.create({
      data: {
        createdBy: input.userId,
        requestText,
        status: 'DRAFTING',
        currentStage: '已创建任务',
        progress: 0,
        messages: {
          create: [
            {
              role: 'USER',
              content: requestText,
            },
            {
              role: 'SYSTEM',
              content: '已创建 AI 新增食材任务，等待 Agent 开始研究。',
            },
          ],
        },
      },
      include: JOB_INCLUDE,
    });
  }

  async listJobs(user: IngredientCreationUserContext) {
    return this.prisma.ingredientCreationJob.findMany({
      where: user.role === 'ADMIN' ? {} : { createdBy: user.userId },
      include: {
        draft: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJobDetail(jobId: string, user: IngredientCreationUserContext) {
    const job = await this.prisma.ingredientCreationJob.findUnique({
      where: { id: jobId },
      include: JOB_INCLUDE,
    });
    if (!job) {
      throw new NotFoundException('AI 新增食材任务不存在');
    }

    assertCanReadJob(job, user);
    return job;
  }

  async addUserMessage(
    jobId: string,
    input: AddIngredientCreationMessageInput,
    user: IngredientCreationUserContext,
  ) {
    const job = await this.getJobDetail(jobId, user);
    const content = trimRequired(input.content, '补充内容不能为空');

    await this.prisma.ingredientCreationMessage.create({
      data: {
        jobId: job.id,
        role: 'USER',
        content,
      },
    });

    return this.getJobDetail(jobId, user);
  }

  async answerQuestion(
    jobId: string,
    input: AddIngredientCreationMessageInput,
    user: IngredientCreationUserContext,
  ) {
    const job = await this.getJobDetail(jobId, user);
    if (job.status !== 'WAITING_USER') {
      throw new BadRequestException('当前任务不在等待用户回答状态');
    }
    const content = trimRequired(input.content, '回答内容不能为空');

    await this.prisma.ingredientCreationMessage.create({
      data: {
        jobId: job.id,
        role: 'USER',
        content,
        payload: {
          answerTo: job.waitingQuestion,
        } as Prisma.InputJsonValue,
      },
    });
    await this.prisma.ingredientCreationJob.update({
      where: { id: job.id },
      data: {
        status: 'SEARCHING_SOURCES',
        waitingQuestion: null,
        currentStage: '已收到回答，等待 Agent 继续研究',
      },
    });

    return this.getJobDetail(jobId, user);
  }

  async rerunDraft(jobId: string, user: IngredientCreationUserContext) {
    const job = await this.getJobDetail(jobId, user);
    if (job.status === 'CONFIRMED') {
      throw new BadRequestException('已确认任务不能重新运行');
    }
    if (job.draft) {
      throw new BadRequestException(EXISTING_DRAFT_MESSAGE);
    }
    if (!this.agentService) {
      throw new BadRequestException('AI 新增食材 Agent 服务未注册');
    }

    return this.agentService.runJob(jobId);
  }

  async updateDraft(
    draftId: string,
    input: UpdateIngredientCreationDraftInput,
    user: IngredientCreationUserContext,
  ) {
    assertAdmin(user);

    const draft = await this.prisma.ingredientCreationDraft.findUnique({
      where: { id: draftId },
      include: { job: true },
    });
    if (!draft) {
      throw new NotFoundException('新增食材草稿不存在');
    }
    assertEditableDraftStatus(draft.status);

    const data: Prisma.IngredientCreationDraftUpdateInput = {};
    if (input.suggestedName !== undefined) {
      data.suggestedName = trimRequired(
        input.suggestedName,
        '标准原料名称不能为空',
      );
    }
    setIfDefined(data, 'unitDisplayLabel', input.unitDisplayLabel);
    setIfDefined(data, 'procurementStrategy', input.procurementStrategy);
    setIfDefined(data, 'diyEnabled', input.diyEnabled);
    setIfDefined(data, 'procurementEnabled', input.procurementEnabled);
    setIfDefined(data, 'notes', input.notes);
    assertHasPatch(data, '没有可更新的草稿字段');

    return this.prisma.ingredientCreationDraft.update({
      where: { id: draftId },
      data,
      include: DRAFT_INCLUDE,
    });
  }

  async updateDraftProfile(
    profileId: string,
    input: UpdateIngredientCreationDraftProfileInput,
    user: IngredientCreationUserContext,
  ) {
    assertAdmin(user);

    const profile = await this.prisma.ingredientCreationDraftProfile.findUnique({
      where: { id: profileId },
      include: PROFILE_WITH_DRAFT_INCLUDE,
    });
    if (!profile) {
      throw new NotFoundException('新增食材草稿档案不存在');
    }
    assertEditableDraftStatus(profile.draft.status);

    const data: Prisma.IngredientCreationDraftProfileUpdateInput = {};
    setIfDefined(data, 'role', input.role);
    setIfDefined(
      data,
      'suggestedDisplayNameZh',
      input.suggestedDisplayNameZh,
    );
    setIfDefined(data, 'preparationState', input.preparationState);
    setIfDefined(data, 'preparationStateLabel', input.preparationStateLabel);
    setIfDefined(data, 'ediblePortionLabel', input.ediblePortionLabel);
    setIfDefined(data, 'processingLabel', input.processingLabel);
    setIfDefined(data, 'agentRationale', input.agentRationale);
    setIfDefined(data, 'sortOrder', input.sortOrder);
    assertHasPatch(data, '没有可更新的草稿档案字段');

    return this.prisma.ingredientCreationDraftProfile.update({
      where: { id: profileId },
      data,
    });
  }

  async confirmDraft(draftId: string, user: IngredientCreationUserContext) {
    assertAdmin(user);

    const confirmedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.ingredientCreationDraft.findUnique({
        where: { id: draftId },
        include: CONFIRM_DRAFT_INCLUDE,
      });
      if (!draft) {
        throw new NotFoundException('新增食材草稿不存在');
      }

      const primaryProfile = getSinglePrimaryProfile(draft.profiles);
      assertUniqueNutritionFoodIdentities(draft.profiles);

      const claim = await tx.ingredientCreationDraft.updateMany({
        where: { id: draftId, status: 'READY_FOR_REVIEW' },
        data: {
          status: 'CONFIRMED',
          confirmedBy: user.userId,
          confirmedAt,
        },
      });
      if (claim.count !== 1) {
        throw new BadRequestException('只有待审核草稿可以确认入库');
      }

      const existingIngredient = await tx.ingredient.findFirst({
        where: {
          name: draft.suggestedName,
          brand: null,
          productModel: null,
        },
        select: { id: true },
      });
      if (existingIngredient) {
        throw new BadRequestException(`标准原料已存在：${draft.suggestedName}`);
      }

      const ingredient = await tx.ingredient.create({
        data: {
          name: draft.suggestedName,
          type: 'FOOD',
          procurementStrategy: draft.procurementStrategy,
          diyEnabled: draft.diyEnabled,
          procurementEnabled: draft.procurementEnabled,
          brand: null,
          productModel: null,
          purchaseChannel: null,
          notes: draft.notes,
          baseUnit: draft.baseUnit,
          unitDisplayLabel: draft.unitDisplayLabel,
          nutritionProfile: toJsonInput(primaryProfile.nutritionData),
          purchaseUnit:
            draft.unitDisplayLabel ?? defaultPurchaseUnit(draft.baseUnit),
          purchaseToBaseRatio: 1,
          currentPricePerPurchaseUnit: 0,
          effectivePricePerPurchaseUnit: 0,
          properties: toJsonInput({}),
        },
      });

      for (const draftProfile of draft.profiles) {
        const dataSource = draftProfile.sourceType ?? 'MANUAL';
        const nutritionFood = await tx.nutritionFood.upsert({
          where: {
            name_dataSource_version: {
              name: draftProfile.sourceFoodName,
              dataSource,
              version: 1,
            },
          },
          create: {
            name: draftProfile.sourceFoodName,
            nameEn: draftProfile.sourceFoodNameEn,
            displayNameZh: draftProfile.suggestedDisplayNameZh,
            displayNameZhSource: 'AI_DRAFT_REVIEWED',
            displayNameZhReviewedAt: confirmedAt,
            displayNameZhReviewedBy: user.userId,
            category: 'OTHER',
            dataSource,
            externalId: draftProfile.sourceKey,
            version: 1,
            status: 'VERIFIED',
            preparationState: draftProfile.preparationState,
            preparationStateLabel: draftProfile.preparationStateLabel,
            ediblePortionLabel: draftProfile.ediblePortionLabel,
            processingLabel: draftProfile.processingLabel,
            nutritionData: toJsonInput(draftProfile.nutritionData),
            notes: 'AI 新增食材草稿确认',
            verifiedBy: user.userId,
            verifiedAt: confirmedAt,
          },
          update: {
            nameEn: draftProfile.sourceFoodNameEn,
            displayNameZh: draftProfile.suggestedDisplayNameZh,
            displayNameZhSource: 'AI_DRAFT_REVIEWED',
            displayNameZhReviewedAt: confirmedAt,
            displayNameZhReviewedBy: user.userId,
            category: 'OTHER',
            externalId: draftProfile.sourceKey,
            status: 'VERIFIED',
            preparationState: draftProfile.preparationState,
            preparationStateLabel: draftProfile.preparationStateLabel,
            ediblePortionLabel: draftProfile.ediblePortionLabel,
            processingLabel: draftProfile.processingLabel,
            nutritionData: toJsonInput(draftProfile.nutritionData),
            notes: 'AI 新增食材草稿确认',
            verifiedBy: user.userId,
            verifiedAt: confirmedAt,
          },
        });

        await tx.nutritionFoodMapping.create({
          data: {
            ingredientId: ingredient.id,
            nutritionFoodId: nutritionFood.id,
            isPrimary: draftProfile.role === 'PRIMARY',
            yieldRate: 1,
            notes: 'AI 新增食材草稿确认',
          },
        });
      }

      await tx.ingredientCreationJob.update({
        where: { id: draft.job.id },
        data: {
          status: 'CONFIRMED',
          currentStage: '已确认创建正式标准原料',
          progress: 100,
          completedAt: confirmedAt,
        },
      });

      return tx.ingredientCreationDraft.update({
        where: { id: draft.id },
        data: {
          confirmedIngredientId: ingredient.id,
        },
      });
    });
  }
}
