import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), 'utf-8');

describe('brand name unification (赛文的食堂)', () => {
  const customerFacingFiles = [
    'src/mixins/shareMixin.ts',
    'src/pages/login/index.vue',
    'src/pages/home/index.vue',
    'src/pages/favorite-recipes/index.vue',
    'src/pages/recipe-detail/index.vue',
    'src/pages/recipe-designer/publish.vue',
    'src/pages/order-detail/index.vue',
    'src/pages/shared-photos/index.vue',
    'src/pages/privacy/index.vue',
    'src/pages/terms/index.vue',
    'src/pages/diy-sheet/index.vue',
    'src/utils/customer-service.ts',
    'src/utils/canvas-printer.ts',
  ];

  it('uses 赛文的食堂 across customer-facing surfaces', () => {
    for (const file of customerFacingFiles) {
      expect(read(file)).toContain('赛文的食堂');
    }
  });

  it('no longer exposes Seven的厨房 or 七厨房 to customers', () => {
    for (const file of customerFacingFiles) {
      expect(read(file)).not.toContain('Seven的厨房');
      expect(read(file)).not.toContain('七厨房');
    }
  });

  it('定制链路找客服走企业微信客服，而不是让顾客去加个人微信号', () => {
    /**
     * 2026-09-28 变更：此前这两处弹的是一句"微信号：SevenKitchen"，
     * 让顾客自己去加好友。而小程序**已经接入企业微信客服**
     * （后台 corp_id / open_kfid 均已配置，全站其它入口都用
     * wx.openCustomerServiceChat），定制链路却是个例外。
     * 现在统一走企微客服通道，个人微信号不再需要。
     */
    expect(read('src/pages/custom-recipe/success.vue')).toContain(
      'CustomerServiceInlineButton',
    );
    expect(read('src/pages/custom-recipe/orders.vue')).toContain(
      'openCustomerServiceChat',
    );
    // 不应再把个人微信号当作客服入口写死在页面上
    expect(read('src/pages/custom-recipe/success.vue')).not.toContain(
      "wechatId = ref('SevenKitchen')",
    );
    expect(read('src/pages/custom-recipe/orders.vue')).not.toContain(
      '微信号：SevenKitchen',
    );
  });
});
