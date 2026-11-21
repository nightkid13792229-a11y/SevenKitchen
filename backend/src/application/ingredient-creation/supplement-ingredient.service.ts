import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { IngredientType, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  createEmptyNutritionProfile,
} from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';

/**
 * 补剂建档。
 *
 * 一条补剂 = 标准原料（单层产品模型）+ 一份**已核验**的营养档案 + 主映射 + 标签证据。
 * 四样在一个事务里落，缺一样这条补剂在配方里就选不到。
 *
 * 这里**不判**门禁过没过——那是入口的事，判完才调进来。
 * 这里只保证：写进去的东西结构对、状态对、不重复建。
 */
export type SupplementPhysicalForm = 'POWDER' | 'TABLET' | 'CAPSULE' | 'LIQUID';

export interface CreateSupplementEvidenceInput {
  productUrl?: string | null;
  productName?: string | null;
  /** 商品正面图（品牌/规格/剂型从这儿抄） */
  frontImageUrl?: string | null;
  labelImageUrl?: string | null;
  labelText?: string | null;
  /** 选品快照：形态结论 + 引用 + 比价 + 选中那瓶；原样存，事后复核用 */
  selection?: unknown;
}

export interface CreateSupplementIngredientInput {
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  /** 基准单位：胶囊/片剂 PCS，粉类 G，液体 ML */
  baseUnit?: 'PCS' | 'G' | 'ML';
  /**
   * 默认目标营养素（fieldPath 列表）。必填：设计器里加这条补剂时默认勾哪几项。
   * 不传就按营养档案里"有值的营养素"兜底；一个都没有则拒绝建档。
   */
  defaultTargetFields?: string[];
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
   * 已废弃：客户端折算的每单位值一律忽略，档案只按「每份 ÷ 份数」算。
   * 字段保留只为兼容旧客户端；新调用方不要传。
   */
  perUnitNutrients?: Record<string, number>;
  /** 上架：原厂保质期（月）。可选，老调用方不传。 */
  shelfLifeMonths?: number | null;
  /** 上架：开盖后保质期（天）。可选，标签写了才填。 */
  openedShelfLifeDays?: number | null;
  /** 上架：储存条件。可选。 */
  storageCondition?: string | null;
  /** 上架：内容物是否油性。可选，默认 false。 */
  isOilBased?: boolean;
  /** 上架：商城是否上架。可选，默认 false。 */
  supplementRetailEnabled?: boolean;
  /** DIY：购买链接，写进 properties.purchase_link。可选。 */
  purchaseLink?: { platform: string; url: string | null } | null;
  /** DIY：商品图片，写进 properties.image_url。可选。 */
  imageUrl?: string | null;
  /** 不上架原因，写进 properties.no_sale_reason；上架时传 null。可选。 */
  noSaleReason?: string | null;
  evidence: CreateSupplementEvidenceInput;
  createdBy: string;
}

