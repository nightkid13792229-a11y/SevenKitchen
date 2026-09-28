import { WechatService } from '../../../src/infrastructure/wechat/wechat.service';

/**
 * 定制订单状态通知（2026-09-28）
 *
 * 模板是从微信公共模板库选的（「订单完成通知」：订单编号 / 订单状态 / 温馨提示）。
 * 微信按**字段类型**分配 key —— 事物是 thing1、字母数字是 character_string1 ——
 * 而代码无法预知"订单编号"会被归成哪一类，所以做了两套候选自动适配。
 *
 * 这一组用例锁住三件事：
 *   1. 没配模板 ID 时不发（只记日志），而不是拿空 ID 去调
 *   2. 字段命名不匹配时换一套重试
 *   3. 与字段无关的错误（例如用户没订阅）不重试，避免重复打扰
 */
describe('WechatService · 定制订单状态通知', () => {
  const TEMPLATE_ID = 'KB72Zlp_xQUb-7noJNw6y8QaXyOUDptJ4Qh1N3t1iYE';

  function createService() {
    const service = new WechatService();
    const send = jest
      .spyOn(service, 'sendSubscriptionMessage')
      .mockResolvedValue({ success: true, msgid: 'm1' });
    return { service, send };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER;
  });

  it('没配模板 ID 时不发消息，也不报错', async () => {
    delete process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER;
    const { service, send } = createService();

    const result = await service.sendCustomRecipeOrderNotification(
      'openid-1',
      'CR202609280001',
      'DELIVERED',
      'RECIPE-BIZ-1',
    );

    expect(send).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('Template ID not configured');
  });

  it('第一套字段命名可用时只发一次', async () => {
    process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER = TEMPLATE_ID;
    const { service, send } = createService();

    const result = await service.sendCustomRecipeOrderNotification(
      'openid-1',
      'CR202609280001',
      'PAID',
    );

    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0] as any;
    expect(payload.template_id).toBe(TEMPLATE_ID);
    expect(payload.touser).toBe('openid-1');
    // 第一套：订单编号按"字母数字"，状态与说明按"事物"
    expect(Object.keys(payload.data)).toEqual([
      'character_string1',
      'thing1',
      'thing2',
    ]);
    expect(payload.data.thing1.value).toBe('已付款');
  });

  it('⭐ 字段命名不匹配（47003）时换第二套重试并成功', async () => {
    process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER = TEMPLATE_ID;
    const { service, send } = createService();
    send
      .mockResolvedValueOnce({ success: false, error: '47003 - argument invalid' })
      .mockResolvedValueOnce({ success: true, msgid: 'm2' });

    const result = await service.sendCustomRecipeOrderNotification(
      'openid-1',
      'CR202609280001',
      'DELIVERED',
      'RECIPE-BIZ-1',
    );

    expect(result.success).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    // 第二套：三个都是"事物"
    const second = send.mock.calls[1][0] as any;
    expect(Object.keys(second.data)).toEqual(['thing1', 'thing2', 'thing3']);
    expect(second.data.thing3.value).toBe('定制食谱已制作完成');
  });

  it('用户没订阅（43101）这类错误不重试 —— 换字段名也没用', async () => {
    process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER = TEMPLATE_ID;
    const { service, send } = createService();
    send.mockResolvedValue({
      success: false,
      error: '43101 - user refuse to accept the msg',
    });

    const result = await service.sendCustomRecipeOrderNotification(
      'openid-1',
      'CR202609280001',
      'PAID',
    );

    expect(result.success).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('交付通知直接跳到那道定制食谱；其它状态跳「我的定制订单」', async () => {
    process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER = TEMPLATE_ID;
    const { service, send } = createService();

    await service.sendCustomRecipeOrderNotification(
      'openid-1',
      'CR202609280001',
      'DELIVERED',
      'RECIPE-BIZ-1',
    );
    expect((send.mock.calls[0][0] as any).page).toBe(
      'pages/recipe-detail/index?id=RECIPE-BIZ-1',
    );

    send.mockClear();
    await service.sendCustomRecipeOrderNotification(
      'openid-1',
      'CR202609280001',
      'PAID',
    );
    expect((send.mock.calls[0][0] as any).page).toBe(
      'pages/custom-recipe/orders',
    );
  });

  it('通知文案是中文（此前是"您的定制食谱已 ready"）', async () => {
    process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER = TEMPLATE_ID;
    const { service, send } = createService();

    await service.sendCustomRecipeOrderNotification(
      'openid-1',
      'CR202609280001',
      'DELIVERED',
      'RECIPE-BIZ-1',
    );

    const values = Object.values((send.mock.calls[0][0] as any).data).map(
      (item: any) => item.value,
    );
    expect(values.join(' ')).not.toContain('ready');
    expect(values).toContain('定制食谱已制作完成');
  });
});
