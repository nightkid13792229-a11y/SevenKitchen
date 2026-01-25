import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get('PrismaService');

  // 获取一个待付款订单
  const orders = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT' },
    take: 1,
    include: { items: true }
  });

  console.log('Found orders:', orders.length);

  if (orders.length > 0) {
    const order = orders[0];
    console.log('Order ID:', order.id);
    console.log('Order Status:', order.status);
    console.log('Order Total:', order.totalAmount || order.amountTotal);
  }

  await app.close();
}

test().catch(console.error);
