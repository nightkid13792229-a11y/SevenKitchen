import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf-8');

/**
 * 去掉注释后的源码。
 *
 * 删除类断言必须用它：说明"删掉了什么"的注释里往往把旧文案原样写回来，
 * 否则断言会被自己的注释误伤。
 */
const stripComments = (src: string) =>
  src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const PAGE_DIR = 'src/pages/custom-recipe';

describe('定制页 → 订单确认页（2026-10-19 老板确认）', () => {
  const page = read(`${PAGE_DIR}/index.vue`);
  const confirm = read(`${PAGE_DIR}/confirm.vue`);
  const pagesJson = read('src/pages.json');

  it('定制页按钮是「确认订单」，可点校验后只跳确认页，不在这里下单', () => {
    expect(page).toContain('@tap="goToOrderConfirm"');
    expect(page).toContain('确认订单');
    expect(page).not.toContain('submitOrder(');
    expect(page).not.toContain('requestCustomRecipeOrderSubscription');
    // 金额和费用小字已从按钮上移除，只在确认页支付按钮显示
    expect(page).not.toContain('submit-btn__fee');
  });

  it('必填项校验会返回提示、目标板块和聚焦输入框', () => {
    expect(page).toContain("selector: '#custom-dog'");
    expect(page).toContain("selector: '#custom-status'");
    expect(page).toContain("selector: '#custom-weight'");
    expect(page).toContain("selector: '#custom-allergy'");
    expect(page).toContain("selector: '#custom-intake'");
    expect(page).toContain("focus: 'allergy'");
    expect(page).toContain("focus: 'currentFoodOther'");
    expect(page).toContain("focus: 'changeReasonOther'");
    expect(page).toContain("focus: 'stomachOther'");
    expect(page).toContain('uni.pageScrollTo');
  });

  it('确认页有只读汇总、附件预览和确认并支付', () => {
    expect(pagesJson).toContain('"pages/custom-recipe/confirm"');
    expect(confirm).toContain('定制对象');
    expect(confirm).toContain('体重管理方向');
    expect(confirm).toContain('过敏情况');
    expect(confirm).toContain('目前主食');
    expect(confirm).toContain('定制原因');
    expect(confirm).toContain('最近肠胃表现');
    expect(confirm).toContain('确认并支付');
    expect(confirm).toContain('reportAttachments');
    expect(confirm).toContain('noteAttachments');
    expect(confirm).toContain('previewConfirmAttachment');
    expect(confirm).not.toContain('返回修改');
    expect(confirm).not.toContain('仅提交，稍后支付');
    expect(confirm).toContain('delivery-note');
    expect(confirm).toContain('（含）之前交付');
  });

  it('确认页创建订单后留在本页支付，不再跳提交成功页', () => {
    expect(confirm).toContain('loadCustomRecipeDraft');
    expect(confirm).toContain('allergyStatus');
    expect(confirm).toContain('clientRequestId');
    expect(confirm).toContain('requestCustomRecipeOrderSubscription');
    expect(confirm).toContain('submitOrder(payload)');
    expect(confirm).toContain('clearCustomRecipeDraft');
    expect(confirm).toContain('createdOrder');
    expect(confirm).toContain('runCustomRecipePayment');
    expect(confirm).toContain('payCreatedOrder');
    expect(confirm).not.toContain('/pages/custom-recipe/success?');
    expect(confirm).not.toContain('uni.reLaunch({');
  });

  it('定制页不显示交付和抵扣；确认页交付只给日期和查看说明', () => {
    expect(page).not.toContain('pre-order-notice__date');
    expect(page).not.toContain('付完可全额抵扣');
    expect(confirm).toContain('title-text">交付</text>');
    expect(confirm).toContain('delivery-note');
    expect(confirm).toContain('我的订单');
    expect(confirm).not.toContain('当前可抵扣');
    expect(confirm).not.toContain('creditText');
  });

  it('附件预览窗上方不再显示“点图片看大图”说明', () => {
    expect(page).not.toContain('点图片看大图；右上角的 × 可以删除这一张。');
  });

  it('健康档案只读块：空态/最近就诊/最近体检/去补填/返回刷新', () => {
    expect(page).toContain('id="custom-health"');
    expect(page).toContain('没有任何就诊和体检记录');
    expect(page).toContain('recentVisit');
    expect(page).toContain('recentCheckup');
    expect(page).toContain('formatHealthRecordDate');
    expect(page).toContain('goToHealthProfile');
    expect(page).toContain('refreshHealthSummary');
    expect(page).toContain('from=custom_recipe');
    // 不展示治疗中/已康复
    expect(page).not.toContain('recentVisit.status');
  });
});

/**
 * 成品抵扣彻底下线（2026-10-20）。
 *
 * 老板决定取消「定制费可抵扣成品货款」：后端已删字段、接口和台账，
 * 小程序这边不能留下任何还在读旧字段或还在讲抵扣的界面。
 * 只删抵扣，定制费金额、支付、交付、订单详情都保持原样。
 */
describe('定制链路 · 成品抵扣已彻底下线（2026-10-20）', () => {
  const CREDIT_WORDS = ['可抵扣', '成品抵扣', '定制费抵扣'];
  const CREDIT_FIELDS = [
    'creditAmount',
    'creditUsed',
    'creditRemaining',
    'creditAmountApplied',
    'creditOriginalProductAmount',
    'customRecipeCreditOrderId',
  ];

  const assertNoCredit = (name: string, source: string) => {
    const code = stripComments(source);
    for (const word of CREDIT_WORDS) {
      expect(code, `${name} 不应再出现「${word}」`).not.toContain(word);
    }
    for (const field of CREDIT_FIELDS) {
      expect(code, `${name} 不应再出现字段 ${field}`).not.toContain(field);
    }
  };

  it('确认页 / 定制订单详情 / 定制页 / 定制订单列表 不再出现抵扣文案与字段', () => {
    const sources: Array<[string, string]> = [
      ['确认页', read(`${PAGE_DIR}/confirm.vue`)],
      ['定制订单详情', read(`${PAGE_DIR}/order-detail.vue`)],
      ['定制页', read(`${PAGE_DIR}/index.vue`)],
      ['定制订单列表', read(`${PAGE_DIR}/orders.vue`)],
    ];

    for (const [name, source] of sources) assertNoCredit(name, source);
  });

  it('首页定制入口与 API 类型也不再提到抵扣', () => {
    assertNoCredit('首页', read('src/pages/home/index.vue'));
    assertNoCredit('定制 API 类型', read('src/api/custom-recipe.ts'));
  });

  it('已下线的提交成功页也清掉了抵扣块', () => {
    assertNoCredit('提交成功页', read(`${PAGE_DIR}/success.vue`));
  });

  it('只删抵扣：定制费与交付信息仍在', () => {
    const confirm = read(`${PAGE_DIR}/confirm.vue`);
    const detail = read(`${PAGE_DIR}/order-detail.vue`);

    // 确认页的真实应付金额仍来自后端配置/订单，并渲染在支付按钮上
    expect(confirm).toContain('const feeText = computed');
    expect(confirm).toContain('确认并支付');
    expect(confirm).toContain('config.value?.feeAmount');
    // 订单详情的定制费金额行保留
    expect(detail).toContain('<text class="label">定制费</text>');
    expect(detail).toContain('formatAmount(order.amount)');
    // 交付日期与查看食谱（「用这份食谱订购成品」的入口）保留
    expect(detail).toContain('estimatedDeliveryDate');
    expect(detail).toContain('const viewRecipe = () =>');
    expect(detail).toContain("url: `/pages/recipe-detail/index?id=");
  });
});
