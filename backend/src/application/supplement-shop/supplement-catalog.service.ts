/**
 * Supplement Catalog Application Service
 *
 * 补剂商城第 0 期：把库存里所有补剂档案拉成一张「上架清单」，
 * 并顺带做数据体检（缺价 / 缺形态 / 缺效期 / 单位口径不一致）。
 *
 * 设计文档：docs/plans/2026-09-18-supplement-shop-design.md
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IngredientType } from '../../domain/ingredient/enums';
import { PrismaService } from '../../infrastructure/prisma.service';

/** 物理形态（与 prisma schema 的 IngredientPhysicalForm 对齐） */
export type IngredientPhysicalFormCode = 'POWDER' | 'TABLET' | 'CAPSULE' | 'LIQUID';

export type SupplementCatalogIssueCode =
  | 'NO_PRICE'
  | 'FORM_MISSING'
  | 'LIQUID_UNSUPPORTED'
  | 'SHELF_LIFE_MISSING'
  | 'STORAGE_MISSING'
  | 'UNIT_INCONSISTENT'
  | 'DUPLICATE_NAME';

export interface SupplementCatalogIssue {
  code: SupplementCatalogIssueCode;
  level: 'ERROR' | 'WARN';
  message: string;
}

export interface SupplementCatalogItem {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  baseUnit: string;
  /** 最终展示单位（与前端一致：unit_display_label → properties.display_unit → purchase_unit） */
  displayUnit: string;
  /** properties.display_unit 原值，用于暴露单位口径不一致 */
  propertiesDisplayUnit: string | null;
  unitDisplayLabel: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  pricePerPurchaseUnit: number;
  /** 每展示单位成本（元/g、元/片、元/粒、元/平勺…） */
  unitCost: number | null;
  physicalForm: IngredientPhysicalFormCode | null;
  /** 按单位口径推断的形态，供后台一键预填 */
  suggestedPhysicalForm: IngredientPhysicalFormCode | null;
  /** 内容物是否油性（鱼油/鱼肝油等），效期取更保守的一档 */
  isOilBased: boolean;
  /** 按名称推断是否油性，供后台一键预填 */
  suggestedOilBased: boolean;
  supplementRetailEnabled: boolean;
  shelfLifeMonths: number | null;
  /** 按品牌通用保质期给出的建议值，供后台一键预填 */
  suggestedShelfLifeMonths: number | null;
  storageCondition: string | null;
  openedShelfLifeDays: number | null;
  /** 被多少个食谱引用（用于判断上架优先级） */
  recipeReferenceCount: number;
  /** 是否可用于生产：能出现在 DIY 制作单上，或被食谱引用 */
  producible: boolean;
  issues: SupplementCatalogIssue[];
  /** 已上架 且 无 ERROR 级问题 */
  readyToSell: boolean;
}

export interface SupplementCatalogSummary {
  total: number;
  retailEnabled: number;
  readyToSell: number;
  blockedByError: number;
  missingForm: number;
  missingShelfLife: number;
  noPrice: number;
}

export interface SupplementCatalogResponse {
  summary: SupplementCatalogSummary;
  items: SupplementCatalogItem[];
}

export interface UpdateSupplementCatalogItemDto {
  physicalForm?: IngredientPhysicalFormCode | null;
  isOilBased?: boolean;
  supplementRetailEnabled?: boolean;
  shelfLifeMonths?: number | null;
  storageCondition?: string | null;
  openedShelfLifeDays?: number | null;
}

/** 统一储存条件默认值：三类形态都怕潮，粉剂/部分片剂还怕光 */
const DEFAULT_STORAGE_CONDITION = '避光、密封、阴凉干燥处保存';

/** 品牌通用原厂保质期（月），仅作后台预填建议，实际以瓶身到期日为准 */
const BRAND_DEFAULT_SHELF_LIFE_MONTHS: Array<{ keyword: string; months: number }> = [
  { keyword: 'NOW', months: 24 },
  { keyword: "NATURE'S WAY", months: 36 },
  { keyword: 'NATURES WAY', months: 36 },
  { keyword: 'SOLGAR', months: 36 },
  { keyword: 'JARROW', months: 24 },
  { keyword: 'KAL', months: 24 },
  { keyword: 'SWANSON', months: 24 },
  { keyword: 'NUTRICOLOGY', months: 24 },
];

