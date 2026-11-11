/**
 * Ingredient Application Service
 * Application layer service for Ingredient domain operations
 */

import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { Ingredient } from '../../domain/ingredient';
import { IngredientCostHistoryService } from './ingredient-cost-history.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { wouldWipeExistingPrice } from '../../domain/ingredient/price-gate';
import {
  IngredientType,
  BaseUnit,
  IngredientProcurementStrategy,
} from '../../domain/ingredient/enums';
import { normalizeNutritionProfileForWrite } from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile, SupplementProperties } from '../../domain/ingredient/types';

export const INGREDIENT_REPOSITORY = Symbol('INGREDIENT_REPOSITORY');

export interface CreateIngredientDto {
  name: string;
  type: IngredientType;
  procurementStrategy?: IngredientProcurementStrategy;
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  notes?: string | null;
  baseUnit: string;
  baseUnitDisplayName?: string | null;
  unitDisplayLabel?: string | null;
  purchaseUnit?: string | null;
  purchaseToBaseRatio?: number | null;
  currentPricePerPurchaseUnit?: number | null;
  effectivePricePerPurchaseUnit?: number | null;
  weightG?: number | null;
  maxCapacityG?: number | null;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
  properties: Record<string, any>;
  nutritionProfile?: NutritionProfile | null;
  tagIds?: string[];
}

export interface UpdateIngredientDto {
  name?: string;
  procurementStrategy?: IngredientProcurementStrategy;
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  notes?: string | null;
  baseUnit?: BaseUnit;
  baseUnitDisplayName?: string | null;
  unitDisplayLabel?: string | null;
  purchaseUnit?: string | null;
  purchaseToBaseRatio?: number | null;
  currentPricePerPurchaseUnit?: number | null;
  effectivePricePerPurchaseUnit?: number | null;
  weightG?: number | null;
  maxCapacityG?: number | null;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
  properties?: Record<string, any>;
  nutritionProfile?: NutritionProfile | null;
  tagIds?: string[];
  type?: IngredientType;
}

export interface UpdateIngredientPriceDto {
  currentPricePerPurchaseUnit: number;
}

@Injectable()
export class IngredientService {
  constructor(
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepository: IngredientRepository,
    private readonly costHistory: IngredientCostHistoryService,
    /**
     * 只用来做"有采购商品时不许改记账单位"的守卫（2026-11-11）。
     * 可选注入：单测和内存仓储模式（没有 Prisma）也能构造。
     */
    @Optional()
    private readonly prisma?: PrismaService,
  ) {}

  private resolveBaseUnitDisplayName(
    dto: Pick<UpdateIngredientDto, 'baseUnitDisplayName' | 'unitDisplayLabel'>,
    fallback: string | null = null,
  ): string | null {
    if (dto.baseUnitDisplayName !== undefined) {
      return dto.baseUnitDisplayName;
    }

    if (dto.unitDisplayLabel !== undefined) {
      return dto.unitDisplayLabel;
    }

    return fallback;
  }

  private normalizeOptionalText(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private resolvePurchaseUnitForPersistence(
    dto: {
      purchaseUnit?: string | null;
      baseUnit?: string | null;
      baseUnitDisplayName?: string | null;
      unitDisplayLabel?: string | null;
    },
    fallback: string | null = null,
  ): string {
    return (
      this.normalizeOptionalText(dto.purchaseUnit) ??
      this.normalizeOptionalText(this.resolveBaseUnitDisplayName(dto)) ??
      this.normalizeOptionalText(fallback) ??
      this.normalizeOptionalText(dto.baseUnit) ??
      BaseUnit.PCS
    );
  }

  private resolvePropertiesForPersistence(input: {
    type: IngredientType;
    properties: Record<string, any>;
    nutritionProfile: NutritionProfile | null;
  }): Record<string, any> {
    if (input.type !== IngredientType.SUPPLEMENT) {
      return input.properties;
    }

    const supplementProperties = {
      ...(input.properties as SupplementProperties),
    };

    return supplementProperties;
  }

  /**
   * Get ingredient by ID
   */
  async getIngredientById(id: string): Promise<Ingredient> {
    const ingredient = await this.ingredientRepository.findById(id);
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }
    return ingredient;
  }

  /**
   * Get all ingredients
   */
  async getAllIngredients(): Promise<Ingredient[]> {
    return this.ingredientRepository.findAll();
  }

