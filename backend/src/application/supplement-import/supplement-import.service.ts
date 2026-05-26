import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AgentConfigService } from '../agent/agent-config.service';
import {
  IngredientProcurementStrategy,
  IngredientType,
} from '../../domain/ingredient/enums';
import { denormalizeNutritionProfileForPersistence } from '../../domain/ingredient/nutrition-profile.utils';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import type { RequestUser } from '../../interfaces/auth/request-user.interface';
import type {
  CreateSupplementImportDraftDto,
  UpdateSupplementImportDraftDto,
} from '../../interfaces/dto/supplement-import.dto';
import {
  classifySupplementImportDuplicates,
  normalizeExtractedSupplementImport,
  validateSupplementImportForConfirm,
} from './supplement-import-normalizer';
import { SupplementImportAgentClient } from './supplement-import-agent.client';
import type {
  ExtractedSupplementImportPayload,
  NormalizedSupplementImportDraft,
  SupplementImportRiskFlag,
  SupplementImportValidationIssue,
  SupplementDuplicateCandidate,
} from './supplement-import.types';

type DraftRecord = {
  id: string;
  status: string;
  imageUrls: string[];
  normalizedDraft?: unknown;
  duplicateCandidates?: unknown;
  validationErrors?: unknown;
  confirmedIngredientId?: string | null;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type NormalizedSupplementImportDraftWithNotes =
  NormalizedSupplementImportDraft & {
    ingredient: NormalizedSupplementImportDraft['ingredient'] & {
      notes?: string | null;
    };
  };

@Injectable()
export class SupplementImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentConfigService: AgentConfigService,
    private readonly agentClient: SupplementImportAgentClient,
    private readonly cosService: TencentCosService,
  ) {}

  async uploadImages(
    files: Express.Multer.File[],
    _user: RequestUser,
  ): Promise<Array<{ url: string; key: string }>> {
    return Promise.all(
      (files ?? []).map((file) =>
        this.cosService.uploadImage(
          file,
          file.originalname,
          'supplement-import',
        ),
      ),
    );
  }

  async createDraft(
    input: CreateSupplementImportDraftDto,
    user: RequestUser,
  ): Promise<any> {
    this.assertImageUrls(input.imageUrls);
    const config =
      await this.agentConfigService.getEnabledSupplementImportConfigForUse();

    const draft = (await this.prisma.supplementImportDraft.create({
      data: {
        status: 'RECOGNIZING',
        imageUrls: input.imageUrls,
        createdBy: user.userId,
        agentConfigSnapshot: (config.snapshot ?? null) as any,
      },
    })) as DraftRecord;

    try {
      const extracted = await this.agentClient.recognize(
        config,
        input.imageUrls,
      );
      const normalized = await this.normalizeWithDuplicates(
        extracted,
        input.imageUrls,
      );
      const validation = validateSupplementImportForConfirm(normalized);
      const status = validation.canConfirm
        ? 'READY_TO_CONFIRM'
        : 'NEEDS_REVIEW';

      return this.prisma.supplementImportDraft.update({
        where: { id: draft.id },
        data: {
          status,
          rawOcrText: (extracted as any).rawOcrText ?? null,
          aiExtractedData: extracted as any,
          normalizedDraft: normalized as any,
          duplicateCandidates: normalized.duplicateCandidates as any,
          riskFlags: normalized.riskFlags as any,
          validationErrors: validation.errors as any,
          modelUsage: (extracted as any).modelUsage ?? null,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '补剂识别 Agent 调用失败';
      const validationErrors: SupplementImportValidationIssue[] = [
        {
          level: 'BLOCKING',
          code: 'AGENT_RECOGNITION_FAILED',
          message,
        },
      ];

      await this.prisma.supplementImportDraft.update({
        where: { id: draft.id },
        data: {
          status: 'FAILED',
          validationErrors: validationErrors as any,
        },
      });

      throw new BadRequestException(`补剂识别失败：${message}`);
    }
  }

  async getDraft(id: string, _user: RequestUser): Promise<any> {
    return this.findDraftOrThrow(id);
  }

  async updateDraft(
    id: string,
    input: UpdateSupplementImportDraftDto,
    _user: RequestUser,
  ): Promise<any> {
    const record = await this.findDraftOrThrow(id);
    const normalized = this.assertNormalizedDraft(input.normalizedDraft);
    const trustedDuplicateCandidates = this.assertDuplicateCandidates(
      record.duplicateCandidates ?? [],
      'duplicateCandidates',
    );
    const normalizedForSave = {
      ...normalized,
      duplicateCandidates: trustedDuplicateCandidates,
    };
    const validation = validateSupplementImportForConfirm(normalizedForSave);

    return this.prisma.supplementImportDraft.update({
      where: { id },
      data: {
        status: validation.canConfirm ? 'READY_TO_CONFIRM' : 'NEEDS_REVIEW',
        normalizedDraft: normalizedForSave as any,
        duplicateCandidates: trustedDuplicateCandidates as any,
        riskFlags: normalized.riskFlags as any,
        validationErrors: validation.errors as any,
      },
    });
  }

  async confirmDraft(id: string, user: RequestUser): Promise<any> {
    const record = await this.findDraftOrThrow(id);
    if (record.status === 'CONFIRMED' && record.confirmedIngredientId) {
      return record;
    }
    if (record.status !== 'READY_TO_CONFIRM') {
      throw new BadRequestException(`当前草稿状态不可确认：${record.status}`);
    }

    const normalized = this.getNormalizedDraft(record);
    const trustedDuplicateCandidates = this.assertDuplicateCandidates(
      record.duplicateCandidates ?? [],
      'duplicateCandidates',
    );
    const normalizedForConfirm = {
      ...normalized,
      duplicateCandidates: trustedDuplicateCandidates,
    };
    const validation = validateSupplementImportForConfirm(normalizedForConfirm);

    if (!validation.canConfirm) {
      throw new BadRequestException('补剂草稿仍有校验错误，无法确认');
    }

    const resolution = normalizedForConfirm.duplicateResolution;
    const targetIngredientId =
      resolution?.action === 'UPDATE_EXISTING' && resolution.ingredientId
        ? resolution.ingredientId
        : randomUUID();
    const confirmedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.supplementImportDraft.updateMany({
        where: { id, status: 'READY_TO_CONFIRM' },
        data: {
          status: 'CONFIRMED',
          confirmedIngredientId: targetIngredientId,
          confirmedBy: user.userId,
          confirmedAt,
        },
      });

      if (claimed.count !== 1) {
        throw new BadRequestException('草稿状态已变化，请刷新后重试');
      }

      if (resolution?.action === 'UPDATE_EXISTING' && resolution.ingredientId) {
        const updated = await tx.ingredient.updateMany({
          where: { id: targetIngredientId, type: IngredientType.SUPPLEMENT },
          data: this.toIngredientUpdateData(normalizedForConfirm),
        });

        if (updated.count !== 1) {
          throw new BadRequestException('目标补剂原料不存在或类型不匹配');
        }
      } else {
        await tx.ingredient.create({
          data: {
            id: targetIngredientId,
            ...this.toIngredientCreateData(normalizedForConfirm),
          },
        });
      }

      return tx.supplementImportDraft.update({
        where: { id },
        data: {
          confirmedIngredientId: targetIngredientId,
        },
      });
    });
  }

  private async normalizeWithDuplicates(
    extracted: ExtractedSupplementImportPayload,
    imageUrls: string[],
  ): Promise<NormalizedSupplementImportDraft> {
    const normalized = normalizeExtractedSupplementImport(extracted, imageUrls);
    const existing = await this.prisma.ingredient.findMany({
      where: { type: IngredientType.SUPPLEMENT },
      select: {
        id: true,
        name: true,
        brand: true,
        productModel: true,
      },
    });
    const duplicateCandidates = classifySupplementImportDuplicates(
      normalized.ingredient,
      existing as any,
    );

    normalized.duplicateCandidates = duplicateCandidates;
    normalized.riskFlags = this.normalizeRiskFlags((extracted as any).risks);
    (normalized.ingredient as any).notes =
      (extracted as any).ingredient?.notes ?? null;

    return normalized;
  }

  private normalizeRiskFlags(input: unknown): SupplementImportRiskFlag[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .filter((item) => item && typeof item === 'object')
      .map((item: any) => ({
        code: String(item.code ?? 'AGENT_RISK'),
        level: ['INFO', 'WARNING', 'BLOCKING'].includes(item.level)
          ? item.level
          : 'WARNING',
        message: String(item.message ?? '识别存在风险'),
      }));
  }

  private toIngredientCreateData(normalized: NormalizedSupplementImportDraft) {
    return {
      ...this.toIngredientLabelData(normalized),
      type: IngredientType.SUPPLEMENT,
      procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
      diyEnabled: true,
      procurementEnabled: false,
      purchaseUnit:
        normalized.ingredient.unitDisplayLabel ??
        normalized.ingredient.baseUnit ??
        'PCS',
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: 0,
      effectivePricePerPurchaseUnit: 0,
    };
  }

  private toIngredientUpdateData(normalized: NormalizedSupplementImportDraft) {
    return this.toIngredientLabelData(normalized);
  }

  private toIngredientLabelData(normalized: NormalizedSupplementImportDraft) {
    const ingredient = normalized.ingredient;
    const notes =
      (normalized as NormalizedSupplementImportDraftWithNotes).ingredient
        .notes ?? null;

    return {
      name: ingredient.name,
      brand: ingredient.brand,
      productModel: ingredient.productSpec,
      notes,
      baseUnit: (ingredient.baseUnit ?? 'PCS') as any,
      unitDisplayLabel: ingredient.unitDisplayLabel,
      weightG: ingredient.weightG,
      properties: {
        category_type: ingredient.categoryType,
        add_timing: ingredient.addTiming,
        production_loss_rate: ingredient.productionLossRate,
      },
      nutritionProfile: denormalizeNutritionProfileForPersistence(
        normalized.nutritionProfile as any,
      ) as any,
    };
  }

  private async findDraftOrThrow(id: string): Promise<DraftRecord> {
    const record = await this.prisma.supplementImportDraft.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('补剂导入草稿不存在');
    }

    return record as DraftRecord;
  }

  private getNormalizedDraft(
    record: DraftRecord,
  ): NormalizedSupplementImportDraft {
    if (!record.normalizedDraft) {
      throw new BadRequestException('补剂导入草稿尚未完成识别');
    }

    return this.assertNormalizedDraft(record.normalizedDraft);
  }

  private assertImageUrls(imageUrls: string[] | undefined): void {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new BadRequestException('请至少上传一张补剂标签图片');
    }
  }

  private assertNormalizedDraft(
    input: unknown,
  ): NormalizedSupplementImportDraft {
    if (!isRecord(input)) {
      throw new BadRequestException('normalizedDraft 必须是对象');
    }
    if (!isRecord(input.ingredient)) {
      throw new BadRequestException('normalizedDraft.ingredient 必须是对象');
    }
    if (!isRecord(input.nutritionProfile)) {
      throw new BadRequestException(
        'normalizedDraft.nutritionProfile 必须是对象',
      );
    }
    if (!Array.isArray(input.rejectedNutritionItems)) {
      throw new BadRequestException(
        'normalizedDraft.rejectedNutritionItems 必须是数组',
      );
    }
    if (!Array.isArray(input.duplicateCandidates)) {
      throw new BadRequestException(
        'normalizedDraft.duplicateCandidates 必须是数组',
      );
    }
    this.assertDuplicateCandidates(
      input.duplicateCandidates,
      'normalizedDraft.duplicateCandidates',
    );
    if (!Array.isArray(input.riskFlags)) {
      throw new BadRequestException('normalizedDraft.riskFlags 必须是数组');
    }
    for (const flag of input.riskFlags) {
      if (
        !isRecord(flag) ||
        typeof flag.code !== 'string' ||
        typeof flag.message !== 'string' ||
        !['INFO', 'WARNING', 'BLOCKING'].includes(String(flag.level ?? ''))
      ) {
        throw new BadRequestException('normalizedDraft.riskFlags 包含无效项');
      }
    }
    if (
      input.duplicateResolution !== null &&
      input.duplicateResolution !== undefined &&
      !isRecord(input.duplicateResolution)
    ) {
      throw new BadRequestException(
        'normalizedDraft.duplicateResolution 必须是对象或 null',
      );
    }
    if (isRecord(input.duplicateResolution)) {
      const action = input.duplicateResolution.action;
      if (!['CREATE_NEW', 'UPDATE_EXISTING'].includes(String(action ?? ''))) {
        throw new BadRequestException(
          'normalizedDraft.duplicateResolution.action 无效',
        );
      }
      if (
        action === 'UPDATE_EXISTING' &&
        typeof input.duplicateResolution.ingredientId !== 'string'
      ) {
        throw new BadRequestException(
          'normalizedDraft.duplicateResolution.ingredientId 必须是字符串',
        );
      }
    }

    return input as unknown as NormalizedSupplementImportDraft;
  }

  private assertDuplicateCandidates(
    input: unknown,
    fieldName: string,
  ): SupplementDuplicateCandidate[] {
    if (!Array.isArray(input)) {
      throw new BadRequestException(`${fieldName} 必须是数组`);
    }

    for (const candidate of input) {
      if (
        !isRecord(candidate) ||
        typeof candidate.ingredientId !== 'string' ||
        !['EXACT', 'LIKELY', 'POSSIBLE'].includes(
          String(candidate.matchType ?? ''),
        )
      ) {
        throw new BadRequestException(`${fieldName} 包含无效项`);
      }
    }

    return input as SupplementDuplicateCandidate[];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
