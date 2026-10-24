import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 交付页 · 内容与交互守卫（2026-10-24 · P1 重构）
 *
 * 这一页从“两页交付”收敛成一页：
 *   · 喂食建议不再预设“按 X 天配的”，份量交给顾客在「自己做」里定；
 *   · 配方组成只出现一次，补剂单独一块、不写用量（用量在制作单）；
 *   · 固定底栏三件事：找 Seven爸爸 / 自己做 / 订购成品。
 *
 * 守卫的目标不是记住文案，而是防止三件事回潮：
 *   ① 页面又把业务数字算一遍（所有计算在后端）；
 *   ② 食材/补剂清单在同一页出现两遍；
 *   ③ 第 2 页被误加回来，或底栏又长出第四颗按钮。
 */

const PAGE = 'src/pages/custom-recipe/delivery.vue';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function stripComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('交付页 · 内容与交互（P1）', () => {
  const source = stripComments(read(PAGE));
  const template = source.slice(0, source.indexOf('<script setup'));

  it('★ 标题是「喂食建议」，不再预设做几天', () => {
    expect(template).toContain('喂食建议');
    expect(template).not.toContain('每天怎么喂');
    expect(template).not.toContain('这份量是按');
    expect(template).toContain('份量可以按你的习惯调整');
  });

  it('★ 配方组成只出现一次；补剂单独一块，不写用量', () => {
    expect(template).toContain('配方组成');
    expect(template).toContain('要加的补剂');
    expect(template).not.toContain('额外补充的营养素');
    expect(template).not.toContain('nutrientRows');
    expect(template).toContain('supplementRows');
    // 原来那句“每 kg 食材添加 2192 毫克”顾客看不懂，已删
    expect(source).not.toContain('每kg食材添加');
    // 补剂用量不在这一页出现 —— 同一组数字只出现一次
    expect(template).not.toContain('totalG');
  });

  it('★ 页面不把业务数字再算一遍（计算全部在后端）', () => {
    const FIELDS =
      'dailyIntakeG|perMealG|mealsPerDay|netG|totalNetG|ratioPercent|energyDensityKcalPerKg';
    const offenders = [
      ...source.matchAll(
        new RegExp(`\\b(?:${FIELDS})\\b\\s*[*/+\\-](?!\\s*['"\\x60])`, 'g'),
      ),
    ].map((match) => match[0].trim());

    expect(offenders).toEqual([]);
  });

  it('★ 固定底栏三件事：客服、自己做、订购成品', () => {
    expect(template).toContain('CustomerServiceInlineButton');
    expect(template).toContain('自己做');
    expect(template).toContain('订购成品');
    expect(template).not.toContain('开始采购与制作');
    expect(source).toContain('buildDeliveryDiyUrl');
    expect(source).toContain('buildFinishedFoodOrderUrl');
    // 只有一颗实心：主按钮用 primary，自己做是 secondary
    expect(template).toContain('bottom-bar__btn--secondary');
    expect(template).toContain('bottom-bar__btn--primary');
  });

  it('★ 客服入口带订单号（客服一进来就知道是哪单）', () => {
    expect(template).toContain(':order-id="orderId"');
    expect(template).toContain('source-type="ORDER"');
    expect(template).toContain('label="Seven爸爸"');
  });

  it('★ 存档说明还在：这一版不会被后来改的配方改掉', () => {
    expect(template).toContain('这份内容在交付时已存档');
  });

  it('★ 第 2 页已删除，路由里不再有；标题改为我的定制食谱', () => {
    const pagesJson = read('src/pages.json');
    expect(pagesJson).not.toContain('delivery-shopping');
    expect(pagesJson).toContain('我的定制食谱');
    expect(pagesJson).not.toContain('我的专属食谱');
  });
});
