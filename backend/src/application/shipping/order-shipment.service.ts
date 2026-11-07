/**
 * 合并 / 拆包发货（2026-11-07）。
 *
 * 一次发货 = 一票（shipment）= 1~N 张订单 + 1~M 个包裹：
 *   · 多张订单装进 1 个包裹 = 合并发货
 *   · 1 张订单装进多个包裹 = 拆包发货
 *   · 混着来也行（A 单拆成 2 包，B 单合进第 1 包）
 *
 * 分摊结果落在 order_shipment_package_item.allocated_fee，
 * 同时回写 order.actual_shipping_fee —— 老报表、老接口一行都不用改。
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderStatus } from '../../domain/order';
import type { OrderRepository } from '../../domain/order/order.repository';
import { PrismaService } from '../../infrastructure/prisma.service';
import { ORDER_REPOSITORY } from '../order/order.service.tokens';
import { ShippingNotificationService } from './shipping-notification.service';
import {
  allocateShipmentFees,
  allocatePackageFee,
  type AllocationItemInput,
} from './shipping-fee-allocation';

/** 一票上限（2026-11-07 老板确认）：最多 10 单 / 6 个包裹 */
export const MAX_ORDERS_PER_SHIPMENT = 10;
export const MAX_PACKAGES_PER_SHIPMENT = 6;

export interface ShipmentPackageItemInput {
  orderId: string;
  /** 每袋多少克 */
  specG: number;
  bags: number;
}

export interface ShipmentPackageInput {
  carrierCode: string;
  trackingNumber: string;
  actualShippingFee: number;
  items: ShipmentPackageItemInput[];
}

export interface CreateShipmentInput {
  packages: ShipmentPackageInput[];
  note?: string | null;
}

export interface ShipmentPackageDto {
  id: string;
  carrierCode: string;
  trackingNumber: string;
  actualShippingFee: number;
  weightG: number;
  sortOrder: number;
  items: Array<{
    orderId: string;
    specG: number;
    bags: number;
    weightG: number;
    allocatedFee: number;
  }>;
}

export interface ShipmentDto {
  id: string;
  shippedAt: string;
  note: string | null;
  packages: ShipmentPackageDto[];
  orders: Array<{
    orderId: string;
    totalWeightG: number;
    totalBags: number;
    allocatedFee: number;
  }>;
}

/** 一张订单的分装方案：specG → 袋数 */
interface OrderPackaging {
  orderId: string;
  specsBags: Map<number, number>;
  totalBags: number;
  totalWeightG: number;
}

@Injectable()
export class OrderShipmentService {
  private readonly logger = new Logger(OrderShipmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
    @Optional()
    private readonly shippingNotificationService?: ShippingNotificationService,
  ) {}

