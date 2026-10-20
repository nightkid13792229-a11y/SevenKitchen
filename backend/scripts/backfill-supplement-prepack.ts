/**
 * 补剂 v2 历史数据回填（默认 dry-run）
 *
 * 1. packingDate：PACKED / SHIPPED / COMPLETED 且没有分装日的历史单，
 *    用明细 packedAt / shippedAt / completedAt 的上海日期补分装日。
 * 2. 旧售后：SupplementOrder.aftersaleType / refund* 迁移成 AftersaleCase。
 *
 * 安全：
 * - 默认只打印，不写库；--apply 才写。
 * - 幂等：已有分装日/已有 case 跳过。
 * - 不改订单状态、不改金额、不重新发起退款。
 *
 * 用法：
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-supplement-prepack.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-supplement-prepack.ts --apply
 */
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { TimezoneUtil } from '../src/utils/timezone.util';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.min(2000, Math.max(1, Number(limitArg?.split('=')[1]) || 500));

function shanghaiDateKey(value: Date | null | undefined): string | null {
  if (!value) return null;
  return TimezoneUtil.shanghaiDateKey(value);
}

function dateOnly(value: Date): Date {
  return new Date(`${shanghaiDateKey(value)}T00:00:00.000Z`);
}

function migrationCaseNo(orderId: string): string {
  return `ASM${createHash('sha1').update(orderId).digest('hex').slice(0, 20)}`;
}

