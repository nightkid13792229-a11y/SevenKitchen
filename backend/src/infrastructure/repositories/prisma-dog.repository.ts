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
      select: { id: true, currentWeightKg: true },
    });

    /**
     * 体重是否发生了变化。
     *
     * 2026-09-27：老板定了「体重超过 60 天就提醒顾客更新」（决策 8），
     * 但 dog 表原先只有 created_at，判断不出"档案里这个体重是什么时候录的"。
     * 这里在体重真正变化时打时间戳（新建档案也算），供前端算有效期。
     *
     * 只在体重变化时刷新：改名字、换头像这类操作不应该让体重"看起来变新了"。
     */
    const weightChanged =
      !existing || existing.currentWeightKg !== dog.currentWeightKg;

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
      preferredFoods: dog.preferredFoods,
      pickyFoods: dog.pickyFoods,
      cachedTargetFoodKcal: dog.cachedTargetFoodKcal,
      // 繁殖期信息（2026-09-29，阶段 A）
      matingDate: dog.matingDate ?? null,
      expectedDueDate: dog.expectedDueDate ?? null,
      deliveryDate: dog.deliveryDate ?? null,
      litterSize: dog.litterSize ?? null,
      ...(weightChanged ? { weightUpdatedAt: new Date() } : {}),
      // 确认状态由领域实体携带：
      // 改档案时会先把已有档案读出来（因此原确认时间会被原样写回），
      // 只有顾客这次真的点了那一项，服务层才会把它覆盖成当前时间。
      bcsScoreConfirmedAt: dog.bcsScoreConfirmedAt,
      activityLevelConfirmedAt: dog.activityLevelConfirmedAt,
      mealsPerDayConfirmedAt: dog.mealsPerDayConfirmedAt,
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
      record.weightUpdatedAt ?? null,
      record.bcsScoreConfirmedAt ?? null,
      record.activityLevelConfirmedAt ?? null,
      record.mealsPerDayConfirmedAt ?? null,
      record.preferredFoods ?? null,
      // 繁殖期信息（2026-09-29，阶段 A）
      record.matingDate ?? null,
      record.expectedDueDate ?? null,
      record.deliveryDate ?? null,
      record.litterSize ?? null,
    );
  }
}
