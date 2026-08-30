import { WechatService } from 'src/infrastructure/wechat/wechat.service';
import axios from 'axios';

describe('WechatService mock login', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('uses configured mock identity when WeChat credentials are placeholders', async () => {
    process.env.WECHAT_APP_ID = 'wx92924e25093f8f18';
    process.env.WECHAT_APP_SECRET = 'your_wechat_app_secret';
    process.env.WECHAT_MOCK_OPENID = 'mock_openid_local_admin';
    process.env.WECHAT_MOCK_UNIONID = 'mock_unionid_local_admin';

    const service = new WechatService();

    const result = await service.code2Session(
      'runtime-code-from-devtools',
      'wx92924e25093f8f18',
    );

    expect(result).toEqual({
      openid: 'mock_openid_local_admin',
      unionid: 'mock_unionid_local_admin',
      sessionKey: 'mock_session_key',
      appId: 'wx92924e25093f8f18',
    });
  });

  it('uses configured mock identity when mock mode is explicitly forced', async () => {
    const axiosGetSpy = jest.spyOn(axios, 'get');
    process.env.WECHAT_APP_ID = 'wx92924e25093f8f18';
    process.env.WECHAT_APP_SECRET = 'real-looking-secret';
    process.env.WECHAT_FORCE_MOCK = 'true';
    process.env.WECHAT_MOCK_OPENID = 'mock_openid_local_admin';
    process.env.WECHAT_MOCK_UNIONID = 'mock_unionid_local_admin';

    const service = new WechatService();

    const result = await service.code2Session(
      'runtime-code-from-devtools',
      'wx92924e25093f8f18',
    );

    expect(result.openid).toBe('mock_openid_local_admin');
    expect(result.unionid).toBe('mock_unionid_local_admin');
    expect(axiosGetSpy).not.toHaveBeenCalled();
  });
});

describe('WechatService shipping order APIs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WECHAT_APP_ID: 'wx-live-appid',
      WECHAT_APP_SECRET: 'live-secret',
      WECHAT_FORCE_MOCK: '',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('gets a shipping order with snake_case order query fields', async () => {
    const service = new WechatService();
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        errcode: 0,
        errmsg: 'ok',
        order: {
          transaction_id: '420000123',
          merchant_id: '1900000109',
          order_state: 3,
        },
      },
    });

    const result = await service.getShippingOrder(
      {
        transactionId: '420000123',
        merchantId: '1900000109',
      },
      'wx-live-appid',
    );

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/wxa/sec/order/get_order?access_token=ACCESS_TOKEN',
      {
        transaction_id: '420000123',
        merchant_id: '1900000109',
      },
    );
    expect(result.order?.order_state).toBe(3);
  });

  it('rejects invalid shipping order queries before posting to WeChat', async () => {
    const service = new WechatService();
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    const axiosPostSpy = jest.spyOn(axios, 'post');

    await expect(service.getShippingOrder({} as any)).rejects.toThrow(
      'WeChat shipping order query requires transactionId or merchantId with merchantTradeNo',
    );
    expect(axiosPostSpy).not.toHaveBeenCalled();
  });

  it('treats unchanged shipping upload responses as idempotent success', async () => {
    const service = new WechatService();
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        errcode: 10060023,
        errmsg: '发货信息未更新',
      },
    });

    const result = await service.uploadShippingInfo(
      {
        order_key: {
          order_number_type: 2,
          mchid: '1900000109',
          transaction_id: '420000123',
        },
        logistics_type: 1,
        delivery_mode: 1,
        is_all_delivered: true,
        shipping_list: [
          {
            tracking_no: 'SF123456789',
            express_company: 'SF',
            item_desc: '鲜食套餐',
          },
        ],
        upload_time: '2026-06-14T00:00:00.000+08:00',
        payer: {
          openid: 'payer-openid',
        },
      },
      'wx-live-appid',
    );

    expect(result).toEqual({
      errcode: 10060023,
      errmsg: '发货信息未更新',
    });
  });

  it('checks whether an app is trade managed', async () => {
    const service = new WechatService();
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        errcode: 0,
        errmsg: 'ok',
        is_trade_managed: true,
      },
    });

    const result = await service.isTradeManaged('wx-live-appid');

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/wxa/sec/order/is_trade_managed?access_token=ACCESS_TOKEN',
      { appid: 'wx-live-appid' },
    );
    expect(result.is_trade_managed).toBe(true);
  });

  it('checks whether trade management confirmation is completed', async () => {
    const service = new WechatService();
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        errcode: 0,
        errmsg: 'ok',
        completed: true,
      },
    });

    const result =
      await service.isTradeManagementConfirmationCompleted('wx-live-appid');

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/wxa/sec/order/is_trade_management_confirmation_completed?access_token=ACCESS_TOKEN',
      { appid: 'wx-live-appid' },
    );
    expect(result.completed).toBe(true);
  });
});

describe('WechatService content security APIs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WECHAT_APP_ID: 'wx-live-appid',
      WECHAT_APP_SECRET: 'live-secret',
      WECHAT_FORCE_MOCK: '',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('flags review text reported as risky by WeChat', async () => {
    const service = new WechatService();
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { errcode: 87014, errmsg: 'risky content' },
    });

    await expect(
      service.checkTextContent('风险文本', 'openid-1'),
    ).resolves.toEqual({ safe: false });
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/wxa/msg_sec_check?access_token=ACCESS_TOKEN',
      { content: '风险文本', version: 2, scene: 2, openid: 'openid-1' },
    );
  });
});
