/**
 * Purchasing Service
 * 采购管理服务
 * Phase 1: Purchasing Management Feature
 */

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderStatus, Order } from '../../domain';
import { ORDER_REPOSITORY } from '../order/order.service';
import type { OrderRepository } from '../../domain/order/order.repository';
import { INGREDIENT_REPOSITORY } from '../ingredient/ingredient.service';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import {
  ProcurementSkuService,
  type ProcurementSkuSummary,
} from '../ingredient/procurement-sku.service';
import {
  PURCHASE_LIST_REPOSITORY,
  PURCHASE_RECORD_REPOSITORY,
} from './purchasing.service.tokens';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import type { PurchaseRecordRepository } from '../../domain/purchasing/purchase-record.repository';
import {
  PurchaseList,
  PurchaseListKind,
  PurchaseItem,
  PurchaseListStatus,
  PurchaseRecord,
} from '../../domain/purchasing';
import { validatePurchasingOperation } from './purchasing-time.utils';
import { DateUtil } from '../../utils/date.util';
import {
  BaseUnit,
  IngredientProcurementStrategy,
} from '../../domain/ingredient/enums';
import {
  RecommendedProductService,
  type RecommendedProductSummary,
} from '../ingredient/recommended-product.service';
import { InventoryService } from '../inventory/inventory.service';
import { resolvePreparationMethodTokens } from '../recipe/preparation-method-text.util';

export interface GeneratePurchaseListDto {
  startDate: string; // YYYY-MM-DD format
  endDate?: string; // YYYY-MM-DD format, optional (defaults to startDate)
}

export interface GeneratePurchaseListResult {
  purchaseList: PurchaseList | null;
  inventoryAllocation: {
    id: string;
    lineCount: number;
    totalAllocatedQuantityG: number;
  } | null;
  fullyCoveredByInventory: boolean;
}

export interface CreateStockPurchaseListDto {
  targetDate: string; // YYYY-MM-DD format
  items: Array<{
    ingredientId: string;
    plannedQuantity: number; // 按采购单位填写
    purchaseChannel?: string;
    productModel?: string;
    notes?: string;
  }>;
}

export interface CompletePurchaseDto {
  actualCosts?: Array<{ itemId: string; actualCost: number }>;
}

export interface AddPurchaseRecordDto {
  purchaseItemId: string;
  ingredientId?: string;
  ingredientName?: string;
  procurementSkuId?: string;
  purchaseChannel: string;
  actualQuantity?: number;
  actualPackageCount?: number;
  actualPackageSize?: number;
  actualPackageUnit?: string;
  actualCost: number;
  productModel?: string;
  notes?: string;
}

export interface UpdatePurchaseRecordDto {
  purchaseChannel?: string;
  actualQuantity?: number;
  actualPackageCount?: number;
  actualPackageSize?: number;
  actualPackageUnit?: string;
  actualCost?: number;
  productModel?: string;
  notes?: string;
}

export interface PurchaseRequirement {
  ingredientId: string;
  ingredientName: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  quantityNeeded: number; // 基于baseUnit
  quantityUnit: string; // G / ML / PCS
  estimatedCost: number; // 基于currentPricePerPurchaseUnit
  grossQuantityNeeded?: number;
  stockDeductedQuantity?: number;
  purchaseShortageQuantity?: number;
  onHandQuantity?: number;
  allocatedQuantity?: number;
  availableQuantity?: number;
  usesInventory?: boolean;
  allocationRequired?: boolean;
  preparationMethods?: string[];
  purchaseChannel?: string;
  productModel?: string;
  displayUnit?: string; // 显示单位（补剂类的单位显示标签）
  ingredientBaseUnit?: string;
  foodDensityGPerMl?: number | null;
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
  minSortOrder?: number; // 最小排序值（用于多食谱合并）
}

export type StockLevelStatus =
  | 'NO_POLICY'
  | 'SUFFICIENT'
  | 'LOW_STOCK'
  | 'NEEDS_REPLENISHMENT';

export interface StockReplenishmentInsight {
  id: string;
  name: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  procurementStrategy: IngredientProcurementStrategy;
  baseUnit: BaseUnit;
  stockUnitLabel: string;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  unitDisplayLabel?: string | null;
  purchaseChannel?: string | null;
  productModel?: string | null;
  procurementSkuId?: string;
  procurementSkuName?: string;
  currentPricePerPurchaseUnit: number;
  effectivePricePerPurchaseUnit?: number | null;
  currentStock: number;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
  stockStatus: StockLevelStatus;
  suggestedBaseQuantity: number;
  suggestedPurchaseQuantity: number;
  suggestedEstimatedCost: number;
  suggestedProductId?: string;
  suggestedProductName?: string;
}

interface NormalizedPurchaseRecordData {
  actualQuantity: number;
  actualPackageCount?: number;
  actualPackageSize?: number;
  actualPackageUnit?: string;
  actualBaseQuantity: number;
  actualBaseUnit: string;
}

interface ProcurementExecutionProfile {
  procurementSku?: ProcurementSkuSummary;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  displayUnit?: string | null;
  purchaseChannel?: string | null;
  productModel?: string | null;
  currentPricePerPurchaseUnit: number;
  effectivePricePerPurchaseUnit: number;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
}

@Injectable()
export class PurchasingService {
  private readonly logger = new Logger(PurchasingService.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepository: IngredientRepository,
    private readonly recommendedProductService: RecommendedProductService,
    private readonly inventoryService: InventoryService,
    private readonly procurementSkuService: ProcurementSkuService,
    @Inject(PURCHASE_LIST_REPOSITORY)
    private readonly purchaseListRepository: PurchaseListRepository,
    @Inject(PURCHASE_RECORD_REPOSITORY)
    private readonly purchaseRecordRepository: PurchaseRecordRepository,
  ) {}

  private mergePreparationMethods(
    current: string[] | undefined,
    next: string[] | undefined,
  ): string[] | undefined {
    const merged = [...(current || []), ...(next || [])].filter(Boolean);
    const unique = merged.filter(
      (method, index) => merged.indexOf(method) === index,
    );
    return unique.length > 0 ? unique : undefined;
  }

