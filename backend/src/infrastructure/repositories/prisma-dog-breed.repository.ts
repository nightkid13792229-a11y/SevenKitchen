/**
 * Prisma DogBreed Repository Implementation
 * Infrastructure layer implementation of DogBreedRepository
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { DogBreedRepository } from '../../domain/dog/dog-breed.repository';
import { DogBreed } from '../../domain/dog/dog-breed.entity';
import { DogSizeCategory, GrowthCurveType } from '../../domain/dog/enums';

@Injectable()
export class PrismaDogBreedRepository implements DogBreedRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DogBreed | null> {
    const record = await this.prisma.dogBreed.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.mapToDomain(record);
  }

  async findAll(): Promise<DogBreed[]> {
    const records = await this.prisma.dogBreed.findMany({
      orderBy: { name: 'asc' },
    });

    return records.map((r) => this.mapToDomain(r));
  }

  async findBySizeCategory(sizeCategory: string): Promise<DogBreed[]> {
    const records = await this.prisma.dogBreed.findMany({
      where: { sizeCategory: sizeCategory as any },
      orderBy: { name: 'asc' },
    });

    return records.map((r) => this.mapToDomain(r));
  }

  private mapToDomain(record: any): DogBreed {
    return new DogBreed(
      record.id,
      record.name,
      record.sizeCategory as DogSizeCategory,
      record.growthCurveType as GrowthCurveType,
      record.adultAgeMonths,
      record.seniorAgeYears,
      record.averageAdultWeightKg,
    );
  }
}
