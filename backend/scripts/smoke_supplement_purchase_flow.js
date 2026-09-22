#!/usr/bin/env node
/**
 * 补剂购买链路冒烟（本地或任意环境）
 *
 * 用途：把「报价 → 下单 → 订单列表」这条链路一次性跑一遍，并校验计价口径，
 *       用于上线前自查、改完计价后回归。
 *
 * 用法：
 *   npm run smoke:supplement-purchase
 *   SMOKE_BASE_URL=https://api.sevenkitchen.com/api/v1 npm run smoke:supplement-purchase
 *   SMOKE_NO_ORDER=1 npm run smoke:supplement-purchase   # 只报价、不创建订单
 *
 * ⚠️ 两点须知：
 *   1. 默认会**创建一条真实的补剂订单**（状态为待付款），用于验证下单与列表。
 *      不想留数据就加 SMOKE_NO_ORDER=1。
 *   2. 补剂用量取的是**代表性数值**（默认 10），不是真实制作单算出来的用量 ——
 *      真实用量来自计价预览接口，链路较长。本脚本验证的是链路可用性与计价口径，
 *      金额不具备业务参考意义。
 *
 * 可覆盖的环境变量：
 *   SMOKE_CUSTOMER_ID / SMOKE_DOG_ID / SMOKE_ADDRESS_ID / SMOKE_RECIPE_ID / SMOKE_AMOUNT
 */

const path = require('path');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const BASE_URL =
  process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3011/api/v1';
const CREATE_ORDER = process.env.SMOKE_NO_ORDER !== '1';
const DEFAULT_AMOUNT = Number(process.env.SMOKE_AMOUNT || 10);

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function api(customerId) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'X-Customer-Id': customerId,
    },
    timeout: 20000,
  });
}

/** 找一个「有狗 + 有地址」的客户；找不到就退化为只要求有狗 */
async function resolveFixture() {
  if (process.env.SMOKE_CUSTOMER_ID) {
    const customerId = process.env.SMOKE_CUSTOMER_ID;
    const dog = process.env.SMOKE_DOG_ID
      ? await prisma.dog.findUnique({ where: { id: process.env.SMOKE_DOG_ID } })
      : await prisma.dog.findFirst({ where: { ownerId: customerId } });
    const address = process.env.SMOKE_ADDRESS_ID
      ? await prisma.address.findUnique({ where: { id: process.env.SMOKE_ADDRESS_ID } })
      : await prisma.address.findFirst({ where: { userId: customerId } });
    return { customerId, dog, address };
  }

  const users = await prisma.user.findMany({
    where: { dogs: { some: {} }, addresses: { some: {} } },
    select: { id: true, nickname: true },
  });
  for (const user of users) {
    const dog = await prisma.dog.findFirst({ where: { ownerId: user.id } });
    const address = await prisma.address.findFirst({ where: { userId: user.id } });
    if (dog && address) {
      return { customerId: user.id, dog, address };
    }
  }

  // 退化：有狗即可，地址留空（下单步骤会跳过）
  const fallback = await prisma.user.findFirst({
    where: { dogs: { some: {} } },
    select: { id: true, nickname: true },
  });
  if (!fallback) return null;

  const dog = await prisma.dog.findFirst({ where: { ownerId: fallback.id } });
  return { customerId: fallback.id, dog, address: null };
}

