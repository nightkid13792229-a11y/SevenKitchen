import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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

const PROFILE_WITH_DRAFT_INCLUDE = {
  draft: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.IngredientCreationDraftProfileInclude;

const EDITABLE_DRAFT_STATUSES = new Set(['DRAFT', 'READY_FOR_REVIEW']);

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

@Injectable()
export class IngredientCreationService {
  constructor(private readonly prisma: PrismaService) {}

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
}
