import { OrderDesignSubmitService } from '../../../src/application/custom-recipe/order-design-submit.service';

/**
 * 最终提交前必须拦住“加入待提交后又改过”的槽位。
 * legacy 槽位（stagedContentRevision 为 null）不误伤。
 */
describe('OrderDesignSubmitService · stale 槽位', () => {
  function service() {
    return Object.create(OrderDesignSubmitService.prototype) as any;
  }

  function slot(overrides: Record<string, any> = {}) {
    return {
      id: 'slot-1',
      orderId: 'order-1',
      dogId: 'dog-1',
      status: 'READY',
      recipeId: 'recipe-1',
      stagedContentRevision: 2,
      currentContentRevision: 2,
      ...overrides,
    };
  }

  it('stage 后又改过的 READY 槽位会被拦住，并指出第几份', () => {
    expect(() =>
      service().assertSlotsReady(
        { recipeQuantity: 1 },
        [slot({ stagedContentRevision: 1, currentContentRevision: 2 })],
      ),
    ).toThrow('第 1 份食谱在加入待提交后又改过');
  });

  it('版本一致的槽位可以提交', () => {
    expect(() =>
      service().assertSlotsReady({ recipeQuantity: 1 }, [slot()]),
    ).not.toThrow();
  });

  it('legacy 槽位没有 stagedContentRevision 时不阻断', () => {
    expect(() =>
      service().assertSlotsReady(
        { recipeQuantity: 1 },
        [slot({ stagedContentRevision: null })],
      ),
    ).not.toThrow();
  });
});