/** 找一份「带可购补剂」的食谱 */
async function resolveRecipe() {
  if (process.env.SMOKE_RECIPE_ID) {
    const recipe = await prisma.recipe.findUnique({
      where: { id: process.env.SMOKE_RECIPE_ID },
      select: { id: true, name: true, status: true },
    });
    return recipe;
  }

  const items = await prisma.recipeItem.findMany({
    where: { ingredient: { type: 'SUPPLEMENT', supplementRetailEnabled: true } },
    select: {
      recipeId: true,
      ingredientId: true,
      ingredient: { select: { name: true } },
      recipe: { select: { name: true, status: true } },
    },
  });

  const grouped = new Map();
  for (const item of items) {
    if (!grouped.has(item.recipeId)) grouped.set(item.recipeId, []);
    grouped.get(item.recipeId).push(item);
  }

  const candidates = [...grouped.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  // 优先公开食谱
  const publicOne = candidates.find(([, list]) => list[0].recipe.status === 'PUBLIC');
  const picked = publicOne || candidates[0];
  if (!picked) return null;

  return {
    id: picked[0],
    name: picked[1][0].recipe.name,
    status: picked[1][0].recipe.status,
    supplements: picked[1].map((item) => ({
      ingredientId: item.ingredientId,
      name: item.ingredient.name,
    })),
  };
}

async function main() {
  console.log(`补剂购买链路冒烟\nBASE_URL = ${BASE_URL}\n创建订单 = ${CREATE_ORDER ? '是' : '否（SMOKE_NO_ORDER=1）'}`);

  const fixture = await resolveFixture();
  if (!fixture) {
    record('准备：找到测试客户与狗狗', false, '数据库里没有「有狗」的客户，无法继续');
    return;
  }
  record(
    '准备：测试客户与狗狗',
    true,
    `客户 ${fixture.customerId} · 狗狗「${fixture.dog.name}」· 地址${
      fixture.address ? `「${fixture.address.recipientName}」` : '（无，将跳下单）'
    }`,
  );

  const recipe = await resolveRecipe();
  if (!recipe) {
    record('准备：找到带可购补剂的食谱', false, '没有上架的补剂，先在后台补剂商城上架');
    return;
  }
  record('准备：带可购补剂的食谱', true, `「${recipe.name}」（${recipe.status}）· ${recipe.supplements.length} 种`);

  const request = api(fixture.customerId);

  // ── 1. 商城开关 ───────────────────────────────────────────────
  section('1. 商城开关');
  const statusRes = await request.get('/supplements/shop-status');
  const shopEnabled = Boolean(statusRes.data?.data?.enabled);
  record(
    'GET /supplements/shop-status',
    shopEnabled,
    shopEnabled
      ? 'enabled = true'
      : 'enabled = false —— 用户在小程序里看不到「一键购买补剂」入口',
  );
  if (!shopEnabled) {
    record('后续步骤', false, '商城未开放，报价会返回 enabled=false，冒烟到此为止');
    return;
  }

  // ── 2. 报价（全部补剂）──────────────────────────────────────────
  section('2. 报价');
  const allLines = recipe.supplements.map((item) => ({
    ingredientId: item.ingredientId,
    amount: DEFAULT_AMOUNT,
  }));

  const quoteRes = await request.post('/supplements/quote', { lines: allLines });
  const quotePayload = quoteRes.data?.data || {};
  const quote = quotePayload.quote;
  const unavailable = quotePayload.unavailable || [];

  record(
    'POST /supplements/quote',
    Boolean(quote && quote.lines?.length),
    `${quote?.lines?.length ?? 0} 种可购${
      unavailable.length ? `，${unavailable.length} 种不可购（${unavailable.map((u) => `${u.name}:${u.reason}`).join('、')}）` : ''
    }`,
  );
  if (!quote || !quote.lines?.length) {
    record('后续步骤', false, '没有任何可报价的补剂');
    return;
  }

  // ── 3. 计价口径断言 ────────────────────────────────────────────
  section('3. 计价口径');
  const expectedGoods =
    Math.round((quote.supplementPrice + quote.serviceFee + quote.packagingFee) * 100) / 100;

  record(
    '运费不向客户收取（2026-09-22 定价口径）',
    quote.shippingFee === 0,
    `shippingFee = ${quote.shippingFee}`,
  );
  record(
    '客户侧始终显示包邮',
    quote.freeShipping === true,
    `freeShipping = ${quote.freeShipping}`,
  );
  record(
    '合计 = 商品小计（不含单独运费）',
    Math.abs(quote.total - expectedGoods) < 0.01,
    `total = ${quote.total}，goodsSubtotal = ${quote.goodsSubtotal}`,
  );
  record(
    '分装袋数 = 补剂种类数（一袋一种）',
    quote.bagCount === quote.lines.length,
    `bagCount = ${quote.bagCount}，种类 = ${quote.lines.length}`,
  );

  // ── 4. 下单 ────────────────────────────────────────────────────
  section('4. 下单');
  if (!fixture.address) {
    record('POST /supplement-orders', false, '测试客户没有收货地址，跳过（请先在「我的 → 收货地址」添加）');
  } else if (!CREATE_ORDER) {
    record('POST /supplement-orders', true, '已按 SMOKE_NO_ORDER=1 跳过');
  } else {
    const createRes = await request.post('/supplement-orders', {
      addressId: fixture.address.id,
      recipeId: recipe.id,
      recipeName: recipe.name,
      dogId: fixture.dog.id,
      dogName: fixture.dog.name,
      cycleDays: 7,
      lines: quote.lines.map((line) => ({
        ingredientId: line.ingredientId,
        amount: line.requestedAmount,
      })),
    });
    const order = createRes.data?.data;
    record(
      'POST /supplement-orders',
      Boolean(order?.orderNo),
      order ? `订单号 ${order.orderNo} · 状态 ${order.status} · 合计 ¥${order.amountTotal}` : createRes.data?.message,
    );

    if (order) {
      record(
        '订单金额与报价一致',
        Math.abs(order.amountTotal - quote.total) < 0.01,
        `订单 ¥${order.amountTotal} vs 报价 ¥${quote.total}`,
      );

      // ── 5. 支付通道 ────────────────────────────────────────────
      section('5. 支付');
      try {
        const payRes = await request.post(`/supplement-orders/${order.id}/pay`);
        const paid = payRes.data?.data?.status === 'PAID';
        record(
          'POST /supplement-orders/:id/pay',
          true,
          paid ? '已直接支付成功' : '未直接支付，小程序会降级为「待人工确认收款」',
        );
      } catch (error) {
        const message = error.response?.data?.message || error.message;
        record(
          'POST /supplement-orders/:id/pay',
          true,
          `支付通道不可用（${message}）→ 小程序降级为「待人工确认收款」`,
        );
      }

      // ── 6. 订单列表 ────────────────────────────────────────────
      section('6. 订单列表');
      const listRes = await request.get('/supplement-orders', { params: { page: 1, pageSize: 10 } });
      const list = listRes.data?.data;
      const found = (list?.items || []).some((item) => item.id === order.id);
      record(
        'GET /supplement-orders 能看到刚下的单',
        found,
        `共 ${list?.total ?? 0} 条`,
      );
    }
  }
}

main()
  .catch((error) => {
    record('冒烟执行', false, error.response?.data?.message || error.message);
  })
  .finally(async () => {
    await prisma.$disconnect();

    const failed = results.filter((item) => !item.ok);
    console.log(
      `\n${failed.length === 0 ? '🎉 全部通过' : `⚠️ ${failed.length} 项未通过`}（共 ${results.length} 项）`,
    );
    if (failed.length > 0) {
      failed.forEach((item) => console.log(`   ❌ ${item.name}${item.detail ? ` — ${item.detail}` : ''}`));
    }
    process.exit(failed.length === 0 ? 0 : 1);
  });