  /**
   * Get ingredients by type
   */
  async getIngredientsByType(type: IngredientType): Promise<Ingredient[]> {
    return this.ingredientRepository.findByType(type);
  }

  /**
   * Get ingredients by IDs
   */
  async getIngredientsByIds(ids: string[]): Promise<Ingredient[]> {
    return this.ingredientRepository.findByIds(ids);
  }

  /**
   * Create ingredient
   */
  async createIngredient(dto: CreateIngredientDto): Promise<Ingredient> {
    const normalizedProfile = normalizeNutritionProfileForWrite(
      dto.nutritionProfile ?? null,
    );
    const normalizedProperties = this.resolvePropertiesForPersistence({
      type: dto.type,
      properties: dto.properties,
      nutritionProfile: normalizedProfile,
    });
    const purchaseUnit = this.resolvePurchaseUnitForPersistence(dto);
    const purchaseToBaseRatio = dto.purchaseToBaseRatio ?? 1;
    this.assertFoodPurchaseRatioInvariant(dto.type, purchaseToBaseRatio);
    const currentPricePerPurchaseUnit = dto.currentPricePerPurchaseUnit ?? 0;

    const ingredient = new Ingredient(
      crypto.randomUUID(),
      dto.name,
      dto.type,
      dto.procurementStrategy ?? IngredientProcurementStrategy.DAILY_PURCHASE,
      dto.diyEnabled ?? false,
      dto.procurementEnabled ?? false,
      dto.brand ?? null,
      dto.productModel ?? null,
      dto.purchaseChannel ?? null,
      dto.notes ?? null,
      dto.baseUnit as any,
      this.resolveBaseUnitDisplayName(dto),
      purchaseUnit,
      purchaseToBaseRatio,
      currentPricePerPurchaseUnit,
      // 2026-11-06：生效价并入当前价（构造参数已废弃，只为兼容签名）
      currentPricePerPurchaseUnit,
      dto.weightG ?? null,
      dto.maxCapacityG ?? null,
      dto.safetyStock ?? null,
      dto.reorderPoint ?? null,
      dto.targetStock ?? null,
      normalizedProperties,
      normalizedProfile,
      false,
      null,
    );

    return this.ingredientRepository.save(ingredient, dto.tagIds);
  }

  /**
   * Update ingredient
   */
  async updateIngredient(
    id: string,
    dto: UpdateIngredientDto,
  ): Promise<Ingredient> {
    const existing = await this.ingredientRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }

    if (dto.type !== undefined && dto.type !== existing.type) {
      throw new BadRequestException('已创建原料的类型不可修改');
    }

    /**
     * 记账单位（克/毫升/个）不能在有采购商品时改（2026-11-11）。
     *
     * 商品上的换算倍数都是"一件 = 多少【这个单位】"。把克改成个，
     * 原来那条「1 箱 = 5000」会当场变成 5000 个 —— 库存和成本整批翻转，
     * 而且没有任何提示。要改就先停用/删除该原料的采购商品。
     */
    if (
      dto.baseUnit !== undefined &&
      String(dto.baseUnit) !== String(existing.baseUnit)
    ) {
      // 数**所有**商品（含停用）：否则"停用 → 改单位 → 再启用"可以绕开守卫，
      // 之后那条商品的层级/倍数语义全错。
      const skuCount = this.prisma
        ? await this.prisma.procurementSku.count({ where: { ingredientId: id } })
        : 0;
      if (skuCount > 0) {
        throw new BadRequestException(
          `这道原料还有 ${skuCount} 个采购商品（含已停用），不能改记账单位：` +
            '请先停用或删除这些商品，再改单位（否则所有商品的换算倍数都会失灵）',
        );
      }
    }

