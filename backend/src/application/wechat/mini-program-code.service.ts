import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';

/**
 * 小程序码（2026-10-18）
 *
 * ## 为什么要有它
 *
 * 长图底部要放一个二维码，扫了进小程序首页。
 * 一开始的方案是"老板从微信后台下载一张静态图放进 `static/`" ——
 * 但那要求人去做一件机器能做的事，而且**装不进代码仓库就没法上线**。
 *
 * 微信提供了 `wxacode.getUnlimited` 接口，**服务端可以直接生成**。
 * 生成一次存到 COS，之后所有人用同一个地址 —— 不需要任何人工步骤。
 *
 * ## 为什么缓存
 *
 * 小程序码本身**不会变**（`scene` 固定、`page` 固定）。
 * 每次请求都去调微信的话：慢、而且微信对调用次数有配额。
 * 所以内存里记住 COS 地址，进程重启才会重新生成一次。
 */
@Injectable()
export class MiniProgramCodeService {
  private readonly logger = new Logger(MiniProgramCodeService.name);

  /** 生成好的 COS 地址（进程内缓存） */
  private cachedUrl: string | null = null;
  /** 防止并发时重复生成（同一个进程里同时来了 10 个请求） */
  private inFlight: Promise<string> | null = null;

  constructor(
    private readonly wechatService: WechatService,
    private readonly cosService: TencentCosService,
  ) {}

  /**
   * 拿小程序码地址；没有就生成一次。
   *
   * 失败**抛错**（不返回 null）—— 调用方是"要不要画这块"的决策者，
   * 它需要区分"没有码"和"取码失败"。
   */
  async getCodeUrl(): Promise<string> {
    if (this.cachedUrl) return this.cachedUrl;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.generateAndStore().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  /** 只查缓存，不触发生成（长图渲染时用来"能画就画"） */
  getCachedUrl(): string | null {
    return this.cachedUrl;
  }

  private async generateAndStore(): Promise<string> {
    const accessToken = await this.wechatService.getAccessToken();

    /**
     * `scene` 是扫码后带进来的参数。
     *
     * 这里用 `home` —— 老板定的是"扫了跳小程序首页"，
     * 交付内容是私密的，陌生人扫码不该看到别人的食谱。
     * 首页不依赖任何参数，所以 scene 只是占位（微信要求必填，最长 32 字符）。
     */
    const url = `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${accessToken}`;

    const response = await axios.post(
      url,
      {
        scene: 'home',
        page: 'pages/index/index',
        // 页面必须已发布才校验通过；开发/体验期传 false 避免生成失败
        check_path: false,
        // 正式版；体验版是 trial，开发版是 develop
        env_version: 'release',
        width: 430,
        auto_color: false,
        line_color: { r: 0, g: 0, b: 0 },
        is_hyaline: false,
      },
      { responseType: 'arraybuffer' },
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);

    /**
     * ⚠️ 微信这个接口**成功返回图片二进制、失败返回 JSON**，
     * 而两者的 content-type 都可能是 `application/json`（图片时是 image/jpeg）。
     *
     * 所以不能只看状态码 —— 要看内容开头是不是 `{`。
     * 是的话说明返回的是 `{"errcode":...}`，必须把 errmsg 报出来，
     * 否则会得到一张"内容是错误 JSON 的图片"，上传 COS 后变成一张打不开的图。
     */
    const head = buffer.subarray(0, 1).toString();
    if (head === '{') {
      let detail = '';
      try {
        const parsed = JSON.parse(buffer.toString());
        detail = `${parsed.errcode} - ${parsed.errmsg}`;
      } catch {
        detail = '无法解析的错误响应';
      }
      this.logger.error(`[miniapp-code] 微信返回错误：${detail}`);
      throw new Error(`生成小程序码失败：${detail}`);
    }

    if (buffer.length === 0) {
      throw new Error('生成小程序码失败：返回内容为空');
    }

    const uploaded = await this.cosService.uploadImage(
      buffer,
      'miniapp-code.png',
      'static',
    );

    this.cachedUrl = uploaded.url;
    this.logger.log(`[miniapp-code] 已生成并缓存：${uploaded.url}`);
    return uploaded.url;
  }
}