export interface CreateSupplementIngredientResult {
  ingredientId: string;
  nutritionFoodId: string;
  /** 建档即确认可用，写入后就是 VERIFIED */
  nutritionFoodStatus: 'VERIFIED' | 'PENDING';
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
  frontImageUrl: string | null;
  productUrl: string | null;
  selection: unknown;
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

/**
 * 基准单位 → 档案口径。PCS 用 `PER_SERVING`（按 1 个单位记），不用 `PER_1_PCS`：
 * 后者不在领域支持的 raw basis 里，配方设计器读路径会当成缺失。
 * G/ML 用每 1 克/毫升，否则浓度解析会因为没有 servingWeightG 判 MISSING_SERVING_WEIGHT。
 */
const RAW_BASIS_BY_BASE_UNIT: Record<'PCS' | 'G' | 'ML', string> = {
  PCS: 'PER_SERVING',
  G: 'PER_1_G',
  ML: 'PER_1_ML',
};

@Injectable()
export class SupplementIngredientService {
  private readonly logger = new Logger(SupplementIngredientService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateSupplementIngredientInput
  ): Promise<CreateSupplementIngredientResult> {
    try {
      return await this.prisma.$transaction((tx) =>
        this.createInTransaction(tx, input),
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        // 兜底路径（并发或 NULL 比较漏网）：也把撞上的那条查出来写进提示
        const existing = await this.prisma.ingredient.findFirst({
          where: {
            type: IngredientType.SUPPLEMENT,
            name: input.name,
            brand: input.brand ?? null,
            productModel: input.productModel ?? null,
          },
          select: { id: true, name: true, brand: true, productModel: true },
        });
        this.logger.warn(
          `[supplement-create] 唯一键冲突 incoming=${JSON.stringify({
            name: input.name,
            brand: input.brand ?? null,
            productModel: input.productModel ?? null,
          })} existing=${JSON.stringify(existing)}`,
        );
        throw new ConflictException(
          existing
            ? this.duplicateMessage(existing)
            : '同名的补剂或营养档案已存在；刷新页面后重试，若仍失败请联系管理员',
        );
      }
      throw error;
    }
  }