  private normalizeComparableText(
    value?: string | null,
  ): string | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : undefined;
  }

  private async buildIngredientLookup(
    ingredientIds: string[],
  ): Promise<Map<string, any>> {
    const uniqueIngredientIds = Array.from(new Set(ingredientIds));
    const ingredients =
      await this.ingredientRepository.findByIds(uniqueIngredientIds);

    return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  }

  private selectSuggestedRecommendedProduct(
    products: RecommendedProductSummary[],
    preferredChannel?: string,
    preferredModel?: string,
  ): RecommendedProductSummary | undefined {
    if (!products.length) {
      return undefined;
    }

    const normalizedChannel = this.normalizeComparableText(preferredChannel);
    const normalizedModel = this.normalizeComparableText(preferredModel);

    const ranked = products
      .map((product, index) => {
        let score = 0;
        if (
          normalizedChannel &&
          this.normalizeComparableText(product.purchaseChannel) === normalizedChannel
        ) {
          score += 1;
        }
        if (
          normalizedModel &&
          this.normalizeComparableText(product.productModel) === normalizedModel
        ) {
          score += 2;
        }

        return { product, index, score };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.index - right.index;
      });

    return ranked[0]?.product;
  }

  private selectSuggestedProcurementSku(
    skus: ProcurementSkuSummary[],
    preferredChannel?: string,
    preferredModel?: string,
  ): ProcurementSkuSummary | undefined {
    if (!skus.length) {
      return undefined;
    }

    const normalizedChannel = this.normalizeComparableText(preferredChannel);
    const normalizedModel = this.normalizeComparableText(preferredModel);
    const hasExplicitPreference = Boolean(normalizedChannel || normalizedModel);

    const ranked = skus
      .map((sku, index) => {
        let score = 0;
        if (!hasExplicitPreference && sku.isDefault) {
          score += 100;
        }
        if (
          normalizedChannel &&
          this.normalizeComparableText(sku.purchaseChannel) ===
            normalizedChannel
        ) {
          score += 2;
        }
        if (
          normalizedModel &&
          this.normalizeComparableText(sku.productModel) === normalizedModel
        ) {
          score += 1;
        }
        if (sku.isDefault) {
          score += 0.5;
        }

        return { sku, index, score };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.index - right.index;
      });

    return ranked[0]?.sku;
  }

  private resolveProcurementExecutionProfile(params: {
    ingredient: any;
    procurementSkus?: ProcurementSkuSummary[];
    preferredChannel?: string;
    preferredModel?: string;
  }): ProcurementExecutionProfile {
    const { ingredient } = params;
    const procurementSku = this.selectSuggestedProcurementSku(
      params.procurementSkus || [],
      params.preferredChannel || ingredient?.purchaseChannel,
      params.preferredModel || ingredient?.productModel,
    );
    const currentPricePerPurchaseUnit =
      procurementSku?.currentPurchasePrice ??
      procurementSku?.referencePurchasePrice ??
      procurementSku?.referencePricePerPurchaseUnit ??
      ingredient?.currentPricePerPurchaseUnit ??
      ingredient?.effectivePricePerPurchaseUnit ??
      0;
    const effectivePricePerPurchaseUnit =
      procurementSku?.currentPurchasePrice ??
      procurementSku?.referencePurchasePrice ??
      procurementSku?.referencePricePerPurchaseUnit ??
      ingredient?.effectivePricePerPurchaseUnit ??
      ingredient?.currentPricePerPurchaseUnit ??
      0;

    return {
      procurementSku,
      purchaseUnit:
        procurementSku?.purchaseUnit ||
        ingredient?.purchaseUnit ||
        ingredient?.baseUnit,
      purchaseToBaseRatio:
        procurementSku?.purchaseToBaseRatio ??
        ingredient?.purchaseToBaseRatio ??
        1,
      displayUnit:
        procurementSku?.displayUnit ||
        procurementSku?.purchaseUnit ||
        ingredient?.unitDisplayLabel ||
        ingredient?.purchaseUnit ||
        ingredient?.baseUnit,
      purchaseChannel:
        procurementSku?.purchaseChannel ||
        params.preferredChannel ||
        ingredient?.purchaseChannel ||
        null,
      productModel:
        procurementSku?.productModel ||
        params.preferredModel ||
        ingredient?.productModel ||
        null,
      currentPricePerPurchaseUnit,
      effectivePricePerPurchaseUnit,
      safetyStock: procurementSku?.safetyStock ?? ingredient?.safetyStock ?? null,
      reorderPoint:
        procurementSku?.reorderPoint ?? ingredient?.reorderPoint ?? null,
      targetStock: procurementSku?.targetStock ?? ingredient?.targetStock ?? null,
    };
  }

  private async enrichRequirementsWithRecommendedProducts(
    requirements: PurchaseRequirement[],
    ingredientLookup: Map<string, any>,
  ): Promise<PurchaseRequirement[]> {
    if (requirements.length === 0) {
      return requirements;
    }

    const recommendedProductsMap =
      await this.recommendedProductService.batchFindActive(
        requirements.map((requirement) => requirement.ingredientId),
      );

    return requirements.map((requirement) => {
      const ingredient = ingredientLookup.get(requirement.ingredientId);
      const preferredChannel =
        requirement.purchaseChannel || ingredient?.purchaseChannel;
      const preferredModel =
        requirement.productModel || ingredient?.productModel;
      const suggestedProduct = this.selectSuggestedRecommendedProduct(
        recommendedProductsMap[requirement.ingredientId] || [],
        preferredChannel,
        preferredModel,
      );

      return {
        ...requirement,
        purchaseChannel:
          requirement.purchaseChannel ||
          suggestedProduct?.purchaseChannel ||
          ingredient?.purchaseChannel ||
          undefined,
        productModel:
          requirement.productModel ||
          suggestedProduct?.productModel ||
          ingredient?.productModel ||
          undefined,
        displayUnit:
          requirement.displayUnit ||
          suggestedProduct?.displayUnit ||
          ingredient?.unitDisplayLabel ||
          ingredient?.purchaseUnit ||
          undefined,
        suggestedProductId:
          requirement.suggestedProductId || suggestedProduct?.id,
        suggestedProductName:
          requirement.suggestedProductName || suggestedProduct?.name,
      };
    });
  }

  private async enrichRequirementsWithProcurementSkus(
    requirements: PurchaseRequirement[],
    ingredientLookup: Map<string, any>,
  ): Promise<PurchaseRequirement[]> {
    if (requirements.length === 0) {
      return requirements;
    }

    const procurementSkuMap = await this.procurementSkuService.batchFindActive(
      requirements.map((requirement) => requirement.ingredientId),
    );

    return requirements.map((requirement) => {
      const ingredient = ingredientLookup.get(requirement.ingredientId);
      const selectedSku = this.selectSuggestedProcurementSku(
        procurementSkuMap[requirement.ingredientId] || [],
        requirement.purchaseChannel || ingredient?.purchaseChannel,
        requirement.productModel || ingredient?.productModel,
      );

      return {
        ...requirement,
        purchaseChannel:
          selectedSku?.purchaseChannel ||
          requirement.purchaseChannel ||
          ingredient?.purchaseChannel ||
          undefined,
        productModel:
          selectedSku?.productModel ||
          requirement.productModel ||
          ingredient?.productModel ||
          undefined,
        displayUnit:
          selectedSku?.displayUnit ||
          requirement.displayUnit ||
          ingredient?.unitDisplayLabel ||
          ingredient?.purchaseUnit ||
          undefined,
        procurementSkuId: requirement.procurementSkuId || selectedSku?.id,
        procurementSkuName:
          requirement.procurementSkuName || selectedSku?.name,
      };
    });
  }

  private async enrichRequirementsWithCatalogData(
    requirements: PurchaseRequirement[],
    ingredientLookup: Map<string, any>,
  ): Promise<PurchaseRequirement[]> {
    const withRecommended =
      await this.enrichRequirementsWithRecommendedProducts(
        requirements,
        ingredientLookup,
      );

    return this.enrichRequirementsWithProcurementSkus(
      withRecommended,
      ingredientLookup,
    );
  }

  private roundNumber(value: number, decimals: number): number {
    return Number(value.toFixed(decimals));
  }

  private roundUpNumber(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.ceil((value - Number.EPSILON) * factor) / factor;
  }

  private usesInventoryForRequirement(ingredient: any): boolean {
    return (
      ingredient?.procurementStrategy ===
        IngredientProcurementStrategy.STOCK_REPLENISHMENT ||
      ingredient?.procurementStrategy === IngredientProcurementStrategy.HYBRID
    );
  }

  private applyInventoryOffset(params: {
    requirement: PurchaseRequirement;
    ingredient: any;
    availability?: {
      onHandQuantityG: number;
      allocatedQuantityG: number;
      availableQuantityG: number;
    };
  }): PurchaseRequirement {
    const grossQuantity = this.roundNumber(
      params.requirement.grossQuantityNeeded ??
        params.requirement.quantityNeeded,
      3,
    );
    const usesInventory = this.usesInventoryForRequirement(params.ingredient);
    const unitCost =
      grossQuantity > 0
        ? Number(params.requirement.estimatedCost || 0) / grossQuantity
        : 0;
    const stockDeductedQuantity = usesInventory
      ? this.roundNumber(
          Math.min(
            grossQuantity,
            params.availability?.availableQuantityG ?? 0,
          ),
          3,
        )
      : 0;
    const shortage = this.roundNumber(
      Math.max(grossQuantity - stockDeductedQuantity, 0),
      3,
    );

    return {
      ...params.requirement,
      grossQuantityNeeded: grossQuantity,
      stockDeductedQuantity,
      purchaseShortageQuantity: shortage,
      quantityNeeded: shortage,
      estimatedCost: this.roundNumber(unitCost * shortage, 2),
      onHandQuantity: params.availability?.onHandQuantityG ?? 0,
      allocatedQuantity: params.availability?.allocatedQuantityG ?? 0,
      availableQuantity: params.availability?.availableQuantityG ?? 0,
      usesInventory,
      allocationRequired: stockDeductedQuantity > 0,
    };
  }

  private async applyInventoryAvailability(
    requirements: PurchaseRequirement[],
    ingredientLookup: Map<string, any>,
  ): Promise<PurchaseRequirement[]> {
    const stockManagedIngredientIds = requirements
      .filter((requirement) =>
        this.usesInventoryForRequirement(
          ingredientLookup.get(requirement.ingredientId),
        ),
      )
      .map((requirement) => requirement.ingredientId);

    const availabilityMap =
      stockManagedIngredientIds.length > 0
        ? await this.inventoryService.getAvailabilityByIngredientIds(
            stockManagedIngredientIds,
          )
        : new Map();

    return requirements.map((requirement) =>
      this.applyInventoryOffset({
        requirement,
        ingredient: ingredientLookup.get(requirement.ingredientId),
        availability: availabilityMap.get(requirement.ingredientId),
      }),
    );
  }

  private getStockLevelStatus(params: {
    currentStock: number;
    safetyStock?: number | null;
    reorderPoint?: number | null;
    targetStock?: number | null;
  }): StockLevelStatus {
    const { currentStock, safetyStock, reorderPoint, targetStock } = params;

    if (reorderPoint !== null && reorderPoint !== undefined && currentStock < reorderPoint) {
      return 'NEEDS_REPLENISHMENT';
    }

    if (safetyStock !== null && safetyStock !== undefined && currentStock < safetyStock) {
      return 'LOW_STOCK';
    }

    if (
      safetyStock !== null &&
      safetyStock !== undefined ||
      reorderPoint !== null &&
      reorderPoint !== undefined ||
      targetStock !== null &&
      targetStock !== undefined
    ) {
      return 'SUFFICIENT';
    }

    return 'NO_POLICY';
  }

  private normalizeMeasurementUnit(unit?: string | null): string {
    const normalized = (unit || '').trim();
    const upper = normalized.toUpperCase();

    if (['G', 'GRAM', 'GRAMS', '克'].includes(upper) || normalized === '克') {
      return 'G';
    }
    if (
      ['KG', 'KGS', '公斤', '千克'].includes(upper) ||
      normalized === '公斤' ||
      normalized === '千克'
    ) {
      return 'KG';
    }
    if (normalized === '斤') {
      return 'JIN';
    }
    if (
      ['ML', 'MILLILITER', 'MILLILITERS', '毫升'].includes(upper) ||
      normalized === '毫升'
    ) {
      return 'ML';
    }
    if (['L', 'LITER', 'LITERS', '升'].includes(upper) || normalized === '升') {
      return 'L';
    }
    if (
      [
        'PCS',
        'PIECE',
        'PIECES',
        '个',
        '件',
        '袋',
        '包',
        '盒',
        '瓶',
        '罐',
        '张',
        '片',
        '支',
        '桶',
        '箱',
      ].includes(upper) ||
      ['个', '件', '袋', '包', '盒', '瓶', '罐', '张', '片', '支', '桶', '箱'].includes(
        normalized,
      )
    ) {
      return 'PCS';
    }

    return upper || normalized;
  }

  private resolveBaseUnit(purchaseItem: PurchaseItem): BaseUnit {
    const rawUnit = purchaseItem.ingredient?.baseUnit || purchaseItem.quantityUnit;
    const normalized = (rawUnit || '').toUpperCase();

    if (
      normalized === BaseUnit.G ||
      normalized === BaseUnit.ML ||
      normalized === BaseUnit.PCS
    ) {
      return normalized as BaseUnit;
    }

    throw new BadRequestException(
      `采购明细 ${purchaseItem.id} 缺少可识别的基础单位，无法折算实际采购量`,
    );
  }

  private resolvePurchaseToBaseRatio(purchaseItem: PurchaseItem): number {
    const ratio = Number(purchaseItem.ingredient?.purchaseToBaseRatio ?? 0);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      throw new BadRequestException(
        `原料 ${purchaseItem.ingredientName} 缺少有效的采购换算系数，无法折算实际采购量`,
      );
    }
    return ratio;
  }

  private resolveDensity(purchaseItem: PurchaseItem): number | null {
    const density = Number(
      purchaseItem.ingredient?.properties?.density_g_per_ml ?? 0,
    );
    return Number.isFinite(density) && density > 0 ? density : null;
  }

  private convertAmountToBaseQuantity(params: {
    baseUnit: BaseUnit;
    inputUnit: string;
    amount: number;
    density: number | null;
    ingredientName: string;
  }): number {
    const { baseUnit, amount, density, ingredientName } = params;
    const inputUnit = this.normalizeMeasurementUnit(params.inputUnit);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('实际采购规格必须大于 0');
    }

    if (baseUnit === BaseUnit.G) {
      switch (inputUnit) {
        case 'G':
          return amount;
        case 'KG':
          return amount * 1000;
        case 'JIN':
          return amount * 500;
        case 'ML':
          if (!density) {
            throw new BadRequestException(
              `${ingredientName} 缺少密度信息，无法把毫升换算为克`,
            );
          }
          return amount * density;
        case 'L':
          if (!density) {
            throw new BadRequestException(
              `${ingredientName} 缺少密度信息，无法把升换算为克`,
            );
          }
          return amount * 1000 * density;
        default:
          throw new BadRequestException(
            `${ingredientName} 当前按重量管理，不支持规格单位 ${params.inputUnit}`,
          );
      }
    }

    if (baseUnit === BaseUnit.ML) {
      switch (inputUnit) {
        case 'ML':
          return amount;
        case 'L':
          return amount * 1000;
        case 'G':
          if (!density) {
            throw new BadRequestException(
              `${ingredientName} 缺少密度信息，无法把克换算为毫升`,
            );
          }
          return amount / density;
        case 'KG':
          if (!density) {
            throw new BadRequestException(
              `${ingredientName} 缺少密度信息，无法把千克换算为毫升`,
            );
          }
          return (amount * 1000) / density;
        case 'JIN':
          if (!density) {
            throw new BadRequestException(
              `${ingredientName} 缺少密度信息，无法把斤换算为毫升`,
            );
          }
          return (amount * 500) / density;
        default:
          throw new BadRequestException(
            `${ingredientName} 当前按体积管理，不支持规格单位 ${params.inputUnit}`,
          );
      }
    }

    if (baseUnit === BaseUnit.PCS) {
      if (inputUnit !== 'PCS') {
        throw new BadRequestException(
          `${ingredientName} 当前按件数管理，不支持规格单位 ${params.inputUnit}`,
        );
      }
      return amount;
    }

    throw new BadRequestException(
      `${ingredientName} 的基础单位 ${baseUnit} 暂不支持自动换算`,
    );
  }

  private buildNormalizedPurchaseRecordData(
    purchaseItem: PurchaseItem,
    dto: AddPurchaseRecordDto | UpdatePurchaseRecordDto,
    existingRecord?: PurchaseRecord,
  ): NormalizedPurchaseRecordData {
    const purchaseToBaseRatio = this.resolvePurchaseToBaseRatio(purchaseItem);
    const baseUnit = this.resolveBaseUnit(purchaseItem);
    const density = this.resolveDensity(purchaseItem);
    const rawFactsProvided =
      dto.actualPackageCount !== undefined ||
      dto.actualPackageSize !== undefined ||
      dto.actualPackageUnit !== undefined;

    if (rawFactsProvided) {
      const packageCount =
        dto.actualPackageCount ?? existingRecord?.actualPackageCount;
      const packageSize =
        dto.actualPackageSize ?? existingRecord?.actualPackageSize;
      const packageUnit =
        dto.actualPackageUnit ?? existingRecord?.actualPackageUnit;

      if (
        !Number.isFinite(packageCount) ||
        (packageCount || 0) <= 0 ||
        !Number.isFinite(packageSize) ||
        (packageSize || 0) <= 0 ||
        !packageUnit ||
        packageUnit.trim().length === 0
      ) {
        throw new BadRequestException(
          '请填写完整的实际采购事实：件数、单件规格和规格单位',
        );
      }

      const baseQuantity = this.convertAmountToBaseQuantity({
        baseUnit,
        inputUnit: packageUnit,
        amount: packageCount! * packageSize!,
        density,
        ingredientName: purchaseItem.ingredientName,
      });

      return {
        actualQuantity: this.roundNumber(baseQuantity / purchaseToBaseRatio, 6),
        actualPackageCount: this.roundNumber(packageCount!, 3),
        actualPackageSize: this.roundNumber(packageSize!, 3),
        actualPackageUnit: packageUnit.trim(),
        actualBaseQuantity: this.roundNumber(baseQuantity, 6),
        actualBaseUnit: baseUnit,
      };
    }

    if (dto.actualQuantity !== undefined) {
      if (!Number.isFinite(dto.actualQuantity) || dto.actualQuantity <= 0) {
        throw new BadRequestException('实际采购数量必须大于 0');
      }

      return {
        actualQuantity: this.roundNumber(dto.actualQuantity, 6),
        actualBaseQuantity: this.roundNumber(
          dto.actualQuantity * purchaseToBaseRatio,
          6,
        ),
        actualBaseUnit: baseUnit,
      };
    }

    if (existingRecord) {
      return {
        actualQuantity: existingRecord.actualQuantity,
        actualPackageCount: existingRecord.actualPackageCount,
        actualPackageSize: existingRecord.actualPackageSize,
        actualPackageUnit: existingRecord.actualPackageUnit,
        actualBaseQuantity:
          existingRecord.actualBaseQuantity ??
          this.roundNumber(existingRecord.actualQuantity * purchaseToBaseRatio, 6),
        actualBaseUnit: existingRecord.actualBaseUnit || baseUnit,
      };
    }

    throw new BadRequestException(
      '请填写实际采购数量，或填写件数、单件规格和规格单位',
    );
  }

  private async buildIngredientLookupFromOrders(
    orders: Order[],
  ): Promise<Map<string, any>> {
    const ingredientIds = Array.from(
      new Set(
        orders.flatMap((order) => {
          const ingredientDetails =
            (order.pricingBreakdownSnapshot as any)?.ingredientDetails || [];
          return ingredientDetails
            .map((detail: any) => detail?.ingredientId)
            .filter(Boolean);
        }),
      ),
    );

    if (ingredientIds.length === 0) {
      return new Map();
    }

    const ingredients = await this.ingredientRepository.findByIds(ingredientIds);
    return new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  }

  async getStockReplenishmentIngredients(params?: {
    keyword?: string;
    type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
    onlyNeedsReplenishment?: boolean;
    includeDaily?: boolean;
  }): Promise<StockReplenishmentInsight[]> {
    const keyword = (params?.keyword || '').trim().toLowerCase();
    const ingredients = await this.ingredientRepository.findAll();
    const procurementSkuMap = await this.procurementSkuService.batchFindActive(
      ingredients.map((ingredient) => ingredient.id),
    );
    const filteredIngredients = ingredients
      .filter(
        (ingredient) =>
          params?.includeDaily !== false ||
          ingredient.procurementStrategy !==
            IngredientProcurementStrategy.DAILY_PURCHASE,
      )
      .filter((ingredient) => !params?.type || ingredient.type === params.type)
      .filter((ingredient) => {
        if (!keyword) {
          return true;
        }

        return [ingredient.name, ingredient.purchaseChannel, ingredient.productModel]
          .concat(
            (procurementSkuMap[ingredient.id] || []).flatMap((sku) => [
              sku.name,
              sku.purchaseChannel,
              sku.productModel,
            ]),
          )
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(keyword));
      });

    const currentStocks = await Promise.all(
      filteredIngredients.map(async (ingredient) => {
        const balance = await this.inventoryService.getBalanceByIngredient(
          ingredient.id,
        );
        return [ingredient.id, balance] as const;
      }),
    );
    const currentStockMap = new Map(currentStocks);
    const ingredientLookup = new Map(
      filteredIngredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    let insights = filteredIngredients.map((ingredient): StockReplenishmentInsight => {
      const profile = this.resolveProcurementExecutionProfile({
        ingredient,
        procurementSkus: procurementSkuMap[ingredient.id] || [],
      });
      const currentStock = this.roundNumber(
        currentStockMap.get(ingredient.id) ?? 0,
        3,
      );
      const stockStatus = this.getStockLevelStatus({
        currentStock,
        safetyStock: profile.safetyStock,
        reorderPoint: profile.reorderPoint,
        targetStock: profile.targetStock,
      });
      const targetBaseQuantity =
        profile.targetStock ??
        profile.reorderPoint ??
        profile.safetyStock ??
        null;
      const suggestedBaseQuantity =
        stockStatus === 'NEEDS_REPLENISHMENT' && targetBaseQuantity !== null
          ? this.roundNumber(Math.max(targetBaseQuantity - currentStock, 0), 3)
          : 0;
      const suggestedPurchaseQuantity =
        suggestedBaseQuantity > 0
          ? this.roundUpNumber(
              suggestedBaseQuantity / profile.purchaseToBaseRatio,
              3,
            )
          : 0;

      return {
        id: ingredient.id,
        name: ingredient.name,
        type: ingredient.type,
        procurementStrategy: ingredient.procurementStrategy,
        baseUnit: ingredient.baseUnit,
        stockUnitLabel: ingredient.unitDisplayLabel || ingredient.baseUnit,
        purchaseUnit: profile.purchaseUnit,
        purchaseToBaseRatio: profile.purchaseToBaseRatio,
        unitDisplayLabel: profile.displayUnit || ingredient.unitDisplayLabel,
        purchaseChannel: profile.purchaseChannel,
        productModel: profile.productModel,
        procurementSkuId: profile.procurementSku?.id,
        procurementSkuName: profile.procurementSku?.name,
        currentPricePerPurchaseUnit: profile.currentPricePerPurchaseUnit,
        effectivePricePerPurchaseUnit: profile.effectivePricePerPurchaseUnit,
        currentStock,
        safetyStock: profile.safetyStock,
        reorderPoint: profile.reorderPoint,
        targetStock: profile.targetStock,
        stockStatus,
        suggestedBaseQuantity,
        suggestedPurchaseQuantity,
        suggestedEstimatedCost: this.roundNumber(
          suggestedPurchaseQuantity * profile.effectivePricePerPurchaseUnit,
          2,
        ),
      };
    });

    const replenishmentRequirements = insights
      .filter((item) => item.suggestedPurchaseQuantity > 0)
      .map((item): PurchaseRequirement => ({
        ingredientId: item.id,
        ingredientName: item.name,
        type: item.type,
        quantityNeeded: item.suggestedPurchaseQuantity,
        quantityUnit: item.purchaseUnit,
        estimatedCost: item.suggestedEstimatedCost,
        purchaseChannel: item.purchaseChannel || undefined,
        productModel: item.productModel || undefined,
        displayUnit: item.unitDisplayLabel || item.purchaseUnit,
        procurementSkuId: item.procurementSkuId,
        procurementSkuName: item.procurementSkuName,
      }));

    const enrichedRequirements =
      await this.enrichRequirementsWithCatalogData(
        replenishmentRequirements,
        ingredientLookup,
      );
    const enrichedRequirementMap = new Map(
      enrichedRequirements.map((requirement) => [requirement.ingredientId, requirement]),
    );

    insights = insights
      .map((item) => {
        const enriched = enrichedRequirementMap.get(item.id);
        if (!enriched) {
          return item;
        }
        return {
          ...item,
          purchaseChannel: enriched.purchaseChannel || item.purchaseChannel,
          productModel: enriched.productModel || item.productModel,
          suggestedProductId: enriched.suggestedProductId,
          suggestedProductName: enriched.suggestedProductName,
        };
      })
      .filter(
        (item) =>
          !params?.onlyNeedsReplenishment ||
          item.stockStatus === 'NEEDS_REPLENISHMENT',
      )
      .sort((left, right) => {
        const statusOrder: Record<StockLevelStatus, number> = {
          NEEDS_REPLENISHMENT: 1,
          LOW_STOCK: 2,
          SUFFICIENT: 3,
          NO_POLICY: 4,
        };
        const strategyOrder = {
          [IngredientProcurementStrategy.STOCK_REPLENISHMENT]: 1,
          [IngredientProcurementStrategy.HYBRID]: 2,
          [IngredientProcurementStrategy.DAILY_PURCHASE]: 3,
        };
        if (statusOrder[left.stockStatus] !== statusOrder[right.stockStatus]) {
          return statusOrder[left.stockStatus] - statusOrder[right.stockStatus];
        }
        if (left.procurementStrategy !== right.procurementStrategy) {
          return (
            strategyOrder[left.procurementStrategy] -
            strategyOrder[right.procurementStrategy]
          );
        }
        if (left.type !== right.type) {
          const typeOrder = { FOOD: 1, SUPPLEMENT: 2, PACKAGING: 3 };
          return typeOrder[left.type] - typeOrder[right.type];
        }
        return left.name.localeCompare(right.name, 'zh-CN');
      });

    return insights;
  }

  async createStockPurchaseList(
    dto: CreateStockPurchaseListDto,
    createdById: string,
  ): Promise<PurchaseList> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('请至少选择一项补货原料');
    }

    const targetDate = new Date(`${dto.targetDate}T12:00:00`);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException(
        `日期格式无效。期望格式：YYYY-MM-DD，实际值：${dto.targetDate}`,
      );
    }

    const { start: checkStart, end: checkEnd } = DateUtil.createDateRange(
      dto.targetDate,
    );
    const existingLists = await this.purchaseListRepository.findByDateRange(
      checkStart,
      checkEnd,
    );
    const pendingStockList = existingLists.find(
      (list) =>
        list.kind === PurchaseListKind.STOCK_REPLENISHMENT &&
        list.status === PurchaseListStatus.PENDING,
    );

    if (pendingStockList) {
      throw new ConflictException(
        `日期 ${dto.targetDate} 已存在待处理的补货采购单，请继续编辑该清单`,
      );
    }

    const mergedItems = new Map<
      string,
      {
        ingredientId: string;
        plannedQuantity: number;
        purchaseChannel?: string;
        productModel?: string;
        notes?: string;
      }
    >();

    for (const item of dto.items) {
      if (!item.ingredientId) {
        throw new BadRequestException('补货原料缺少 ingredientId');
      }
      if (!Number.isFinite(item.plannedQuantity) || item.plannedQuantity <= 0) {
        throw new BadRequestException('计划采购数量必须大于 0');
      }

      const existing = mergedItems.get(item.ingredientId);
      if (existing) {
        existing.plannedQuantity += item.plannedQuantity;
        existing.purchaseChannel = item.purchaseChannel || existing.purchaseChannel;
        existing.productModel = item.productModel || existing.productModel;
        existing.notes = item.notes || existing.notes;
      } else {
        mergedItems.set(item.ingredientId, {
          ingredientId: item.ingredientId,
          plannedQuantity: item.plannedQuantity,
          purchaseChannel: item.purchaseChannel,
          productModel: item.productModel,
          notes: item.notes,
        });
      }
    }

    const ingredientIds = Array.from(mergedItems.keys());
    const ingredients = await this.ingredientRepository.findByIds(ingredientIds);
    if (ingredients.length !== ingredientIds.length) {
      const foundIds = new Set(ingredients.map((ingredient) => ingredient.id));
      const missingIds = ingredientIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(
        `以下原料不存在，无法创建补货采购单：${missingIds.join(', ')}`,
      );
    }

    const ingredientLookup = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );
    const procurementSkuMap = await this.procurementSkuService.batchFindActive(
      ingredientIds,
    );

    const requirements = await this.enrichRequirementsWithCatalogData(
      ingredientIds.map((ingredientId): PurchaseRequirement => {
        const ingredient = ingredientLookup.get(ingredientId)!;
        const input = mergedItems.get(ingredientId)!;
        const profile = this.resolveProcurementExecutionProfile({
          ingredient,
          procurementSkus: procurementSkuMap[ingredientId] || [],
          preferredChannel: input.purchaseChannel,
          preferredModel: input.productModel,
        });
        return {
          ingredientId,
          ingredientName: ingredient.name,
          type: ingredient.type,
          quantityNeeded: this.roundNumber(input.plannedQuantity, 3),
          quantityUnit: profile.purchaseUnit,
          estimatedCost: this.roundNumber(
            input.plannedQuantity * profile.effectivePricePerPurchaseUnit,
            2,
          ),
          purchaseChannel: profile.purchaseChannel || undefined,
          productModel: profile.productModel || undefined,
          displayUnit: profile.displayUnit || profile.purchaseUnit,
          procurementSkuId: profile.procurementSku?.id,
          procurementSkuName: profile.procurementSku?.name,
        };
      }),
      ingredientLookup,
    );

    const items = requirements.map((req) => {
      const input = mergedItems.get(req.ingredientId)!;
      return new PurchaseItem({
        purchaseListId: '',
        ingredientId: req.ingredientId,
        procurementSkuId: req.procurementSkuId,
        procurementSkuName: req.procurementSkuName,
        ingredientName: req.ingredientName,
        type: req.type,
        quantityNeeded: req.quantityNeeded,
        quantityUnit: req.quantityUnit,
        estimatedCost: req.estimatedCost,
        purchaseChannel: req.purchaseChannel,
        productModel: req.productModel,
        suggestedProductId: req.suggestedProductId,
        suggestedProductName: req.suggestedProductName,
        displayUnit: req.displayUnit,
        notes: input.notes,
      });
    });

    const totalEstimatedCost = items.reduce(
      (sum, item) => sum + Number(item.estimatedCost),
      0,
    );

    const purchaseList = new PurchaseList({
      targetDate,
      kind: PurchaseListKind.STOCK_REPLENISHMENT,
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost: this.roundNumber(totalEstimatedCost, 2),
      itemCount: items.length,
      createdById,
      sourceOrderIds: [],
      items,
    });

    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(
      `Stock replenishment purchase list ${saved.id} created successfully with ${items.length} items`,
    );

    return saved;
  }
  /**
   * 计算指定日期范围的采购需求
   * 复用订单的 pricingBreakdownSnapshot 中的 ingredientDetails
   */
  async calculatePurchaseRequirements(
    startDate: string,
    endDate?: string,
  ): Promise<PurchaseRequirement[]> {
    const end = endDate || startDate;

    // 为targetProductionDate查询创建范围（使用午夜00:00:00，因为数据库中存储的是午夜时间）
    const start_date = new Date(`${startDate}T00:00:00`);
    const end_date = new Date(`${end}T23:59:59.999`);

    this.logger.log(
      `Calculating purchase requirements from ${startDate} to ${end}`,
    );
    this.logger.log(
      `Query range (local): ${start_date.toString()} to ${end_date.toString()}`,
    );
    this.logger.log(
      `Query range (UTC): ${start_date.toISOString()} to ${end_date.toISOString()}`,
    );

    // 查询制作日期范围内的待生产订单（PAID状态）
    // 使用 targetProductionDate 而不是 createdAt，因为采购需求基于制作日期
    const { list: orders } =
      await this.orderRepository.findByTargetProductionDateRange({
        status: OrderStatus.PAID,
        startDate: start_date,
        endDate: end_date,
      });

    this.logger.log(`Found ${orders.length} PAID orders in query range`);

    if (orders.length === 0) {
      this.logger.warn(
        `No PAID orders found with target production date in range ${startDate} - ${end}`,
      );
      return [];
    }

    this.logger.log(
      `Found ${orders.length} PAID orders for purchase calculation`,
    );

    const ingredientLookup = await this.buildIngredientLookupFromOrders(orders);

    // 汇总所有订单的原料需求
    const ingredientMap = new Map<string, PurchaseRequirement>();

    for (const order of orders) {
      // 检查订单是否有定价快照
      if (!order.pricingBreakdownSnapshot) {
        this.logger.warn(
          `Order ${order.id} has no pricing breakdown snapshot, skipping`,
        );
        continue;
      }

      const pricingBreakdown = order.pricingBreakdownSnapshot as any;
      const ingredientDetails = pricingBreakdown.ingredientDetails || [];

      // 创建recipeSnapshot的映射，用于获取sort_order
      const recipeSnapshotMap = new Map<string, any>();
      for (const orderItem of order.items) {
        if (orderItem.recipeSnapshot?.items) {
          for (const item of orderItem.recipeSnapshot.items) {
            recipeSnapshotMap.set(item.ingredient_id, item);
          }
        }
      }

      // 遍历定价快照中的每个原料
      for (const detail of ingredientDetails) {
        const key = detail.ingredientId;
        const ingredientId = detail.ingredientId;

        // 从recipeSnapshot中获取原料信息（用于排序和类型）
        const recipeItem = recipeSnapshotMap.get(ingredientId);
        if (!recipeItem) {
          this.logger.warn(
            `Ingredient ${ingredientId} (${detail.name}) not found in recipe snapshot, skipping`,
          );
          continue;
        }

        // purchaseAmount 是整个订单的采购总量（已包含制作损耗，不含出肉率）
        // 如果没有 purchaseAmount，回退到 amount
        const purchaseQuantity = detail.purchaseAmount || detail.amount || 0;

        // 调试日志
        this.logger.debug(`Ingredient calculation: ${detail.name}`, {
          ingredientId,
          purchaseAmount: detail.purchaseAmount,
          amount: detail.amount,
          purchaseQuantity,
          type: detail.type,
          sortOrder: recipeItem.sort_order,
        });

        // 如果采购量为0或负数，跳过该原料
        if (purchaseQuantity <= 0) {
          this.logger.warn(
            `Skipping ingredient ${detail.name} due to non-positive quantity: ${purchaseQuantity}`,
          );
          continue;
        }

        // 获取原料类型（从recipeSnapshot或ingredientDetails）
        const type = recipeItem.ingredient_type || detail.type || 'FOOD';

        // 使用订单的总成本
        const totalCost = detail.cost || 0;
        const preparationMethods = resolvePreparationMethodTokens(
          (detail as any).preparationMethod,
          new Map(),
          { preserveUnresolvedLegacy: false },
        );

        if (ingredientMap.has(key)) {
          // 累加数量和成本
          const existing = ingredientMap.get(key)!;
          existing.quantityNeeded += purchaseQuantity;
          existing.estimatedCost += totalCost;
          existing.preparationMethods = this.mergePreparationMethods(
            existing.preparationMethods,
            preparationMethods,
          );
          // 更新最小sortOrder
          if (recipeItem.sort_order !== undefined) {
            existing.minSortOrder = Math.min(
              existing.minSortOrder ?? 99999,
              recipeItem.sort_order,
            );
          }
        } else {
          const ingredient = ingredientLookup.get(key);
          // 新增原料
          ingredientMap.set(key, {
            ingredientId: key,
            ingredientName: detail.name,
            type: type,
            quantityNeeded: purchaseQuantity,
            quantityUnit: detail.unit || 'G',
            estimatedCost: totalCost,
            preparationMethods:
              preparationMethods.length > 0 ? preparationMethods : undefined,
            purchaseChannel: detail.purchaseChannel,
            productModel: detail.productModel,
            displayUnit: detail.displayUnit,
            ingredientBaseUnit: ingredient?.baseUnit,
            foodDensityGPerMl:
              ingredient?.baseUnit === 'ML'
                ? Number(
                    (ingredient.properties as any)?.density_g_per_ml ?? 0,
                  ) || null
                : null,
            minSortOrder: recipeItem.sort_order,
          });
        }
      }
    }

    // 转换为数组并排序：先按类型，再按sortOrder
    const requirements = Array.from(ingredientMap.values()).sort((a, b) => {
      // 1. 先按类型排序
      const typeOrder = { FOOD: 1, SUPPLEMENT: 2, PACKAGING: 3 };
      const typeDiff = typeOrder[a.type] - typeOrder[b.type];
      if (typeDiff !== 0) return typeDiff;

      // 2. 同类型内按sortOrder排序（取最小值）
      return (a.minSortOrder ?? 99999) - (b.minSortOrder ?? 99999);
    });

    this.logger.log(
      `Calculated ${requirements.length} unique ingredient requirements`,
    );

    const enrichedRequirements = await this.enrichRequirementsWithCatalogData(
      requirements,
      ingredientLookup,
    );

    return this.applyInventoryAvailability(
      enrichedRequirements,
      ingredientLookup,
    );
  }

  /**
   * 预览采购需求（不创建采购清单，不改变订单状态）
   */
  async previewPurchaseRequirements(
    startDate: string,
    endDate?: string,
  ): Promise<{
    targetDateRange: { start: string; end: string };
    itemCount: number;
    totalEstimatedCost: number;
    items: Array<{
      ingredientId: string;
      ingredientName: string;
      quantityNeeded: number;
      quantityUnit: string;
      estimatedCost: number;
      type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
      displayUnit?: string;
      ingredientBaseUnit?: string;
      foodDensityGPerMl?: number | null;
      preparationMethods?: string[];
      purchaseChannel?: string;
      productModel?: string;
      procurementSkuId?: string;
      procurementSkuName?: string;
      suggestedProductId?: string;
      suggestedProductName?: string;
    }>;
    affectedOrders: Array<{
      orderId: string;
      targetProductionDate: string;
    }>;
  }> {
    const end = endDate || startDate;

    this.logger.log(
      `Previewing purchase requirements for ${startDate} - ${end}`,
    );

    // 1. 计算采购需求（复用现有逻辑）
    const requirements = await this.calculatePurchaseRequirements(
      startDate,
      end,
    );

    const enrichedRequirements = requirements;

    // 2. 查询影响的订单（用于预览）
    const start_date = new Date(`${startDate}T00:00:00`);
    const end_date = new Date(`${end}T23:59:59.999`);
    const { list: orders } =
      await this.orderRepository.findByTargetProductionDateRange({
        status: OrderStatus.PAID,
        startDate: start_date,
        endDate: end_date,
      });

    // 3. 组装订单信息
    const affectedOrders = orders.map((order) => ({
      orderId: order.id,
      targetProductionDate:
        order.targetProductionDate?.toISOString().split('T')[0] || '',
    }));

    // 4. 组装返回数据（只返回必要的信息）
    const items = enrichedRequirements.map((req) => ({
      ingredientId: req.ingredientId,
      ingredientName: req.ingredientName,
      quantityNeeded: req.quantityNeeded,
      quantityUnit: req.quantityUnit,
      estimatedCost: req.estimatedCost,
      type: req.type,
      displayUnit: req.displayUnit,
      ingredientBaseUnit: req.ingredientBaseUnit,
      foodDensityGPerMl: req.foodDensityGPerMl,
      preparationMethods: req.preparationMethods,
      purchaseChannel: req.purchaseChannel,
      productModel: req.productModel,
      procurementSkuId: req.procurementSkuId,
      procurementSkuName: req.procurementSkuName,
      suggestedProductId: req.suggestedProductId,
      suggestedProductName: req.suggestedProductName,
    }));

    const totalEstimatedCost = requirements.reduce(
      (sum, req) => sum + req.estimatedCost,
      0,
    );

    return {
      targetDateRange: { start: startDate, end },
      totalEstimatedCost,
      itemCount: enrichedRequirements.length,
      items,
      affectedOrders,
    };
  }

  /**
   * 生成采购清单
   */
  async generatePurchaseList(
    dto: GeneratePurchaseListDto,
    createdById: string,
  ): Promise<GeneratePurchaseListResult> {
    const end = dto.endDate || dto.startDate;

    // 为targetProductionDate查询创建范围（使用午夜00:00:00，因为数据库中存储的是午夜时间）
    const queryStartDate = new Date(`${dto.startDate}T00:00:00`);
    const queryEndDate = new Date(`${end}T23:59:59.999`);

    // 为采购清单的targetDate创建中午12点时间（与其他模块保持一致）
    const targetDate = new Date(`${dto.startDate}T12:00:00`);

    // 验证日期格式
    if (isNaN(queryStartDate.getTime()) || isNaN(queryEndDate.getTime())) {
      throw new BadRequestException(
        `日期格式无效。期望格式：YYYY-MM-DD，实际值：${dto.startDate}`,
      );
    }

    // 验证日期范围
    if (queryEndDate < queryStartDate) {
      throw new BadRequestException('结束日期不能早于开始日期');
    }

    // 检查同日采购清单：
    // - 若存在待采购清单，则必须继续使用该清单，避免重复采购
    // - 若仅存在已完成清单，则允许新建一张独立的增量采购清单
    const { start: checkStart, end: checkEnd } = DateUtil.createDateRange(
      dto.startDate,
    );
    const existingLists = await this.purchaseListRepository.findByDateRange(
      checkStart,
      checkEnd,
    );
    const pendingList = existingLists.find(
      (list) => list.status === PurchaseListStatus.PENDING,
    );
    const hasCompletedLists = existingLists.some(
      (list) => list.status === PurchaseListStatus.COMPLETED,
    );

    if (pendingList) {
      throw new ConflictException(
        `日期 ${dto.startDate} 已存在待采购清单，请进入现有清单继续采购或合并新增订单`,
      );
    }

    this.logger.log(
      `${hasCompletedLists ? 'Generating supplemental purchase list' : 'Generating purchase list'} for ${dto.startDate} - ${end} by user ${createdById}`,
    );

    // 计算采购需求
    const requirements = await this.calculatePurchaseRequirements(
      dto.startDate,
      end,
    );

    if (requirements.length === 0) {
      throw new BadRequestException(
        hasCompletedLists
          ? `日期 ${dto.startDate} 当前没有新的待采购订单，无需生成增量采购清单`
          : `日期范围 ${dto.startDate} - ${end} 内没有找到采购需求，请确认有待生产的订单`,
      );
    }

    const enrichedRequirements = requirements;
    const purchaseRequirements = enrichedRequirements.filter(
      (requirement) => requirement.quantityNeeded > 0,
    );
    const allocationLines = enrichedRequirements
      .filter((requirement) => (requirement.stockDeductedQuantity ?? 0) > 0)
      .map((requirement) => ({
        ingredientId: requirement.ingredientId,
        procurementSkuId: requirement.procurementSkuId,
        quantityG: requirement.stockDeductedQuantity!,
      }));

    // 查询订单ID列表（使用制作日期查询）
    const { list: orders } =
      await this.orderRepository.findByTargetProductionDateRange({
        status: OrderStatus.PAID,
        startDate: queryStartDate,
        endDate: queryEndDate,
      });
    const sourceOrderIds = orders.map((o) => o.id);

    // 转换订单状态：PAID → PURCHASING
    let transitionedCount = 0;
    for (const order of orders) {
      try {
        order.transitionTo(OrderStatus.PURCHASING);
        await this.orderRepository.save(order);
        transitionedCount++;
        this.logger.log(
          `Order ${order.id} transitioned from PAID to PURCHASING`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to transition order ${order.id} to PURCHASING: ${error}`,
        );
      }
    }
    this.logger.log(
      `Transitioned ${transitionedCount}/${orders.length} orders to PURCHASING status`,
    );

    // 创建采购明细：只采购库存抵扣后的缺口
    const totalEstimatedCost = purchaseRequirements.reduce(
      (sum, r) => sum + r.estimatedCost,
      0,
    );
    const items = purchaseRequirements.map(
      (req) =>
        new PurchaseItem({
          purchaseListId: '', // 会在创建PurchaseList时更新
          ingredientId: req.ingredientId,
          procurementSkuId: req.procurementSkuId,
          procurementSkuName: req.procurementSkuName,
          suggestedProductId: req.suggestedProductId,
          suggestedProductName: req.suggestedProductName,
          ingredientName: req.ingredientName, // ✅ 传入原料名称
          type: req.type, // ✅ 传入原料类型
          quantityNeeded: req.quantityNeeded,
          quantityUnit: req.quantityUnit,
          estimatedCost: req.estimatedCost,
          purchaseChannel: req.purchaseChannel,
          productModel: req.productModel,
          displayUnit: req.displayUnit, // ✅ 传入显示单位
        }),
    );

    // 保存订单日期快照
    const orderDateSnapshot: Record<
      string,
      { originalDate: string; hasChanged: boolean }
    > = {};
    for (const order of orders) {
      orderDateSnapshot[order.id] = {
        originalDate:
          order.targetProductionDate?.toISOString().split('T')[0] || '',
        hasChanged: false,
      };
    }

    let saved: PurchaseList | null = null;

    if (items.length > 0) {
      // 创建采购清单（使用中午12点的targetDate）
      const purchaseList = new PurchaseList({
        targetDate: targetDate,
        kind: PurchaseListKind.ORDER_DEMAND,
        status: PurchaseListStatus.PENDING,
        totalEstimatedCost,
        itemCount: items.length,
        createdById,
        sourceOrderIds,
        orderDateSnapshot,
        items,
      });

      // 保存到数据库
      saved = await this.purchaseListRepository.save(purchaseList);

      this.logger.log(
        `Purchase list ${saved.id} created successfully with ${items.length} items`,
      );
    }

    const inventoryAllocation =
      allocationLines.length > 0
        ? await this.inventoryService.createAllocationForOrderDemand({
            targetDate,
            purchaseListId: saved?.id ?? null,
            sourceOrderIds,
            createdById,
            lines: allocationLines,
          })
        : null;

    return {
      purchaseList: saved,
      inventoryAllocation: inventoryAllocation
        ? {
            id: inventoryAllocation.id,
            lineCount: allocationLines.length,
            totalAllocatedQuantityG: this.roundNumber(
              allocationLines.reduce((sum, line) => sum + line.quantityG, 0),
              3,
            ),
          }
        : null,
      fullyCoveredByInventory:
        saved === null && allocationLines.length > 0 && items.length === 0,
    };
  }

  /**
   * 追加订单到采购清单
   */
  async addOrdersToPurchaseList(
    purchaseListId: string,
    orderIds: string[],
    operatorId: string,
  ): Promise<{
    addedCount: number;
    newItems: PurchaseItem[];
    updatedItems: PurchaseItem[];
    purchaseList: PurchaseList;
  }> {
    this.logger.log(
      `Adding ${orderIds.length} orders to purchase list ${purchaseListId}`,
    );

    // 1. 验证采购清单状态
    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);
    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    // 只有PENDING状态可以追加订单
    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以追加订单');
    }

    // 2. 查询订单并验证状态
    const orderPromises = orderIds.map((id) =>
      this.orderRepository.findById(id),
    );
    const orderResults = await Promise.all(orderPromises);
    const orders = orderResults.filter((o) => o !== null);
    const validOrders = orders.filter((o) => o.status === OrderStatus.PAID);

    if (validOrders.length === 0) {
      throw new BadRequestException('没有可追加的PAID状态订单');
    }

    this.logger.log(
      `Found ${validOrders.length}/${orders.length} valid PAID orders to add`,
    );

    const ingredientLookup = await this.buildIngredientLookupFromOrders(
      validOrders,
    );

    // 3. 计算新增订单的原料需求
    const ingredientMap = new Map<string, any>();

    for (const order of validOrders) {
      if (!order.pricingBreakdownSnapshot) {
        this.logger.warn(
          `Order ${order.id} has no pricing breakdown snapshot, skipping`,
        );
        continue;
      }

      const pricingBreakdown = order.pricingBreakdownSnapshot as any;
      const ingredientDetails = pricingBreakdown.ingredientDetails || [];

      for (const detail of ingredientDetails) {
        const key = detail.ingredientId;
        const purchaseQuantity = detail.purchaseAmount || detail.amount || 0;

        if (purchaseQuantity <= 0) continue;

        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key);
          existing.quantityNeeded += purchaseQuantity;
          existing.estimatedCost += detail.cost || 0;
        } else {
          ingredientMap.set(key, {
            ingredientId: key,
            ingredientName: detail.name,
            type: detail.type || 'FOOD',
            quantityNeeded: purchaseQuantity,
            quantityUnit: detail.unit || 'G',
            estimatedCost: detail.cost || 0,
            purchaseChannel: detail.purchaseChannel,
            productModel: detail.productModel,
            displayUnit: detail.displayUnit,
          });
        }
      }
    }

    const enrichedRequirements =
      await this.enrichRequirementsWithCatalogData(
        Array.from(ingredientMap.values()),
        ingredientLookup,
      );

    // 4. 合并到现有采购清单
    const existingItemMap = new Map(
      purchaseList.items.map((item) => [item.ingredientId, item]),
    );

    const newItems: PurchaseItem[] = [];
    const updatedItems: PurchaseItem[] = [];

    for (const requirement of enrichedRequirements) {
      const ingredientId = requirement.ingredientId;
      if (existingItemMap.has(ingredientId)) {
        // 更新现有项
        const existing = existingItemMap.get(ingredientId)!;
        existing.quantityNeeded += requirement.quantityNeeded;
        existing.estimatedCost =
          Number(existing.estimatedCost) + requirement.estimatedCost;
        updatedItems.push(existing);
      } else {
        // 新增项
        const newItem = new PurchaseItem({
          purchaseListId,
          ingredientId: requirement.ingredientId,
          procurementSkuId: requirement.procurementSkuId,
          procurementSkuName: requirement.procurementSkuName,
          suggestedProductId: requirement.suggestedProductId,
          suggestedProductName: requirement.suggestedProductName,
          ingredientName: requirement.ingredientName,
          type: requirement.type,
          quantityNeeded: requirement.quantityNeeded,
          quantityUnit: requirement.quantityUnit,
          estimatedCost: requirement.estimatedCost,
          purchaseChannel: requirement.purchaseChannel,
          productModel: requirement.productModel,
          displayUnit: requirement.displayUnit,
        });
        purchaseList.items.push(newItem);
        newItems.push(newItem);
      }
    }

    // 5. 更新采购清单汇总
    purchaseList.itemCount = purchaseList.items.length;
    purchaseList.totalEstimatedCost = purchaseList.items.reduce(
      (sum, item) => sum + Number(item.estimatedCost),
      0,
    );
    purchaseList.sourceOrderIds = [
      ...new Set([
        ...purchaseList.sourceOrderIds,
        ...validOrders.map((o) => o.id),
      ]),
    ];
    purchaseList.orderDateSnapshot = {
      ...(purchaseList.orderDateSnapshot || {}),
      ...Object.fromEntries(
        validOrders.map((order) => [
          order.id,
          {
            originalDate:
              order.targetProductionDate?.toISOString().split('T')[0] || '',
            hasChanged: false,
          },
        ]),
      ),
    };
    purchaseList.updatedAt = new Date();

    // 6. 转换订单状态
    let transitionedCount = 0;
    for (const order of validOrders) {
      try {
        order.transitionTo(OrderStatus.PURCHASING);
        await this.orderRepository.save(order);
        transitionedCount++;
        this.logger.log(
          `Order ${order.id} transitioned from PAID to PURCHASING`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to transition order ${order.id} to PURCHASING: ${error}`,
        );
      }
    }

    // 7. 保存采购清单
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(
      `Added ${validOrders.length} orders to purchase list ${purchaseListId}`,
    );

    return {
      addedCount: validOrders.length,
      newItems,
      updatedItems,
      purchaseList: saved,
    };
  }

  /**
   * 从采购清单剔除订单
   */
  async removeOrdersFromPurchaseList(
    purchaseListId: string,
    orderIds: string[],
    operatorId: string,
  ): Promise<{
    removedCount: number;
    affectedItems: Array<{
      ingredientId: string;
      ingredientName: string;
      oldQuantity: number;
      newQuantity: number;
    }>;
    purchaseList: PurchaseList;
  }> {
    this.logger.log(
      `Removing ${orderIds.length} orders from purchase list ${purchaseListId}`,
    );

    // 1. 验证采购清单
    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);
    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以剔除订单');
    }

    // 2. 验证订单是否在清单中
    const validOrderIds = orderIds.filter((id) =>
      purchaseList.sourceOrderIds.includes(id),
    );

    if (validOrderIds.length === 0) {
      throw new BadRequestException('这些订单不在当前采购清单中');
    }

    // 3. 查询被剔除的订单
    const orderPromises = validOrderIds.map((id) =>
      this.orderRepository.findById(id),
    );
    const orderResults = await Promise.all(orderPromises);
    const orders = orderResults.filter((o) => o !== null);

    // 4. 计算被剔除订单的原料需求（用于扣减）
    const ingredientDeductionMap = new Map<string, number>();
    const ingredientCostMap = new Map<string, number>();

    for (const order of orders) {
      if (!order.pricingBreakdownSnapshot) {
        continue;
      }

      const pricingBreakdown = order.pricingBreakdownSnapshot as any;
      const ingredientDetails = pricingBreakdown.ingredientDetails || [];

      for (const detail of ingredientDetails) {
        const key = detail.ingredientId;
        const purchaseQuantity = detail.purchaseAmount || detail.amount || 0;
        const cost = detail.cost || 0;

        if (purchaseQuantity <= 0) continue;

        ingredientDeductionMap.set(
          key,
          (ingredientDeductionMap.get(key) || 0) + purchaseQuantity,
        );
        ingredientCostMap.set(key, (ingredientCostMap.get(key) || 0) + cost);
      }
    }

    // 5. 更新采购清单项
    const affectedItems: Array<{
      ingredientId: string;
      ingredientName: string;
      oldQuantity: number;
      newQuantity: number;
    }> = [];

    const itemsToKeep: PurchaseItem[] = [];

    for (const item of purchaseList.items) {
      const deduction = ingredientDeductionMap.get(item.ingredientId) || 0;

      if (deduction > 0) {
        const oldQuantity = item.quantityNeeded;
        item.quantityNeeded -= deduction;

        // 如果数量为0或负数，删除该项
        if (item.quantityNeeded <= 0.01) {
          affectedItems.push({
            ingredientId: item.ingredientId,
            ingredientName: item.ingredientName,
            oldQuantity,
            newQuantity: 0,
          });
          // 不添加到 itemsToKeep，相当于删除
        } else {
          item.estimatedCost =
            Number(item.estimatedCost) -
            (ingredientCostMap.get(item.ingredientId) || 0);
          affectedItems.push({
            ingredientId: item.ingredientId,
            ingredientName: item.ingredientName,
            oldQuantity,
            newQuantity: item.quantityNeeded,
          });
          itemsToKeep.push(item);
        }
      } else {
        itemsToKeep.push(item);
      }
    }

    purchaseList.items = itemsToKeep;

    // 6. 更新采购清单汇总
    purchaseList.itemCount = purchaseList.items.length;
    purchaseList.totalEstimatedCost = purchaseList.items.reduce(
      (sum, item) => sum + Number(item.estimatedCost),
      0,
    );
    purchaseList.sourceOrderIds = purchaseList.sourceOrderIds.filter(
      (id) => !validOrderIds.includes(id),
    );
    purchaseList.updatedAt = new Date();

    // 7. 回退订单状态
    let restoredCount = 0;
    for (const order of orders) {
      if (order.status === OrderStatus.PURCHASING) {
        try {
          order.transitionTo(OrderStatus.PAID);
          await this.orderRepository.save(order);
          restoredCount++;
          this.logger.log(
            `Order ${order.id} transitioned from PURCHASING to PAID`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to restore order ${order.id} to PAID: ${error}`,
          );
        }
      }
    }

    // 8. 保存采购清单
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(
      `Removed ${orders.length} orders from purchase list ${purchaseListId}`,
    );

    return {
      removedCount: orders.length,
      affectedItems,
      purchaseList: saved,
    };
  }

  /**
   * 添加原料到采购清单（人工添加）
   */
  async addManualItem(
    purchaseListId: string,
    dto: {
      ingredientId: string;
      ingredientName: string;
      type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
      quantityNeeded: number;
      quantityUnit: string;
      estimatedCost: number;
      purchaseChannel?: string;
      productModel?: string;
    },
    operatorId: string,
  ): Promise<PurchaseList> {
    this.logger.log(`Adding manual item to purchase list ${purchaseListId}`);

    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以添加原料');
    }

    // 检查原料是否已存在
    const existingItem = purchaseList.items.find(
      (item) => item.ingredientId === dto.ingredientId,
    );

    if (existingItem) {
      throw new BadRequestException('该原料已在清单中，请使用追加订单功能');
    }

    // 创建新原料项
    const newItem = new PurchaseItem({
      purchaseListId,
      ingredientId: dto.ingredientId,
      ingredientName: dto.ingredientName,
      type: dto.type,
      quantityNeeded: dto.quantityNeeded,
      quantityUnit: dto.quantityUnit,
      estimatedCost: dto.estimatedCost,
      purchaseChannel: dto.purchaseChannel,
      productModel: dto.productModel,
    });

    purchaseList.items.push(newItem);
    purchaseList.itemCount = purchaseList.items.length;
    purchaseList.totalEstimatedCost =
      Number(purchaseList.totalEstimatedCost) + dto.estimatedCost;
    purchaseList.updatedAt = new Date();

    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(
      `Added manual item ${dto.ingredientName} to purchase list ${purchaseListId}`,
    );

    return saved;
  }

  /**
   * 从采购清单删除原料
   */
  async removeItem(
    purchaseListId: string,
    itemId: string,
    operatorId: string,
  ): Promise<PurchaseList> {
    this.logger.log(
      `Removing item ${itemId} from purchase list ${purchaseListId}`,
    );

    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以删除原料');
    }

    const itemIndex = purchaseList.items.findIndex(
      (item) => item.id === itemId,
    );

    if (itemIndex === -1) {
      throw new BadRequestException('原料项不存在');
    }

    const item = purchaseList.items[itemIndex];

    // 从items数组中移除
    const updatedItems = [...purchaseList.items];
    updatedItems.splice(itemIndex, 1);

    // 创建更新后的PurchaseList对象
    const updatedList = new PurchaseList({
      ...purchaseList,
      items: updatedItems,
      itemCount: updatedItems.length,
      totalEstimatedCost:
        Number(purchaseList.totalEstimatedCost) - Number(item.estimatedCost),
    });

    // 使用repository的原始Prisma访问直接删除原料项并更新清单
    const saved = await (
      this.purchaseListRepository as any
    ).deleteItemAndUpdate(purchaseListId, itemId, updatedList);

    return saved;
  }

  /**
   * 重新计算采购清单需求（恢复被删除的原料）
   */
  async recalculatePurchaseList(
    purchaseListId: string,
    operatorId: string,
  ): Promise<PurchaseList> {
    this.logger.log(`Recalculating purchase list ${purchaseListId}`);

    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以重新计算需求');
    }

    // 获取采购清单的targetDate
    const targetDate = new Date(purchaseList.targetDate);
    const startDate = targetDate.toISOString().split('T')[0];
    const endDate = startDate;

    // 计算原始原料需求（基于订单）
    const calculatedRequirements = await this.calculatePurchaseRequirements(
      startDate,
      endDate,
    );

    if (calculatedRequirements.length === 0) {
      throw new BadRequestException('没有找到可以纳入的订单');
    }

    const enrichedRequirements = calculatedRequirements;

    // 分离手动添加的原料和自动生成的原料
    const manualItems = purchaseList.items.filter(
      (item) => item.ingredientId && item.ingredientId.startsWith('manual-'),
    );

    // 合并手动添加的原料和重新计算的原料
    const mergedItemsMap = new Map<string, any>();

    // 先添加重新计算的原料
    for (const req of enrichedRequirements) {
      mergedItemsMap.set(req.ingredientId, {
        ingredientId: req.ingredientId,
        procurementSkuId: req.procurementSkuId,
        procurementSkuName: req.procurementSkuName,
        suggestedProductId: req.suggestedProductId,
        suggestedProductName: req.suggestedProductName,
        ingredientName: req.ingredientName,
        type: req.type,
        quantityNeeded: req.quantityNeeded,
        quantityUnit: req.quantityUnit,
        estimatedCost: req.estimatedCost,
        purchaseChannel: req.purchaseChannel,
        productModel: req.productModel,
      });
    }

    // 再添加手动添加的原料（避免覆盖，但需要合并数量）
    for (const manualItem of manualItems) {
      const existing = mergedItemsMap.get(manualItem.ingredientId);
      if (existing) {
        // 如果该原料既在订单中又手动添加了，累加数量
        mergedItemsMap.set(manualItem.ingredientId, {
          ...existing,
          quantityNeeded: existing.quantityNeeded + manualItem.quantityNeeded,
          estimatedCost: existing.estimatedCost + manualItem.estimatedCost,
        });
      } else {
        // 仅手动添加的原料
        mergedItemsMap.set(manualItem.ingredientId, manualItem);
      }
    }

    // 转换为数组并计算总成本
    const mergedItems = Array.from(mergedItemsMap.values());
    const totalCost = mergedItems.reduce(
      (sum, item) => sum + Number(item.estimatedCost || 0),
      0,
    );

    // 创建更新后的采购清单
    const updatedList = new PurchaseList({
      ...purchaseList,
      items: mergedItems.map(
        (item) =>
          new PurchaseItem({
            id: `recalc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 生成新ID
            purchaseListId: purchaseList.id,
            ...item,
          }),
      ),
      itemCount: mergedItems.length,
      totalEstimatedCost: totalCost,
    });

    // 保存到数据库
    const saved = await (this.purchaseListRepository as any).recalculateItems(
      purchaseListId,
      updatedList,
    );

    this.logger.log(
      `Recalculated purchase list ${purchaseListId}: ${mergedItems.length} items`,
    );

    return saved;
  }

  /**
   * 删除采购清单
   */
  async deletePurchaseList(
    purchaseListId: string,
    operatorId: string,
  ): Promise<{
    deletedId: string;
    restoredOrdersCount: number;
  }> {
    this.logger.log(`Deleting purchase list ${purchaseListId}`);

    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    // 检查是否已关联报销单
    if (purchaseList.reimbursementId) {
      throw new BadRequestException('已关联报销单的采购清单不能删除');
    }

    // 检查状态
    if (purchaseList.status === PurchaseListStatus.COMPLETED) {
      throw new BadRequestException('已完成的采购清单不能删除');
    }

    // 回退订单状态（PURCHASING → PAID）
    const orderPromises = purchaseList.sourceOrderIds.map((id) =>
      this.orderRepository.findById(id),
    );
    const orderResults = await Promise.all(orderPromises);
    const orders = orderResults.filter((o) => o !== null);
    let restoredCount = 0;

    for (const order of orders) {
      if (order.status === OrderStatus.PURCHASING) {
        try {
          order.transitionTo(OrderStatus.PAID);
          await this.orderRepository.save(order);
          restoredCount++;
          this.logger.log(`Order ${order.id} restored to PAID`);
        } catch (error) {
          this.logger.error(`Failed to restore order ${order.id}: ${error}`);
        }
      }
    }

    // 删除采购清单
    await this.purchaseListRepository.delete(purchaseListId);

    this.logger.log(
      `Deleted purchase list ${purchaseListId}, restored ${restoredCount} orders`,
    );

    return {
      deletedId: purchaseListId,
      restoredOrdersCount: restoredCount,
    };
  }

  /**
   * 检查采购清单中订单的制作日期是否发生变更
   */
  async checkOrderDateChanges(purchaseListId: string): Promise<{
    hasChanges: boolean;
    changedOrders: Array<{
      orderId: string;
      originalDate: string;
      currentDate: string;
    }>;
  }> {
    this.logger.log(
      `Checking order date changes for purchase list ${purchaseListId}`,
    );

    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    // 从快照中获取原始日期（如果已保存）
    const dateSnapshot = (purchaseList.orderDateSnapshot as any) || {};

    // 查询当前订单
    const orderPromises = purchaseList.sourceOrderIds.map((id) =>
      this.orderRepository.findById(id),
    );
    const orderResults = await Promise.all(orderPromises);
    const orders = orderResults.filter((o) => o !== null);

    const changedOrders: Array<{
      orderId: string;
      originalDate: string;
      currentDate: string;
    }> = [];

    for (const order of orders) {
      const originalDate = dateSnapshot[order.id]?.originalDate;
      const currentDate =
        order.targetProductionDate?.toISOString().split('T')[0] || '';

      // 如果没有快照记录，首次检测
      if (!originalDate) {
        continue;
      }

      // 比较日期
      if (originalDate !== currentDate) {
        changedOrders.push({
          orderId: order.id,
          originalDate,
          currentDate,
        });
      }
    }

    this.logger.log(`Found ${changedOrders.length} orders with date changes`);

    return {
      hasChanges: changedOrders.length > 0,
      changedOrders,
    };
  }

  /**
   * 查询采购清单列表
   */
  async getPurchaseLists(params: {
    kind?: PurchaseListKind;
    status?: PurchaseListStatus;
    createdById?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
    excludeReimbursed?: boolean;
  }): Promise<{ list: PurchaseList[]; total: number }> {
    const {
      kind,
      status,
      createdById,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
      excludeReimbursed,
    } = params;

    const query: any = { page, pageSize };
    if (kind) query.kind = kind;
    if (status) query.status = status;
    if (createdById) query.createdById = createdById;
    if (startDate) {
      query.startDate = DateUtil.createDateRange(startDate).start;
    }
    if (endDate) {
      query.endDate = DateUtil.createDateRange(endDate).end;
    }
    if (excludeReimbursed) query.excludeReimbursed = excludeReimbursed;

    return this.purchaseListRepository.findMany(query);
  }

  /**
   * 查询采购清单详情
   */
  async getPurchaseListDetail(id: string): Promise<PurchaseList> {
    const purchaseList = await this.purchaseListRepository.findById(id);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${id}`);
    }

    return purchaseList;
  }

  /**
   * 确认采购完成
   * 状态转换: DRAFT/PENDING → COMPLETED
   */
  async completePurchase(
    id: string,
    dto: CompletePurchaseDto,
  ): Promise<PurchaseList> {
    const purchaseList = await this.purchaseListRepository.findById(id);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${id}`);
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '确认采购完成');

    // 如果提供了实际成本，更新采购明细
    if (dto.actualCosts && dto.actualCosts.length > 0) {
      for (const actualCost of dto.actualCosts) {
        const item = purchaseList.items.find((i) => i.id === actualCost.itemId);
        if (item) {
          // 注意：PurchaseItem的estimatedCost是readonly，这里需要创建新的PurchaseItem
          // 但为了简化，我们暂时只记录实际成本的差异，不修改entity
          this.logger.log(
            `Item ${actualCost.itemId}: estimated ${item.estimatedCost}, actual ${actualCost.actualCost}`,
          );
        }
      }
    }

    const purchaseRecords =
      await this.purchaseRecordRepository.findByPurchaseListId(id);
    if (purchaseRecords.length > 0) {
      const inboundResult =
        await this.inventoryService.inboundFromPurchaseRecords(purchaseRecords);
      this.logger.log(
        `Purchase list ${id} inbounded ${inboundResult.createdCount} purchase records into inventory (${inboundResult.skippedCount} skipped)`,
      );
    } else {
      this.logger.warn(
        `Purchase list ${id} completed without purchase records, skipping inventory inbound`,
      );
    }

    // 确认采购完成
    purchaseList.complete();

    // 保存到数据库
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Purchase list ${id} marked as completed`);

    return saved;
  }

  /**
   * 开始采购
   * 记录开始采购的时间
   */
  async startPurchase(id: string): Promise<PurchaseList> {
    const purchaseList = await this.purchaseListRepository.findById(id);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${id}`);
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '开始采购');

    // 开始采购
    purchaseList.start();

    // 保存到数据库
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Purchase list ${id} started`);

    return saved;
  }

  /**
   * 添加采购记录
   */
  async addPurchaseRecord(
    purchaseListId: string,
    dto: AddPurchaseRecordDto,
  ): Promise<PurchaseRecord> {
    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${purchaseListId}`);
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '添加采购记录');

    const purchaseItem = purchaseList.items.find(
      (item) => item.id === dto.purchaseItemId,
    );
    if (!purchaseItem) {
      throw new BadRequestException(
        `未找到关联的采购明细：${dto.purchaseItemId}`,
      );
    }

    if (purchaseList.reimbursementId) {
      throw new BadRequestException('已关联报销单的采购记录不能新增');
    }

    const selectedProcurementSku = dto.procurementSkuId
      ? await this.procurementSkuService.findById(dto.procurementSkuId)
      : undefined;

    if (
      selectedProcurementSku &&
      selectedProcurementSku.ingredientId !== purchaseItem.ingredientId
    ) {
      throw new BadRequestException('所选生产采购 SKU 与采购明细原料不匹配');
    }

    const normalizedRecordData = this.buildNormalizedPurchaseRecordData(
      purchaseItem,
      dto,
    );

    // 创建采购记录
    const purchaseRecord = new PurchaseRecord({
      purchaseListId,
      purchaseItemId: dto.purchaseItemId,
      ingredientId: purchaseItem.ingredientId,
      procurementSkuId:
        selectedProcurementSku?.id || purchaseItem.procurementSkuId,
      procurementSkuName:
        selectedProcurementSku?.name || purchaseItem.procurementSkuName,
      ingredientName: purchaseItem.ingredientName,
      purchaseChannel: dto.purchaseChannel,
      actualQuantity: normalizedRecordData.actualQuantity,
      actualPackageCount: normalizedRecordData.actualPackageCount,
      actualPackageSize: normalizedRecordData.actualPackageSize,
      actualPackageUnit: normalizedRecordData.actualPackageUnit,
      actualBaseQuantity: normalizedRecordData.actualBaseQuantity,
      actualBaseUnit: normalizedRecordData.actualBaseUnit,
      actualCost: dto.actualCost,
      productModel: dto.productModel,
      notes: dto.notes,
    });

    // 保存到数据库
    const saved = await this.purchaseRecordRepository.save(purchaseRecord);

    this.logger.log(
      `Purchase record ${saved.id} added to purchase list ${purchaseListId}`,
    );

    return saved;
  }

  /**
   * 更新采购记录
   */
  async updatePurchaseRecord(
    id: string,
    dto: UpdatePurchaseRecordDto,
  ): Promise<PurchaseRecord> {
    const purchaseRecord = await this.purchaseRecordRepository.findById(id);

    if (!purchaseRecord) {
      throw new BadRequestException(`未找到采购记录：${id}`);
    }

    // 获取关联的采购清单
    const purchaseList = await this.purchaseListRepository.findById(
      purchaseRecord.purchaseListId,
    );

    if (!purchaseList) {
      throw new BadRequestException(
        `未找到关联的采购清单：${purchaseRecord.purchaseListId}`,
      );
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '更新采购记录');

    // 检查是否已关联报销单（已关联则不能修改）
    if (purchaseList.reimbursementId) {
      throw new BadRequestException('已关联报销单的采购记录不能修改');
    }

    const purchaseItem = purchaseList.items.find(
      (item) => item.id === purchaseRecord.purchaseItemId,
    );
    if (!purchaseItem) {
      throw new BadRequestException(
        `未找到关联的采购明细：${purchaseRecord.purchaseItemId}`,
      );
    }

    const normalizedRecordData = this.buildNormalizedPurchaseRecordData(
      purchaseItem,
      dto,
      purchaseRecord,
    );

    // 更新采购记录
    purchaseRecord.update({
      ...dto,
      actualQuantity: normalizedRecordData.actualQuantity,
      actualPackageCount: normalizedRecordData.actualPackageCount,
      actualPackageSize: normalizedRecordData.actualPackageSize,
      actualPackageUnit: normalizedRecordData.actualPackageUnit,
      actualBaseQuantity: normalizedRecordData.actualBaseQuantity,
      actualBaseUnit: normalizedRecordData.actualBaseUnit,
    });

    // 保存到数据库
    const saved = await this.purchaseRecordRepository.save(purchaseRecord);

    this.logger.log(`Purchase record ${id} updated`);

    return saved;
  }

  /**
   * 删除采购记录
   */
  async deletePurchaseRecord(id: string): Promise<void> {
    const purchaseRecord = await this.purchaseRecordRepository.findById(id);

    if (!purchaseRecord) {
      throw new BadRequestException(`未找到采购记录：${id}`);
    }

    // 获取关联的采购清单
    const purchaseList = await this.purchaseListRepository.findById(
      purchaseRecord.purchaseListId,
    );

    if (!purchaseList) {
      throw new BadRequestException(
        `未找到关联的采购清单：${purchaseRecord.purchaseListId}`,
      );
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '删除采购记录');

    // 检查是否已关联报销单（已关联则不能删除）
    if (purchaseList.reimbursementId) {
      throw new BadRequestException('已关联报销单的采购记录不能删除');
    }

    // 删除采购记录
    await this.purchaseRecordRepository.delete(id);

    this.logger.log(`Purchase record ${id} deleted`);
  }

  /**
   * 查询采购记录列表
   */
  async getPurchaseRecords(purchaseListId: string): Promise<PurchaseRecord[]> {
    const purchaseList =
      await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${purchaseListId}`);
    }

    return this.purchaseRecordRepository.findByPurchaseListId(purchaseListId);
  }

  /**
   * 获取所有采购渠道列表
   * 从原料数据库中提取所有不同的采购渠道
   */
  async getPurchaseChannels(): Promise<string[]> {
    const [ingredients, recommendedChannels, procurementChannels] =
      await Promise.all([
      this.ingredientRepository.findAll(),
      this.recommendedProductService.listActivePurchaseChannels(),
      this.procurementSkuService.listActivePurchaseChannels(),
      ]);

    // 提取所有不同的采购渠道并过滤掉空值
    const channels = new Set<string>();
    ingredients.forEach((ingredient) => {
      if (ingredient.purchaseChannel) {
        channels.add(ingredient.purchaseChannel);
      }
    });
    recommendedChannels.forEach((channel) => channels.add(channel));
    procurementChannels.forEach((channel) => channels.add(channel));

    // 转换为数组并按字母顺序排序
    return Array.from(channels).sort();
  }
}
