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

    // 检查是否已存在同一用户+食谱+狗狗的制作单
    const existing = await this.prisma.dIYSheet.findFirst({
      where: {
        userId,
        recipeId: dto.recipeId,
        dogId: dto.dogId,
      },
    });

    if (existing) {
      // 更新已有记录
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
      createdAt: sheet.createdAt.toISOString(),
      updatedAt: sheet.updatedAt.toISOString(),
    };
  }
}