const PHYSICAL_FORM_CODES: IngredientPhysicalFormCode[] = [
  'POWDER',
  'TABLET',
  'CAPSULE',
  'LIQUID',
];

@Injectable()
export class SupplementCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 拉出全部补剂档案 + 体检结果。
   * 不改动任何数据，纯读，可安全对生产库执行。
   */
  async listCatalog(): Promise<SupplementCatalogResponse> {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { type: IngredientType.SUPPLEMENT },
      orderBy: [{ name: 'asc' }, { brand: 'asc' }],
      select: {
        id: true,
        name: true,
        brand: true,
        productModel: true,
        purchaseChannel: true,
        baseUnit: true,
        unitDisplayLabel: true,
        purchaseUnit: true,
        purchaseToBaseRatio: true,
        currentPricePerPurchaseUnit: true,
        physicalForm: true,
        isOilBased: true,
        diyEnabled: true,
        supplementRetailEnabled: true,
        shelfLifeMonths: true,
        storageCondition: true,
        openedShelfLifeDays: true,
        properties: true,
      },
    });

    const referenceCounts = await this.countRecipeReferences(
      ingredients.map((item) => item.id),
    );

    const nameCounts = new Map<string, number>();
    for (const ingredient of ingredients) {
      nameCounts.set(ingredient.name, (nameCounts.get(ingredient.name) || 0) + 1);
    }

    const items = ingredients.map((ingredient) =>
      this.buildCatalogItem(ingredient, {
        recipeReferenceCount: referenceCounts.get(ingredient.id) || 0,
        sameNameCount: nameCounts.get(ingredient.name) || 0,
        // 「可用于生产」= 能出现在 DIY 制作单上，或已被食谱引用
        producible:
          ingredient.diyEnabled ||
          (referenceCounts.get(ingredient.id) || 0) > 0,
      }),
    );

    return { summary: this.buildSummary(items), items };
  }

  /** 更新单个补剂的上架档案（形态 / 上架开关 / 效期 / 储存条件） */
  async updateCatalogItem(
    id: string,
    dto: UpdateSupplementCatalogItemDto,
  ): Promise<SupplementCatalogItem> {
    const existing = await this.prisma.ingredient.findUnique({
      where: { id },
      select: { id: true, type: true },
    });

    if (!existing || existing.type !== IngredientType.SUPPLEMENT) {
      throw new NotFoundException(`补剂档案不存在: ${id}`);
    }

    if (
      dto.physicalForm !== undefined &&
      dto.physicalForm !== null &&
      !PHYSICAL_FORM_CODES.includes(dto.physicalForm)
    ) {
      throw new BadRequestException(`不支持的物理形态: ${dto.physicalForm}`);
    }

    this.assertPositiveIntOrNull(dto.shelfLifeMonths, '原厂保质期（月）');
    this.assertPositiveIntOrNull(dto.openedShelfLifeDays, '开封后可用天数');

    // 上架前必须补齐档案：先落库再做体检，避免"边填边开"绕过校验
    if (dto.supplementRetailEnabled === true) {
      await this.prisma.ingredient.update({
        where: { id },
        data: this.buildUpdateData(dto),
      });
      const catalog = await this.listCatalog();
      const current = catalog.items.find((item) => item.id === id);
      const errors = (current?.issues || []).filter(
        (issue) => issue.level === 'ERROR',
      );
      if (errors.length > 0) {
        // 回滚上架开关，档案字段保留（便于继续补录）
        await this.prisma.ingredient.update({
          where: { id },
          data: { supplementRetailEnabled: false },
        });
        throw new BadRequestException(
          `上架前需先补齐档案：${errors.map((issue) => issue.message).join('；')}`,
        );
      }
      return current as SupplementCatalogItem;
    }

    await this.prisma.ingredient.update({
      where: { id },
      data: this.buildUpdateData(dto),
    });

    const catalog = await this.listCatalog();
    const updated = catalog.items.find((item) => item.id === id);
    if (!updated) {
      throw new NotFoundException(`补剂档案不存在: ${id}`);
    }
    return updated;
  }

  private buildUpdateData(dto: UpdateSupplementCatalogItemDto) {
    return {
      ...(dto.physicalForm !== undefined && { physicalForm: dto.physicalForm }),
      ...(dto.isOilBased !== undefined && { isOilBased: dto.isOilBased }),
      ...(dto.supplementRetailEnabled !== undefined && {
        supplementRetailEnabled: dto.supplementRetailEnabled,
      }),
      ...(dto.shelfLifeMonths !== undefined && {
        shelfLifeMonths: dto.shelfLifeMonths,
      }),
      ...(dto.storageCondition !== undefined && {
        storageCondition: dto.storageCondition?.trim() || null,
      }),
      ...(dto.openedShelfLifeDays !== undefined && {
        openedShelfLifeDays: dto.openedShelfLifeDays,
      }),
    };
  }

  /** 批量按"系统建议"预填形态与保质期，只填空白项，不覆盖已填内容 */
  async applySuggestions(): Promise<{ updated: number }> {
    const catalog = await this.listCatalog();
    const targets = catalog.items.filter(
      (item) =>
        (!item.physicalForm && item.suggestedPhysicalForm) ||
        (!item.shelfLifeMonths && item.suggestedShelfLifeMonths) ||
        (!item.isOilBased && item.suggestedOilBased),
    );

    for (const item of targets) {
      await this.prisma.ingredient.update({
        where: { id: item.id },
        data: {
          ...(!item.physicalForm &&
            item.suggestedPhysicalForm && {
              physicalForm: item.suggestedPhysicalForm,
            }),
          ...(!item.shelfLifeMonths &&
            item.suggestedShelfLifeMonths && {
              shelfLifeMonths: item.suggestedShelfLifeMonths,
            }),
          ...(!item.isOilBased &&
            item.suggestedOilBased && { isOilBased: true }),
          ...(!item.storageCondition && {
            storageCondition: DEFAULT_STORAGE_CONDITION,
          }),
        },
      });
    }

    return { updated: targets.length };
  }

  /**
   * 一键上架全部「可用于生产」的补剂。
   *
   * 业务前提：凡是能参与生产的补剂都应该可以分装售卖，不需要逐个人工审批。
   * 因此这里先把空白档案按系统建议补齐，再把通过体检的补剂全部置为可售；
   * 补不齐的（例如没有进货价，算不出售价）会被单独列出原因，交给人工处理。
   */
  async enableAllProducible(): Promise<{
    enabled: number;
    alreadyEnabled: number;
    skipped: Array<{ name: string; brand: string | null; reason: string }>;
  }> {
    // 先补齐空白项（不覆盖已填内容），避免因为缺形态/缺效期而上不了架
    await this.applySuggestions();

    const catalog = await this.listCatalog();
    const alreadyEnabled = catalog.items.filter(
      (item) => item.supplementRetailEnabled,
    ).length;

    const skipped: Array<{ name: string; brand: string | null; reason: string }> =
      [];

    for (const item of catalog.items) {
      if (!item.producible || item.supplementRetailEnabled) continue;

      const errors = item.issues.filter((issue) => issue.level === 'ERROR');
      if (errors.length > 0) {
        skipped.push({
          name: item.name,
          brand: item.brand,
          reason: errors.map((issue) => issue.message).join('；'),
        });
        continue;
      }

      await this.prisma.ingredient.update({
        where: { id: item.id },
        data: { supplementRetailEnabled: true },
      });
    }

    const after = await this.listCatalog();
    return {
      enabled: after.items.filter((item) => item.supplementRetailEnabled).length,
      alreadyEnabled,
      skipped,
    };
  }

  private assertPositiveIntOrNull(
    value: number | null | undefined,
    label: string,
  ): void {
    if (value === undefined || value === null) return;
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${label}必须是正整数`);
    }
  }

  private async countRecipeReferences(
    ingredientIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (ingredientIds.length === 0) return result;

    const rows = await this.prisma.recipeItem.groupBy({
      by: ['ingredientId'],
      where: { ingredientId: { in: ingredientIds } },
      _count: { _all: true },
    });

    for (const row of rows) {
      if (row.ingredientId) {
        result.set(row.ingredientId, row._count._all);
      }
    }
    return result;
  }

  private buildCatalogItem(
    ingredient: {
      id: string;
      name: string;
      brand: string | null;
      productModel: string | null;
      purchaseChannel: string | null;
      baseUnit: string;
      unitDisplayLabel: string | null;
      purchaseUnit: string;
      purchaseToBaseRatio: number;
      currentPricePerPurchaseUnit: unknown;
      physicalForm: string | null;
      isOilBased: boolean;
      diyEnabled: boolean;
      supplementRetailEnabled: boolean;
      shelfLifeMonths: number | null;
      storageCondition: string | null;
      openedShelfLifeDays: number | null;
      properties: unknown;
    },
    context: {
      recipeReferenceCount: number;
      sameNameCount: number;
      producible: boolean;
    },
  ): SupplementCatalogItem {
    const properties = (ingredient.properties || {}) as Record<string, unknown>;
    const rawPropertiesDisplayUnit =
      typeof properties.display_unit === 'string' && properties.display_unit.trim()
        ? properties.display_unit.trim()
        : null;

    // 与 recipe-designer.service 的 resolveIngredientDisplayUnit / resolveRecipeDesignerIngredientUnit 保持一致
    const displayUnit =
      (ingredient.unitDisplayLabel || '').trim() ||
      rawPropertiesDisplayUnit ||
      (ingredient.purchaseUnit || '').trim() ||
      ingredient.baseUnit;

    const price = Number(ingredient.currentPricePerPurchaseUnit || 0);
    const ratio = Number(ingredient.purchaseToBaseRatio || 0);
    const unitCost = price > 0 && ratio > 0 ? price / ratio : null;

    const physicalForm = this.normalizePhysicalForm(ingredient.physicalForm);
    const suggestedPhysicalForm = this.suggestPhysicalForm(
      ingredient.baseUnit,
      ingredient.unitDisplayLabel,
      displayUnit,
    );
    const suggestedShelfLifeMonths = this.suggestShelfLifeMonths(ingredient.brand);

    const issues: SupplementCatalogIssue[] = [];

    if (price <= 0) {
      issues.push({
        code: 'NO_PRICE',
        level: 'ERROR',
        message: '进货价为 0，无法计价，需先补价或不上架',
      });
    }

    if (!physicalForm) {
      issues.push({
        code: 'FORM_MISSING',
        level: 'ERROR',
        message: '未填写物理形态，无法确定分装方式',
      });
    } else if (physicalForm === 'LIQUID') {
      issues.push({
        code: 'LIQUID_UNSUPPORTED',
        level: 'ERROR',
        message: '液体补剂暂不支持分装，不应上架',
      });
    }

    if (!ingredient.shelfLifeMonths) {
      issues.push({
        code: 'SHELF_LIFE_MISSING',
        level: 'ERROR',
        message: '未填写原厂保质期，无法计算分装后有效期',
      });
    }

    if (!ingredient.storageCondition) {
      issues.push({
        code: 'STORAGE_MISSING',
        level: 'WARN',
        message: '未填写储存条件，标签无法印刷',
      });
    }

    if (
      rawPropertiesDisplayUnit &&
      ingredient.unitDisplayLabel &&
      rawPropertiesDisplayUnit !== ingredient.unitDisplayLabel
    ) {
      issues.push({
        code: 'UNIT_INCONSISTENT',
        level: 'WARN',
        message: `单位口径不一致：properties.display_unit="${rawPropertiesDisplayUnit}"，unit_display_label="${ingredient.unitDisplayLabel}"`,
      });
    }

    if (context.sameNameCount > 1) {
      issues.push({
        code: 'DUPLICATE_NAME',
        level: 'WARN',
        message: `同名补剂档案有 ${context.sameNameCount} 条，需确认是否重复`,
      });
    }

    const hasError = issues.some((issue) => issue.level === 'ERROR');

    return {
      id: ingredient.id,
      name: ingredient.name,
      brand: ingredient.brand,
      productModel: ingredient.productModel,
      purchaseChannel: ingredient.purchaseChannel,
      baseUnit: ingredient.baseUnit,
      displayUnit,
      propertiesDisplayUnit: rawPropertiesDisplayUnit,
      unitDisplayLabel: ingredient.unitDisplayLabel,
      purchaseUnit: ingredient.purchaseUnit,
      purchaseToBaseRatio: ratio,
      pricePerPurchaseUnit: price,
      unitCost,
      physicalForm,
      suggestedPhysicalForm,
      isOilBased: ingredient.isOilBased === true,
      suggestedOilBased: this.suggestOilBased(ingredient.name),
      supplementRetailEnabled: ingredient.supplementRetailEnabled,
      shelfLifeMonths: ingredient.shelfLifeMonths,
      suggestedShelfLifeMonths,
      storageCondition: ingredient.storageCondition,
      openedShelfLifeDays: ingredient.openedShelfLifeDays,
      recipeReferenceCount: context.recipeReferenceCount,
      producible: context.producible,
      issues,
      readyToSell: ingredient.supplementRetailEnabled && !hasError,
    };
  }

  private normalizePhysicalForm(
    value: string | null,
  ): IngredientPhysicalFormCode | null {
    if (!value) return null;
    return PHYSICAL_FORM_CODES.includes(value as IngredientPhysicalFormCode)
      ? (value as IngredientPhysicalFormCode)
      : null;
  }

  /**
   * 按单位口径推断形态：
   * - 平勺 → 粉剂（例如海藻粉按勺计量）
   * - 片   → 片剂
   * - 粒   → 胶囊
   * - 按克/毫升计量的 → 粉剂（液体补剂需人工改判）
   */
  private suggestPhysicalForm(
    baseUnit: string,
    unitDisplayLabel: string | null,
    displayUnit: string,
  ): IngredientPhysicalFormCode | null {
    const label = (unitDisplayLabel || displayUnit || '').trim();

    if (label.includes('平勺') || label.includes('勺')) return 'POWDER';
    if (label.includes('片')) return 'TABLET';
    if (label.includes('粒') || label.includes('胶囊')) return 'CAPSULE';
    if (baseUnit === 'G' || baseUnit === 'ML') return 'POWDER';
    if (baseUnit === 'PCS') return null;

    return null;
  }

  /**
   * 按名称推断是否油性内容物。
   * 只做「开」不做「关」：命中的自动标为油性，没命中的保持原值由人工确认
   * （维生素E 这类实际是油性软胶囊但名字看不出来的，需要人工打开）。
   */
  private suggestOilBased(name: string): boolean {
    const normalized = (name || '').trim();
    return normalized.includes('油');
  }

  private suggestShelfLifeMonths(brand: string | null): number | null {
    if (!brand) return null;
    const normalized = brand.trim().toUpperCase();
    const matched = BRAND_DEFAULT_SHELF_LIFE_MONTHS.find((row) =>
      normalized.includes(row.keyword),
    );
    return matched ? matched.months : null;
  }

  private buildSummary(items: SupplementCatalogItem[]): SupplementCatalogSummary {
    return {
      total: items.length,
      retailEnabled: items.filter((item) => item.supplementRetailEnabled).length,
      readyToSell: items.filter((item) => item.readyToSell).length,
      blockedByError: items.filter((item) =>
        item.issues.some((issue) => issue.level === 'ERROR'),
      ).length,
      missingForm: items.filter((item) => !item.physicalForm).length,
      missingShelfLife: items.filter((item) => !item.shelfLifeMonths).length,
      noPrice: items.filter((item) => item.pricePerPurchaseUnit <= 0).length,
    };
  }
}
