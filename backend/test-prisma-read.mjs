import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    const order = await prisma.order.findUnique({
      where: { id: '8d328512-4d70-40f8-b791-df27ea2b184a' }
    });

    if (order) {
      console.log('Order found!');
      console.log('targetProductionDate:', order.targetProductionDate);
      console.log('originalTargetProductionDate:', order.originalTargetProductionDate);
    } else {
      console.log('Order not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
