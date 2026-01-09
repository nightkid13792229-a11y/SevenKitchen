/**
 * Ingredient Application Service
 * Application layer service for Ingredient domain operations
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { Ingredient } from '../../domain/ingredient';
import { IngredientType, BaseUnit } from '../../domain/ingredient/enums';

export const INGREDIENT_REPOSITORY = Symbol('INGREDIENT_REPOSITORY');

export interface CreateIngredientDto {
  name: string;
  type: IngredientType;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  notes?: string | null;
  baseUnit: string;
  unitDisplayLabel?: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number;
  weightG?: number | null;
  maxCapacityG?: number | null;
  properties: Record<string, any>;
  tagIds?: string[];
}

export interface UpdateIngredientDto {
  name?: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  notes?: string | null;
  baseUnit?: BaseUnit;
  unitDisplayLabel?: string | null;
  purchaseUnit?: string;
  purchaseToBaseRatio?: number;
  currentPricePerPurchaseUnit?: number;
  weightG?: number | null;
  maxCapacityG?: number | null;
  properties?: Record<string, any>;
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
    const ingredient = new Ingredient(
      crypto.randomUUID(),
      dto.name,
      dto.type as IngredientType,
      dto.brand ?? null,
      dto.productModel ?? null,
      dto.purchaseChannel ?? null,
      dto.notes ?? null,
      dto.baseUnit as any,
      dto.unitDisplayLabel ?? null,
      dto.purchaseUnit,
      dto.purchaseToBaseRatio,
      dto.currentPricePerPurchaseUnit,
      dto.weightG ?? null,
      dto.maxCapacityG ?? null,
      dto.properties,
    );

    return this.ingredientRepository.save(ingredient, dto.tagIds);
  }

  /**
   * Update ingredient
   */
  async updateIngredient(id: string, dto: UpdateIngredientDto): Promise<Ingredient> {
    const existing = await this.ingredientRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.brand !== undefined) data.brand = dto.brand;
    if (dto.productModel !== undefined) data.productModel = dto.productModel;
    if (dto.purchaseChannel !== undefined) data.purchaseChannel = dto.purchaseChannel;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.baseUnit !== undefined) data.baseUnit = dto.baseUnit;
    if (dto.unitDisplayLabel !== undefined) data.unitDisplayLabel = dto.unitDisplayLabel;
    if (dto.purchaseUnit !== undefined) data.purchaseUnit = dto.purchaseUnit;
    if (dto.purchaseToBaseRatio !== undefined) data.purchaseToBaseRatio = dto.purchaseToBaseRatio;
    if (dto.currentPricePerPurchaseUnit !== undefined) data.currentPricePerPurchaseUnit = dto.currentPricePerPurchaseUnit;
    if (dto.weightG !== undefined) data.weightG = dto.weightG;
    if (dto.maxCapacityG !== undefined) data.maxCapacityG = dto.maxCapacityG;
    if (dto.properties !== undefined) data.properties = dto.properties;
    if (dto.type !== undefined) data.type = dto.type;

    const updated = await this.ingredientRepository.update(id, data);

    // Update tag associations if provided
    if (dto.tagIds !== undefined) {
      await this.ingredientRepository.setTags(id, dto.tagIds);
    }

    return updated;
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
    const ingredient = await this.ingredientRepository.updatePrice(
      id,
      dto.currentPricePerPurchaseUnit,
    );
    if (!ingredient) {
      throw new NotFoundException(`Ingredient not found: ${id}`);
    }
    return ingredient;
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

