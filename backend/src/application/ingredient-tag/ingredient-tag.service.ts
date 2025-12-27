/**
 * IngredientTag Application Service
 * Application layer service for IngredientTag domain operations
 */

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IngredientTagRepository } from '../../domain/ingredient-tag/ingredient-tag.repository';
import { IngredientTag } from '../../domain/ingredient-tag/ingredient-tag.entity';

export const INGREDIENT_TAG_REPOSITORY = Symbol('INGREDIENT_TAG_REPOSITORY');

export interface CreateTagDto {
  name: string;
  description?: string | null;
  parentId?: string | null;
  sort?: number;
  color?: string | null;
}

export interface UpdateTagDto {
  name?: string;
  description?: string | null;
  parentId?: string | null;
  sort?: number;
  color?: string | null;
}

@Injectable()
export class IngredientTagService {
  constructor(
    @Inject(INGREDIENT_TAG_REPOSITORY)
    private readonly tagRepository: IngredientTagRepository,
  ) {}

  /**
   * Get tag by ID
   */
  async getTagById(id: string): Promise<IngredientTag> {
    const tag = await this.tagRepository.findById(id);
    if (!tag) {
      throw new NotFoundException(`Tag not found: ${id}`);
    }
    return tag;
  }

  /**
   * Get all tags (flat list)
   */
  async getAllTags(): Promise<IngredientTag[]> {
    return this.tagRepository.findAll();
  }

  /**
   * Get root tags (no parent)
   */
  async getRootTags(): Promise<IngredientTag[]> {
    return this.tagRepository.findRootTags();
  }

  /**
   * Get tag hierarchy (tree structure)
   */
  async getTagHierarchy(): Promise<IngredientTag[]> {
    return this.tagRepository.getHierarchy();
  }

  /**
   * Get children by parent ID
   */
  async getChildren(parentId: string): Promise<IngredientTag[]> {
    const parent = await this.tagRepository.findById(parentId);
    if (!parent) {
      throw new NotFoundException(`Parent tag not found: ${parentId}`);
    }
    return this.tagRepository.findChildren(parentId);
  }

  /**
   * Get tags by ingredient ID
   */
  async getTagsByIngredient(ingredientId: string): Promise<IngredientTag[]> {
    return this.tagRepository.findByIngredient(ingredientId);
  }

  /**
   * Create tag
   */
  async createTag(dto: CreateTagDto): Promise<IngredientTag> {
    // Validate parent exists if provided
    if (dto.parentId) {
      const parent = await this.tagRepository.findById(dto.parentId);
      if (!parent) {
        throw new NotFoundException(`Parent tag not found: ${dto.parentId}`);
      }
    }

    // Convert empty string to null for optional fields
    const color = dto.color && dto.color.trim() ? dto.color : null;
    const description = dto.description && dto.description.trim() ? dto.description : null;

    const tag = new IngredientTag(
      crypto.randomUUID(),
      dto.name,
      description,
      dto.parentId ?? null,
      dto.sort ?? 0,
      color
    );

    return this.tagRepository.save(tag);
  }

  /**
   * Update tag
   */
  async updateTag(id: string, dto: UpdateTagDto): Promise<IngredientTag> {
    const existing = await this.tagRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Tag not found: ${id}`);
    }

    // Validate parent exists if provided
    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new BadRequestException('Tag cannot be its own parent');
      }
      if (dto.parentId) {
        const parent = await this.tagRepository.findById(dto.parentId);
        if (!parent) {
          throw new NotFoundException(`Parent tag not found: ${dto.parentId}`);
        }
      }
    }

    // Convert empty string to null for optional fields
    const color = dto.color !== undefined
      ? (dto.color && dto.color.trim() ? dto.color : null)
      : existing.color;
    const description = dto.description !== undefined
      ? (dto.description && dto.description.trim() ? dto.description : null)
      : existing.description;

    const updated = new IngredientTag(
      id,
      dto.name ?? existing.name,
      description,
      dto.parentId !== undefined ? dto.parentId : existing.parentId,
      dto.sort !== undefined ? dto.sort : existing.sort,
      color
    );

    return this.tagRepository.save(updated);
  }

  /**
   * Delete tag
   */
  async deleteTag(id: string): Promise<void> {
    const tag = await this.tagRepository.findById(id);

    // If tag doesn't exist, consider it already deleted (idempotent operation)
    if (!tag) {
      return;
    }

    const hasChildren = await this.tagRepository.hasChildren(id);
    if (hasChildren) {
      throw new BadRequestException('Cannot delete tag with children. Delete or reassign children first.');
    }

    await this.tagRepository.delete(id);
  }
}
