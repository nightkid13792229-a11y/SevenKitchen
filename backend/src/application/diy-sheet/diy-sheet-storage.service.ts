/**
 * DIY Sheet Storage Application Service
 * DIY制作单存储服务（用于保存、查询制作单）
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  CreateDIYSheetDto,
  DIYSheetResponseDto,
} from '../../interfaces/dto/diy-sheets.dto';

@Injectable()
export class DIYSheetStorageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建DIY制作单（幂等：同一用户+食谱+狗狗组合已存在时更新）
   */
  async create(
    userId: string,
    dto: CreateDIYSheetDto,
  ): Promise<DIYSheetResponseDto> {
    // 验证狗狗是否存在
    const dog = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        dogs: {
          where: { id: dto.dogId },
          select: { id: true, name: true },
        },
      },
    });

    if (!dog || dog.dogs.length === 0) {
      throw new BadRequestException('狗狗不存在');
    }

    const dogName = dog.dogs[0].name;

    // 同一用户+食谱+狗狗可能有多张（冻结后重新生成会新建），取最新一张
    const existing = await this.prisma.dIYSheet.findFirst({
      where: {
        userId,
        recipeId: dto.recipeId,
        dogId: dto.dogId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // 已冻结：内容没变就复用；内容变了必须新建，不能覆盖旧单
      if (existing.snapshot) {
        if (this.sameFrozenContent(existing, dto, dogName)) {
          return this.toResponseDto(existing);
        }
      } else {
        const updated = await this.prisma.dIYSheet.update({
          where: { id: existing.id },
          data: {
            recipeName: dto.recipeName,
            dogName,
            cycleDays: dto.cycleDays,
            perMealG: dto.perMealG,
            dailyIntakeG: dto.dailyIntakeG,
            packagePlan: dto.packagePlan as any,
            purchaseList: dto.purchaseList as any,
            productionSteps: dto.productionSteps,
          },
        });
        return this.toResponseDto(updated);
      }
    }

    // 创建制作单
    const sheet = await this.prisma.dIYSheet.create({
      data: {
        userId,
        recipeId: dto.recipeId,
        recipeName: dto.recipeName,
        dogId: dto.dogId,
        dogName,
        cycleDays: dto.cycleDays,
        perMealG: dto.perMealG,
        dailyIntakeG: dto.dailyIntakeG,
        packagePlan: dto.packagePlan as any,
        purchaseList: dto.purchaseList as any, // Prisma Json类型需要使用any
        productionSteps: dto.productionSteps,
      },
    });

    return this.toResponseDto(sheet);
  }

  /**
   * 获取用户的所有制作单
   */
  async findAllByUser(userId: string): Promise<DIYSheetResponseDto[]> {
    const sheets = await this.prisma.dIYSheet.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return sheets.map((sheet) => this.toResponseDto(sheet));
  }

  /**
   * 根据ID获取制作单
   */
  async findOne(id: string, userId: string): Promise<DIYSheetResponseDto> {
    const sheet = await this.prisma.dIYSheet.findFirst({
      where: { id, userId },
    });

    if (!sheet) {
      throw new NotFoundException('制作单不存在');
    }

    return this.toResponseDto(sheet);
  }

  /**
   * 删除制作单
   */
  async delete(id: string, userId: string): Promise<void> {
    // 验证制作单是否属于该用户
    const sheet = await this.prisma.dIYSheet.findFirst({
      where: { id, userId },
    });

    if (!sheet) {
      throw new NotFoundException('制作单不存在');
    }

    await this.prisma.dIYSheet.delete({
      where: { id },
    });
  }

  /**
   * 转换为响应DTO
   */
  /**
   * 冻结后判断“这次保存是不是同一张单”。
   * 只比较会变化的内容；snapshot/updatedAt 不参与，否则永远不相等。
   */
  private sameFrozenContent(
    existing: any,
    dto: CreateDIYSheetDto,
    dogName: string,
  ): boolean {
    const left = {
      recipeName: existing.recipeName,
      dogName: existing.dogName,
      cycleDays: existing.cycleDays,
      perMealG: existing.perMealG,
      dailyIntakeG: existing.dailyIntakeG,
      packagePlan: existing.packagePlan ?? null,
      purchaseList: existing.purchaseList ?? null,
      productionSteps: existing.productionSteps ?? null,
    };
    const right = {
      recipeName: dto.recipeName,
      dogName,
      cycleDays: dto.cycleDays,
      perMealG: dto.perMealG,
      dailyIntakeG: dto.dailyIntakeG,
      packagePlan: dto.packagePlan ?? null,
      purchaseList: dto.purchaseList ?? null,
      productionSteps: dto.productionSteps ?? null,
    };
    return stableStringify(left) === stableStringify(right);
  }

  private toResponseDto(sheet: any): DIYSheetResponseDto {
    return {
      id: sheet.id,
      recipeId: sheet.recipeId,
      recipeName: sheet.recipeName,
      dogId: sheet.dogId,
      dogName: sheet.dogName,
      cycleDays: sheet.cycleDays,
      perMealG: sheet.perMealG,
      dailyIntakeG: sheet.dailyIntakeG,
      packagePlan: sheet.packagePlan ?? null,
      purchaseList: sheet.purchaseList,
      productionSteps: sheet.productionSteps,
      recipeVersion: sheet.recipeVersion ?? null,
      snapshot: (sheet.snapshot ?? null) as Record<string, unknown> | null,
      snapshotAt: sheet.snapshotAt
        ? sheet.snapshotAt.toISOString()
        : null,
      createdAt: sheet.createdAt.toISOString(),
      updatedAt: sheet.updatedAt.toISOString(),
    };
  }
}


/** 稳定序列化：对象 key 排序，避免 JSONB 字段顺序不同导致误判 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
