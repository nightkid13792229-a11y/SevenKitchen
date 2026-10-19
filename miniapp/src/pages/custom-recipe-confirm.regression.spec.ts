import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf-8');
const PAGE_DIR = 'src/pages/custom-recipe';

describe('定制页 → 订单确认页（2026-10-19 老板确认）', () => {
  const page = read(`${PAGE_DIR}/index.vue`);
  const confirm = read(`${PAGE_DIR}/confirm.vue`);
  const pagesJson = read('src/pages.json');

  it('定制页按钮是「确认信息」，可点校验后只跳确认页，不在这里下单', () => {
    expect(page).toContain('@tap="goToOrderConfirm"');
    expect(page).toContain('确认信息');
    expect(page).not.toContain('submitOrder(');
    expect(page).not.toContain('requestCustomRecipeOrderSubscription');
    // 金额仍在说明里，按钮不显示金额
    expect(page).toContain('食谱定制费');
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

  it('确认页有只读汇总、返回修改和确认并支付', () => {
    expect(pagesJson).toContain('"pages/custom-recipe/confirm"');
    expect(confirm).toContain('给谁定制');
    expect(confirm).toContain('定制方向');
    expect(confirm).toContain('过敏信息');
    expect(confirm).toContain('现在主要喂什么');
    expect(confirm).toContain('定制原因');
    expect(confirm).toContain('最近肠胃');
    expect(confirm).toContain('返回修改');
    expect(confirm).toContain('确认并支付');
    expect(confirm).toContain('仅提交，稍后支付');
    expect(confirm).toContain('预计');
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

  it('定制页不显示预计交付和抵扣；确认页显示交付与可抵扣金额', () => {
    expect(page).not.toContain('pre-order-notice__date');
    expect(page).not.toContain('付完可全额抵扣');
    expect(confirm).toContain('预计');
    expect(confirm).toContain('当前可抵扣');
    expect(confirm).toContain('creditText');
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
