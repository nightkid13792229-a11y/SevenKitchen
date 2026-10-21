import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { TimezoneUtil } from '../../utils/timezone.util';

export type PackagingRoleCode = 'POUCH' | 'DESICCANT' | 'LABEL';

export interface PackagingRuleDto {
  id: string;
  role: PackagingRoleCode;
  ingredientId: string;
  ingredientName: string;
  /** 包材规格/型号，用于区分同名不同尺寸的袋/标签 */
  ingredientSpec: string | null;
  ingredientBrand: string | null;
  physicalForm: string | null;
  unitPattern: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  priority: number;
  enabled: boolean;
  note: string | null;
}

export interface UpsertPackagingRuleInput {
  id?: string;
  role: PackagingRoleCode;
  ingredientId: string;
  physicalForm?: string | null;
  unitPattern?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
  priority?: number;
  enabled?: boolean;
  note?: string | null;
}

/**
 * 补剂包材规则 + 分装汇总（2026-10-20 P5/P7）
 *
 * 包材主数据仍用 Ingredient(type=PACKAGING)；这里只维护“选哪只袋/哪张标签/哪包干燥剂”。
 * 本轮不扣包材库存，只算需求量；未配置不阻塞分装，但汇总/上线检查会标红。
 */
@Injectable()
export class SupplementPackagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async listRules(): Promise<PackagingRuleDto[]> {
    const rows = await this.prisma.supplementPackagingRule.findMany({
      include: {
        ingredient: { select: { name: true, brand: true, productModel: true } },
      },
      orderBy: [{ role: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async listPackagingIngredients() {
    return this.prisma.ingredient.findMany({
      where: { type: 'PACKAGING' },
      select: {
        id: true,
        name: true,
        brand: true,
        productModel: true,
        baseUnit: true,
        unitDisplayLabel: true,
        purchaseUnit: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async upsertRule(input: UpsertPackagingRuleInput): Promise<PackagingRuleDto> {
    if (!['POUCH', 'DESICCANT', 'LABEL'].includes(input.role)) {
      throw new BadRequestException('包材角色不合法');
    }
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: input.ingredientId },
      select: { id: true, type: true },
    });
    if (!ingredient || ingredient.type !== 'PACKAGING') {
      throw new BadRequestException('包材必须来自 PACKAGING 类型的原料档案');
    }
    if (
      input.minAmount !== undefined &&
      input.minAmount !== null &&
      input.minAmount < 0
    ) {
      throw new BadRequestException('最小量不能为负数');
    }
    if (
      input.maxAmount !== undefined &&
      input.maxAmount !== null &&
      input.minAmount !== undefined &&
      input.minAmount !== null &&
      input.maxAmount < input.minAmount
    ) {
      throw new BadRequestException('最大量不能小于最小量');
    }

    const data: any = {
      role: input.role,
      ingredientId: input.ingredientId,
      physicalForm: input.physicalForm ?? null,
      unitPattern: input.unitPattern?.trim() || null,
      minAmount: input.minAmount ?? null,
      maxAmount: input.maxAmount ?? null,
      priority: input.priority ?? 0,
      enabled: input.enabled ?? true,
      note: input.note?.trim() || null,
    };

    const row = input.id
      ? await this.prisma.supplementPackagingRule.update({
          where: { id: input.id },
          data,
          include: {
        ingredient: { select: { name: true, brand: true, productModel: true } },
      },
        })
      : await this.prisma.supplementPackagingRule.create({
          data,
          include: {
        ingredient: { select: { name: true, brand: true, productModel: true } },
      },
        });
    return this.toDto(row as any);
  }

  async deleteRule(id: string): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.supplementPackagingRule.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('包材规则不存在');
    await this.prisma.supplementPackagingRule.delete({ where: { id } });
    return { deleted: true };
  }

  async getPackingSummary(dateInput?: string) {
    const date = dateInput
      ? TimezoneUtil.parseDateOnly(dateInput)
      : TimezoneUtil.toShanghaiDateOnly(new Date());
    const config = await this.prisma.supplementShopConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPackingCapacity: true },
    });
    const orders = await this.prisma.supplementOrder.findMany({
      where: {
        packingDate: date,
        status: { in: ['PAID', 'PACKING', 'PACKED'] },
      },
      select: {
        id: true,
        orderNo: true,
        status: true,
        bagCount: true,
        items: {
          select: {
            ingredientId: true,
            name: true,
            unit: true,
            physicalForm: true,
            packedAmount: true,
            bags: true,
          },
        },
      },
      orderBy: { orderNo: 'asc' },
    });

    const rules = await this.prisma.supplementPackagingRule.findMany({
      where: { enabled: true },
      include: {
        ingredient: { select: { name: true, brand: true, productModel: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    const ingredientTotals = new Map<
      string,
      { ingredientId: string; name: string; unit: string; quantity: number; orders: Set<string> }
    >();
    const packagingNeeds = new Map<
      string,
      { role: PackagingRoleCode; name: string; quantity: number; configured: boolean }
    >();
    const missingRules: string[] = [];
    let bagCount = 0;

    const addNeed = (
      key: string,
      role: PackagingRoleCode,
      name: string,
      quantity: number,
      configured: boolean,
    ) => {
      const current = packagingNeeds.get(key);
      if (current) current.quantity += quantity;
      else packagingNeeds.set(key, { role, name, quantity, configured });
    };

    for (const order of orders) {
      bagCount += order.bagCount;
      for (const item of order.items) {
        const quantity = Number(item.packedAmount) * Math.max(1, item.bags);
        const key = `${item.ingredientId}::${item.unit}`;
        const current = ingredientTotals.get(key);
        if (current) {
          current.quantity += quantity;
          current.orders.add(order.id);
        } else {
          ingredientTotals.set(key, {
            ingredientId: item.ingredientId,
            name: item.name,
            unit: item.unit,
            quantity,
            orders: new Set([order.id]),
          });
        }

        const rule = this.resolveRule(
          rules,
          'POUCH',
          item.physicalForm,
          item.unit,
          Number(item.packedAmount),
        );
        if (rule) {
          addNeed(
            `POUCH:${rule.id}`,
            'POUCH',
            rule.ingredient.name,
            item.bags,
            true,
          );
        } else {
          missingRules.push(
            `${item.name}（${item.physicalForm ?? '未填形态'} / ${item.unit} / ${item.packedAmount}）`,
          );
        }
      }
    }

    for (const role of ['DESICCANT', 'LABEL'] as const) {
      const rule = rules.find((row) => row.role === role);
      addNeed(
        `${role}:${rule?.id ?? 'default'}`,
        role,
        rule?.ingredient.name ??
          (role === 'DESICCANT' ? '干燥剂' : '40×60 标签'),
        bagCount,
        Boolean(rule),
      );
    }

    const ingredientIds = Array.from(ingredientTotals.values()).map(
      (item) => item.ingredientId,
    );
    const availability =
      await this.inventoryService.getAvailabilityByIngredientIds(
        ingredientIds,
      );

    return {
      date: TimezoneUtil.shanghaiDateKey(date),
      capacity: Math.max(1, config?.dailyPackingCapacity ?? 30),
      orderCount: orders.length,
      bagCount,
      ingredientTotals: Array.from(ingredientTotals.values()).map((item) => {
        const stock = availability.get(item.ingredientId);
        const onHand = Number(stock?.onHandQuantityG ?? 0);
        return {
          ingredientId: item.ingredientId,
          name: item.name,
          unit: item.unit,
          quantity: Number(item.quantity.toFixed(3)),
          orderCount: item.orders.size,
          onHand,
          shortage: Math.max(Number((item.quantity - onHand).toFixed(3)), 0),
        };
      }),
      packagingNeeds: Array.from(packagingNeeds.values()),
      missingPouchRules: Array.from(new Set(missingRules)),
      orders: orders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        status: order.status,
        bagCount: order.bagCount,
      })),
    };
  }

  private resolveRule(
    rules: Array<{
      id: string;
      role: string;
      physicalForm: string | null;
      unitPattern: string | null;
      minAmount: number | null;
      maxAmount: number | null;
      priority: number;
      ingredient: { name: string };
    }>,
    role: PackagingRoleCode,
    physicalForm: string | null,
    unit: string,
    amount: number,
  ) {
    return rules
      .filter((rule) => rule.role === role)
      .filter(
        (rule) => !rule.physicalForm || rule.physicalForm === physicalForm,
      )
      .filter(
        (rule) =>
          !rule.unitPattern ||
          unit.toLowerCase().includes(rule.unitPattern.toLowerCase()),
      )
      .filter((rule) => rule.minAmount === null || amount >= rule.minAmount)
      .filter((rule) => rule.maxAmount === null || amount <= rule.maxAmount)
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        const aSpan = (a.maxAmount ?? Infinity) - (a.minAmount ?? 0);
        const bSpan = (b.maxAmount ?? Infinity) - (b.minAmount ?? 0);
        return aSpan - bSpan;
      })[0];
  }

  private toDto(row: {
    id: string;
    role: string;
    ingredientId: string;
    physicalForm: string | null;
    unitPattern: string | null;
    minAmount: number | null;
    maxAmount: number | null;
    priority: number;
    enabled: boolean;
    note: string | null;
    ingredient: { name: string; brand: string | null; productModel: string | null };
  }): PackagingRuleDto {
    return {
      id: row.id,
      role: row.role as PackagingRoleCode,
      ingredientId: row.ingredientId,
      ingredientName: row.ingredient.name,
      ingredientSpec: row.ingredient.productModel,
      ingredientBrand: row.ingredient.brand,
      physicalForm: row.physicalForm,
      unitPattern: row.unitPattern,
      minAmount: row.minAmount,
      maxAmount: row.maxAmount,
      priority: row.priority,
      enabled: row.enabled,
      note: row.note,
    };
  }
}
