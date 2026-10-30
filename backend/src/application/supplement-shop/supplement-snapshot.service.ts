import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';

type Tx = Prisma.TransactionClient;

/**
 * 补剂制作单快照（2026-10-20）
 *
 * 首次为一张 DIY 制作单下单补剂时，冻结整张制作单：
 * - 制作单字段（周期/每餐/分装计划/采购清单/步骤）
 * - 食谱 + 食谱行（食材/补剂/比例/示例重量）
 * - 狗狗计算字段
 * - 本单实际购买的补剂行（未买的也保留 purchased=false）
 *
 * 只写一次；后续改食谱不影响。冻结后再生成制作单由 DIYSheetStorageService 新建。
 */
@Injectable()
export class SupplementSnapshotService {
  private readonly logger = new Logger(SupplementSnapshotService.name);
  private static readonly MAX_SNAPSHOT_BYTES = 200_000;

  constructor(private readonly prisma: PrismaService) {}

  async freezeForOrder(
    tx: Tx,
    input: { orderId: string; userId: string; diySheetId: string },
  ): Promise<void> {
    const [order, sheet] = await Promise.all([
      tx.supplementOrder.findUnique({
        where: { id: input.orderId },
        include: { items: true },
      }),
      tx.dIYSheet.findUnique({ where: { id: input.diySheetId } }),
    ]);
    if (!order) throw new BadRequestException('补剂订单不存在');
    if (!sheet) throw new BadRequestException('制作单不存在');
    if (sheet.userId !== input.userId) {
      throw new BadRequestException('制作单不属于当前用户');
    }
    if (order.userId !== input.userId) {
      throw new BadRequestException('订单不属于当前用户');
    }
    if (order.diySheetId && order.diySheetId !== sheet.id) {
      throw new BadRequestException('订单与制作单不匹配');
    }
    if (
      order.recipeId &&
      sheet.recipeId &&
      order.recipeId !== sheet.recipeId
    ) {
      throw new BadRequestException('订单食谱与制作单不一致');
    }
    if (order.dogId && sheet.dogId && order.dogId !== sheet.dogId) {
      throw new BadRequestException('订单狗狗与制作单不一致');
    }

    // 已冻结：不覆盖。订单与制作单的归属/recipe/dog 已在上方校验。
    if (sheet.snapshot) return;

    const recipe = await this.findRecipe(tx, sheet.recipeId);
    const dog = await tx.dog.findUnique({
      where: { id: sheet.dogId },
      select: {
        id: true,
        name: true,
        currentWeightKg: true,
        mealsPerDay: true,
      },
    });

    const orderItemsByIngredient = new Map(
      order.items.map((item) => [item.ingredientId, item]),
    );
    const recipeSupplementItems = (recipe?.items ?? []).filter(
      (item) => item.ingredient?.type === 'SUPPLEMENT',
    );
    const seen = new Set<string>();
    const supplementLines: Array<Record<string, unknown>> = [];

    for (const item of recipeSupplementItems) {
      seen.add(item.ingredientId);
      const orderItem = orderItemsByIngredient.get(item.ingredientId);
      supplementLines.push({
        ingredientId: item.ingredientId,
        name: orderItem?.name || item.ingredient?.name || item.ingredientId,
        brand: orderItem?.brand ?? null,
        productModel: orderItem?.productModel ?? null,
        unit:
          orderItem?.unit ||
          item.ingredient?.unitDisplayLabel ||
          item.ingredient?.baseUnit ||
          'g',
        requestedAmount: orderItem?.requestedAmount ?? null,
        packedAmount: orderItem?.packedAmount ?? null,
        bags: orderItem?.bags ?? null,
        recipeItemId: (orderItem as any)?.recipeItemId ?? null,
        sourceIngredientId:
          (orderItem as any)?.sourceIngredientId ?? null,
        dosageSnapshot: (orderItem as any)?.dosageSnapshot ?? null,
        purchased: Boolean(orderItem),
      });
    }

    for (const item of order.items) {
      if (seen.has(item.ingredientId)) continue;
      supplementLines.push({
        ingredientId: item.ingredientId,
        name: item.name,
        brand: item.brand,
        productModel: item.productModel,
        unit: item.unit,
        requestedAmount: item.requestedAmount,
        packedAmount: item.packedAmount,
        bags: item.bags,
        recipeItemId: (item as any).recipeItemId ?? null,
        sourceIngredientId: (item as any).sourceIngredientId ?? null,
        dosageSnapshot: (item as any).dosageSnapshot ?? null,
        purchased: true,
      });
    }

    const frozenAt = new Date();
    const snapshot: Record<string, unknown> = {
      version: 1,
      frozenAt: frozenAt.toISOString(),
      sheet: {
        id: sheet.id,
        recipeId: sheet.recipeId,
        recipeName: sheet.recipeName,
        dogId: sheet.dogId,
        dogName: sheet.dogName,
        cycleDays: sheet.cycleDays,
        perMealG: sheet.perMealG,
        dailyIntakeG: sheet.dailyIntakeG,
        packagePlan: sheet.packagePlan ?? null,
        purchaseList: sheet.purchaseList ?? null,
        productionSteps: sheet.productionSteps ?? null,
        createdAt: sheet.createdAt.toISOString(),
      },
      recipe: recipe
        ? {
            id: recipe.id,
            recipeId: recipe.recipeId,
            version: recipe.version,
            name: recipe.name,
            nutritionStandard: recipe.nutritionStandard ?? null,
            productionLossRate: recipe.productionLossRate ?? null,
            nutritionDetailedData: recipe.nutritionDetailedData ?? null,
            items: recipe.items.map((item) => ({
              ingredientId: item.ingredientId,
              name: item.ingredient?.name ?? null,
              type: item.ingredient?.type ?? null,
              ratioPercent: item.ratioPercent ?? null,
              exampleWeight: item.exampleWeight ?? null,
              preparationMethod: item.preparationMethod ?? null,
              supplementTargets: item.supplementTargets ?? null,
            })),
          }
        : null,
      dog: dog
        ? {
            id: dog.id,
            name: dog.name,
            weightKg: dog.currentWeightKg,
            mealsPerDay: dog.mealsPerDay,
          }
        : null,
      supplementLines,
      ...(recipe
        ? {}
        : { snapshotWarning: '下单时未找到食谱，快照缺少食谱明细' }),
    };

    const serialized = JSON.stringify(snapshot);
    if (serialized.length > SupplementSnapshotService.MAX_SNAPSHOT_BYTES) {
      // 不丢核心字段；只标记超限，后续可把采购清单/步骤拆到附件
      snapshot.snapshotWarning =
        '快照超过 200KB，已完整保留，建议后续拆分长文本';
      this.logger.warn(
        `[SupplementSnapshot] snapshot too large order=${order.id} bytes=${serialized.length}`,
      );
    }

    await tx.dIYSheet.update({
      where: { id: sheet.id },
      data: {
        recipeVersion: recipe?.version ?? null,
        snapshot: snapshot as Prisma.InputJsonValue,
        snapshotAt: frozenAt,
      },
    });
  }

  private async findRecipe(tx: Tx, recipeId: string) {
    const byId = await tx.recipe.findUnique({
      where: { id: recipeId },
      include: {
        items: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                type: true,
                baseUnit: true,
                unitDisplayLabel: true,
              },
            },
          },
        },
      },
    });
    if (byId) return byId;

    // 兼容历史数据：DIYSheet.recipeId 可能存的是逻辑 recipeId，而不是版本行 id
    return tx.recipe.findFirst({
      where: { recipeId },
      orderBy: { version: 'desc' },
      include: {
        items: {
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                type: true,
                baseUnit: true,
                unitDisplayLabel: true,
              },
            },
          },
        },
      },
    });
  }
}
