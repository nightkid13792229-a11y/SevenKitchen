import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 多份交付 · 页面源码守卫（2026-10-21 · 第二阶段 Task 4）
 *
 * ## 这条守卫守的是三件容易悄悄退回去的事
 *
 * 1. **多份订单要看到 N 张卡片**，不是"只显示第一份"。
 *    批次接口一次返回 N 份，页面若忘了 `v-for`，顾客付了 5 份只看到 1 份。
 * 2. **每张卡片进的是自己那一份**。链接里漏了 `recipeId`，
 *    点第二张也会打开第一份 —— 页面看起来正常，内容却是错的。
 * 3. **老订单的单份卡片一个字都不能变**。批次是追加路径，
 *    不能把老订单的 `delivery` 卡挤掉。
 *
 * 另外确认收到必须**仍然只有一次整单调用**：多份不能变成每张卡一个按钮。
 * 最后守一条底线：多份交付里不许出现任何"抵扣 / credit"。
 */

const ORDER_DETAIL = 'src/pages/custom-recipe/order-detail.vue';
const DELIVERY = 'src/pages/custom-recipe/delivery.vue';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

/** 去掉注释，免得自己写的注释把自己骗了 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

describe('定制订单详情 · 多份交付卡片', () => {
  const source = stripComments(read(ORDER_DETAIL));

  it('★ 有 deliveryBatch 时显示「本次共交付 N 份」并逐份渲染卡片', () => {
    expect(source).toContain('deliveryBatch');
    expect(source).toContain('本次共交付');
    expect(source).toContain('deliveryBatch.items');
    expect(source).toMatch(/v-for="[^"]*deliveryBatch\.items/);
  });

  it('★ 每张卡片有食谱名、封面、交付时间、交付物标签和「进入食谱」', () => {
    expect(source).toContain('item.recipeName');
    expect(source).toContain('item.recipeCoverImageUrl');
    expect(source).toContain('item.itemCodes');
    expect(source).toContain('deliveryBatch.deliveredAt');
    expect(source).toContain('进入食谱');
  });

  it('★ 每张卡片跳到自己的那份（orderId + recipeId），不是永远第一份', () => {
    expect(source).toContain('buildDeliveryDetailUrl');
    expect(source).toContain('item.recipeId');
    // 路由拼接只在 helper 里做，页面不再手拼查询串
    expect(source).not.toContain('/pages/custom-recipe/delivery?orderId=');
  });

  it('★ 确认收到仍是整单一次调用，不按份重复', () => {
    const calls = source.match(/confirmReceiptRequest\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(source).toContain('@tap="handleConfirmReceipt"');
  });

  it('★ 只有老 delivery、没有批次时，原来的单份卡片保持原样', () => {
    expect(source).toContain('v-if="!deliveryBatch && delivery"');
    // 老卡片的入口与文案都还在
    expect(source).toContain('查看完整内容');
    expect(source).toContain('viewDelivery');
    expect(source).toContain('order.recipeName');
    expect(source).toContain('delivery.itemCodes');
    expect(source).toContain('delivery.deliveredAt');
  });
});

describe('交付详情页 · 按 recipeId 选份', () => {
  const source = stripComments(read(DELIVERY));

  it('★ 接收 recipeId，并用统一 helper 选出对应那一份', () => {
    expect(source).toContain('recipeId');
    expect(source).toContain('resolveDeliverySelection');
    expect(source).toContain('deliveryBatchCountText');
  });

  it('★ 显示的是选中那份的食谱名与版本，而不是批次第一份', () => {
    expect(source).toContain('resolved.recipeName');
    expect(source).toContain('resolved.version');
    expect(source).toContain('resolved.deliveredAt');
  });

  it('★ 去做 / 订购成品时把这一份的 recipeId 带上，避免退回第一份', () => {
    expect(source).toContain('buildDeliveryDiyUrl');
    expect(source).toContain('buildFinishedFoodOrderUrl');
    expect(source).toContain('selectedRecipeId');
  });

  it('老单份交付仍然直接读 content，不经过批次分支', () => {
    expect(source).toContain('content.recipe');
    expect(source).toContain('content.feeding');
  });
});

describe('多份交付 · 全面取消成品抵扣', () => {
  it('★ 订单详情 / 交付页都不出现抵扣或 credit', () => {
    for (const file of [ORDER_DETAIL, DELIVERY]) {
      const source = stripComments(read(file));
      expect(source).not.toMatch(/抵扣|credit/i);
    }
  });
});
