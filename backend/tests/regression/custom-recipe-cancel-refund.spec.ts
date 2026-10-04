import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 第 4 批的跨端守卫（2026-09-28）
 *
 * 老板拍板的决策 12 + Q2 + 通知中文化：
 *   · 顾客自助取消 + 全额原路退款（不需要客服先确认）
 *   · 关单/退款后自动把抵扣额度还回去
 *   · 通知在"顾客真的付了钱"和"交付"两个时刻都要发
 */
describe('定制订单 · 取消退款与通知守卫', () => {
  const backend = (path: string) =>
    readFileSync(resolve(process.cwd(), path), 'utf-8');
  const miniapp = (path: string) =>
    readFileSync(resolve(process.cwd(), '../miniapp', path), 'utf-8');

  it('顾客端有取消接口，并且校验归属与状态', () => {
    const controller = backend(
      'src/interfaces/controllers/custom-recipe/custom-recipe.controller.ts',
    );
    const service = backend(
      'src/application/custom-recipe/custom-recipe.service.ts',
    );

    expect(controller).toContain("orders/:orderId/cancel");
    expect(controller).toContain('createCustomRecipeRefund');
    expect(service).toContain('async cancelOrderByCustomer');
    expect(service).toContain('无权操作此订单');
    expect(service).toContain('订单已开始制作，无法自助取消');
  });

  it('退款失败就不取消订单（不能出现"取消了钱没退"）', () => {
    const service = backend(
      'src/application/custom-recipe/custom-recipe.service.ts',
    );

    /**
     * 2026-10-04 起实现顺序变了，但保证更强：
     * 先 CAS 认领取消（并发下只有一方能释放名额），再退款；
     * **退款抛错时把取消回滚**（状态改回 PAID + 名额重新占上），
     * 所以"取消了钱没退"依然不可能发生。
     */
    const claimIdx = service.indexOf(
      'const claimed = await this.prisma.$transaction',
    );
    const refundIdx = service.indexOf('const result = await refund(');
    const rollbackIdx = service.indexOf(
      'status: CustomRecipeStatus.PAID,',
      refundIdx,
    );

    expect(claimIdx).toBeGreaterThan(-1);
    expect(refundIdx).toBeGreaterThan(claimIdx);
    expect(rollbackIdx).toBeGreaterThan(refundIdx);
    expect(service).toContain('把取消回滚');
    // 回滚要把名额重新占上，否则"取消了又回滚"会白吃一个名额
    expect(service).toMatch(
      /把取消回滚[\s\S]{0,2000}bookedCount: \{ increment: 1 \}/,
    );
  });

  it('定制订单有独立的退款记录字段', () => {
    const schema = backend('prisma/schema.prisma');

    expect(schema).toContain('refundStatus');
    expect(schema).toContain('refundOutNo');
    expect(schema).toContain('refundedAt');
  });

  it('微信退款走定制单自己的商户单号', () => {
    const payment = backend(
      'src/application/payment/wechat-payment.service.ts',
    );

    expect(payment).toContain('async createCustomRecipeRefund');
    // 支付时用的是 CustomRecipeOrder.orderId（CR 开头），退款必须一致
    expect(payment).toContain('out_trade_no: order.orderId');
    expect(payment).toContain('customRecipeOrder.update');
  });

  it('成品单关单时自动把定制费抵扣额度还回去', () => {
    const order = backend('src/application/order/order.service.ts');

    expect(order).toContain('restoreCustomRecipeCreditIfNeeded');
    expect(order).toContain('creditAmountApplied: true');
    expect(order).toContain('customRecipeCreditOrderId: true');
    // 幂等：交给 restoreCredit 的 CAS
    expect(order).toContain('restoreCredit({');
  });

  it('顾客付款成功时也发通知（原先只有客服点按钮才发）', () => {
    const service = backend(
      'src/application/custom-recipe/custom-recipe.service.ts',
    );

    expect(service).toContain("sendCustomRecipeOrderNotification(");
    expect(service).toContain("'PAID'");
    expect(service).toContain('if (!alreadyPaid');
  });

  it('公开配置会把订阅模板 ID 带给小程序（未配置则为 null）', () => {
    const config = backend(
      'src/application/custom-recipe/custom-recipe-config.service.ts',
    );

    expect(config).toContain('orderNotifyTemplateId');
    expect(config).toContain('WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER');
    expect(config).toContain('|| null');
  });

  it('小程序：订单页可自助取消；提交时申请订阅授权', () => {
    const detailPage = miniapp('src/pages/custom-recipe/order-detail.vue');
    const indexPage = miniapp('src/pages/custom-recipe/index.vue');

    // 取消入口
    expect(detailPage).toContain('canSelfCancel');
    expect(detailPage).toContain('取消并退款');
    expect(detailPage).toContain('/cancel');
    // 只有待付款/已付款能取消
    expect(detailPage).toContain("status === 'PENDING_PAYMENT' || status === 'PAID'");

    /**
     * 订阅授权要在**两个时刻**各申请一次：
     * 微信的订阅消息"订阅一次只能下发一条"，而我们会在「已付款」和「已交付」
     * 两个时刻各发一条。只申请一次的话第二条会被微信以 43101 拒掉。
     */
    const paymentUtil = miniapp('src/utils/custom-recipe-payment.ts');

    expect(indexPage).toContain('requestCustomRecipeOrderSubscription');
    expect(paymentUtil).toContain('export async function requestCustomRecipeOrderSubscription');
    expect(paymentUtil).toContain('uni.requestSubscribeMessage');
    // 付款前再申请一次（用户点击「立即付款」的那一刻）
    expect(paymentUtil).toContain('await requestCustomRecipeOrderSubscription();');
    // 没配模板就不做无意义的失败调用
    expect(paymentUtil).toContain('if (!templateId) return;');
  });
});