async function backfillPackingDates() {
  const orders = await prisma.supplementOrder.findMany({
    where: {
      packingDate: null,
      status: { in: ['PACKED', 'SHIPPED', 'COMPLETED'] },
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      paidAt: true,
      shippedAt: true,
      completedAt: true,
      items: { select: { packedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  console.log(
    `[backfill-supplement-prepack] packingDate mode=${apply ? 'APPLY' : 'DRY-RUN'} candidates=${orders.length}`,
  );
  let done = 0;
  for (const order of orders) {
    const packedAt = order.items
      .map((item) => item.packedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const basis = packedAt ?? order.shippedAt ?? order.completedAt ?? order.paidAt;
    if (!basis) {
      console.log(`  SKIP ${order.orderNo} 没有可用日期`);
      continue;
    }
    const packingDate = dateOnly(basis);
    const line = `${order.orderNo} status=${order.status} -> ${shanghaiDateKey(packingDate)}`;
    if (!apply) {
      console.log(`  DRY  ${line}`);
      continue;
    }
    await prisma.supplementOrder.update({
      where: { id: order.id },
      data: {
        packingDate,
        packingDateSource: 'ADMIN',
      },
    });
    done += 1;
    console.log(`  OK   ${line}`);
  }
  return { candidates: orders.length, done };
}

async function backfillAftersales() {
  const orders = await prisma.supplementOrder.findMany({
    where: {
      OR: [
        { aftersaleType: { not: null } },
        { refundStatus: { not: null } },
        { refundAmount: { not: null } },
      ],
    },
    select: {
      id: true,
      orderNo: true,
      userId: true,
      status: true,
      amountTotal: true,
      aftersaleType: true,
      aftersaleReason: true,
      aftersaleAt: true,
      refundStatus: true,
      refundAmount: true,
      refundOutNo: true,
      refundId: true,
      refundReason: true,
      refundRequestedAt: true,
      refundedAt: true,
      reshipFromOrderNo: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const orderIds = orders.map((order) => order.id);
  const existing = orderIds.length
    ? await prisma.aftersaleCase.findMany({
        where: { orderType: 'SUPPLEMENT', orderId: { in: orderIds } },
        select: { orderId: true },
      })
    : [];
  const existingIds = new Set(existing.map((row) => row.orderId));

  // 补发单：原单 -> 补发单
  const reshipOrders = orderIds.length
    ? await prisma.supplementOrder.findMany({
        where: { reshipFromOrderNo: { in: orders.map((o) => o.orderNo) } },
        select: { id: true, orderNo: true, reshipFromOrderNo: true },
      })
    : [];
  const reshipByOriginal = new Map(
    reshipOrders
      .filter((row) => row.reshipFromOrderNo)
      .map((row) => [row.reshipFromOrderNo as string, row]),
  );

  const pending = orders.filter((order) => !existingIds.has(order.id));
  console.log(
    `[backfill-supplement-prepack] aftersale mode=${apply ? 'APPLY' : 'DRY-RUN'} candidates=${pending.length}/${orders.length}`,
  );

  let done = 0;
  for (const order of pending) {
    const refundStatus = String(order.refundStatus || '').toUpperCase();
    const isReship =
      String(order.aftersaleType || '').toUpperCase() === 'RESHIP' ||
      Boolean(order.reshipFromOrderNo);
    const reship = reshipByOriginal.get(order.orderNo);
    const requestType = isReship ? 'RESHIP' : 'REFUND';

    let status: 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'REJECTED' = 'PENDING';
    let resolutionType: 'REFUND' | 'RESHIP' | 'REGISTER_ONLY' | 'REJECT' | null = null;
    if (refundStatus === 'SUCCESS') {
      status = 'RESOLVED';
      resolutionType = 'REFUND';
    } else if (refundStatus === 'FAILED') {
      status = 'PROCESSING';
      resolutionType = 'REFUND';
    } else if (refundStatus === 'PENDING' || refundStatus === 'PROCESSING') {
      status = 'PROCESSING';
      resolutionType = 'REFUND';
    } else if (reship) {
      status = 'RESOLVED';
      resolutionType = 'RESHIP';
    } else if (order.aftersaleType) {
      status = 'PENDING';
    }

    const refundAmount = isReship
      ? null
      : order.refundAmount ?? (refundStatus === 'SUCCESS' ? order.amountTotal : null);
    const line = `${order.orderNo} type=${requestType} status=${status} refund=${refundStatus || '-'} amount=${refundAmount ?? '-'}`;
    if (!apply) {
      console.log(`  DRY  ${line}`);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.aftersaleCase.create({
          data: {
            caseNo: migrationCaseNo(order.id),
            orderType: 'SUPPLEMENT',
            orderId: order.id,
            orderNo: order.orderNo,
            customerId: order.userId,
            status,
            requestType,
            requestedReason:
              order.refundReason ||
              order.aftersaleReason ||
              '历史售后迁移',
            requestedPhotos: [],
            source: 'MIGRATION',
            handlingNote:
              refundStatus === 'FAILED'
                ? '历史退款状态 FAILED，请管理员确认后重试或线下处理'
                : null,
            resolutionType,
            refundAmount,
            refundStatus: refundStatus || null,
            refundOutNo: order.refundOutNo || null,
            refundId: order.refundId || null,
            refundRequestedAt: order.refundRequestedAt || order.aftersaleAt,
            refundedAt: order.refundedAt || (refundStatus === 'SUCCESS' ? order.aftersaleAt : null),
            reshipOrderId: reship?.id || null,
            reshipOrderNo: reship?.orderNo || null,
            acceptedAt: order.aftersaleAt || null,
            resolvedAt:
              status === 'RESOLVED'
                ? order.refundedAt || order.aftersaleAt || order.updatedAt
                : null,
            createdAt: order.aftersaleAt || order.refundRequestedAt || order.createdAt,
          },
        });
        await tx.supplementOrderEvent.create({
          data: {
            orderId: order.id,
            type: 'AFTERSALE_CREATED',
            actorType: 'SYSTEM',
            reason: '历史售后迁移',
            metadata: { migration: true, caseNo: migrationCaseNo(order.id) },
          },
        });
      });
      done += 1;
      console.log(`  OK   ${line}`);
    } catch (error) {
      console.error(`  ERR  ${line}: ${(error as Error).message}`);
    }
  }
  return { candidates: pending.length, done };
}

async function main() {
  console.log(`[backfill-supplement-prepack] apply=${apply} limit=${limit}`);
  const packing = await backfillPackingDates();
  const aftersale = await backfillAftersales();
  console.log(
    `[backfill-supplement-prepack] summary packing=${packing.done}/${packing.candidates} aftersale=${aftersale.done}/${aftersale.candidates}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
