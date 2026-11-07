import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { IngredientType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  createEmptyNutritionProfile,
} from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';

/**
 * 补剂建档。
 *
 * 一条补剂 = 标准原料（单层产品模型）+ 一份**待验证**的营养档案 + 主映射 + 标签证据。
 * 四样在一个事务里落，缺一样这条补剂在配方里就选不到。
 *
 * 这里**不判**折算对不对、门禁过没过——那是入口的事，判完才调进来。
 * 这里只保证：写进去的东西结构对、状态对、不重复建。
 */
export type SupplementPhysicalForm = 'POWDER' | 'TABLET' | 'CAPSULE' | 'LIQUID';

export interface CreateSupplementEvidenceInput {
  productUrl?: string | null;
  productName?: string | null;
  labelImageUrl?: string | null;
  labelText?: string | null;
}

export interface CreateSupplementIngredientInput {
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  /** 粒 / 片 / 胶囊 / 平勺 / 份 */
  unitDisplayLabel: string;
  physicalForm: SupplementPhysicalForm;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number;
  addTiming: string;
  productionLossRate: number;
  diyEnabled: boolean;
  procurementEnabled: boolean;
  labelCategory: 'FEED_MATERIAL' | 'FEED_ADDITIVE' | null;
  labelNames: string[];
  labelNameSource: string | null;
  tagNames: string[];
  /** 标签上「Serving Size」后面那个数 */
  servingUnitsPerDose: number;
  /** 标签上每份的含量，键是规范字段路径（fattyAcids.epa / minerals.zinc）。折算由服务端做。 */
  servingNutrients: Record<string, number>;
  /**
   * 可选：调用方自己折好的每粒值。带了就必须与「每份 ÷ N」一致，
   * 否则 400——折算只有服务端说了算，客户端只能提出、不能决定。
   */
  perUnitNutrients?: Record<string, number>;
  evidence: CreateSupplementEvidenceInput;
  createdBy: string;
}

export interface CreateSupplementIngredientResult {
  ingredientId: string;
  nutritionFoodId: string;
  nutritionFoodStatus: 'PENDING';
  evidenceId: string;
}

export interface SupplementEvidenceView {
  evidenceId: string;
  ingredientId: string | null;
  nutritionFoodId: string | null;
  nutritionFoodStatus: string | null;
  servingUnitsPerDose: number;
  labelText: string | null;
  labelImageUrl: string | null;
  productUrl: string | null;
}

export interface PendingSupplementArchiveView {
  nutritionFoodId: string;
  ingredientId: string | null;
  name: string;
  createdAt: string;
}

/** 档案里可以落数的五个分组；也是字段路径的第一段。 */
const NUTRIENT_GROUPS = [
  'macros',
  'minerals',
  'vitamins',
  'fattyAcids',
  'aminoAcids'
] as const;

type NutrientGroup = (typeof NUTRIENT_GROUPS)[number];

function isNutrientGroup(value: string): value is NutrientGroup {
  return (NUTRIENT_GROUPS as readonly string[]).includes(value);
}

