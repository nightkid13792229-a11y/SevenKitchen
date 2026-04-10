import { Injectable } from '@nestjs/common';
import { Prisma, Dog as PrismaDog } from '@prisma/client';
import type { DogRepository } from '../../domain/dog/dog.repository';
import { Dog } from '../../domain/dog/dog.entity';
import { PrismaService } from '../prisma.service';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  DogSizeCategory,
  TreatInputMode,
  TreatLevel,
} from '../../domain';

@Injectable()
export class PrismaDogRepository implements DogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Dog | null> {
    const record = await this.prisma.dog.findUnique({
      where: { id },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Dog[]> {
    // Enforce customer isolation: always filter by ownerId
    const records = await this.prisma.dog.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async save(dog: Dog): Promise<Dog> {
    const existing = await this.prisma.dog.findUnique({
      where: { id: dog.id },
      select: { id: true },
    });

    const data: Prisma.DogUncheckedCreateInput = {
      id: dog.id,
      ownerId: dog.ownerId,
      name: dog.name,
      breedId: dog.breedId,
      customBreedName: dog.customBreedName,
      birthday: dog.birthday,
      gender: dog.gender as any,
      isNeutered: dog.isNeutered,
      currentWeightKg: dog.currentWeightKg,
      bcsScore: dog.bcsScore,
      activityLevel: dog.activityLevel as any,
      lifeStageOverride: dog.lifeStageOverride as any,
      sizeClassOverride: dog.sizeClassOverride as any,
      mealsPerDay: dog.mealsPerDay,
      treatInputMode: dog.treatInputMode as any,
      treatLevel: dog.treatLevel as any,
      manualTreatKcal: dog.manualTreatKcal,
      medicalHistory: dog.medicalHistory,
      avatarUrl: dog.avatarUrl,
      allergyFoods: dog.allergyFoods,
      pickyFoods: dog.pickyFoods,
      cachedTargetFoodKcal: dog.cachedTargetFoodKcal,
    };

    if (!existing) {
      await this.prisma.dog.create({ data });
    } else {
      await this.prisma.dog.update({
        where: { id: dog.id },
        data,
      });
    }

    const saved = await this.prisma.dog.findUnique({
      where: { id: dog.id },
    });
    return saved ? this.mapToDomain(saved) : dog;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.dog.delete({ where: { id } });
  }

  private mapToDomain(record: PrismaDog): Dog {
    return new Dog(
      record.id,
      record.ownerId,
      record.name,
      record.breedId,
      record.customBreedName,
      record.birthday,
      record.gender as DogGender,
      record.isNeutered,
      record.currentWeightKg,
      record.bcsScore,
      record.activityLevel as ActivityLevel,
      record.lifeStageOverride as LifeStageOverride,
      (record.sizeClassOverride as DogSizeCategory) ?? null,
      record.mealsPerDay,
      record.treatInputMode as TreatInputMode,
      record.treatLevel as TreatLevel,
      record.manualTreatKcal,
      record.medicalHistory,
      record.allergyFoods,
      record.pickyFoods,
      record.cachedTargetFoodKcal,
      record.avatarUrl,
    );
  }
}
