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

  it('keeps the real WeChat customer-service account id intact', () => {
    // 微信号 SevenKitchen 是真实客服账号标识，不是品牌名，不能改
    expect(read('src/pages/custom-recipe/success.vue')).toContain(
      "wechatId = ref('SevenKitchen')",
    );
    expect(read('src/pages/custom-recipe/orders.vue')).toContain(
      '微信号：SevenKitchen',
    );
  });
});
