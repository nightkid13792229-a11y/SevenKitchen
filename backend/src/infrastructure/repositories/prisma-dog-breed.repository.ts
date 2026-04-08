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

  async save(breed: DogBreed): Promise<DogBreed> {
    const record = await this.prisma.dogBreed.create({
      data: {
        id: breed.id,
        name: breed.name,
        aliases: breed.aliases,
        isCommon: breed.isCommon,
        sizeCategory: breed.sizeCategory,
        growthCurveType: breed.growthCurveType,
        adultAgeMonths: breed.adultAgeMonths,
        seniorAgeYears: breed.seniorAgeYears,
        averageAdultWeightKg: breed.averageAdultWeightKg,
      },
    });

    return this.mapToDomain(record);
  }

  async update(id: string, breed: DogBreed): Promise<DogBreed | null> {
    try {
      const record = await this.prisma.dogBreed.update({
        where: { id },
        data: {
          name: breed.name,
          aliases: breed.aliases,
          isCommon: breed.isCommon,
          sizeCategory: breed.sizeCategory,
          growthCurveType: breed.growthCurveType,
          adultAgeMonths: breed.adultAgeMonths,
          seniorAgeYears: breed.seniorAgeYears,
          averageAdultWeightKg: breed.averageAdultWeightKg,
        },
      });

      return this.mapToDomain(record);
    } catch (error) {
      // Record not found
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.dogBreed.delete({
      where: { id },
    });
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    const count = await this.prisma.dogBreed.count({
      where: {
        name,
        ...(excludeId && { id: { not: excludeId } }),
      },
    });
    return count > 0;
  }

  async countUsage(breedId: string): Promise<number> {
    return this.prisma.dog.count({
      where: { breedId },
    });
  }

  async findUsage(
    breedId: string,
    limit: number = 10,
  ): Promise<Array<{ id: string; name: string; ownerId: string }>> {
    const dogs = await this.prisma.dog.findMany({
      where: { breedId },
      select: {
        id: true,
        name: true,
        ownerId: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return dogs;
  }

  private mapToDomain(record: any): DogBreed {
    return new DogBreed(
      record.id,
      record.name,
      record.aliases || [],
      record.sizeCategory as DogSizeCategory,
      record.growthCurveType as GrowthCurveType,
      record.adultAgeMonths,
      record.seniorAgeYears,
      record.averageAdultWeightKg,
      record.isCommon || false,
    );
  }
}
