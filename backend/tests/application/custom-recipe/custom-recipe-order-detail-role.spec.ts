/**
 * 后台定制订单详情：顾客角色必须一并取出（2026-10-21）
 *
 * 内部账号下的测试单与真实顾客单在页面上长得一样，
 * 只有把 `customer.role` 带到详情里，后台才能标「内部测试」。
 * 这里直接锁 Prisma select，防止以后有人清理字段时又把它删掉。
 */

import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';

describe('CustomRecipeService · 订单详情顾客角色', () => {
  it('getOrderByOrderId 的 customer select 包含 role', async () => {
    const prisma = {
      customRecipeOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cr-1',
          orderId: 'CR202610210001',
          customer: {
            id: 'admin-1',
            nickname: '内部测试号',
            phone: '13900000000',
            role: 'ADMIN',
            wechatOpenid: null,
          },
        }),
      },
    };

    const service = new CustomRecipeService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const order: any = await service.getOrderByOrderId('CR202610210001');

    expect(prisma.customRecipeOrder.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'CR202610210001' },
        include: expect.objectContaining({
          customer: expect.objectContaining({
            select: expect.objectContaining({
              role: true,
            }),
          }),
        }),
      }),
    );
    expect(order.customer.role).toBe('ADMIN');
  });
});
