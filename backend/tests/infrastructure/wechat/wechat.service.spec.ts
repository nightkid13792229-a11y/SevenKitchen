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
