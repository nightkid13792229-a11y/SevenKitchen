import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface WechatUserInfo {
  openid: string;
  unionid?: string;
  sessionKey?: string;
}

interface WechatAccessTokenResponse {
  access_token: string;
  expires_in: number;
  errcode: number;
  errmsg: string;
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
  private accessToken: string | null = null;
  accessTokenExpiresAt: number | null = null;

  constructor() {
    this.appId = process.env.WECHAT_APP_ID || '';
    this.appSecret = process.env.WECHAT_APP_SECRET || '';

    if (!this.appId || !this.appSecret) {
      this.logger.warn(
        'WeChat credentials not configured - Using mock mode for development',
      );
    }
  }

  /**
   * Check if running in mock mode (no WeChat credentials)
   */
  private isMockMode(): boolean {
    // Check if credentials are missing or are placeholder values
    const isPlaceholder =
      this.appId === 'your_wechat_app_id' ||
      this.appSecret === 'your_wechat_app_secret';
    const isMissing = !this.appId || !this.appSecret;
    return isMissing || isPlaceholder;
  }

  /**
   * 通过微信code换取用户openid
   * @param code 微信小程序wx.login()获取的code
   */
  async code2Session(code: string): Promise<WechatUserInfo> {
    // Mock mode for development (when WeChat credentials are not configured)
    if (this.isMockMode()) {
      console.log('[WechatService] ===== MOCK MODE =====');
      console.log(
        '[WechatService] Using mock WeChat authentication for development',
      );
      console.log('[WechatService] appId:', this.appId);
      console.log('[WechatService] appSecret configured:', !!this.appSecret);

      // Generate a consistent mock openid based on the code
      const mockOpenid = `mock_openid_${code.substring(0, 8)}`;
      console.log('[WechatService] Generated mock openid:', mockOpenid);

      const result = {
        openid: mockOpenid,
        unionid: `mock_unionid_${code.substring(0, 8)}`,
        sessionKey: 'mock_session_key',
      };

      console.log('[WechatService] Returning mock result:', result);
      return result;
    }

    // Production mode with real WeChat API
    const url = 'https://api.weixin.qq.com/sns/jscode2session';
    const params = {
      appid: this.appId,
      secret: this.appSecret,
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
      };
    } catch (error) {
      this.logger.error('Failed to get WeChat session:', error);
      throw new Error('Failed to authenticate with WeChat');
    }
  }

  /**
   * 获取微信access_token（用于调用微信API）
   */
  async getAccessToken(): Promise<string> {
    // 检查缓存是否有效
    if (
      this.accessToken &&
      this.accessTokenExpiresAt &&
      Date.now() < this.accessTokenExpiresAt
    ) {
      return this.accessToken;
    }

    const url = 'https://api.weixin.qq.com/cgi-bin/token';
    const params = {
      grant_type: 'client_credential',
      appid: this.appId,
      secret: this.appSecret,
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
      this.accessToken = data.access_token;
      this.accessTokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;

      return this.accessToken;
    } catch (error) {
      this.logger.error('Failed to get WeChat access token:', error);
      throw new Error('Failed to get WeChat access token');
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