  /**
   * 提交一票发货。
   *
   * 校验全部前置，任何一条不满足直接 400 —— 不做「发一半」。
   */
  async createShipment(
    input: CreateShipmentInput,
    actorId?: string | null,
  ): Promise<ShipmentDto> {
    const packages = Array.isArray(input?.packages) ? input.packages : [];
    if (packages.length === 0) {
      throw new BadRequestException('至少要有一个包裹');
    }
    if (packages.length > MAX_PACKAGES_PER_SHIPMENT) {
      throw new BadRequestException(
        `一票最多 ${MAX_PACKAGES_PER_SHIPMENT} 个包裹`,
      );
    }

    const normalized = packages.map((pkg, index) =>
      this.normalizePackage(pkg, index),
    );

    const trackingNumbers = normalized.map((pkg) => pkg.trackingNumber);
    if (new Set(trackingNumbers).size !== trackingNumbers.length) {
      throw new BadRequestException('两个包裹填了同一个运单号');
    }

    const orderIds = Array.from(
      new Set(
        normalized.flatMap((pkg) => pkg.items.map((item) => item.orderId)),
      ),
    );
    if (orderIds.length === 0) {
      throw new BadRequestException('这票里没有装任何订单');
    }
    if (orderIds.length > MAX_ORDERS_PER_SHIPMENT) {
      throw new BadRequestException(
        `一票最多 ${MAX_ORDERS_PER_SHIPMENT} 张订单`,
      );
    }

    // 1) 订单状态 / 顾客 / 地址
    const orders = await Promise.all(
      orderIds.map((orderId) => this.orderRepository.findById(orderId)),
    );
    orders.forEach((order, index) => {
      if (!order) {
        throw new NotFoundException(`Order not found: ${orderIds[index]}`);
      }
    });
    const customerIds = new Set(orders.map((order) => order!.customerId));
    if (customerIds.size > 1) {
      throw new BadRequestException('不同顾客的订单不能合并发货');
    }
    this.assertSameAddress(orders as any[]);

    // 2) 已经在别的票里了就直说，别让唯一索引报一个看不懂的错
    const occupied = await this.prisma.orderShipmentOrder.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, shipmentId: true },
    });
    if (occupied.length > 0) {
      throw new BadRequestException(
        `${occupied.length} 张订单已经在另一票发货里了，刷新看看`,
      );
    }

    // 2) 分装方案，用来校验袋数、算重量
    const packaging = await this.loadPackaging(orderIds);
    for (const orderId of orderIds) {
      if (!packaging.has(orderId)) {
        throw new BadRequestException(`订单 ${orderId} 没有可发货的分装方案`);
      }
    }
    this.assertBagsMatch(normalized, packaging);

    // 3) 算分摊（纯函数，可单独测）。按「订单 × 规格」逐行分，再汇总到订单 ——
    //    这样一张订单在同一包裹里有两个规格时，金额也能落到具体那一行。
    const allocation = allocateShipmentFees(
      normalized.map((pkg) => ({
        totalFee: pkg.actualShippingFee,
        items: pkg.items.map((item) => ({
          orderId: item.orderId,
          weightG: item.weightG,
        })),
      })),
    );

    // 4) 域校验：状态机允许发货吗（会抛 InvalidStateTransitionError）
    const shippedAt = new Date();
    const primary = normalized[0];
    const statusBefore = new Map<string, OrderStatus>();
    for (const order of orders as any[]) {
      statusBefore.set(order.id, order.status);
      order.markAsShipped(primary.trackingNumber, primary.carrierCode);
    }

    // 5) 落库：票 + 包裹 + 分摊 + 订单状态，一个事务
    const shipmentId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.orderShipment.create({
        data: {
          id: shipmentId,
          shippedAt,
          shippedBy: actorId ?? null,
          note: input.note ?? null,
        },
      });

      await tx.orderShipmentOrder.createMany({
        data: orderIds.map((orderId) => {
          const pack = packaging.get(orderId)!;
          return {
            id: randomUUID(),
            shipmentId,
            orderId,
            totalWeightG: pack.totalWeightG,
            totalBags: pack.totalBags,
          };
        }),
      });

      for (let i = 0; i < normalized.length; i += 1) {
        const pkg = normalized[i];
        const packageId = randomUUID();
        const packageAllocation = allocation.packages[i];

        await tx.orderShipmentPackage.create({
          data: {
            id: packageId,
            shipmentId,
            carrierCode: pkg.carrierCode,
            trackingNumber: pkg.trackingNumber,
            actualShippingFee: pkg.actualShippingFee.toFixed(2),
            weightG: packageAllocation.totalWeightG,
            sortOrder: i + 1,
          },
        });

        await tx.orderShipmentPackageItem.createMany({
          data: packageAllocation.items.map((item, itemIndex) => ({
            id: randomUUID(),
            packageId,
            orderId: item.orderId,
            specG: pkg.items[itemIndex].specG,
            bags: pkg.items[itemIndex].bags,
            weightG: item.weightG,
            allocatedFee: item.allocatedFee.toFixed(2),
          })),
        });
      }

      for (const order of orders as any[]) {
        const total = allocation.orderTotals[order.id] ?? 0;
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.SHIPPED,
            trackingNumber: primary.trackingNumber,
            carrierCode: primary.carrierCode,
            shippedAt,
            actualShippingFee: total.toFixed(2),
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            id: randomUUID(),
            orderId: order.id,
            fromStatus: statusBefore.get(order.id) ?? OrderStatus.FREEZING,
            toStatus: OrderStatus.SHIPPED,
            actor: 'admin',
            actorId: actorId ?? null,
            metadata: {
              shipmentId,
              trackingNumbers,
              allocatedShippingFee: total,
            },
          },
        });
      }
    });

    // 6) 发货通知：每张订单一条（老板 2026-11-07 确认维持现状）
    for (const orderId of orderIds) {
      await this.sendNotificationSafely(orderId);
    }

    return this.getShipment(shipmentId);
  }

  /** 按订单查它所在的那一票（没有就返回 null，老订单走降级渲染） */
  async getByOrderId(orderId: string): Promise<ShipmentDto | null> {
    const link = await this.prisma.orderShipmentOrder.findUnique({
      where: { orderId },
      select: { shipmentId: true },
    });
    if (!link) return null;
    return this.getShipment(link.shipmentId);
  }

  async getShipment(shipmentId: string): Promise<ShipmentDto> {
    const shipment = await this.prisma.orderShipment.findUnique({
      where: { id: shipmentId },
      include: {
        packages: {
          include: { items: true },
          orderBy: { sortOrder: 'asc' },
        },
        orders: true,
      },
    });
    if (!shipment) {
      throw new NotFoundException(`Shipment not found: ${shipmentId}`);
    }

    const allocatedByOrder = new Map<string, number>();
    for (const pkg of shipment.packages) {
      for (const item of pkg.items) {
        allocatedByOrder.set(
          item.orderId,
          (allocatedByOrder.get(item.orderId) ?? 0) +
            Number(item.allocatedFee),
        );
      }
    }

    return {
      id: shipment.id,
      shippedAt: shipment.shippedAt.toISOString(),
      note: shipment.note ?? null,
      packages: shipment.packages.map((pkg) => ({
        id: pkg.id,
        carrierCode: pkg.carrierCode,
        trackingNumber: pkg.trackingNumber,
        actualShippingFee: Number(pkg.actualShippingFee),
        weightG: pkg.weightG,
        sortOrder: pkg.sortOrder,
        items: pkg.items.map((item) => ({
          orderId: item.orderId,
          specG: item.specG,
          bags: item.bags,
          weightG: item.weightG,
          allocatedFee: Number(item.allocatedFee),
        })),
      })),
      orders: shipment.orders.map((row) => ({
        orderId: row.orderId,
        totalWeightG: row.totalWeightG,
        totalBags: row.totalBags,
        allocatedFee:
          Math.round((allocatedByOrder.get(row.orderId) ?? 0) * 100) / 100,
      })),
    };
  }

  /**
   * 改一个包裹的运单号 / 运费（= 升级版「改运费」）。
   *
   * 运费一改，这包的分摊要重算，涉及到的订单 actual_shipping_fee 同步回写。
   * 不动订单状态、不重发发货通知、不重传微信发货信息。
   */
  async updatePackage(
    packageId: string,
    patch: {
      carrierCode?: string;
      trackingNumber?: string;
      actualShippingFee?: number;
    },
  ): Promise<ShipmentDto> {
    const pkg = await this.prisma.orderShipmentPackage.findUnique({
      where: { id: packageId },
      include: { items: true, shipment: true },
    });
    if (!pkg) {
      throw new NotFoundException(`Package not found: ${packageId}`);
    }
    if (pkg.shipment.cancelledAt) {
      throw new BadRequestException('这票已撤销，不能再改');
    }

    const carrierCode = String(patch.carrierCode ?? pkg.carrierCode).trim();
    const trackingNumber = String(
      patch.trackingNumber ?? pkg.trackingNumber,
    ).trim();
    if (!carrierCode) throw new BadRequestException('请选择快递公司');
    if (trackingNumber.length < 5) {
      throw new BadRequestException('运单号太短，检查一下');
    }

    const fee =
      patch.actualShippingFee === undefined
        ? Number(pkg.actualShippingFee)
        : Number(patch.actualShippingFee);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new BadRequestException('实际运费必须是不小于 0 的数字');
    }
    if (Math.abs(fee - Number(fee.toFixed(2))) > 1e-9) {
      throw new BadRequestException('实际运费最多保留两位小数');
    }

    // 同一票里不许出现重复单号
    const sibling = await this.prisma.orderShipmentPackage.findFirst({
      where: {
        shipmentId: pkg.shipmentId,
        trackingNumber,
        NOT: { id: packageId },
      },
      select: { id: true },
    });
    if (sibling) {
      throw new BadRequestException('同一票里已经有这个运单号了');
    }

    const weights: AllocationItemInput[] = pkg.items.map((item) => ({
      orderId: item.orderId,
      weightG: item.weightG,
    }));
    const allocated = allocatePackageFee(fee, weights);
    const orderIds = pkg.items.map((item) => item.orderId);

    await this.prisma.$transaction(async (tx) => {
      await tx.orderShipmentPackage.update({
        where: { id: packageId },
        data: {
          carrierCode,
          trackingNumber,
          actualShippingFee: fee.toFixed(2),
        },
      });

      for (const item of allocated) {
        await tx.orderShipmentPackageItem.updateMany({
          where: { packageId, orderId: item.orderId },
          data: { allocatedFee: item.allocatedFee.toFixed(2) },
        });
      }

      for (const orderId of orderIds) {
        const rows = await tx.orderShipmentPackageItem.findMany({
          where: { orderId },
          select: { allocatedFee: true },
        });
        const total =
          Math.round(
            rows.reduce((sum, row) => sum + Number(row.allocatedFee), 0) * 100,
          ) / 100;
        await tx.order.update({
          where: { id: orderId },
          data: { actualShippingFee: total.toFixed(2) },
        });
      }

      // 第 1 个包裹是「主单号」，老读法（订单上的 tracking_number）跟着它走
      for (const orderId of orderIds) {
        if (pkg.sortOrder === 1) {
          await tx.order.update({
            where: { id: orderId },
            data: { trackingNumber, carrierCode },
          });
        }
      }
    });

    return this.getShipment(pkg.shipmentId);
  }

  // ------------------------------------------------------------------
  // 内部工具
  // ------------------------------------------------------------------

  private normalizePackage(pkg: ShipmentPackageInput, index: number) {
    const carrierCode = String(pkg?.carrierCode ?? '').trim();
    const trackingNumber = String(pkg?.trackingNumber ?? '').trim();
    const fee = Number(pkg?.actualShippingFee);

    if (!carrierCode) {
      throw new BadRequestException(`包裹 ${index + 1} 还没选快递公司`);
    }
    if (trackingNumber.length < 5) {
      throw new BadRequestException(`包裹 ${index + 1} 的运单号太短`);
    }
    if (!Number.isFinite(fee) || fee < 0) {
      throw new BadRequestException(`包裹 ${index + 1} 的运费不对`);
    }
    if (Math.abs(fee - Number(fee.toFixed(2))) > 1e-9) {
      throw new BadRequestException(`包裹 ${index + 1} 的运费最多两位小数`);
    }

    const items = Array.isArray(pkg?.items) ? pkg.items : [];
    if (items.length === 0) {
      throw new BadRequestException(`包裹 ${index + 1} 是空的`);
    }

    const normalizedItems = items.map((item) => {
      const orderId = String(item?.orderId ?? '').trim();
      const specG = Math.floor(Number(item?.specG));
      const bags = Math.floor(Number(item?.bags));
      if (!orderId) {
        throw new BadRequestException(`包裹 ${index + 1} 里有订单没填`);
      }
      if (!Number.isFinite(specG) || specG < 1) {
        throw new BadRequestException(`包裹 ${index + 1} 的规格不对`);
      }
      if (!Number.isFinite(bags) || bags < 1) {
        throw new BadRequestException(`包裹 ${index + 1} 里有 0 袋的明细`);
      }
      return { orderId, specG, bags, weightG: specG * bags };
    });

    return {
      carrierCode,
      trackingNumber,
      actualShippingFee: Math.round(fee * 100) / 100,
      items: normalizedItems,
    };
  }

  /** 读订单的分装方案：specG → 袋数 */
  private async loadPackaging(
    orderIds: string[],
  ): Promise<Map<string, OrderPackaging>> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: {
        orderId: true,
        packagePlan: true,
        packageSpecG: true,
        packageCount: true,
      },
    });

    const map = new Map<string, OrderPackaging>();
    for (const item of items) {
      const rows = Array.isArray(item.packagePlan)
        ? (item.packagePlan as Array<{ packageSpecG?: number; packageCount?: number }>)
        : null;

      const normalizedRows =
        rows && rows.length > 0
          ? rows.map((row) => ({
              specG: Math.floor(Number(row.packageSpecG)),
              bags: Math.floor(Number(row.packageCount)),
            }))
          : [
              {
                specG: Math.floor(Number(item.packageSpecG)),
                bags: Math.floor(Number(item.packageCount)),
              },
            ];

      const current =
        map.get(item.orderId) ??
        {
          orderId: item.orderId,
          specsBags: new Map<number, number>(),
          totalBags: 0,
          totalWeightG: 0,
        };

      for (const row of normalizedRows) {
        if (row.specG < 1 || row.bags < 1) continue;
        current.specsBags.set(
          row.specG,
          (current.specsBags.get(row.specG) ?? 0) + row.bags,
        );
        current.totalBags += row.bags;
        current.totalWeightG += row.specG * row.bags;
      }

      map.set(item.orderId, current);
    }

    return map;
  }

  /** 每张订单的袋数必须全部分配完，且不能多装 */
  private assertBagsMatch(
    packages: Array<{
      items: Array<{ orderId: string; specG: number; bags: number }>;
    }>,
    packaging: Map<string, OrderPackaging>,
  ) {
    const submitted = new Map<string, Map<number, number>>();
    for (const pkg of packages) {
      for (const item of pkg.items) {
        const perOrder =
          submitted.get(item.orderId) ?? new Map<number, number>();
        perOrder.set(item.specG, (perOrder.get(item.specG) ?? 0) + item.bags);
        submitted.set(item.orderId, perOrder);
      }
    }

    for (const [orderId, pack] of packaging) {
      if (!submitted.has(orderId)) {
        throw new BadRequestException(`订单 ${orderId} 的货没装进任何包裹`);
      }
    }

    for (const [orderId, perOrder] of submitted) {
      const pack = packaging.get(orderId);
      if (!pack) {
        throw new BadRequestException(`订单 ${orderId} 不存在或不可发货`);
      }

      for (const [specG, bags] of perOrder) {
        const expected = pack.specsBags.get(specG);
        if (!expected) {
          throw new BadRequestException(
            `订单 ${orderId} 没有 ${specG}g 这个规格`,
          );
        }
        if (bags !== expected) {
          throw new BadRequestException(
            `订单 ${orderId} 的 ${specG}g 规格应装 ${expected} 袋，实际装了 ${bags} 袋`,
          );
        }
      }
    }
  }

  /** 合并发货要求同一个收货地址 */
  private assertSameAddress(orders: any[]) {
    const signatures = new Set(
      orders.map((order) => {
        if (order.addressId) return `id:${order.addressId}`;
        try {
          return `snapshot:${JSON.stringify(order.shippingAddressSnapshot ?? null)}`;
        } catch {
          return 'snapshot:null';
        }
      }),
    );
    if (signatures.size > 1) {
      throw new BadRequestException('收货地址不同的订单不能合并发货');
    }
  }

  private async sendNotificationSafely(orderId: string): Promise<void> {
    if (!this.shippingNotificationService) return;
    try {
      await this.shippingNotificationService.sendForOrder(orderId);
    } catch (error) {
      this.logger.error(
        `[Shipment] 发货通知发送失败 order=${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
