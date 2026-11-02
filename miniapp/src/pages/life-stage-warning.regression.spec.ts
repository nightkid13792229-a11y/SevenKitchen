import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 生命阶段提醒 · 页面契约（2026-11-02）
 *
 * 三页共用 `LifeStageVersionBar`；版本由 `/recipes/:id` 的结论决定，页面不再单独请求。
 * 只有高风险（幼犬/繁殖期选错）在"下单/生成制作单"那一下确认一次，卡片上没有确认键。
 */
describe('life-stage integration contract', () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
  const detail = read('src/pages/recipe-detail/index.vue');
  const order = read('src/pages/recipe-order/index.vue');
  const diy = read('src/pages/recipe-diy/index.vue');

  it('three pages use the shared version bar', () => {
    for (const source of [detail, order, diy]) {
      expect(source).toContain('<LifeStageVersionBar');
      expect(source).toContain('<LifeStageVersionSheet');
      expect(source).not.toContain('<LifeStageVersionCard');
    }
  });

  it('pages no longer fetch the verdict separately', () => {
    for (const source of [detail, order, diy]) {
      expect(source).not.toContain('fetchLifeStageMatch');
      expect(source).not.toContain('checkLifeStageMatch');
    }
  });

  it('removes the card acknowledge button and the old dismiss logic', () => {
    for (const source of [detail, order, diy]) {
      expect(source).not.toContain('我已知晓');
      expect(source).not.toContain('dismissWarning');
      expect(source).not.toContain('acknowledgedLifeStageDogIds');
    }
  });

  it('confirms only high-risk mismatches before ordering / generating', () => {
    for (const source of [order, diy]) {
      expect(source).toContain("lifeStageRisk.value === 'HIGH'");
      expect(source).toContain('confirmLifeStageMismatch');
    }
    expect(order).toContain("source: 'order'");
    expect(diy).toContain("source: 'diy'");
  });

  it('keeps the no-dog state free of mismatch wording', () => {
    const ui = read('src/utils/life-stage-ui.ts');
    const detailTemplate = detail.slice(0, detail.indexOf('<script setup'));
    expect(detailTemplate).toContain(':state="lifeStageState"');
    expect(ui).toContain("if (!input.hasDog) return 'no_dog'");
    expect(ui).not.toContain('没有完全匹配的版本');
  });
});
