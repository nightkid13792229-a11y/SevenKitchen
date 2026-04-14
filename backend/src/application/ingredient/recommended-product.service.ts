/**
 * RecommendedProduct Application Service
 * Handles CRUD and batch queries for recommended products
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export interface RecommendedProductSummary {
  id: string;
  ingredientId: string;
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  purchaseLink?: any;
  imageUrl?: string | null;
  activeNutrients?: any;
  marketingNutritionHighlights?: any;
  displayUnit?: string | null;
}

export interface CreateRecommendedProductDto {
  name: string;
  brand?: string;
  productModel?: string;
  purchaseChannel?: string;
  purchaseLink?: object;
  imageUrl?: string;
  activeNutrients?: Record<string, { value: number; unit: string }>;
  marketingNutritionHighlights?: Record<string, { value: number; unit: string }>;
  displayUnit?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateRecommendedProductDto {
  name?: string;
  brand?: string;
  productModel?: string;
  purchaseChannel?: string;
  purchaseLink?: object;
  imageUrl?: string;
  activeNutrients?: Record<string, { value: number; unit: string }>;
  marketingNutritionHighlights?: Record<string, { value: number; unit: string }>;
  displayUnit?: string;
  isActive?: boolean;
  sortOrder?: number;
}

@Injectable()
export class RecommendedProductService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDistinctValues(values: Array<string | null | undefined>): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((left, right) => left.localeCompare(right));
  }

  /**
   * Batch find active recommended products by ingredient IDs (user-facing)
   */
  async batchFindActive(
    ingredientIds: string[],
  ): Promise<Record<string, RecommendedProductSummary[]>> {
    if (ingredientIds.length === 0) return {};

    const products = await this.prisma.recommendedProduct.findMany({
      where: {
        ingredientId: { in: ingredientIds },
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const result: Record<string, RecommendedProductSummary[]> = {};
    for (const p of products) {
      if (!result[p.ingredientId]) {
        result[p.ingredientId] = [];
      }
      result[p.ingredientId].push({
        id: p.id,
        ingredientId: p.ingredientId,
        name: p.name,
        brand: p.brand,
        productModel: p.productModel,
        purchaseChannel: p.purchaseChannel,
        purchaseLink: p.purchaseLink,
        imageUrl: p.imageUrl,
        activeNutrients: p.activeNutrients,
        marketingNutritionHighlights: p.activeNutrients,
        displayUnit: p.displayUnit,
      });
    }
    return result;
  }

  async listBrands(): Promise<string[]> {
    const products = await this.prisma.recommendedProduct.findMany({
      where: {
        brand: {
          not: null,
        },
      },
      select: {
        brand: true,
      },
    });

    return this.normalizeDistinctValues(products.map((product) => product.brand));
  }

  async listPurchaseChannels(): Promise<string[]> {
    const products = await this.prisma.recommendedProduct.findMany({
      where: {
        purchaseChannel: {
          not: null,
        },
      },
      select: {
        purchaseChannel: true,
      },
    });

    return this.normalizeDistinctValues(
      products.map((product) => product.purchaseChannel),
    );
  }

  async listActivePurchaseChannels(): Promise<string[]> {
    return this.listPurchaseChannels();
  }

  /**
   * Find all recommended products for an ingredient (admin)
   */
  async findByIngredientId(ingredientId: string): Promise<any[]> {
    const products = await this.prisma.recommendedProduct.findMany({
      where: { ingredientId },
      orderBy: { sortOrder: 'asc' },
    });

    return products.map((product) => ({
      ...product,
      marketingNutritionHighlights: product.activeNutrients,
    }));
  }

  /**
   * Create a recommended product (admin)
   */
  async create(
    ingredientId: string,
    dto: CreateRecommendedProductDto,
  ): Promise<any> {
    // Verify ingredient exists
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
    });
    if (!ingredient) {
      throw new NotFoundException(
        `Ingredient not found: ${ingredientId}`,
      );
    }

    return this.prisma.recommendedProduct.create({
      data: {
        ingredientId,
        name: dto.name,
        brand: dto.brand || null,
        productModel: dto.productModel || null,
        purchaseChannel: dto.purchaseChannel || null,
        purchaseLink: dto.purchaseLink || undefined,
        imageUrl: dto.imageUrl || null,
        activeNutrients:
          dto.marketingNutritionHighlights || dto.activeNutrients || undefined,
        displayUnit: dto.displayUnit || null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    }).then((product) => ({
      ...product,
      marketingNutritionHighlights: product.activeNutrients,
    }));
  }

  /**
   * Update a recommended product (admin)
   */
  async update(id: string, dto: UpdateRecommendedProductDto): Promise<any> {
    const existing = await this.prisma.recommendedProduct.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Recommended product not found: ${id}`);
    }

    return this.prisma.recommendedProduct.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.brand !== undefined && { brand: dto.brand || null }),
        ...(dto.productModel !== undefined && {
          productModel: dto.productModel || null,
        }),
        ...(dto.purchaseChannel !== undefined && {
          purchaseChannel: dto.purchaseChannel || null,
        }),
        ...(dto.purchaseLink !== undefined && {
          purchaseLink: dto.purchaseLink as any,
        }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl || null }),
        ...((dto.activeNutrients !== undefined ||
          dto.marketingNutritionHighlights !== undefined) && {
          activeNutrients: (
            dto.marketingNutritionHighlights ?? dto.activeNutrients
          ) as any,
        }),
        ...(dto.displayUnit !== undefined && {
          displayUnit: dto.displayUnit || null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    }).then((product) => ({
      ...product,
      marketingNutritionHighlights: product.activeNutrients,
    }));
  }

  /**
   * Delete a recommended product (admin)
   */
  async delete(id: string): Promise<void> {
    const existing = await this.prisma.recommendedProduct.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Recommended product not found: ${id}`);
    }
    await this.prisma.recommendedProduct.delete({ where: { id } });
  }
}