    const nextType = dto.type !== undefined ? dto.type : existing.type;
    const nextNutritionProfile =
      dto.nutritionProfile !== undefined
        ? normalizeNutritionProfileForWrite(dto.nutritionProfile)
        : existing.nutritionProfile;
    const nextProperties = this.resolvePropertiesForPersistence({
      type: nextType,
      properties: dto.properties !== undefined ? dto.properties : existing.properties,
      nutritionProfile: nextNutritionProfile,
    });
    const nextBaseUnit =
      dto.baseUnit !== undefined ? dto.baseUnit : existing.baseUnit;
    const nextUnitDisplayLabel = this.resolveBaseUnitDisplayName(
      dto,
      existing.unitDisplayLabel,
    );
    const nextPurchaseUnit =
      dto.purchaseUnit !== undefined
        ? this.resolvePurchaseUnitForPersistence(
            {
              purchaseUnit: dto.purchaseUnit,
              baseUnit: nextBaseUnit,
              baseUnitDisplayName: nextUnitDisplayLabel,
              unitDisplayLabel: nextUnitDisplayLabel,
            },
            existing.purchaseUnit,
          )
        : this.resolvePurchaseUnitForPersistence(
            {
              purchaseUnit: existing.purchaseUnit,
              baseUnit: nextBaseUnit,
              baseUnitDisplayName: nextUnitDisplayLabel,
              unitDisplayLabel: nextUnitDisplayLabel,
            },
          );
    const nextPurchaseToBaseRatio =
      dto.purchaseToBaseRatio ?? existing.purchaseToBaseRatio ?? 1;
    // 2026-11-06：生效价并入当前价。老客户端只传 effectivePrice 时按当前价处理。
    const nextCurrentPricePerPurchaseUnit =
      dto.currentPricePerPurchaseUnit ??
      dto.effectivePricePerPurchaseUnit ??
      existing.currentPricePerPurchaseUnit ??
      0;
    const nextEffectivePricePerPurchaseUnit = nextCurrentPricePerPurchaseUnit;

    // 2026-11-06：编辑表单直接写档案价，不经过采购报销那道闸，
    // 于是「红薯被一次保存写成 0 元」这种事闸门拦不住。这里补一道：
    // 已经有价格的原料，不允许被改成 0（要停用请关采购 / DIY 开关）。
    // 食材的采购换算恒为 1（成本口径 = 每基准单位），别处不要试图改它。
    this.assertFoodPurchaseRatioInvariant(nextType, nextPurchaseToBaseRatio);

    this.assertPriceNotWipedToZero({
      ingredientName: existing.name,
      previousPrice: existing.currentPricePerPurchaseUnit,
      nextPrice: nextCurrentPricePerPurchaseUnit,
    });

    const updated = new Ingredient(
      existing.id,
      dto.name !== undefined ? dto.name : existing.name,
      nextType,
      dto.procurementStrategy !== undefined
        ? dto.procurementStrategy
        : existing.procurementStrategy,
      dto.diyEnabled !== undefined ? dto.diyEnabled : existing.diyEnabled,
      dto.procurementEnabled !== undefined
        ? dto.procurementEnabled
        : existing.procurementEnabled,
      dto.brand !== undefined ? dto.brand : existing.brand,
      dto.productModel !== undefined
        ? dto.productModel
        : existing.productModel,
      dto.purchaseChannel !== undefined
        ? dto.purchaseChannel
        : existing.purchaseChannel,
      dto.notes !== undefined ? dto.notes : existing.notes,
      nextBaseUnit,
      nextUnitDisplayLabel,
      nextPurchaseUnit,
      nextPurchaseToBaseRatio,
      nextCurrentPricePerPurchaseUnit,
      nextEffectivePricePerPurchaseUnit,
      dto.weightG !== undefined ? dto.weightG : existing.weightG,
      dto.maxCapacityG !== undefined ? dto.maxCapacityG : existing.maxCapacityG,
      dto.safetyStock !== undefined ? dto.safetyStock : existing.safetyStock,
      dto.reorderPoint !== undefined
        ? dto.reorderPoint
        : existing.reorderPoint,
      dto.targetStock !== undefined ? dto.targetStock : existing.targetStock,
      nextProperties,
      nextNutritionProfile,
      existing.supplementRetailEnabled,
      existing.initialPricePerPurchaseUnit,
    );

