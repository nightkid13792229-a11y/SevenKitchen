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
      this.logger.warn('WeChat credentials not configured');
    }
  }

  /**
   * 通过微信code换取用户openid
   * @param code 微信小程序wx.login()获取的code
   */
  async code2Session(code: string): Promise<WechatUserInfo> {
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
    if (this.accessToken && this.accessTokenExpiresAt && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const url = 'https://api.weixin.qq.com/cgi-bin/token';
    const params = {
      grant_type: 'client_credential',
      appid: this.appId,
      secret: this.appSecret,
    };

    try {
      const response = await axios.get<WechatAccessTokenResponse>(url, { params });
      const data = response.data;

      if (data.errcode) {
        throw new Error(`Failed to get access token: ${data.errcode} - ${data.errmsg}`);
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
}
