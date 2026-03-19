/**
 * Prisma IngredientTag Repository
 * Production-ready implementation using PostgreSQL database
 */

import { Injectable, Logger } from '@nestjs/common';
import type { IngredientTagRepository } from '../../domain/ingredient-tag/ingredient-tag.repository';
import { IngredientTag } from '../../domain/ingredient-tag/ingredient-tag.entity';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaIngredientTagRepository implements IngredientTagRepository {
  private readonly logger = new Logger(PrismaIngredientTagRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<IngredientTag | null> {
    const record = await this.prisma.ingredientTag.findUnique({
      where: { id },
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  async findAll(): Promise<IngredientTag[]> {
    const records = await this.prisma.ingredientTag.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async findRootTags(): Promise<IngredientTag[]> {
    const records = await this.prisma.ingredientTag.findMany({
      where: { parentId: null },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async findChildren(parentId: string): Promise<IngredientTag[]> {
    const records = await this.prisma.ingredientTag.findMany({
      where: { parentId },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async findByIngredient(ingredientId: string): Promise<IngredientTag[]> {
    const assignments = await this.prisma.ingredientTagAssignment.findMany({
      where: { ingredientId },
      include: {
        tag: true,
      },
    });
    return assignments.map((a) => this.mapToDomain(a.tag));
  }

  async save(tag: IngredientTag): Promise<IngredientTag> {
    const data = {
      name: tag.name,
      description: tag.description,
      parentId: tag.parentId,
      sort: tag.sort,
      color: tag.color,
    };

    this.logger.debug(`Saving ingredient tag ${tag.id}: ${tag.name}`);

    const saved = await this.prisma.ingredientTag.upsert({
      where: { id: tag.id },
      update: data,
      create: { id: tag.id, ...data },
    });

    this.logger.debug(`Ingredient tag ${tag.id} saved successfully`);
    return this.mapToDomain(saved);
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting ingredient tag ${id}`);

    // Check if tag has children
    const childCount = await this.prisma.ingredientTag.count({
      where: { parentId: id },
    });

    if (childCount > 0) {
      throw new Error(
        `Cannot delete tag with ${childCount} children. Delete or reassign children first.`,
      );
    }

    // Check if tag is used by any ingredients
    const assignmentCount = await this.prisma.ingredientTagAssignment.count({
      where: { tagId: id },
    });

    if (assignmentCount > 0) {
      throw new Error(
        `Cannot delete tag used by ${assignmentCount} ingredients. Remove tag from ingredients first.`,
      );
    }

    await this.prisma.ingredientTag.delete({
      where: { id },
    });

    this.logger.debug(`Ingredient tag ${id} deleted successfully`);
  }

  async hasChildren(id: string): Promise<boolean> {
    const count = await this.prisma.ingredientTag.count({
      where: { parentId: id },
    });
    return count > 0;
  }

  async getHierarchy(): Promise<IngredientTag[]> {
    // Get all tags ordered by sort and name
    const allTags = await this.prisma.ingredientTag.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });

    // Return all as domain entities (frontend will build tree)
    return allTags.map((r) => this.mapToDomain(r));
  }

  /**
   * Map Prisma record to Domain entity
   */
  private mapToDomain(record: any): IngredientTag {
    return new IngredientTag(
      record.id,
      record.name,
      record.description,
      record.parentId,
      record.sort,
      record.color,
    );
  }
}
