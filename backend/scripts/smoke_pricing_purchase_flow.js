#!/usr/bin/env node

const path = require('path');
const axios = require('axios');
const { PrismaClient, RecipeStatus, UserRole } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const DEFAULT_PORT = process.env.PORT || '3000';
const BASE_URL =
  process.env.SMOKE_BASE_URL || `http://127.0.0.1:${DEFAULT_PORT}/api/v1`;

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function roundCurrency(value) {
  return Number(value.toFixed(2));
}

function apiClient(userId) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      'X-Customer-Id': userId,
    },
  });
}

async function findNextAvailableDate(startOffsetDays) {
  let cursor = addDays(new Date(), startOffsetDays);

  while (true) {
    const candidate = toDateString(cursor);
    const existing = await prisma.purchaseList.findFirst({
      where: {
        targetDate: {
          gte: new Date(`${candidate}T00:00:00`),
          lte: new Date(`${candidate}T23:59:59.999`),
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    cursor = addDays(cursor, 1);
  }
}

async function loadFixtureContext() {
  const customer = await prisma.user.findFirst({
    where: {
      role: UserRole.CUSTOMER,
      dogs: { some: {} },
      addresses: { some: {} },
    },
    include: {
      dogs: {
        take: 1,
        orderBy: { createdAt: 'asc' },
      },
      addresses: {
        take: 1,
        orderBy: { isDefault: 'desc' },
      },
    },
  });

  if (!customer || customer.dogs.length === 0 || customer.addresses.length === 0) {
    throw new Error('缺少可用于试跑的 CUSTOMER + Dog + Address 数据');
  }

  const recipe = await prisma.recipe.findFirst({
    where: {
      status: RecipeStatus.PUBLIC,
      items: { some: {} },
    },
    include: {
      items: {
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!recipe || recipe.items.length === 0) {
    throw new Error('缺少可用于试跑的 PUBLIC Recipe 数据');
  }

  const staff = await prisma.user.findFirst({
    where: { role: UserRole.STAFF },
    orderBy: { createdAt: 'asc' },
  });
  const admin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    orderBy: { createdAt: 'asc' },
  });

  if (!staff || !admin) {
    throw new Error('缺少 STAFF 或 ADMIN 用户，无法做采购/审核试跑');
  }

  return {
    customer,
    dog: customer.dogs[0],
    address: customer.addresses[0],
    recipe,
    staff,
    admin,
  };
}

async function previewPrice(client, dogId, recipeId) {
  const response = await client.post('/orders/pricing/preview', {
    dogId,
    type: 'FRESH_FOOD',
    items: [
      {
        recipeId,
        quantityG: 2000,
        packageCount: 4,
        packageSpecG: 500,
        cycleDays: 4,
        dailyIntakeG: 500,
      },
    ],
  });

  return response.data.data;
}

async function createPaidOrder(context, targetDate) {
  const customerClient = apiClient(context.customer.id);
  const preview = await previewPrice(
    customerClient,
    context.dog.id,
    context.recipe.recipeId,
  );

  const created = await customerClient.post('/orders', {
    snapshotId: preview.snapshotId,
    addressId: context.address.id,
    targetProductionDate: targetDate,
    type: 'FRESH_FOOD',
  });

  const orderId = created.data.data.id;
  await customerClient.post(`/orders/${orderId}/confirm`);
  await customerClient.post(`/orders/${orderId}/pay`);

  return {
    preview,
    orderId,
  };
}

async function createPurchaseList(context, targetDate) {
  const staffClient = apiClient(context.staff.id);
  const generated = await staffClient.post('/staff/purchasing/lists', {
    startDate: targetDate,
  });

  const purchaseList = generated.data.data;
  await staffClient.post(`/staff/purchasing/lists/${purchaseList.id}/start`);
  return purchaseList;
}

async function addSinglePurchaseRecord(context, purchaseListId, purchaseItem, deltaRate) {
  const staffClient = apiClient(context.staff.id);
  const ingredient = await prisma.ingredient.findUnique({
    where: { id: purchaseItem.ingredientId },
    select: {
      currentPricePerPurchaseUnit: true,
    },
  });

  if (!ingredient) {
    throw new Error(`原料不存在: ${purchaseItem.ingredientId}`);
  }

  const actualQuantity = 1;
  const actualCost = roundCurrency(
    Number(ingredient.currentPricePerPurchaseUnit) * (1 + deltaRate),
  );

  const recordResponse = await staffClient.post(
    `/staff/purchasing/lists/${purchaseListId}/records`,
    {
      purchaseItemId: purchaseItem.id,
      ingredientId: purchaseItem.ingredientId,
      ingredientName: purchaseItem.ingredientName,
      purchaseChannel: purchaseItem.purchaseChannel || '试跑渠道',
      actualQuantity,
      actualCost,
      productModel: purchaseItem.productModel || undefined,
      notes: `smoke-${deltaRate}`,
    },
  );

  await staffClient.post(`/staff/purchasing/lists/${purchaseListId}/complete`, {
    actualCosts: [
      {
        itemId: purchaseItem.id,
        actualCost,
      },
    ],
  });

  return {
    record: recordResponse.data.data,
    actualCost,
    actualQuantity,
  };
}

async function submitReimbursement(context, purchaseListId, totalActualCost, suffix) {
  const staffClient = apiClient(context.staff.id);
  const response = await staffClient.post('/staff/purchasing/reimbursements', {
    purchaseListIds: [purchaseListId],
    receiptUrls: [`https://example.com/reimbursement-${suffix}.jpg`],
    totalActualCost,
  });

  return response.data.data;
}

async function fetchReimbursementDetail(context, reimbursementId) {
  const adminClient = apiClient(context.admin.id);
  const response = await adminClient.get(
    `/admin/purchasing/reimbursements/${reimbursementId}`,
  );
  return response.data.data;
}

async function approveReimbursement(context, reimbursementId, comment) {
  const adminClient = apiClient(context.admin.id);
  await adminClient.post(`/admin/purchasing/reimbursements/${reimbursementId}/review`, {
    decision: 'APPROVE',
    comment,
  });
}

async function assertIngredientPriceChange(ingredientId, previousEffectivePrice, shouldChange) {
  const ingredient = await prisma.ingredient.findUnique({
    where: { id: ingredientId },
    select: {
      effectivePricePerPurchaseUnit: true,
    },
  });

  if (!ingredient) {
    throw new Error(`原料不存在: ${ingredientId}`);
  }

  const currentEffectivePrice = Number(ingredient.effectivePricePerPurchaseUnit || 0);
  if (shouldChange && currentEffectivePrice === previousEffectivePrice) {
    throw new Error(`预期原料 ${ingredientId} 生效价变化，但仍为 ${currentEffectivePrice}`);
  }
  if (!shouldChange && currentEffectivePrice !== previousEffectivePrice) {
    throw new Error(
      `预期原料 ${ingredientId} 生效价保持不变，但从 ${previousEffectivePrice} 变成了 ${currentEffectivePrice}`,
    );
  }

  return currentEffectivePrice;
}

async function runScenario(
  context,
  targetDate,
  deltaRate,
  expectedApprovalMode,
  approveAfterSubmit,
  preferredIngredientId = null,
) {
  await createPaidOrder(context, targetDate);
  const purchaseList = await createPurchaseList(context, targetDate);
  const purchaseItem =
    purchaseList.items.find((item) => item.ingredientId === preferredIngredientId) ||
    purchaseList.items[0];

  if (!purchaseItem) {
    throw new Error(`采购清单 ${purchaseList.id} 没有采购项`);
  }

  const ingredientBefore = await prisma.ingredient.findUnique({
    where: { id: purchaseItem.ingredientId },
    select: {
      effectivePricePerPurchaseUnit: true,
    },
  });

  const previousEffectivePrice = Number(
    ingredientBefore?.effectivePricePerPurchaseUnit || 0,
  );

  const purchaseRecord = await addSinglePurchaseRecord(
    context,
    purchaseList.id,
    purchaseItem,
    deltaRate,
  );
  const reimbursement = await submitReimbursement(
    context,
    purchaseList.id,
    purchaseRecord.actualCost,
    `${expectedApprovalMode}-${Date.now()}`,
  );
  const detailAfterSubmit = await fetchReimbursementDetail(context, reimbursement.id);
  const priceChange = detailAfterSubmit.priceChanges?.[0];

  if (!priceChange) {
    throw new Error(`报销单 ${reimbursement.id} 未生成价格变更记录`);
  }

  if (priceChange.approvalMode !== expectedApprovalMode) {
    throw new Error(
      `预期审核方式 ${expectedApprovalMode}，实际为 ${priceChange.approvalMode}，原因：${(priceChange.reviewReasons || []).join('；') || '-'}`,
    );
  }

  const priceAfterSubmit = await assertIngredientPriceChange(
    purchaseItem.ingredientId,
    previousEffectivePrice,
    expectedApprovalMode === 'AUTO',
  );

  if (approveAfterSubmit) {
    await approveReimbursement(
      context,
      reimbursement.id,
      `smoke approve ${expectedApprovalMode}`,
    );
  }

  const priceAfterReview = approveAfterSubmit
    ? await assertIngredientPriceChange(
        purchaseItem.ingredientId,
        priceAfterSubmit,
        expectedApprovalMode !== 'AUTO',
      )
    : priceAfterSubmit;

  const previewAfter = await previewPrice(
    apiClient(context.customer.id),
    context.dog.id,
    context.recipe.recipeId,
  );

  return {
    targetDate,
    purchaseListId: purchaseList.id,
    reimbursementId: reimbursement.id,
    ingredientId: purchaseItem.ingredientId,
    approvalMode: priceChange.approvalMode,
    reviewReasons: priceChange.reviewReasons || [],
    previousEffectivePrice,
    priceAfterSubmit,
    priceAfterReview,
    previewAmountAfter: previewAfter.amountTotal,
  };
}

async function main() {
  const context = await loadFixtureContext();
  const manualDate = await findNextAvailableDate(5);
  const autoDate = await findNextAvailableDate(
    Math.max(6, Math.ceil((new Date(`${manualDate}T00:00:00`).getTime() - Date.now()) / 86400000) + 1),
  );

  const manualResult = await runScenario(
    context,
    manualDate,
    0.35,
    'MANUAL_REQUIRED',
    true,
  );
  const autoResult = await runScenario(
    context,
    autoDate,
    0.05,
    'AUTO',
    true,
    manualResult.ingredientId,
  );

  console.log(
    `Using customer=${context.customer.id}, dog=${context.dog.id}, recipe=${context.recipe.recipeId}`,
  );
  console.log(`Manual scenario date=${manualDate}, Auto scenario date=${autoDate}`);

  console.log('Smoke test passed.');
  console.log(
    JSON.stringify(
      {
        autoResult,
        manualResult,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error.response?.data || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
