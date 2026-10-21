import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 第 4 批的跨端守卫（2026-09-28）
 *
 * 老板拍板的决策 12 + Q2 + 通知中文化：
 *   · 顾客自助取消 + 全额原路退款（不需要客服先确认）
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
    /**
     * ⚠️ 2026-10-18：原来这里断言「订单已开始制作，无法自助取消」——
     * 那锁的是被 **V39 推翻**的旧口径（"只要没交付，随时都可以退"）。
     *
     * 制作中**仍然没交付**，现在允许取消；真正的边界是**已交付**。
     */
    expect(service).toContain('订单已交付，不能取消');
  });

  it('退款失败就不取消订单（不能出现"取消了钱没退"）', () => {
    const service = backend(
      'src/application/custom-recipe/custom-recipe.service.ts',
    );

    /**
     * 2026-10-04 起实现顺序变了，但保证更强：
     * 先 CAS 认领取消（并发下只有一方能释放名额），再退款；
     * **退款抛错时把取消回滚**（状态改回取消前的状态 + 名额重新占上），
     * 所以"取消了钱没退"依然不可能发生。
     *
     * 2026-10-21：回滚目标从写死的 PAID 改成 `order.status` ——
     * 制作中取消失败必须回到 IN_PROGRESS，不能变成"已付款"。
     */
    const claimIdx = service.indexOf(
      'const claimed = await this.prisma.$transaction',
    );
    const refundIdx = service.indexOf('const result = await refund(');
    const rollbackIdx = service.indexOf('status: order.status,', refundIdx);

    expect(claimIdx).toBeGreaterThan(-1);
    expect(refundIdx).toBeGreaterThan(claimIdx);
    expect(rollbackIdx).toBeGreaterThan(refundIdx);
    expect(service).toContain('把取消回滚');
    expect(service).toMatch(
      /refundableBeforeDelivery[\s\S]{0,400}CustomRecipeStatus\.IN_PROGRESS/,
    );
    // 回滚要把名额重新占上，否则"取消了又回滚"会白吃一个名额
    expect(service).toMatch(
      /把取消回滚[\s\S]{0,2000}bookedCount: \{ increment: quantity \}/,
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

  it('付款成功不再发订阅消息，把唯一一次订阅留给已交付通知', () => {
    const service = backend(
      'src/application/custom-recipe/custom-recipe.service.ts',
    );

    expect(service).not.toContain('sendCustomRecipeOrderNotification(');
    expect(service).toContain('唯一一次订阅');
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
    const confirmPage = miniapp('src/pages/custom-recipe/confirm.vue');

    /**
     * 取消入口。
     *
     * 2026-10-16（批次 2.3 / 2.8）有两处变化，守卫跟着挪但**意图不变**：
     *
     * ① 取消接口地址从页面挪到了 API 层（`src/api/custom-recipe.ts`）；
     * ② 「取消并退款」这个措辞从**页面**挪到了**后端动作解析器** ——
     *    措辞本身是业务口径，且"会不会退款"后端最清楚。
     *    所以现在断言：后端下发这个文案 + 页面照它渲染。
     */
    const apiLayer = miniapp('src/api/custom-recipe.ts');
    expect(apiLayer).toContain('/cancel');

    expect(detailPage).toContain('cancelAction');
    expect(detailPage).toContain('cancelOrderRequest');

    // 后端动作解析器必须给出「取消并退款」这个文案
    const resolver = backend(
      'src/application/custom-recipe/custom-recipe-action-resolver.ts',
    );
    expect(resolver).toContain('取消并退款');
    // 且区分待付款 / 已付款两种措辞
    expect(resolver).toContain("unpaid ? '取消订单' : '取消并退款'");

    /**
     * 只有待付款/已付款能取消 —— 这条现在由**后端**判定
     * （`SELF_CANCELLABLE`），页面不再自己写状态判断。
     */
    const stateResolver = backend(
      'src/application/custom-recipe/custom-recipe-action-resolver.ts',
    );
    expect(stateResolver).toContain('SELF_CANCELLABLE');
    expect(stateResolver).toContain('CustomRecipeStatus.PAID');
    expect(stateResolver).toContain('CustomRecipeStatus.PENDING_PAYMENT');

    /**
     * 订阅只申请一次，并留给「已交付」：
     * 微信的一次性订阅一次授权只能下发一条，付款时再申请会多一个弹窗/等待，
     * 且「已付款」会消耗掉唯一一次订阅，导致交付通知发不出去。
     */
    const paymentUtil = miniapp('src/utils/custom-recipe-payment.ts');

    // 提交订单时申请一次（2026-10-19 从定制页挪到订单确认页）
    expect(confirmPage).toContain('requestCustomRecipeOrderSubscription');
    expect(paymentUtil).toContain('export async function requestCustomRecipeOrderSubscription');
    expect(paymentUtil).toContain('uni.requestSubscribeMessage');
    // 付款前不再申请第二次
    expect(paymentUtil).not.toContain('await requestCustomRecipeOrderSubscription();');
    // 没配模板就不做无意义的失败调用
    expect(paymentUtil).toContain('if (!templateId) return false;');
  });
});
