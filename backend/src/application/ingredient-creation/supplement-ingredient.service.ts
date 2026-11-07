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
  /** 键是规范字段路径，例如 fattyAcids.epa / minerals.zinc */
  perUnitNutrients: Record<string, number>;
  evidence: CreateSupplementEvidenceInput;
  createdBy: string;
}

export interface CreateSupplementIngredientResult {
  ingredientId: string;
  nutritionFoodId: string;
  nutritionFoodStatus: 'PENDING';
  evidenceId: string;
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
    const profile = this.buildProfile(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
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
              active_nutrients: Object.keys(input.perUnitNutrients),
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
            name: input.name,
            nameEn: null,
            displayNameZh: input.name,
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
              perUnitNutrients: input.perUnitNutrients,
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
  }

  private buildProfile(input: CreateSupplementIngredientInput): NutritionProfileV2 {
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

    for (const [path, value] of Object.entries(input.perUnitNutrients)) {
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

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