    // Update tag associations if provided
    return this.ingredientRepository.save(
      updated,
      dto.tagIds !== undefined ? dto.tagIds : undefined,
    );
  }

  /**
   * Get ingredient tags
   */
  async getIngredientTags(id: string): Promise<any[]> {
    const ingredient = await this.ingredientRepository.findById(id);
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }
    return this.ingredientRepository.getTags(id);
  }

  /**
   * Update ingredient price
   */
  async updateIngredientPrice(
    id: string,
    dto: UpdateIngredientPriceDto,
    operatorId?: string | null,
  ): Promise<Ingredient> {
    const existing = await this.ingredientRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }

    // 2026-11-07 硬门禁：食材成本只有两个来源 —— 建档时用第一条采购商品初始化、
    // 之后由采购报销按实付覆盖。手工改价是第三个来源，会让「来源唯一」不成立。
    if (existing.type === IngredientType.FOOD) {
      throw new BadRequestException(
        `「${existing.name}」是食材，成本只能由「建档时的采购商品」或「采购报销」写入，` +
          '不能手工改。要调价请走采购商品 / 报销',
      );
    }

    this.assertPriceNotWipedToZero({
      ingredientName: existing.name,
      previousPrice: existing.currentPricePerPurchaseUnit,
      nextPrice: dto.currentPricePerPurchaseUnit,
    });
    this.assertPriceChangeNotAbsurd({
      ingredientName: existing.name,
      previousPrice: existing.currentPricePerPurchaseUnit,
      nextPrice: dto.currentPricePerPurchaseUnit,
    });

    const ingredient = await this.ingredientRepository.updatePrice(
      id,
      dto.currentPricePerPurchaseUnit,
    );
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }

    // 手工改价必须留痕：库存页是唯一绕开采购报销直接写成本的入口
    await this.costHistory.record({
      ingredientId: id,
      oldCost: existing.currentPricePerPurchaseUnit,
      newCost: dto.currentPricePerPurchaseUnit,
      source: 'MANUAL',
      operatorId: operatorId ?? null,
      note: '后台手工改价',
    });

    // 2026-11-06：生效价已并入当前价，只写一次
    return ingredient;
  }

  /**
   * 禁止把已有的价格改成 0（2026-11-06 红薯事故后补的闸）。
   *
   * 采购报销那条路有完整的三道闸，但后台「编辑原料」是直接写档案价，
   * 绕过了所有闸。红薯就是这样在 01:31 被一次保存写成 0 元的，
   * 而它还在多个已发布食谱里，成本和售价跟着一起变。
   *
   * 允许的场景：新原料建档时就是 0（还没定价）。
   */
  /**
   * 食材采购换算不变量（2026-11-07 成本口径归位）。
   *
   * 食材的成本 = `current_price_per_purchase_unit ÷ purchase_to_base_ratio`。
   * 换算恒为 1 时，这一列就是「元/基准单位」。一旦有人把换算写成 500，
   * 成本会静默变成原来的 1/500 —— 没有任何报错，只有售价悄悄变低。
   */
  /**
   * 手工改价的「离谱」闸（2026-11-07）。
   *
   * 采购报销那条路有 0 元 / 5 倍 / 8% 三道闸，库存页这条只有「不能改 0」。
   * 折算后食材成本是「元/克」，39.9 这种「本来想填一件的价」会被当成 39.9 元/克 ——
   * 差 500 倍，已发布食谱的售价跟着错。这里至少拦住 5 倍以上的跳变。
   */
  private assertPriceChangeNotAbsurd(params: {
    ingredientName: string;
    previousPrice: number;
    nextPrice: number;
  }): void {
    const previous = Number(params.previousPrice ?? 0);
    const next = Number(params.nextPrice ?? 0);
    if (!(previous > 0) || !(next > 0)) {
      return;
    }

    const multiple = next / previous;
    if (multiple <= 5 && multiple >= 1 / 5) {
      return;
    }

    throw new BadRequestException(
      `「${params.ingredientName}」这次改价是原价的 ${multiple.toFixed(2)} 倍，` +
        `疑似单位或数量录错（食材成本是「元/克」）。确认无误请分两步改，或走采购报销`,
    );
  }

  private assertFoodPurchaseRatioInvariant(
    type: IngredientType | string,
    purchaseToBaseRatio: number,
  ): void {
    if (type !== IngredientType.FOOD) {
      return;
    }

    if (Number(purchaseToBaseRatio) === 1) {
      return;
    }

    throw new BadRequestException(
      '食材的采购换算固定为 1（成本按每克/每毫升记），规格请到「生产/采购SKU」里维护',
    );
  }

  private assertPriceNotWipedToZero(params: {
    ingredientName: string;
    previousPrice: number;
    nextPrice: number;
  }): void {
    if (wouldWipeExistingPrice(params.previousPrice, params.nextPrice)) {
      const previous = Number(params.previousPrice ?? 0);
      throw new BadRequestException(
        `「${params.ingredientName}」当前单价是 ${previous}，不能改成 0 或负数。` +
          `如果不希望它再参与算价，请关闭「参与采购 / DIY」开关，而不是把价格清零。`,
      );
    }
  }

  /**
   * Delete ingredient
   *
   * 删除前先做两件事（2026-11-12）：
   *
   * 1. 拦住「还有业务引用」的原料。此前一律直接 delete，数据库报外键错，
   *    前端只看到一句「删除失败」—— 用户不知道卡在哪。
   * 2. 解开系统自动建的营养档案。补剂建档时会自动生成一条
   *    `Supplement label profile <id>` 词条 + 一条映射，而这条映射是 RESTRICT：
   *    不解开就永远删不掉（线上 175 条原料里 157 条都卡在这里）。
   *
   * 只清「自动生成、且只属于这条原料」的词条；人工挑的 USDA/CFCT 词条一根都不动。
   */
  async deleteIngredient(id: string): Promise<void> {
    // Check if ingredient exists
    const ingredient = await this.ingredientRepository.findById(id);
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }

    await this.assertNoBusinessReferences(id, ingredient.name);
    await this.releaseAutoNutritionProfile(id);

    try {
      await this.ingredientRepository.delete(id);
    } catch (error) {
      // 上面已经逐张表查过；这里兜底，避免再把裸的外键错误抛给前端。
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException(
          `「${ingredient.name}」仍被其它数据引用，暂时无法删除。`,
        );
      }
      throw error;
    }
  }

  /**
   * 删之前把「还被谁用着」说清楚，别让用户对着「删除失败」猜。
   */
  private async assertNoBusinessReferences(
    id: string,
    name: string,
  ): Promise<void> {
    if (!this.prisma) {
      return;
    }

    const [
      recipeCount,
      designCount,
      purchaseCount,
      alternativeCount,
      packagingRuleCount,
    ] = await Promise.all([
      this.prisma.recipeItem.count({ where: { ingredientId: id } }),
      this.prisma.designRecipeItem.count({ where: { ingredientId: id } }),
      this.prisma.purchaseItem.count({ where: { ingredientId: id } }),
      this.prisma.recipeSupplementAlternative.count({
        where: { alternativeIngredientId: id },
      }),
      this.prisma.supplementPackagingRule.count({ where: { ingredientId: id } }),
    ]);

    const blockers: string[] = [];
    if (recipeCount > 0) blockers.push(`${recipeCount} 处配方`);
    if (designCount > 0) blockers.push(`${designCount} 处配方设计稿`);
    if (purchaseCount > 0) blockers.push(`${purchaseCount} 条采购记录`);
    if (alternativeCount > 0) blockers.push(`${alternativeCount} 处补剂替代设置`);
    if (packagingRuleCount > 0) blockers.push(`${packagingRuleCount} 条补剂包装规则`);

    if (blockers.length > 0) {
      throw new BadRequestException(
        `「${name}」还被 ${blockers.join('、')} 引用，不能直接删除：请先处理这些引用。`,
      );
    }
  }

  /**
   * 摘掉自动生成的营养档案（词条 + 映射）。
   *
   * 词条名固定为 `Supplement label profile <ingredientId>`（建档/补数脚本的产物），
   * 只在这个名字、这条原料、且已经没有其它引用时才删 —— 任何一步对不上就留着，
   * 宁可在营养库里多一条，也不误删人工维护的数据。
   */
  private async releaseAutoNutritionProfile(id: string): Promise<void> {
    if (!this.prisma) {
      return;
    }

    const mappings = await this.prisma.nutritionFoodMapping.findMany({
      where: { ingredientId: id },
      select: { nutritionFoodId: true },
    });
    if (mappings.length === 0) {
      return;
    }

    const nutritionFoodIds = Array.from(
      new Set(mappings.map((mapping) => mapping.nutritionFoodId)),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.nutritionFoodMapping.deleteMany({ where: { ingredientId: id } });

      const orphanProfiles = await tx.nutritionFood.findMany({
        where: {
          id: { in: nutritionFoodIds },
          name: `Supplement label profile ${id}`,
          mappings: { none: {} },
          recipeItems: { none: {} },
          designRecipeItems: { none: {} },
        },
        select: { id: true },
      });

      if (orphanProfiles.length > 0) {
        await tx.nutritionFood.deleteMany({
          where: { id: { in: orphanProfiles.map((profile) => profile.id) } },
        });
      }
    });
  }
}

/**
 * Prisma 外键冲突（P2003）。删除接口要把它翻译成人话，而不是 500。
 */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2003'
  );
}
