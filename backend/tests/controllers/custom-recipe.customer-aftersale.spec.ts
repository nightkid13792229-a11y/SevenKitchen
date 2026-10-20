import { BadRequestException } from '@nestjs/common';
import { CustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/custom-recipe.controller';

/**
 * 顾客端 · 多份售后提交（2026-10-21 · 第二阶段 Task 6）
 *
 * ## 这组测试锁的是**透传**
 *
 * 「涉及哪几份 / 每份想改什么」的规则（属于哪一批、说明不能为空）
 * 全部在 `CustomRecipeAftersaleService` 里 —— 那里才拿得到批次明细。
 * 控制器如果自己再判一遍，迟早出现两套口径；这里只保证：
 *   · 两个新字段原样交下去；
 *   · 不传时仍是老调用（老小程序不用改）；
 *   · 服务层算好的响应原样回给顾客。
 */
describe('CustomRecipeController · 顾客提交多份售后', () => {
  function createController() {
    const aftersaleService = {
      create: jest.fn().mockResolvedValue({
        id: 'aftersale-1',
        type: 'ADJUST_RECIPE',
        typeLabel: '调整食谱',
        status: 'PENDING',
        statusLabel: '待受理',
        deliveryBatchId: 'batch-1',
        deliveryItemIds: ['item-1', 'item-2'],
        recipeRequests: [
          { deliveryItemId: 'item-1', description: '太油了' },
          { deliveryItemId: 'item-2', description: '想换成鸭肉' },
        ],
      }),
    };

    const controller = new CustomRecipeController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      aftersaleService as any,
      {} as any,
      {} as any,
    );

    return { controller, aftersaleService };
  }

  const req = { user: { userId: 'user-1' } } as any;

  it('★ 勾选 2 份 + 逐份说明：原样交给服务层，响应带回选择结果', async () => {
    const { controller, aftersaleService } = createController();
    const recipeRequests = [
      { deliveryItemId: 'item-1', description: '太油了' },
      { deliveryItemId: 'item-2', description: '想换成鸭肉' },
    ];

    const res: any = await controller.createAftersale(
      req,
      'CR202610210001',
      'ADJUST_RECIPE',
      '整体说明：两份都不太适应',
      ['https://cdn.example.com/1.jpg'],
      ['item-1', 'item-2'],
      recipeRequests,
    );

    expect(aftersaleService.create).toHaveBeenCalledWith({
      orderIdOrId: 'CR202610210001',
      customerId: 'user-1',
      type: 'ADJUST_RECIPE',
      description: '整体说明：两份都不太适应',
      photos: ['https://cdn.example.com/1.jpg'],
      deliveryItemIds: ['item-1', 'item-2'],
      recipeRequests,
    });

    expect(res.data.deliveryBatchId).toBe('batch-1');
    expect(res.data.deliveryItemIds).toEqual(['item-1', 'item-2']);
    expect(res.data.recipeRequests).toHaveLength(2);
  });

  it('不传新字段：调用与老版本完全一致（老小程序不受影响）', async () => {
    const { controller, aftersaleService } = createController();

    await controller.createAftersale(
      req,
      'CR202610180001',
      'QUESTION',
      '只有一个问题',
    );

    expect(aftersaleService.create).toHaveBeenCalledWith({
      orderIdOrId: 'CR202610180001',
      customerId: 'user-1',
      type: 'QUESTION',
      description: '只有一个问题',
      photos: [],
      deliveryItemIds: undefined,
      recipeRequests: undefined,
    });
  });

  it('类型必填：控制器先挡住，不浪费一次服务层调用', async () => {
    const { controller, aftersaleService } = createController();

    await expect(
      controller.createAftersale(req, 'CR202610210001', '', '说明'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(aftersaleService.create).not.toHaveBeenCalled();
  });
});
