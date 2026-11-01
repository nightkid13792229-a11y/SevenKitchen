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
import { computeSheetTotalWeightG } from '../supplement-shop/supplement-sheet-weight.util';

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
            cycleDays: dto.cycleDays ?? null,
            perMealG: dto.perMealG,
            dailyIntakeG: dto.dailyIntakeG,
            packagePlan: dto.packagePlan as any,
            purchaseList: dto.purchaseList as any,
            productionSteps: dto.productionSteps,
            ...(dto.recipeVersion !== undefined && {
              recipeVersion: dto.recipeVersion,
            }),
            ...(dto.supplementSelections !== undefined && {
              supplementSelections: dto.supplementSelections as any,
            }),
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
        cycleDays: dto.cycleDays ?? null,
        perMealG: dto.perMealG,
        dailyIntakeG: dto.dailyIntakeG,
        packagePlan: dto.packagePlan as any,
        purchaseList: dto.purchaseList as any, // Prisma Json类型需要使用any
        productionSteps: dto.productionSteps,
        recipeVersion: dto.recipeVersion ?? null,
        ...(dto.supplementSelections !== undefined && {
          supplementSelections: dto.supplementSelections as any,
        }),
      },
    });

    return this.toResponseDto(sheet);
  }

  /**
   * 只改「分装规格」：补剂下单页的快速天数/自定义分装用它。
   *
   * 为什么单独一个接口：`create` 需要整份采购清单（客户端算的），
   * 而下单页手上只有「每袋多少克 × 多少袋」。所以这里按新旧总重比例
   * 缩放已有采购清单，不重新推导配方。
   *
   * ⚠️ 已冻结（下过单）的制作单不能覆盖：新建一张，旧的快照原样留着。
   */
  async updatePlan(
    userId: string,
    sheetId: string,
    packagePlan: Array<{ packageSpecG: number; packageCount: number }>,
  ): Promise<DIYSheetResponseDto> {
    const rows = (Array.isArray(packagePlan) ? packagePlan : []).map((row) => ({
      packageSpecG: Math.floor(Number(row?.packageSpecG)),
      packageCount: Math.floor(Number(row?.packageCount)),
    }));

    if (rows.length === 0 || rows.length > 10) {
      throw new BadRequestException('分装规格必须有 1~10 条');
    }
    for (const row of rows) {
      if (!Number.isFinite(row.packageSpecG) || row.packageSpecG < 1 || row.packageSpecG > 2000) {
        throw new BadRequestException('每袋克数必须是 1~2000 的整数');
      }
      if (!Number.isFinite(row.packageCount) || row.packageCount < 1 || row.packageCount > 200) {
        throw new BadRequestException('袋数必须是 1~200 的整数');
      }
    }
    const totalBags = rows.reduce((sum, row) => sum + row.packageCount, 0);
    if (totalBags > 300) {
      throw new BadRequestException('一张制作单最多 300 袋');
    }

    const sheet = await this.prisma.dIYSheet.findFirst({
      where: { id: sheetId, userId },
    });
    if (!sheet) {
      throw new NotFoundException('制作单不存在');
    }

    const oldTotalG = computeSheetTotalWeightG(sheet);
    const newTotalG = rows.reduce(
      (sum, row) => sum + row.packageSpecG * row.packageCount,
      0,
    );
    const ratio = oldTotalG > 0 && newTotalG > 0 ? newTotalG / oldTotalG : 1;
    const purchaseList = this.scalePurchaseList(
      (sheet as { purchaseList?: unknown }).purchaseList,
      ratio,
    );

    if (sheet.snapshot) {
      const created = await this.prisma.dIYSheet.create({
        data: {
          userId,
          recipeId: sheet.recipeId,
          recipeName: sheet.recipeName,
          dogId: sheet.dogId,
          dogName: sheet.dogName,
          cycleDays: null,
          perMealG: sheet.perMealG,
          dailyIntakeG: sheet.dailyIntakeG,
          packagePlan: rows as unknown as object,
          purchaseList: purchaseList as unknown as object,
          productionSteps: sheet.productionSteps,
          recipeVersion: sheet.recipeVersion,
          supplementSelections:
            (sheet as { supplementSelections?: unknown }).supplementSelections as
              | object
              | undefined,
        } as never,
      });
      return this.toResponseDto(created);
    }

    const updated = await this.prisma.dIYSheet.update({
      where: { id: sheet.id },
      data: {
        cycleDays: null,
        packagePlan: rows as unknown as object,
        purchaseList: purchaseList as unknown as object,
      },
    });
    return this.toResponseDto(updated);
  }

  /**
   * 按总重比例缩放采购清单。
   *
   * 采购清单是客户端算好存进来的（食材按"好买的量"取整、补剂保留 1 位小数），
   * 后端没有配方推导能力，所以只能等比缩放；数字跟着变，展示字符串按同一套
   * 规则重新生成，避免表格里数字和文字对不上。
   */
  private scalePurchaseList(list: unknown, ratio: number): unknown {
    if (!Array.isArray(list) || ratio === 1) return list;
    return list.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = { ...(item as Record<string, unknown>) };
      const type = String(row.type ?? '');
      const isFood = type === 'FOOD';

      const scaleNumber = (value: unknown): number | null => {
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        return Number((num * ratio).toFixed(1));
      };

      for (const key of ['netAmount', 'theoreticalAmount', 'actualAmount']) {
        if (typeof row[key] === 'number') {
          const scaled = scaleNumber(row[key]);
          if (scaled !== null) row[key] = scaled;
        }
      }
      for (const key of [
        'netAmountStr',
        'theoreticalAmountStr',
        'actualAmountStr',
      ]) {
        const amountKey = key.replace('Str', '');
        if (typeof row[key] === 'string' && typeof row[amountKey] === 'number') {
          row[key] = this.formatSheetAmount(row[amountKey] as number, isFood);
        }
      }
      return row;
    });
  }

  /** 与小程序 `formatNetAmount` 同一套规则：食材按好买的量取整，补剂保留 1 位小数 */
  private formatSheetAmount(amount: number, isFood: boolean): string {
    if (!Number.isFinite(amount) || amount <= 0) return '0g';
    if (!isFood) return `${amount.toFixed(1)}g`;
    if (amount < 10) return `${amount.toFixed(1)}g`;
    return `${Math.round(amount)}g`;
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
      cycleDays: existing.cycleDays ?? null,
      perMealG: existing.perMealG,
      dailyIntakeG: existing.dailyIntakeG,
      packagePlan: existing.packagePlan ?? null,
      purchaseList: existing.purchaseList ?? null,
      productionSteps: existing.productionSteps ?? null,
      ...(dto.recipeVersion !== undefined && {
        recipeVersion: existing.recipeVersion ?? null,
      }),
    };
    const right = {
      recipeName: dto.recipeName,
      dogName,
      cycleDays: dto.cycleDays ?? null,
      perMealG: dto.perMealG,
      dailyIntakeG: dto.dailyIntakeG,
      packagePlan: dto.packagePlan ?? null,
      purchaseList: dto.purchaseList ?? null,
      productionSteps: dto.productionSteps ?? null,
      ...(dto.recipeVersion !== undefined && {
        recipeVersion: dto.recipeVersion,
      }),
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
      cycleDays: sheet.cycleDays ?? null,
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
      supplementSelections: sheet.supplementSelections ?? null,
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
