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
    expect(template).toContain('喂食建议仅供参考');
    expect(template).toContain('可以点击下方【自己做】自定义配置');
  });

  it('★ 食材清单只出现一次；营养素单独一块，不写补剂用量', () => {
    // 2026-10-24：配方组成→食材清单；要加的补剂→须额外添加的营养素
    expect(template).toContain('食材清单');
    expect(template).toContain('须额外添加的营养素');
    expect(template).toContain('supplementTargetRows');
    // 营养素表头：营养素 / 添加浓度
    expect(template).toContain('添加浓度');
    // 原来那句“每 kg 食材添加 2192 毫克”顾客看不懂，已删
    expect(source).not.toContain('每kg食材添加');
    // 补剂总量不在这一页出现 —— 同一组数字只出现一次
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

  it('★ 添加浓度用“每公斤食材添加 X 单位”，喂食说明只留头尾', () => {
    // 2026-11-07：摊平文案收进 utils/supplement-nutrients，与详情页共用一份
    const nutrientRowsSource = read('src/utils/supplement-nutrients.ts');
    expect(source).toContain('buildSupplementNutrientRows');
    expect(nutrientRowsSource).toContain('每公斤食材添加');
    expect(template).toContain('喂食建议仅供参考。可以点击下方【自己做】自定义配置。');
    expect(template).not.toContain('每天喂食量、每日进食次数和每餐喂食量');
  });

  it('★ 营养报告入口在页面最下方（核心营养成分之后）', () => {
    expect(template).toContain('NutritionReportEntry');
    expect(template).toContain('@open="openNutritionReport"');
    expect(source).toContain('/pages/recipe-nutrition-report/index');

    const nutritionCardIndex = template.indexOf('<RecipeNutritionCard');
    const reportEntryIndex = template.indexOf('<NutritionReportEntry');
    const bottomBarIndex = template.indexOf('class="bottom-bar"');

    expect(nutritionCardIndex).toBeGreaterThan(-1);
    expect(reportEntryIndex).toBeGreaterThan(nutritionCardIndex);
    // 底栏之前 —— 它是正文最下方，不在固定栏里
    expect(bottomBarIndex).toBeGreaterThan(reportEntryIndex);
  });

  it('★ 报告入口只在交付快照里冻结了报告时才出现（不点进去看「暂无报告」）', () => {
    // 2026-11-08：入口 gating 从「有食谱编号」改成「快照里有冻结报告」
    expect(template).toContain('v-if="frozenNutritionReport"');
    expect(source).toContain('content.value.nutrition.report');
    // 老快照没有 report → 不渲染入口
    expect(template).not.toContain('v-if="selectedRecipeId"');
  });

  it('★ 报告页地址带订单号，让报告页读冻结的交付版', () => {
    const openSource = source.match(
      /const openNutritionReport = \(\) => \{[\s\S]*?\n\};/,
    )?.[0] || '';

    expect(openSource).toContain('/pages/recipe-nutrition-report/index?');
    expect(openSource).toContain('encodeURIComponent(selectedRecipeId.value)');
    // 订单号是"读交付快照"的钥匙：不带它，报告页会去取被改过的活行
    expect(openSource).toContain('orderId=');
    expect(openSource).toContain('encodeURIComponent(orderId.value)');
    // 没报告 / 缺编号时给提示，不跳空页
    expect(openSource).toContain('这份交付没有营养报告');
  });

  it('★ 营养报告卡与上面的「全营养标准」banner 左右对齐', () => {
    // banner 自带 24rpx 左右外边距，交付页自身内边距也是 24rpx；
    // 报告卡再补 24rpx 才能与 banner 同宽（2026-11-08 审核修）
    const slotStyle = source.match(/\.report-entry-slot\s*\{[^}]*\}/)?.[0] || '';

    expect(slotStyle).toContain('margin: 0 24rpx 24rpx;');
  });

  it('★ 全营养标准 banner 独立展示，核心营养卡不再重复标准行', () => {
    expect(template).toContain('NutritionStandardBanner');
    expect(template).toContain(':show-standard="false"');
  });

  it('★ 底部“交付时已存档”小字已按 2026-10-24 要求拿掉', () => {
    expect(template).not.toContain('这份内容在交付时已存档');
  });

  it('★ 第 2 页已删除，路由里不再有；标题改为我的定制食谱', () => {
    const pagesJson = read('src/pages.json');
    expect(pagesJson).not.toContain('delivery-shopping');
    expect(pagesJson).toContain('我的定制食谱');
    expect(pagesJson).not.toContain('我的专属食谱');
  });
});