@Injectable()
export class SupplementIngredientService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateSupplementIngredientInput
  ): Promise<CreateSupplementIngredientResult> {
    this.assertInput(input);
    const perUnitNutrients = this.derivePerUnitNutrients(input);
    const profile = this.buildProfile(input, perUnitNutrients);
    const nutritionFoodName = this.buildNutritionFoodName(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 同一条补剂不许建两个档案。
        // 库里的 @@unique(name, brand, productModel) 挡不住"品牌或规格为空"的情形——
        // Postgres 把 NULL 当互不相等。所以这里按同样的三件套做一次显式比较。
        const duplicate = await tx.ingredient.findFirst({
          where: {
            type: IngredientType.SUPPLEMENT,
            name: input.name,
            brand: input.brand ?? null,
            productModel: input.productModel ?? null
          },
          select: { id: true }
        });
        if (duplicate) {
          throw new ConflictException(
            '这条补剂已经建过了（同名、同品牌、同规格），不要重复建'
          );
        }

        const ingredient = await tx.ingredient.create({
          data: {
            name: input.name,
            type: IngredientType.SUPPLEMENT,
            baseUnit: 'PCS',
            unitDisplayLabel: input.unitDisplayLabel,
            brand: input.brand ?? null,
            productModel: input.productModel ?? null,
            purchaseChannel: input.purchaseChannel ?? null,
            purchaseUnit: input.purchaseUnit,
            purchaseToBaseRatio: input.purchaseToBaseRatio,
            currentPricePerPurchaseUnit: input.currentPricePerPurchaseUnit,
            physicalForm: input.physicalForm,
            diyEnabled: input.diyEnabled,
            procurementEnabled: input.procurementEnabled,
            nutritionProfile: profile as unknown as Prisma.InputJsonValue,
            properties: {
              category_type: 'OTHER',
              display_unit: input.unitDisplayLabel,
              serving_unit_label: input.unitDisplayLabel,
              serving_units_per_dose: input.servingUnitsPerDose,
              add_timing: input.addTiming,
              production_loss_rate: input.productionLossRate,
              label_category: input.labelCategory,
              label_names: input.labelNames,
              label_name_source: input.labelNameSource,
              tags: input.tagNames
            }
          }
        });

        const nutritionFood = await tx.nutritionFood.create({
          data: {
            name: nutritionFoodName,
            nameEn: null,
            displayNameZh: nutritionFoodName,
            displayNameZhSource: 'MANUAL',
            displayNameZhReviewedAt: new Date(),
            displayNameZhReviewedBy: input.createdBy,
            category: 'SUPPLEMENT',
            dataSource: 'MANUAL',
            externalId: `SUPPLEMENT-MANUAL:${ingredient.id}`,
            preparationState: 'SUPPLEMENT',
            preparationStateLabel: '补剂',
            ediblePortionLabel: `每 1 ${input.unitDisplayLabel}`,
            processingLabel: '标签折算',
            nutritionData: profile as unknown as Prisma.InputJsonValue,
            notes: '补剂标签折算，待人工确认',
            createdBy: input.createdBy,
            status: 'PENDING'
          }
        });

        await tx.nutritionFoodMapping.create({
          data: {
            nutritionFoodId: nutritionFood.id,
            ingredientId: ingredient.id,
            yieldRate: 1,
            isPrimary: true,
            notes: '补剂标签折算，待人工确认'
          }
        });

        await this.attachTags(tx, ingredient.id, input.tagNames);

        const evidence = await tx.supplementLabelEvidence.create({
          data: {
            ingredientId: ingredient.id,
            nutritionFoodId: nutritionFood.id,
            productUrl: input.evidence.productUrl ?? null,
            productName: input.evidence.productName ?? input.name,
            servingUnitsPerDose: input.servingUnitsPerDose,
            labelImageUrl: input.evidence.labelImageUrl ?? null,
            labelText: input.evidence.labelText ?? null,
            conversionSnapshot: {
              servingUnitsPerDose: input.servingUnitsPerDose,
              servingNutrients: input.servingNutrients,
              perUnitNutrients,
              unitDisplayLabel: input.unitDisplayLabel
            },
            createdBy: input.createdBy
          }
        });

        return {
          ingredientId: ingredient.id,
          nutritionFoodId: nutritionFood.id,
          nutritionFoodStatus: 'PENDING' as const,
          evidenceId: evidence.id
        };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          '这条补剂已经建过了（同名、同品牌、同规格），不要重复建'
        );
      }
      throw error;
    }
  }

  /** 营养档案名带上品牌与规格：库对 (name, dataSource, version) 唯一，同名不同品牌是两个产品。 */
  private buildNutritionFoodName(input: CreateSupplementIngredientInput): string {
    const suffix = [input.brand, input.productModel].filter(Boolean).join(' · ');
    return suffix ? `${input.name}（${suffix}）` : input.name;
  }

  private assertInput(input: CreateSupplementIngredientInput): void {
    if (!Number.isInteger(input.servingUnitsPerDose) || input.servingUnitsPerDose < 1) {
      throw new BadRequestException('每份几粒必须是大于 0 的整数');
    }
    if (!Number.isFinite(input.purchaseToBaseRatio) || input.purchaseToBaseRatio <= 0) {
      throw new BadRequestException('换算倍数必须大于 0');
    }
    if (!Number.isFinite(input.currentPricePerPurchaseUnit) || input.currentPricePerPurchaseUnit <= 0) {
      throw new BadRequestException('采购价必须大于 0');
    }
    const nutrients = Object.entries(input.servingNutrients ?? {});
    if (nutrients.length === 0) {
      throw new BadRequestException('至少要有一种营养素的含量');
    }
    for (const [key, value] of nutrients) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`营养素 ${key} 必须是大于等于 0 的数字`);
      }
    }
  }

  /** 折算只有这一处：每份 ÷ 每份粒数。客户端送来的每粒值只用来核对。 */
  private derivePerUnitNutrients(
    input: CreateSupplementIngredientInput
  ): Record<string, number> {
    const derived: Record<string, number> = {};
    for (const [key, servingValue] of Object.entries(input.servingNutrients)) {
      derived[key] = servingValue / input.servingUnitsPerDose;
    }

    for (const [key, claimed] of Object.entries(input.perUnitNutrients ?? {})) {
      const expected = derived[key];
      if (expected === undefined || Math.abs(claimed - expected) > 1e-4) {
        throw new BadRequestException(
          `每粒值对不上折算：${key} 应为 ${expected ?? '（未提供每份值）'}，收到 ${claimed}`
        );
      }
    }

    return derived;
  }

  private buildProfile(
    input: CreateSupplementIngredientInput,
    perUnitNutrients: Record<string, number>
  ): NutritionProfileV2 {
    const profile = createEmptyNutritionProfile();
    profile.meta = {
      ...profile.meta,
      rawBasisType: 'PER_SERVING',
      sampleState: 'CONCENTRATE',
      isEdiblePortionBasis: true,
      // amountUnitLabel / servingUnitLabel 在 NutritionMeta 里没有声明，但档案读取器
      // 按约定读它们（nutrition-profile-reader.ts 的 usesDirectServingUnit）。
      // 不写这两个键，按粒记的补剂会被当成"按克记"。
      amountUnitLabel: input.unitDisplayLabel,
      servingUnitLabel: input.unitDisplayLabel,
      sourceType: 'SUPPLEMENT_LABEL',
      fieldSources: {},
      fieldDisplayUnits: {}
    } as unknown as NutritionProfileV2['meta'];

    for (const [path, value] of Object.entries(perUnitNutrients)) {
      const [group, key] = path.split('.');
      if (!group || !key || !isNutrientGroup(group)) {
        throw new BadRequestException(`营养字段不认识：${path}`);
      }
      const tab = profile[group] as Record<string, number | null>;
      if (!(key in tab)) {
        throw new BadRequestException(`营养字段不认识：${path}`);
      }
      tab[key] = value;
    }

    return profile;
  }

  private async attachTags(
    tx: {
      ingredientTag: {
        findFirst: (args: { where: { name: string } }) => Promise<{ id: string } | null>;
        create: (args: { data: { name: string } }) => Promise<{ id: string }>;
      };
      ingredientTagAssignment: {
        create: (args: {
          data: { ingredientId: string; tagId: string };
        }) => Promise<unknown>;
      };
    },
    ingredientId: string,
    tagNames: string[]
  ): Promise<void> {
    const names = [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];
    for (const name of names) {
      const existing = await tx.ingredientTag.findFirst({ where: { name } });
      const tag = existing ?? (await tx.ingredientTag.create({ data: { name } }));
      await tx.ingredientTagAssignment.create({
        data: { ingredientId, tagId: tag.id }
      });
    }
  }

  /** 按原料回查当时那张标签。 */
  async getEvidence(ingredientId: string): Promise<SupplementEvidenceView | null> {
    const evidence = await this.prisma.supplementLabelEvidence.findFirst({
      where: { ingredientId },
      orderBy: { createdAt: 'desc' }
    });
    if (!evidence) {
      return null;
    }

    const food = evidence.nutritionFoodId
      ? await this.prisma.nutritionFood.findFirst({
          where: { id: evidence.nutritionFoodId },
          select: { id: true, status: true }
        })
      : null;

    return {
      evidenceId: evidence.id,
      ingredientId: evidence.ingredientId,
      nutritionFoodId: evidence.nutritionFoodId,
      nutritionFoodStatus: food?.status ?? null,
      servingUnitsPerDose: evidence.servingUnitsPerDose,
      labelText: evidence.labelText,
      labelImageUrl: evidence.labelImageUrl,
      productUrl: evidence.productUrl
    };
  }

  /** 待验证的补剂档案：关掉页面后还能找回来确认。 */
  async listPending(): Promise<PendingSupplementArchiveView[]> {
    const rows = await this.prisma.nutritionFood.findMany({
      where: { status: 'PENDING', category: 'SUPPLEMENT' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        mappings: { where: { isPrimary: true }, select: { ingredientId: true } }
      }
    });

    return rows.map((row) => ({
      nutritionFoodId: row.id,
      ingredientId: row.mappings?.[0]?.ingredientId ?? null,
      name: row.name,
      createdAt: row.createdAt.toISOString()
    }));
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
