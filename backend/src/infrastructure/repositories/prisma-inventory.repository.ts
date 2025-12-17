/**
 * Prisma Inventory Repository Implementation
 * Phase 8.13: Inventory Deduction
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { InventoryRepository } from '../../domain/inventory/inventory.repository';
import { InventoryLedgerEntry } from '../../domain/inventory/inventory-ledger-entry.entity';
import { InventorySourceType } from '../../domain/inventory/enums';

@Injectable()
export class PrismaInventoryRepository implements InventoryRepository {
  private readonly logger = new Logger(PrismaInventoryRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordEntries(entries: InventoryLedgerEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    // Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryLedgerEntry.createMany({
        data: entries.map((entry) => ({
          id: entry.id,
          ingredientId: entry.ingredientId,
          deltaG: entry.deltaG,
          sourceType: entry.sourceType as any,
          sourceId: entry.sourceId,
          createdAt: entry.createdAt,
        })),
        skipDuplicates: true, // Handle unique constraint violations gracefully
      });
    });

    this.logger.debug(`Recorded ${entries.length} inventory ledger entries`);
  }

  async existsBySourceAndIngredient(
    sourceType: InventorySourceType,
    sourceId: string,
    ingredientId: string,
  ): Promise<boolean> {
    const count = await this.prisma.inventoryLedgerEntry.count({
      where: {
        sourceType: sourceType as any,
        sourceId,
        ingredientId,
      },
    });

    return count > 0;
  }

  async getCurrentBalanceByIngredient(ingredientId: string): Promise<number> {
    const result = await this.prisma.inventoryLedgerEntry.aggregate({
      where: {
        ingredientId,
      },
      _sum: {
        deltaG: true,
      },
    });

    return result._sum.deltaG ?? 0;
  }

  async findBySource(
    sourceType: InventorySourceType,
    sourceId: string,
  ): Promise<InventoryLedgerEntry[]> {
    const records = await this.prisma.inventoryLedgerEntry.findMany({
      where: {
        sourceType: sourceType as any,
        sourceId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return records.map((r: any) => this.mapToDomain(r));
  }

  private mapToDomain(record: any): InventoryLedgerEntry {
    return new InventoryLedgerEntry(
      record.id,
      record.ingredientId,
      record.deltaG,
      record.sourceType as InventorySourceType,
      record.sourceId,
      record.createdAt,
    );
  }
}
