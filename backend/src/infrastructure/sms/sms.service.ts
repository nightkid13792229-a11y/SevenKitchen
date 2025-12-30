import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * 短信验证码服务
 * 支持阿里云、腾讯云等短信服务商
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private redis: Redis | null = null;
  private readonly CODE_EXPIRY = 300; // 5分钟
  private readonly CODE_LENGTH = 6;

  constructor() {
    // 初始化Redis（如果配置了）
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl);
        this.logger.log('Redis connected for SMS service');
      } catch (error) {
        this.logger.warn('Failed to connect to Redis, using in-memory storage');
      }
    }
  }

  /**
   * 发送短信验证码
   * @param phone 手机号
   * @returns 验证码过期时间（秒）
   */
  async sendVerificationCode(phone: string): Promise<number> {
    // 1. 检查发送频率限制（60秒内只能发送一次）
    const rateLimitKey = `sms:rate:${phone}`;
    const lastSentTime = await this.getFromStorage(rateLimitKey);

    if (lastSentTime && Date.now() - parseInt(lastSentTime) < 60000) {
      throw new Error('发送过于频繁，请60秒后再试');
    }

    // 2. 生成6位随机验证码
    const code = this.generateCode();

    // 3. 存储验证码（5分钟有效期）
    const codeKey = `sms:code:${phone}`;
    await this.setToStorage(codeKey, code, this.CODE_EXPIRY);

    // 4. 记录发送时间（用于频率限制）
    await this.setToStorage(rateLimitKey, Date.now().toString(), 60);

    // 5. 调用短信服务商API发送验证码
    // TODO: 实际生产环境需要对接真实的短信服务
    // await this.sendSmsViaProvider(phone, code);

    // 开发环境：打印验证码到日志
    this.logger.log(`[SMS] Verification code for ${phone}: ${code} (valid for ${this.CODE_EXPIRY}s)`);

    return this.CODE_EXPIRY;
  }

  /**
   * 验证验证码
   * @param phone 手机号
   * @param code 验证码
   * @returns 是否验证成功
   */
  async verifyCode(phone: string, code: string): Promise<boolean> {
    const codeKey = `sms:code:${phone}`;
    const storedCode = await this.getFromStorage(codeKey);

    if (!storedCode) {
      throw new Error('验证码不存在或已过期');
    }

    if (storedCode !== code) {
      throw new Error('验证码错误');
    }

    // 验证成功后删除验证码（一次性使用）
    await this.deleteFromStorage(codeKey);

    return true;
  }

  /**
   * 生成随机验证码
   */
  private generateCode(): string {
    let code = '';
    for (let i = 0; i < this.CODE_LENGTH; i++) {
      code += Math.floor(Math.random() * 10);
    }
    return code;
  }

  /**
   * Redis/内存存储辅助方法
   */
  private async getFromStorage(key: string): Promise<string | null> {
    if (this.redis) {
      const value = await this.redis.get(key);
      return value;
    }

    // 内存存储fallback
    const memoryStore = global.smsMemoryStore || (global.smsMemoryStore = new Map());
    const item = memoryStore.get(key);
    if (item && item.expiry > Date.now()) {
      return item.value;
    }
    if (item) {
      memoryStore.delete(key);
    }
    return null;
  }

  private async setToStorage(key: string, value: string, ttl: number): Promise<void> {
    if (this.redis) {
      await this.redis.setex(key, ttl, value);
      return;
    }

    // 内存存储fallback
    const memoryStore = global.smsMemoryStore || (global.smsMemoryStore = new Map());
    memoryStore.set(key, {
      value,
      expiry: Date.now() + ttl * 1000,
    });

    // 自动清理过期数据
    setTimeout(() => {
      const item = memoryStore.get(key);
      if (item && item.expiry <= Date.now()) {
        memoryStore.delete(key);
      }
    }, ttl * 1000);
  }

  private async deleteFromStorage(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
      return;
    }

    const memoryStore = global.smsMemoryStore;
    if (memoryStore) {
      memoryStore.delete(key);
    }
  }

  /**
   * 清理资源（模块销毁时调用）
   */
  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// 声明全局内存存储类型
declare global {
  var smsMemoryStore: Map<string, { value: string; expiry: number }> | undefined;
}
