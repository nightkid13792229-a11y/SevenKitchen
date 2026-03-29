/**
 * RecommendedProduct Application Service
 * Handles CRUD and batch queries for recommended products
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export interface CreateRecommendedProductDto {
  name: string;
  brand?: string;
  productModel?: string;
  purchaseChannel?: string;
  purchaseLink?: object;
  imageUrl?: string;
  activeNutrients?: Record<string, { value: number; unit: string }>;
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
  displayUnit?: string;
  isActive?: boolean;
  sortOrder?: number;
}

@Injectable()
export class RecommendedProductService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Batch find active recommended products by ingredient IDs (user-facing)
   */
  async batchFindActive(
    ingredientIds: string[],
  ): Promise<Record<string, any[]>> {
    if (ingredientIds.length === 0) return {};

    const products = await this.prisma.recommendedProduct.findMany({
      where: {
        ingredientId: { in: ingredientIds },
        isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    const result: Record<string, any[]> = {};
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
        displayUnit: p.displayUnit,
      });
    }
    return result;
  }

  /**
   * Find all recommended products for an ingredient (admin)
   */
  async findByIngredientId(ingredientId: string): Promise<any[]> {
    return this.prisma.recommendedProduct.findMany({
      where: { ingredientId },
      orderBy: { sortOrder: 'asc' },
    });
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
        activeNutrients: dto.activeNutrients || undefined,
        displayUnit: dto.displayUnit || null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
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
        ...(dto.activeNutrients !== undefined && {
          activeNutrients: dto.activeNutrients as any,
        }),
        ...(dto.displayUnit !== undefined && {
          displayUnit: dto.displayUnit || null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
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
