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
    // 2026-10-25：缺项错误常驻在对应板块/底部，不只靠 toast
    expect(page).toContain('showValidation');
    expect(page).toContain('validationMessage');
    expect(page).toContain('validationTarget');
    expect(page).toContain('class="section-error"');
    expect(page).toContain('class="form-error"');
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

  it('★ 多份选择按顾客+狗记住，返回再进不重置', () => {
    expect(confirm).toContain('loadCustomRecipeMultiChoice');
    expect(confirm).toContain('saveCustomRecipeMultiChoice');
    expect(confirm).toContain('loadQuote(recipeQuantity.value)');
    expect(confirm).toContain('loadDeliveryDate(recipeQuantity.value)');
    expect(confirm).toContain('watch(');
  });

  it('★ 单份费用为 0 时挡住支付，不显示“¥0”', () => {
    expect(confirm).toContain('singleFeeMissing');
    expect(confirm).toContain('!singleFeeMissing.value');
    expect(confirm).toContain("'费用读取失败，请返回重试'");
    expect(confirm).toContain('定制费用没读取出来');
  });

  it('★ 支付前有退款/取消规则说明', () => {
    expect(confirm).toContain('未开始制作可全额退款');
    expect(confirm).toContain('联系 Seven爸爸审核');
  });

  it('★ 确认页死代码清理：不再有 post* 状态和 payAfterSubmit', () => {
    expect(confirm).not.toContain('postTitle');
    expect(confirm).not.toContain('postDesc');
    expect(confirm).not.toContain('postPaymentHint');
    expect(confirm).not.toContain('payAfterSubmit');
  });

  it('确认页创建订单后留在本页支付，不再跳提交成功页', () => {
    expect(confirm).toContain('loadCustomRecipeDraft');
    expect(confirm).toContain('allergyStatus');
    expect(confirm).toContain('clientRequestId');
    expect(confirm).toContain('requestCustomRecipeOrderSubscription');
    expect(confirm).toContain('submitOrder(payload)');
    expect(confirm).toContain('retainCustomRecipeChoicesAfterPayment');
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
 * 多份购买 · 确认页（2026-10-20 第一阶段）。
 *
 * 份数选择、主蛋白选择和价格明细都**只在后端开关打开时出现**；
 * 金额只展示后端报价，开关关闭时仍是原来的单份确认页。
 */
describe('多份购买 · 确认页（2026-10-20）', () => {
  const confirm = read(`${PAGE_DIR}/confirm.vue`);
  const api = read('src/api/custom-recipe.ts');
  const helper = read('src/utils/custom-recipe-pricing.ts');

  it('公开配置类型带上多份开关、上限和优惠档位', () => {
    expect(api).toContain('multiRecipeEnabled');
    expect(api).toContain('maxRecipeQuantity');
    expect(api).toContain('multiRecipeDiscounts');
    expect(api).toContain('payableAmount');
  });

  it('报价走 GET /custom-recipe/quote?quantity=N，不用前端价格兜底', () => {
    expect(api).toContain('export async function fetchCustomRecipeQuote');
    expect(api).toContain('/custom-recipe/quote?quantity=');
    expect(confirm).toContain('fetchCustomRecipeQuote');
  });

  it('配方份数只在开关为 true 时显示，关闭时强制 1 份', () => {
    expect(confirm).toContain('v-if="multiRecipeEnabled"');
    expect(confirm).toContain('配方份数');
    expect(confirm).toContain('最多 {{ maxRecipeQuantity }} 份');
    expect(confirm).toContain('changeRecipeQuantity');
    expect(confirm).toContain(
      'recipeQuantity: multiRecipeEnabled.value ? recipeQuantity.value : 1',
    );
  });

  it('指定主蛋白有营养师配/自己选，自己选只给六种肉、不含鱼', () => {
    expect(confirm).toContain('指定主蛋白');
    expect(confirm).toContain('营养师配');
    expect(confirm).toContain('自己选');
    expect(confirm).toContain('proteinOptions');
    expect(confirm).toContain('toggleProtein');

    for (const code of [
      'CHICKEN',
      'DUCK',
      'PORK',
      'BEEF',
      'TURKEY',
      'RABBIT',
    ]) {
      expect(helper).toContain(`code: '${code}'`);
    }
    expect(helper).not.toContain('FISH');
  });

  it('价格明细展示原价、多份优惠、应付、每份均价，并挡住不完整选择', () => {
    expect(confirm).toContain('价格明细');
    expect(confirm).toContain('原价');
    expect(confirm).toContain('多份优惠');
    expect(confirm).toContain('应付金额');
    expect(confirm).toContain('每份均价');
    expect(confirm).toContain(
      'formatAmount(currentQuote.value.payableAmount)',
    );
    expect(confirm).toContain('perRecipeAverage');
    expect(confirm).toContain('proteinSelectionError');
    expect(confirm).toContain(':disabled="!canSubmit"');
  });

  it('报价失败时显示重试并挡住提交', () => {
    expect(confirm).toContain('quoteError');
    expect(confirm).toContain('retryQuote');
    expect(confirm).toContain('price-state--error');
    expect(confirm).toContain('if (!quoteReady.value)');
  });

  it('份数变化时按新份数重取交付日期，晚到的旧响应不覆盖新份数', () => {
    expect(api).toContain(
      'export async function fetchNextDeliveryDate(quantity?: number)',
    );
    expect(api).toContain('/custom-recipe/next-delivery-date?quantity=');

    const loadDelivery =
      confirm.match(/async function loadDeliveryDate\([\s\S]*?\n}\n/)?.[0] ||
      '';
    expect(loadDelivery).toContain('++deliveryRequestSeq');
    expect(loadDelivery).toContain('sequence !== deliveryRequestSeq');
    expect(loadDelivery).toContain('fetchNextDeliveryDate(');
    expect(confirm).toContain('void loadDeliveryDate(next)');
    expect(confirm).toContain('deliveryRequestSeq += 1');
  });

  it('新增的多份价格区不出现任何抵扣说法', () => {
    const code = stripComments(`${confirm}\n${helper}\n${api}`);
    for (const word of ['可抵扣', '成品抵扣', '抵扣']) {
      expect(code).not.toContain(word);
    }
  });

  it('提交 payload 带份数和肉类偏好；营养师配传空数组', () => {
    const submit =
      confirm.match(
        /async function submitConfirmedOrder\([\s\S]*?\n}\n\nonLoad/,
      )?.[0] || '';

    expect(submit).toContain('recipeQuantity:');
    expect(submit).toContain('requestedProteinCodes:');
    expect(submit).toContain('resolveRequestedProteinCodes');
    expect(submit).toContain(': [],');
    expect(submit).toContain('quoteReady.value');
    expect(submit).toContain('proteinSelectionError.value');
  });
});

describe('确认页 · 支付前可靠性（2026-10-25）', () => {
  const confirm = read(`${PAGE_DIR}/confirm.vue`);

  it('选项字典没就绪时挡住支付，并给加载/失败/重试', () => {
    expect(confirm).toContain('optionsReady');
    expect(confirm).toContain('optionsFailed');
    expect(confirm).toContain('optionsLoading');
    expect(confirm).toContain('optionLoadingText');
    expect(confirm).toContain('retryOptions');
    expect(confirm).toContain('currentFoodLoading');
    expect(confirm).toContain('changeReasonFailed');
    expect(confirm).toContain('canSubmit = computed');
    expect(confirm).toContain('optionsReady.value');
    // 摘要不能只显示空白
    expect(confirm).toContain("'读取中…'");
    expect(confirm).toContain("'读取失败'");
  });

  it('首次交付日期失败不挡整页，狗狗详情失败要阻断', () => {
    expect(confirm).toContain('fetchNextDeliveryDate().catch');
    expect(confirm).toContain("loadError.value = '狗狗信息读取失败，请重试'");
    expect(confirm).toContain('resolveDogAvatarSrc');
    expect(confirm).toContain('dogAvatar');
    // 狗狗详情失败后不再用通用“狗狗”继续付款
    expect(confirm).toContain("dogRes?.data?.profile");
  });

  it('提交幂等键按顾客+狗持久化，创建成功后清掉', () => {
    expect(confirm).toContain('getOrCreateCustomRecipeSubmitKey');
    expect(confirm).toContain('clearCustomRecipeSubmitKey');
    expect(confirm).toContain("clientRequestId.value = ''");
    // onLoad 不再自己生成新 key
    expect(confirm).not.toContain('clientRequestId.value = `cr-');
  });

  it('提交守卫先立起来；支付未完成先讲清“订单已创建”', () => {
    const submitIndex = confirm.indexOf('submitting.value = true');
    const subscribeIndex = confirm.indexOf('const subscriptionRequest');
    expect(submitIndex).toBeGreaterThan(-1);
    expect(subscribeIndex).toBeGreaterThan(submitIndex);

    expect(confirm).toContain("title: '订单已创建'");
    expect(confirm).toContain('本次支付已取消');
    expect(confirm).toContain('微信支付没有完成');
    expect(confirm).toContain('onBackPress');
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

  it('确认页 / 定制订单详情 / 定制页 / 统一订单列表 不再出现抵扣文案与字段', () => {
    const sources: Array<[string, string]> = [
      ['确认页', read(`${PAGE_DIR}/confirm.vue`)],
      ['定制订单详情', read(`${PAGE_DIR}/order-detail.vue`)],
      ['定制页', read(`${PAGE_DIR}/index.vue`)],
      ['统一订单列表', read('src/pages/orders-list/index.vue')],
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
