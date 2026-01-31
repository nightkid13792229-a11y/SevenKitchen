import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const orderIds = [
    "01de652b-dbc4-47b3-b6d7-73231d73ba82",
    "cf2e5448-3686-42d6-94dd-ce3dd69a8c13"
  ];

  console.log("开始修改订单日期...");

  for (const orderId of orderIds) {
    await prisma.$executeRawUnsafe(
      `UPDATE "order" SET "created_at" = '2026-01-28 14:00:00+00'::timestamp, "target_production_date" = '2026-01-29 00:00:00+00'::timestamp WHERE "id" = '${orderId}'::uuid`
    );
    console.log("订单已更新:", orderId);
  }

  console.log("\n验证结果：");
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      createdAt: true,
      targetProductionDate: true,
    },
  });

  orders.forEach((o, i) => {
    console.log("\\n订单 " + (i + 1) + ":");
    console.log("  创建时间:", o.createdAt.toISOString());
    console.log("  目标日期:", o.targetProductionDate?.toISOString());
  });

  await prisma.$disconnect();
}

main().catch(console.error);