  /**
   * 建档事务体：旧 `POST /supplements` 与草稿最终写入共用这一份，
   * 避免两套建档逻辑分叉。
   */
  async createInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateSupplementIngredientInput,
  ): Promise<CreateSupplementIngredientResult> {
    this.assertInput(input);
    const perUnitNutrients = this.derivePerUnitNutrients(input);
    const profile = this.buildProfile(input, perUnitNutrients);
    const nutritionFoodName = this.buildNutritionFoodName(input);

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
      select: { id: true, name: true, brand: true, productModel: true }
    });
    if (duplicate) {
      this.logger.warn(
        `[supplement-create] 重复建档 incoming=${JSON.stringify({
          name: input.name,
          brand: input.brand ?? null,
          productModel: input.productModel ?? null,
        })} existing=${JSON.stringify(duplicate)}`,
      );
      throw new ConflictException(this.duplicateMessage(duplicate));
    }

    const ingredient = await tx.ingredient.create({
      data: {
        name: input.name,
        type: IngredientType.SUPPLEMENT,
        baseUnit: (input.baseUnit ?? 'PCS') as 'PCS' | 'G' | 'ML',
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
        shelfLifeMonths: input.shelfLifeMonths ?? null,
        openedShelfLifeDays: input.openedShelfLifeDays ?? null,
        storageCondition: input.storageCondition ?? null,
        isOilBased: input.isOilBased ?? false,
        supplementRetailEnabled: input.supplementRetailEnabled ?? false,
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
          tags: input.tagNames,
          ...(input.purchaseLink
            ? { purchase_link: input.purchaseLink }
            : {}),
          ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
          ...(input.noSaleReason
            ? { no_sale_reason: input.noSaleReason }
            : {}),
        }
      }
    });

    // 默认目标营养素：显式给了就用，没给按档案里有值的营养素兜底；
    // 一个都没有就不让建档——否则设计器里加进去没有默认目标，等于白建。
    const targetFields = (input.defaultTargetFields ?? []).filter(
      (fieldPath) => Number(perUnitNutrients[fieldPath]) > 0,
    );
    const resolvedTargetFields =
      targetFields.length > 0
        ? targetFields
        : Object.keys(perUnitNutrients).filter(
            (fieldPath) => Number(perUnitNutrients[fieldPath]) > 0,
          );
    if (resolvedTargetFields.length === 0) {
      throw new BadRequestException(
        '这条补剂没有任何营养素数值，无法确定默认目标营养素；请先把标签上的含量读出来或手填',
      );
    }
    const defaultSupplementTargets = resolvedTargetFields.map((fieldPath) => {
      const field = findNutritionField(fieldPath);
      return {
        fieldPath,
        label: field?.label ?? null,
        unit: field?.unit ?? null,
      };
    });

    /**
     * 上一次写入中断（或原料被删）会在 nutrition_food 里留下同名孤儿：
     * 营养档案的唯一键是 (name, dataSource, version)，孤儿在，这次插入就会撞键，
     * 还会被误报成「补剂重复」。所以先找同名的无主档案，有就复用（更新数据）。
     */
    const existingFood = await tx.nutritionFood.findFirst({
      where: {
        name: nutritionFoodName,
        dataSource: 'MANUAL',
        version: 1,
        mappings: { none: {} },
      },
      select: { id: true },
    });
    const nutritionFood = existingFood
      ? await tx.nutritionFood.update({
          where: { id: existingFood.id },
          data: {
            externalId: `SUPPLEMENT-MANUAL:${ingredient.id}`,
            nutritionData: profile as unknown as Prisma.InputJsonValue,
            defaultSupplementTargets:
              defaultSupplementTargets as unknown as Prisma.InputJsonValue,
            status: 'VERIFIED',
            verifiedBy: input.createdBy,
            verifiedAt: new Date(),
            notes: '补剂标签折算；建档时已逐项核对，随建档确认可用',
          },
        })
      : await tx.nutritionFood.create({
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
        defaultSupplementTargets:
          defaultSupplementTargets as unknown as Prisma.InputJsonValue,
        notes: '补剂标签折算；建档时已逐项核对，随建档确认可用',
        createdBy: input.createdBy,
        // 建档这一步就是人工核对：填完并写入即视为确认可用，不再多一道"确认可用"
        status: 'VERIFIED',
        verifiedBy: input.createdBy,
        verifiedAt: new Date()
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
        frontImageUrl: input.evidence.frontImageUrl ?? null,
        labelImageUrl: input.evidence.labelImageUrl ?? null,
        labelText: input.evidence.labelText ?? null,
        selectionSnapshot:
          (input.evidence.selection as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
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
      // 建档即确认：营养档案随写入一起变成「已验证」
      nutritionFoodStatus: 'VERIFIED' as const,
      evidenceId: evidence.id
    };
  }

  /** 重复建档的统一提示：写清楚撞上哪一条，人才能判断是不是同一款。 */
  private duplicateMessage(item: {
    name: string;
    brand: string | null;
    productModel: string | null;
  }): string {
    const spec = [item.brand, item.productModel].filter(Boolean).join(' · ');
    return (
      `已经有同名同规格的补剂：${item.name}${spec ? `（${spec}）` : ''}。` +
      '如果是同一款，去「原料库」找到它继续配置；不是的话，改一下名称或产品规格再存'
    );
  }

  /** 营养档案名带上品牌与规格：库对 (name, dataSource, version) 唯一，同名不同品牌是两个产品。 */
  private buildNutritionFoodName(input: CreateSupplementIngredientInput): string {
    const suffix = [input.brand, input.productModel].filter(Boolean).join(' · ');
    return suffix ? `${input.name}（${suffix}）` : input.name;
  }

  private assertInput(input: CreateSupplementIngredientInput): void {
    if (
      !Number.isFinite(input.servingUnitsPerDose) ||
      input.servingUnitsPerDose <= 0
    ) {
      throw new BadRequestException('每份多少必须大于 0（胶囊是整数，粉/液体可以是小数）');
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

  /** 折算只有这一处：每份 ÷ 每份量。客户端送来的 perUnitNutrients 一律忽略。 */
  private derivePerUnitNutrients(
    input: CreateSupplementIngredientInput
  ): Record<string, number> {
    const derived: Record<string, number> = {};
    for (const [key, servingValue] of Object.entries(input.servingNutrients)) {
      derived[key] = servingValue / input.servingUnitsPerDose;
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
      rawBasisType: RAW_BASIS_BY_BASE_UNIT[input.baseUnit ?? 'PCS'],
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
    tx: Prisma.TransactionClient,
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
      frontImageUrl: evidence.frontImageUrl,
      productUrl: evidence.productUrl,
      selection: evidence.selectionSnapshot
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
