import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentConfigService } from '../agent/agent-config.service';
import { IngredientService } from '../ingredient/ingredient.service';
import {
  IngredientProcurementStrategy,
  IngredientType,
} from '../../domain/ingredient/enums';
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

@Injectable()
export class SupplementImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentConfigService: AgentConfigService,
    private readonly agentClient: SupplementImportAgentClient,
    private readonly ingredientService: IngredientService,
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
    await this.findDraftOrThrow(id);
    const normalized = input.normalizedDraft;
    const validation = validateSupplementImportForConfirm(normalized);

    return this.prisma.supplementImportDraft.update({
      where: { id },
      data: {
        status: validation.canConfirm ? 'READY_TO_CONFIRM' : 'NEEDS_REVIEW',
        normalizedDraft: normalized as any,
        duplicateCandidates: normalized.duplicateCandidates as any,
        riskFlags: normalized.riskFlags as any,
        validationErrors: validation.errors as any,
      },
    });
  }

  async confirmDraft(id: string, user: RequestUser): Promise<any> {
    const record = await this.findDraftOrThrow(id);
    const normalized = this.getNormalizedDraft(record);
    const validation = validateSupplementImportForConfirm(normalized);

    if (!validation.canConfirm) {
      throw new BadRequestException('补剂草稿仍有校验错误，无法确认');
    }

    const payload = this.toIngredientPayload(normalized);
    const resolution = normalized.duplicateResolution;
    const ingredient =
      resolution?.action === 'UPDATE_EXISTING' && resolution.ingredientId
        ? await this.ingredientService.updateIngredient(
            resolution.ingredientId,
            payload as any,
          )
        : await this.ingredientService.createIngredient(payload);

    return this.prisma.supplementImportDraft.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        confirmedIngredientId: ingredient.id,
        confirmedBy: user.userId,
        confirmedAt: new Date(),
      },
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

  private toIngredientPayload(normalized: NormalizedSupplementImportDraft) {
    const ingredient = normalized.ingredient;
    const notes = (ingredient as any).notes ?? null;

    return {
      name: ingredient.name,
      type: IngredientType.SUPPLEMENT,
      procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
      diyEnabled: true,
      procurementEnabled: false,
      brand: ingredient.brand,
      productModel: ingredient.productSpec,
      notes,
      baseUnit: (ingredient.baseUnit ?? 'PCS') as any,
      unitDisplayLabel: ingredient.unitDisplayLabel,
      purchaseUnit: ingredient.unitDisplayLabel,
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: 0,
      weightG: ingredient.weightG,
      properties: {
        category_type: ingredient.categoryType,
        add_timing: ingredient.addTiming,
        production_loss_rate: ingredient.productionLossRate,
      },
      nutritionProfile: normalized.nutritionProfile,
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

    return record.normalizedDraft as NormalizedSupplementImportDraft;
  }

  private assertImageUrls(imageUrls: string[] | undefined): void {
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new BadRequestException('请至少上传一张补剂标签图片');
    }
  }
}
