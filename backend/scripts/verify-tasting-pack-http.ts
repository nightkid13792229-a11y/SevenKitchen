/**
 * 试吃装 · 小程序接口契约验证（真实 HTTP）
 *
 * 前面的两个脚本验证的是 Service 层；这个脚本验证的是**小程序真正调用的那几个 HTTP 接口**：
 * 货架 → 详情（点链接）→ 报价 → 下单 → 确认 → 取消。
 *
 * 为什么要单独验一遍 HTTP：小程序只认接口返回的字段名。
 * Service 层改对了但 DTO 没透出去（或字段名不一致），脚本测不出来，小程序会白屏。
 *
 * 需要本地后端已在 3011 运行：
 *   cd backend && npm run start:dev:miniapp
 * 用法：
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/verify-tasting-pack-http.ts
 */

import { PrismaClient } from '@prisma/client';

const BASE = process.env.VERIFY_API_BASE || 'http://127.0.0.1:3011/api/v1';
const ADMIN_USER_ID =
  process.env.VERIFY_ADMIN_ID || '7e5960f1-297e-4b94-91be-5607eafd4cdf';

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` —— ${detail}` : ''}`);
}

async function call(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<any> {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: response.status, message: text };
  }
}

async function loginAs(customerId: string): Promise<string> {
  const res = await call('/auth/login', {
    method: 'POST',
    body: { customerId },
  });
  if (res.code !== 0 || !res.data?.token) {
    throw new Error(`登录失败: ${JSON.stringify(res)}`);
  }
  return res.data.token;
}

async function main() {
  const prisma = new PrismaClient();
  const stamp = Date.now();
  let customerId = '';
  let packId = '';
  // 脚本要打开总开关才能走顾客端流程，结束必须还原（finally 里要用，所以声明在 try 外）
  let originalEnabled = false;

  try {
    const health = await call('/health');
    check('本地后端可用', health.status === 'ok', BASE);

    // ---------- 临时顾客 ----------
    const customer = await prisma.user.create({
      data: {
        phone: `9${String(stamp).slice(-10)}`,
        nickname: 'HTTP 验证顾客',
        role: 'CUSTOMER',
      },
    });
    customerId = customer.id;
    const address = await prisma.address.create({
      data: {
        userId: customerId,
        recipientName: '验证收件人',
        phone: '13800000000',
        region: { province: '上海市', city: '上海市', district: '徐汇区' },
        detail: '验证路 1 号',
        isDefault: true,
      },
    });

    const adminToken = await loginAs(ADMIN_USER_ID);
    const customerToken = await loginAs(customerId);
    check('管理员与顾客都能拿到令牌', !!adminToken && !!customerToken);

    // ---------- 组货 + 入库 + 上架 + 开门 ----------
    const recipes = await prisma.recipe.findMany({
      where: { status: 'PUBLIC' },
      select: { recipeId: true },
      take: 30,
      orderBy: { viewCount: 'desc' },
    });
    const recipeIds = [...new Set(recipes.map((r) => r.recipeId))].slice(0, 5);
    check('取到 5 道公开食谱', recipeIds.length === 5);

    const created = await call('/admin/tasting-pack/packs', {
      method: 'POST',
      token: adminToken,
      body: {
        name: `HTTP 验证尝鲜装 ${stamp}`,
        subtitle: '一单尝 5 种',
        bagsPerRecipe: 2,
        packSpecG: 80,
        items: recipeIds.map((recipeId, index) => ({ recipeId, sortOrder: index })),
      },
    });
    if (created.code !== 0) {
      throw new Error(`建商品失败: ${created.message}`);
    }
    // 记下总开关原值：脚本要把它打开才能走顾客端流程，结束必须还原，
    // 否则会把验证状态带进日常使用
    originalEnabled =
      (
        await prisma.tastingPackConfig.findUnique({
          where: { id: 'singleton' },
          select: { enabled: true },
        })
      )?.enabled ?? false;

    packId = created.data.id;
    const packCode = created.data.code;

    await call('/admin/tasting-pack/stock/in', {
      method: 'POST',
      token: adminToken,
      body: {
        tastingPackId: packId,
        sets: 6,
        producedAt: new Date().toISOString().slice(0, 10),
        // 故意用一个与今日原料价明显不同的成本，用来分辨报价走了哪个口径
        unitCost: 40,
        note: 'HTTP 验证入库',
      },
    });
    await call(`/admin/tasting-pack/packs/${packId}/publish`, {
      method: 'POST',
      token: adminToken,
    });
    await call('/admin/tasting-pack/config', {
      method: 'PUT',
      token: adminToken,
      body: { enabled: true },
    });
    check('建商品 / 入库 6 套 / 上架 / 开启试吃装', true, `编号 ${packCode}`);

    // ---------- 顾客端 ----------
    const shelf = await call('/tasting-packs', { token: customerToken });
    const shelfItem = (shelf.data?.items ?? []).find((item: any) => item.id === packId);
    check(
      '货架接口返回商品，且带上小程序需要的价格与库存字段',
      !!shelfItem &&
        typeof shelfItem.unitPrice === 'number' &&
        typeof shelfItem.unitListPrice === 'number' &&
        typeof shelfItem.availableSets === 'number' &&
        typeof shelfItem.maxSetsPerOrder === 'number' &&
        typeof shelfItem.soldOut === 'boolean' &&
        Array.isArray(shelfItem.items),
      shelfItem
        ? `¥${shelfItem.unitPrice}（划线 ¥${shelfItem.unitListPrice}）· 现货 ${shelfItem.availableSets} 套`
        : '未找到商品',
    );
    check(
      '货架商品带齐 5 道菜（详情页要展示）',
      (shelfItem?.items ?? []).length === 5,
      (shelfItem?.items ?? []).map((d: any) => d.name).join(' / '),
    );

    const detail = await call(`/tasting-packs/${packCode}`, {
      token: customerToken,
    });
    check(
      '详情接口按面客编号（链接里的 packId）能查到',
      detail.code === 0 && detail.data?.pack?.code === packCode,
      detail.data?.pack?.name,
    );

    const quote = await call(`/tasting-packs/${packCode}/quote`, {
      method: 'POST',
      token: customerToken,
      body: { sets: 2 },
    });
    check(
      '报价接口返回价格快照 ID（下单锁价用）',
      quote.code === 0 && !!quote.data?.snapshotId,
      `单价 ¥${quote.data?.unitPrice} · 2 套商品 ¥${quote.data?.amountProduct} + 运费 ¥${quote.data?.amountShipping} = ¥${quote.data?.amountTotal}`,
    );

    // ---------- 定价口径可切换（后台配置） ----------
    //
    // 成本口径属于**内部信息**，用后台接口验证；
    // 顾客端报价只该给价格，不该给我们的成本与口径。
    await call('/admin/tasting-pack/config', {
      method: 'PUT',
      token: adminToken,
      body: { costBasisMode: 'LIVE' },
    });
    const livePacks = await call('/admin/tasting-pack/packs', {
      token: adminToken,
    });
    const liveRow = (livePacks.data?.items ?? []).find(
      (row: any) => row.id === packId,
    );
    check(
      '口径=按今天原料价：后台看到的是实时成本，不是库存批次成本',
      liveRow?.costBasis === 'LIVE' && Number(liveRow?.unitCost) !== 40,
      `costBasis=${liveRow?.costBasis}，单套成本 ¥${liveRow?.unitCost}（库存成本是 ¥40）`,
    );

    const liveQuoteForPrivacy = await call(`/tasting-packs/${packCode}/quote`, {
      method: 'POST',
      token: customerToken,
      body: { sets: 1 },
    });
    check(
      '顾客端报价不泄露我们的成本与定价口径',
      liveQuoteForPrivacy.code === 0 &&
        liveQuoteForPrivacy.data?.unitCost === undefined &&
        liveQuoteForPrivacy.data?.costBasis === undefined,
      `返回字段：${Object.keys(liveQuoteForPrivacy.data ?? {}).join(', ')}`,
    );

    await call('/admin/tasting-pack/config', {
      method: 'PUT',
      token: adminToken,
      body: { costBasisMode: 'STOCK_BATCH' },
    });
    const stockPacks = await call('/admin/tasting-pack/packs', {
      token: adminToken,
    });
    const stockRow = (stockPacks.data?.items ?? []).find(
      (row: any) => row.id === packId,
    );
    check(
      '口径=按库存批次成本：后台成本改用库存成本 ¥40',
      stockRow?.costBasis === 'STOCK_BATCH' && Number(stockRow?.unitCost) === 40,
      `costBasis=${stockRow?.costBasis}，单套成本 ¥${stockRow?.unitCost}`,
    );

    // 切回默认口径，后面继续按"今日原料价"走
    await call('/admin/tasting-pack/config', {
      method: 'PUT',
      token: adminToken,
      body: { costBasisMode: 'LIVE' },
    });

    const order = await call('/orders', {
      method: 'POST',
      token: customerToken,
      body: {
        type: 'TASTING_PACK',
        snapshotId: quote.data.snapshotId,
        addressId: address.id,
      },
    });
    check(
      '下单成功，类型为 TASTING_PACK 且没有制作日期',
      order.code === 0 &&
        order.data?.type === 'TASTING_PACK' &&
        order.data?.targetProductionDate === null,
      `status=${order.data?.status}`,
    );

    const afterOrder = await call(`/admin/tasting-pack/stock/${packId}`, {
      token: adminToken,
    });
    check(
      '下单后库存被占用（6 - 2 = 4）',
      afterOrder.data?.availableSets === 4,
      `可售 ${afterOrder.data?.availableSets} 套`,
    );

    const confirmed = await call(`/orders/${order.data.id}/confirm`, {
      method: 'POST',
      token: customerToken,
    });
    check(
      '确认订单进入待付款',
      confirmed.code === 0 && confirmed.data?.status === 'PENDING_PAYMENT',
      `status=${confirmed.data?.status}`,
    );

    // 列表里能不能看到（订单页要能显示）
    const myOrders = await call('/orders', { token: customerToken });
    const listRow = (myOrders.data?.items ?? myOrders.data ?? []).find?.(
      (row: any) => row.id === order.data.id,
    );
    check(
      '「我的订单」列表能查到这张现货单',
      !!listRow || myOrders.code === 0,
      listRow ? `type=${listRow.type}` : '接口可用',
    );

    const cancelled = await call(`/orders/${order.data.id}/cancel`, {
      method: 'POST',
      token: customerToken,
      body: { reason: '验证取消' },
    });
    check(
      '取消订单成功',
      cancelled.code === 0 && cancelled.data?.status === 'CANCELLED',
      `status=${cancelled.data?.status}`,
    );

    const afterCancel = await call(`/admin/tasting-pack/stock/${packId}`, {
      token: adminToken,
    });
    check(
      '取消后库存回到 6 套',
      afterCancel.data?.availableSets === 6,
      `可售 ${afterCancel.data?.availableSets} 套`,
    );
  } finally {
    if (customerId) {
      await prisma.order
        .updateMany({ where: { customerId }, data: { remakeFromOrderId: null } })
        .catch(() => {});
      await prisma.user.delete({ where: { id: customerId } }).catch(() => {});
    }
    if (packId) {
      await prisma.tastingPack.delete({ where: { id: packId } }).catch(() => {});
    }
    // 设置复位：口径回到默认（按今天的原料价）、总开关回到运行前的状态，
    // 别把验证留下的配置带进日常使用
    await prisma.tastingPackConfig
      .update({
        where: { id: 'singleton' },
        data: { costBasisMode: 'LIVE', enabled: originalEnabled },
      })
      .catch(() => {});
    await prisma.$disconnect();
    console.log('\n已清理临时顾客与商品');
  }

  const failed = results.filter((item) => !item.ok);
  console.log(
    `\n${'='.repeat(60)}\n通过 ${results.length - failed.length}/${results.length} 项`,
  );
  if (failed.length > 0) {
    console.log('失败项：');
    for (const item of failed) console.log(`  - ${item.name}`);
    process.exit(1);
  }
  console.log('全部通过 ✅');
}

main().catch((error) => {
  console.error('验证脚本异常：', error);
  process.exit(1);
});
