import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface WechatUserInfo {
  openid: string;
  unionid?: string;
  sessionKey?: string;
  appId?: string;
}

interface WechatAccessTokenResponse {
  access_token: string;
  expires_in: number;
  errcode: number;
  errmsg: string;
}

interface WechatPhoneNumberResponse {
  errcode: number;
  errmsg: string;
  phone_info?: {
    phoneNumber?: string;
    purePhoneNumber?: string;
    countryCode?: string;
  };
}

interface WechatAppConfig {
  appId: string;
  appSecret: string;
  label: string;
}

interface SubscriptionMessageData {
  [key: string]: {
    value: string;
  };
}

interface SendSubscriptionMessageParams {
  touser: string;
  template_id: string;
  page?: string;
  data: SubscriptionMessageData;
}

interface SendSubscriptionMessageResponse {
  errcode: number;
  errmsg: string;
  msgid: string;
}

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly appConfigs: WechatAppConfig[];
  private readonly accessTokenCache = new Map<
    string,
    { token: string; expiresAt: number }
  >();
  private accessToken: string | null = null;
  accessTokenExpiresAt: number | null = null;

  constructor() {
    this.appId = process.env.WECHAT_APP_ID || '';
    this.appSecret = process.env.WECHAT_APP_SECRET || '';
    this.appConfigs = this.loadAppConfigs();

    if (this.appConfigs.length === 0) {
      this.logger.warn(
        'WeChat credentials not configured - Using mock mode for development',
      );
    }
  }

  getPrimaryAppId(): string {
    return this.appConfigs[0]?.appId || this.appId;
  }

  private loadAppConfigs(): WechatAppConfig[] {
    const configs: WechatAppConfig[] = [];
    const addConfig = (
      appId: string | undefined,
      appSecret: string | undefined,
      label: string,
    ) => {
      const normalizedAppId = (appId || '').trim();
      const normalizedSecret = (appSecret || '').trim();
      if (!normalizedAppId || !normalizedSecret) return;
      if (configs.some((item) => item.appId === normalizedAppId)) return;
      configs.push({
        appId: normalizedAppId,
        appSecret: normalizedSecret,
        label,
      });
    };

    addConfig(
      process.env.WECHAT_APP_ID,
      process.env.WECHAT_APP_SECRET,
      'primary',
    );
    addConfig(
      process.env.WECHAT_LEGACY_APP_ID,
      process.env.WECHAT_LEGACY_APP_SECRET,
      'legacy',
    );
    addConfig(
      process.env.WECHAT_OLD_APP_ID,
      process.env.WECHAT_OLD_APP_SECRET,
      'legacy',
    );

    return configs;
  }

  /**
   * Check if running in mock mode (no WeChat credentials)
   */
  private isMockMode(): boolean {
    // Check if credentials are missing or are placeholder values
    const isPlaceholder =
      this.appConfigs.length === 0 ||
      this.appConfigs.every(
        (config) =>
          config.appId === 'your_wechat_app_id' ||
          config.appSecret === 'your_wechat_app_secret' ||
          config.appId === 'local_wechat_app_id' ||
          config.appSecret === 'local_wechat_app_secret' ||
          config.appId === 'touristappid',
      );
    const isMissing = this.appConfigs.length === 0;
    return isMissing || isPlaceholder;
  }

  private getAppConfig(appId?: string): WechatAppConfig {
    if (this.isMockMode()) {
      return {
        appId: appId || this.appId || 'mock_appid',
        appSecret: this.appSecret || 'mock_secret',
        label: 'mock',
      };
    }

    const config = appId
      ? this.appConfigs.find((item) => item.appId === appId)
      : this.appConfigs[0];

    if (!config) {
      throw new Error(
        appId
          ? `WeChat credentials not configured for AppID: ${appId}`
          : 'WeChat credentials not configured',
      );
    }

    return config;
  }

  /**
   * 通过微信code换取用户openid
   * @param code 微信小程序wx.login()获取的code
   */
  async code2Session(code: string, appId?: string): Promise<WechatUserInfo> {
    // Mock mode for development (when WeChat credentials are not configured)
    if (this.isMockMode()) {
      console.log('[WechatService] ===== MOCK MODE =====');
      console.log(
        '[WechatService] Using mock WeChat authentication for development',
      );
      console.log('[WechatService] appId:', appId || this.appId);
      console.log('[WechatService] appSecret configured:', !!this.appSecret);

      // Generate a consistent mock openid based on the code
      const mockOpenid = `mock_openid_${code.substring(0, 8)}`;
      console.log('[WechatService] Generated mock openid:', mockOpenid);

      const result = {
        openid: mockOpenid,
        unionid: `mock_unionid_${code.substring(0, 8)}`,
        sessionKey: 'mock_session_key',
        appId: appId || this.appId || 'mock_appid',
      };

      console.log('[WechatService] Returning mock result:', result);
      return result;
    }

    const configs = appId ? [this.getAppConfig(appId)] : this.appConfigs;
    let lastError: unknown = null;
    for (const config of configs) {
      try {
        return await this.code2SessionWithConfig(code, config);
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Failed to get WeChat session with ${config.label} AppID ${config.appId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.error('Failed to get WeChat session:', lastError);
    throw new Error('Failed to authenticate with WeChat');
  }

  private async code2SessionWithConfig(
    code: string,
    config: WechatAppConfig,
  ): Promise<WechatUserInfo> {
    const url = 'https://api.weixin.qq.com/sns/jscode2session';
    const params = {
      appid: config.appId,
      secret: config.appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    };

    try {
      const response = await axios.get(url, { params });
      const data = response.data;

      if (data.errcode) {
        throw new Error(`WeChat API error: ${data.errcode} - ${data.errmsg}`);
      }

      return {
        openid: data.openid,
        unionid: data.unionid,
        sessionKey: data.session_key,
        appId: config.appId,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 获取微信access_token（用于调用微信API）
   */
  async getAccessToken(appId?: string): Promise<string> {
    const config = this.getAppConfig(appId);
    const cached = this.accessTokenCache.get(config.appId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    // 检查缓存是否有效
    if (
      !appId &&
      this.accessToken &&
      this.accessTokenExpiresAt &&
      Date.now() < this.accessTokenExpiresAt
    ) {
      return this.accessToken;
    }

    const url = 'https://api.weixin.qq.com/cgi-bin/token';
    const params = {
      grant_type: 'client_credential',
      appid: config.appId,
      secret: config.appSecret,
    };

    try {
      const response = await axios.get<WechatAccessTokenResponse>(url, {
        params,
      });
      const data = response.data;

      if (data.errcode) {
        throw new Error(
          `Failed to get access token: ${data.errcode} - ${data.errmsg}`,
        );
      }

      // 缓存access_token（提前5分钟过期）
      const expiresAt = Date.now() + (data.expires_in - 300) * 1000;
      this.accessTokenCache.set(config.appId, {
        token: data.access_token,
        expiresAt,
      });
      if (!appId || appId === this.appId) {
        this.accessToken = data.access_token;
        this.accessTokenExpiresAt = expiresAt;
      }

      return data.access_token;
    } catch (error) {
      this.logger.error('Failed to get WeChat access token:', error);
      throw new Error('Failed to get WeChat access token');
    }
  }

  async getPhoneNumber(
    code: string,
    appId?: string,
  ): Promise<{
    phoneNumber: string;
    purePhoneNumber?: string;
    countryCode?: string;
  }> {
    if (this.isMockMode()) {
      return {
        phoneNumber: '13800000000',
        purePhoneNumber: '13800000000',
        countryCode: '86',
      };
    }

    const config = this.getAppConfig(appId);
    const accessToken = await this.getAccessToken(config.appId);
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;

    try {
      const response = await axios.post<WechatPhoneNumberResponse>(url, {
        code,
      });
      const data = response.data;

      if (data.errcode !== 0) {
        throw new Error(
          `Failed to get phone number: ${data.errcode} - ${data.errmsg}`,
        );
      }

      const phoneNumber = data.phone_info?.phoneNumber;
      if (!phoneNumber) {
        throw new Error('WeChat did not return phone number');
      }

      return {
        phoneNumber,
        purePhoneNumber: data.phone_info?.purePhoneNumber,
        countryCode: data.phone_info?.countryCode,
      };
    } catch (error) {
      this.logger.error('Failed to get WeChat phone number:', error);
      throw new Error('Failed to get WeChat phone number');
    }
  }

  /**
   * 发送微信订阅消息
   * @param params 订阅消息参数
   */
  async sendSubscriptionMessage(
    params: SendSubscriptionMessageParams,
  ): Promise<{ success: boolean; msgid?: string; error?: string }> {
    // Mock mode for development
    if (this.isMockMode()) {
      this.logger.log('===== MOCK MODE - Sending Subscription Message =====');
      this.logger.log('To user:', params.touser);
      this.logger.log('Template ID:', params.template_id);
      this.logger.log('Page:', params.page || 'N/A');
      this.logger.log('Data:', JSON.stringify(params.data, null, 2));

      return {
        success: true,
        msgid: `mock_msgid_${Date.now()}`,
      };
    }

    // Production mode with real WeChat API
    try {
      const accessToken = await this.getAccessToken();
      const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;

      const response = await axios.post<SendSubscriptionMessageResponse>(
        url,
        params,
      );
      const data = response.data;

      if (data.errcode === 0) {
        this.logger.log(
          `Subscription message sent successfully to ${params.touser}, msgid: ${data.msgid}`,
        );
        return {
          success: true,
          msgid: data.msgid,
        };
      } else {
        this.logger.error(
          `Failed to send subscription message: ${data.errcode} - ${data.errmsg}`,
        );
        return {
          success: false,
          error: `${data.errcode} - ${data.errmsg}`,
        };
      }
    } catch (error) {
      this.logger.error('Failed to send subscription message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 发送定制食谱订单状态通知
   * @param openid 用户openid
   * @param orderId 订单号
   * @param status 订单状态
   * @param recipeId 食谱ID (已交付时)
   */
  async sendCustomRecipeOrderNotification(
    openid: string,
    orderId: string,
    status: string,
    recipeId?: string,
  ): Promise<{ success: boolean; msgid?: string; error?: string }> {
    const templateId = process.env.WECHAT_TEMPLATE_CUSTOM_RECIPE_ORDER || '';

    if (!templateId) {
      this.logger.warn(
        'WeChat template ID for custom recipe order not configured',
      );
      return { success: false, error: 'Template ID not configured' };
    }

    const statusTextMap: Record<string, string> = {
      PAID: '已付款',
      IN_PROGRESS: '制作中',
      DELIVERED: '已交付',
    };

    const statusText = statusTextMap[status] || status;

    const data: SubscriptionMessageData = {
      thing1: { value: orderId.substring(0, 20) }, // 订单号
      thing2: { value: statusText }, // 订单状态
    };

    // 如果是已交付状态，添加食谱ID
    if (status === 'DELIVERED' && recipeId) {
      data.thing3 = { value: '您的定制食谱已 ready' };
    } else {
      data.thing3 = { value: '我们会尽快完成' };
    }

    return this.sendSubscriptionMessage({
      touser: openid,
      template_id: templateId,
      page:
        status === 'DELIVERED' && recipeId
          ? `pages/recipe-detail/index?id=${recipeId}`
          : `pages/custom-recipe/orders`,
      data,
    });
  }
}
