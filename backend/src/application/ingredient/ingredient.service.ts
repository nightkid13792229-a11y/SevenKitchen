/**
 * Ingredient Application Service
 * Application layer service for Ingredient domain operations
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { Ingredient } from '../../domain/ingredient';
import {
  IngredientType,
  BaseUnit,
  IngredientProcurementStrategy,
} from '../../domain/ingredient/enums';
import { normalizeNutritionProfileForWrite } from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../../domain/ingredient/types';

export const INGREDIENT_REPOSITORY = Symbol('INGREDIENT_REPOSITORY');

export interface CreateIngredientDto {
  name: string;
  type: IngredientType;
  procurementStrategy?: IngredientProcurementStrategy;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  notes?: string | null;
  baseUnit: string;
  baseUnitDisplayName?: string | null;
  unitDisplayLabel?: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number;
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
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  notes?: string | null;
  baseUnit?: BaseUnit;
  baseUnitDisplayName?: string | null;
  unitDisplayLabel?: string | null;
  purchaseUnit?: string;
  purchaseToBaseRatio?: number;
  currentPricePerPurchaseUnit?: number;
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

    const ingredient = new Ingredient(
      crypto.randomUUID(),
      dto.name,
      dto.type,
      dto.procurementStrategy ?? IngredientProcurementStrategy.DAILY_PURCHASE,
      dto.brand ?? null,
      dto.productModel ?? null,
      dto.purchaseChannel ?? null,
      dto.notes ?? null,
      dto.baseUnit as any,
      this.resolveBaseUnitDisplayName(dto),
      dto.purchaseUnit,
      dto.purchaseToBaseRatio,
      dto.currentPricePerPurchaseUnit,
      dto.effectivePricePerPurchaseUnit ?? dto.currentPricePerPurchaseUnit ?? 0,
      dto.weightG ?? null,
      dto.maxCapacityG ?? null,
      dto.safetyStock ?? null,
      dto.reorderPoint ?? null,
      dto.targetStock ?? null,
      dto.properties,
      normalizedProfile,
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

    const updated = new Ingredient(
      existing.id,
      dto.name !== undefined ? dto.name : existing.name,
      dto.type !== undefined ? dto.type : existing.type,
      dto.procurementStrategy !== undefined
        ? dto.procurementStrategy
        : existing.procurementStrategy,
      dto.brand !== undefined ? dto.brand : existing.brand,
      dto.productModel !== undefined
        ? dto.productModel
        : existing.productModel,
      dto.purchaseChannel !== undefined
        ? dto.purchaseChannel
        : existing.purchaseChannel,
      dto.notes !== undefined ? dto.notes : existing.notes,
      dto.baseUnit !== undefined ? dto.baseUnit : existing.baseUnit,
      this.resolveBaseUnitDisplayName(dto, existing.unitDisplayLabel),
      dto.purchaseUnit !== undefined ? dto.purchaseUnit : existing.purchaseUnit,
      dto.purchaseToBaseRatio !== undefined
        ? dto.purchaseToBaseRatio
        : existing.purchaseToBaseRatio,
      dto.currentPricePerPurchaseUnit !== undefined
        ? dto.currentPricePerPurchaseUnit
        : existing.currentPricePerPurchaseUnit,
      dto.effectivePricePerPurchaseUnit !== undefined
        ? dto.effectivePricePerPurchaseUnit
        : existing.effectivePricePerPurchaseUnit,
      dto.weightG !== undefined ? dto.weightG : existing.weightG,
      dto.maxCapacityG !== undefined ? dto.maxCapacityG : existing.maxCapacityG,
      dto.safetyStock !== undefined ? dto.safetyStock : existing.safetyStock,
      dto.reorderPoint !== undefined
        ? dto.reorderPoint
        : existing.reorderPoint,
      dto.targetStock !== undefined ? dto.targetStock : existing.targetStock,
      dto.properties !== undefined ? dto.properties : existing.properties,
      dto.nutritionProfile !== undefined
        ? normalizeNutritionProfileForWrite(dto.nutritionProfile)
        : existing.nutritionProfile,
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
  ): Promise<Ingredient> {
    const existing = await this.ingredientRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }

    const ingredient = await this.ingredientRepository.updatePrice(
      id,
      dto.currentPricePerPurchaseUnit,
    );
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }

    const updatedEffective = await this.ingredientRepository.updateEffectivePrice(
      id,
      dto.currentPricePerPurchaseUnit,
    );
    if (!updatedEffective) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }
    return updatedEffective;
  }

  /**
   * Delete ingredient
   */
  async deleteIngredient(id: string): Promise<void> {
    // Check if ingredient exists
    const ingredient = await this.ingredientRepository.findById(id);
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }

    await this.ingredientRepository.delete(id);
  }
}
