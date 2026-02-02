/**
 * 测试删除采购清单时订单状态回退功能
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PurchasingService } from '../src/application/purchasing/purchasing.service';
import { PURCHASE_LIST_REPOSITORY } from '../src/application/purchasing/purchasing.service.tokens';

async function test() {
  console.log('启动测试...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const purchasingService = app.get(PurchasingService);

  try {
    // 1. 查询当前PAID状态的订单
    console.log('1️⃣  查询PAID状态的订单...');
    const response1 = await fetch('http://localhost:3001/api/v1/staff/orders?status=PAID&page=1&pageSize=2', {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsInJvbGVzIjpbIkFETUlOIl0sImlhdCI6MTczNzgyNDAwMCwiZXhwIjoxNzM3OTEwNDAwfQ.admin-signature'
      }
    });

    const data1 = await response1.json();
    console.log('找到的PAID订单:', data1.data.list.length);

    if (data1.data.list.length < 2) {
      console.error('❌ 需要至少2个PAID状态的订单进行测试');
      process.exit(1);
    }

    const orderIds = data1.data.list.slice(0, 2).map((o: any) => o.id);
    console.log('   订单ID:', orderIds);
    console.log('');

    // 2. 生成采购清单（订单会变成PURCHASING）
    console.log('2️⃣  生成采购清单...');
    const response2 = await fetch('http://localhost:3001/api/v1/staff/purchasing/lists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsInJvbGVzIjpbIkFETUlOIl0sImlhdCI6MTczNzgyNDAwMCwiZXhwIjoxNzM3OTEwNDAwfQ.admin-signature'
      },
      body: JSON.stringify({
        startDate: new Date().toISOString().split('T')[0]
      })
    });

    const data2 = await response2.json();
    if (data2.code !== 0) {
      console.error('❌ 生成采购清单失败:', data2.message);
      process.exit(1);
    }

    const purchaseListId = data2.data.id;
    console.log('✅ 采购清单创建成功:', purchaseListId);
    console.log('   关联订单:', data2.data.sourceOrderIds);
    console.log('');

    // 3. 验证订单状态已变为PURCHASING
    console.log('3️⃣  验证订单状态...');
    const response3 = await fetch(`http://localhost:3001/api/v1/staff/orders/${orderIds[0]}`, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsInJvbGVzIjpbIkFETUlOIl0sImlhdCI6MTczNzgyNDAwMCwiZXhwIjoxNzM3OTEwNDAwfQ.admin-signature'
      }
    });

    const data3 = await response3.json();
    console.log('   订单状态:', data3.data.status);

    if (data3.data.status !== 'PURCHASING') {
      console.error('❌ 订单状态应该为PURCHASING');
      process.exit(1);
    }

    console.log('✅ 订单状态正确变更为PURCHASING');
    console.log('');

    // 4. 删除采购清单
    console.log('4️⃣  删除采购清单...');
    const response4 = await fetch(`http://localhost:3001/api/v1/staff/purchasing/lists/${purchaseListId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsInJvbGVzIjpbIkFETUlOIl0sImlhdCI6MTczNzgyNDAwMCwiZXhwIjoxNzM3OTEwNDAwfQ.admin-signature'
      }
    });

    const data4 = await response4.json();
    if (data4.code !== 0) {
      console.error('❌ 删除采购清单失败:', data4.message);
      process.exit(1);
    }

    console.log('✅ 采购清单删除成功');
    console.log('   回退订单数:', data4.data.restoredOrdersCount);
    console.log('');

    // 5. 验证订单状态已回退到PAID
    console.log('5️⃣  验证订单状态回退...');
    const response5 = await fetch(`http://localhost:3001/api/v1/staff/orders/${orderIds[0]}`, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsInJvbGVzIjpbIkFETUlOIl0sImlhdCI6MTczNzgyNDAwMCwiZXhwIjoxNzM3OTEwNDAwfQ.admin-signature'
      }
    });

    const data5 = await response5.json();
    console.log('   订单状态:', data5.data.status);

    if (data5.data.status !== 'PAID') {
      console.error('❌ 订单状态未回退到PAID，当前状态:', data5.data.status);
      process.exit(1);
    }

    console.log('');
    console.log('✅✅✅ 测试通过！订单状态正确回退到PAID');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  } finally {
    await app.close();
    process.exit(0);
  }
}

test();
