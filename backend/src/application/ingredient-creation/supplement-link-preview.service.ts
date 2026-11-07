import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig
} from '../nutrition-governance/agent-provider-config.service';
import { INGREDIENT_INTAKE_AGENT_PURPOSE } from './ingredient-creation-intake.service';
import {
  extractServingUnits,
  parseSupplementLabel,
  type ParsedNutrient
} from '../../domain/ingredient/supplement-label-parser';

/**
 * 贴一个商品链接，把它读成补剂档案的初稿。
 *
 * 三条硬规矩：
 * 1. **只走已有的抓取代理**（`r.jina.ai`），不自己直连电商——直连 iHerb 是 403。
 * 2. **只认白名单里的电商域名**，别把服务变成任意 URL 的抓取器。
 * 3. **读不出来的东西留空**，不猜；把认不出的行原样交回去让人补。
 */
const ALLOWED_HOSTS = ['iherb.com', 'taobao.com', 'tmall.com', 'jd.com'];
/**
 * 抓取走 DeepSeek 官方的 Search / Fetch 套件。
 *
 * 换掉原来的 r.jina.ai：国内生产环境连不上那个域名（DNS 被劫持，直连超时），
 * 而 api.deepseek.com 是通的——同一个 key、同一份配置，不用额外申请。
 */
const FETCH_TIMEOUT_MS = 25_000;
const MAX_BODY_CHARS = 400_000;
/** 交给前端展示的标签原文长度：够核对，不撑爆页面。 */
const LABEL_TEXT_LIMIT = 4000;

export interface LinkPreviewNutrient {
  fieldPath: string;
  value: number;
  unit: string;
  rawName: string;
}

export interface SupplementCandidate {
  url: string;
  name: string;
  /** 商品页上的标价（美元），读不到就是 null */
  priceUsd: number | null;
  /** 每份折算价（美元），读不到就是 null */
  pricePerServingUsd: number | null;
}

export interface SupplementLinkPreview {
  productUrl: string;
  productName: string | null;
  servingUnitsPerDose: number | null;
  nutrients: LinkPreviewNutrient[];
  /** 有数值但认不出名字的行，原样返回让人补 */
  unrecognized: string[];
  labelText: string | null;
}

@Injectable()
export class SupplementLinkPreviewService {
  constructor(private readonly providerConfig: AgentProviderConfigService) {}

  async preview(url: string): Promise<SupplementLinkPreview> {
    const target = this.assertAllowed(url);
    const text = await this.fetchThroughProxy(target);

    const parsed = parseSupplementLabel(text);
    return {
      productUrl: target.toString(),
      productName: this.extractProductName(text),
      servingUnitsPerDose: extractServingUnits(text),
      nutrients: parsed.nutrients.map(
        (nutrient: ParsedNutrient): LinkPreviewNutrient => ({
          fieldPath: nutrient.fieldPath,
          value: nutrient.value,
          unit: nutrient.unit,
          rawName: nutrient.rawName
        })
      ),
      unrecognized: parsed.unrecognized,
      labelText: this.extractLabelText(text)
    };
  }

  /**
   * 按关键词去 iHerb 搜一圈，把候选捞出来。
   *
   * 只捞「链接 + 名字 + 标价」——成分表要逐个商品页去读（`preview`），
   * 搜索页上没有。捞不到就返回空数组，不硬凑。
   */
  async searchCandidates(keyword: string, limit = 8): Promise<SupplementCandidate[]> {
    const query = keyword.trim();
    if (!query) {
      return [];
    }
    const runtime = await this.loadRuntime();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${runtime.baseUrl.replace(/\/+$/, '')}/tools/search`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${runtime.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            // 只搜 iHerb 站内，别把别家的链接混进来
            query: `site:iherb.com ${query}`,
            count: Math.max(1, Math.min(limit, 20)),
            need_content: false
          })
        }
      );
      if (!response.ok) {
        throw new BadRequestException(`搜索失败（${response.status}），可以手动填或贴链接`);
      }
      const payload = (await response.json()) as {
        results?: { title?: unknown; url?: unknown }[];
      };
      const results = Array.isArray(payload.results) ? payload.results : [];
      return results
        .filter((item) => typeof item.url === 'string' && item.url.includes('iherb.com/'))
        .slice(0, Math.max(1, limit))
        .map((item) => ({
          url: String(item.url),
          name: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : String(item.url),
          // 搜索接口不返回价格：宁可空着，也不要编一个
          priceUsd: null,
          pricePerServingUsd: null
        }));
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('搜索失败（可能超时），可以手动填或贴链接');
    } finally {
      clearTimeout(timer);
    }
  }

  /** 搜索页每行是 `[](商品链接 "商品名")`，价格跟在后面几行。 */
  parseCandidates(text: string): SupplementCandidate[] {
    const lines = text.split(/\r?\n/);
    const results: SupplementCandidate[] = [];
    const seen = new Set<string>();

    for (let index = 0; index < lines.length; index += 1) {
      const match = lines[index].match(
        /\[\]\((https:\/\/www\.iherb\.com\/pr\/[^)\s"]+)\s+"([^"]+)"\)/
      );
      if (!match) {
        continue;
      }
      const [, url, title] = match;
      // 同一商品在页面上会出现好几次（图、标题、评价数），只收第一次
      if (seen.has(url) || /\/5 - /.test(title)) {
        continue;
      }
      seen.add(url);

      let priceUsd: number | null = null;
      let pricePerServingUsd: number | null = null;
      for (let probe = index; probe < Math.min(index + 20, lines.length); probe += 1) {
        const price = lines[probe].match(/\$([\d.]+)\s*\(\$([\d.]+)\/serving\)/);
        if (price) {
          priceUsd = Number(price[1]);
          pricePerServingUsd = Number(price[2]);
          break;
        }
      }

      results.push({ url, name: title.trim(), priceUsd, pricePerServingUsd });
    }

    return results;
  }

  private assertAllowed(raw: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new BadRequestException('这不像一个商品链接');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('只支持 http / https 链接');
    }
    // 复制来的链接常带 #reviews 之类，没必要连同锚点一起转给抓取通道
    parsed.hash = '';
    const host = parsed.hostname.toLowerCase();
    const allowed = ALLOWED_HOSTS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
    if (!allowed) {
      throw new BadRequestException(
        '这个网站还不支持自动读，请手动填，或换成 iHerb / 淘宝 / 京东 的链接'
      );
    }
    return parsed;
  }

  private async fetchThroughProxy(target: URL): Promise<string> {
    const runtime = await this.loadRuntime();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${runtime.baseUrl.replace(/\/+$/, '')}/tools/fetch`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${runtime.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: target.toString() })
        }
      );
      if (!response.ok) {
        throw new BadRequestException(
          `这个链接读不出来（${response.status}），可以换成手动填`
        );
      }
      const payload = (await response.json()) as { content?: unknown };
      const content = typeof payload.content === 'string' ? payload.content : '';
      if (!content.trim()) {
        throw new BadRequestException('这个链接读不到内容，可以换成手动填');
      }
      return content.slice(0, MAX_BODY_CHARS);
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        '这个链接读不出来（可能被挡或超时），可以换成手动填'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async loadRuntime(): Promise<DeepSeekRuntimeConfig> {
    try {
      return await this.providerConfig.getEnabledDeepSeekRuntimeConfig({
        purpose: INGREDIENT_INTAKE_AGENT_PURPOSE,
        fallbackToDefault: false
      });
    } catch {
      // 没有模型配置=抓取通道不可用：按"读不出来"报，别把内部配置错误漏给页面
      throw new BadRequestException('抓取通道不可用，可以换成手动填');
    }
  }

  /**
   * 抓取通道对"目标页 404 / 需要登录"也回 200，只在头部写一行 Warning/Final URL。
   * 不认这两行的话，站长会看到"读到了"，拿到的却是一张空表。
   */
  private assertProxyDelivered(body: string, target: URL): void {
    const header = body.slice(0, 2000);

    const warning = header.match(/^Warning:\s*(.+)$/im);
    if (warning) {
      throw new BadRequestException(
        `这个链接读不出来：${warning[1].trim()}。可以换成手动填`
      );
    }

    const finalUrl = header.match(/^Final URL:\s*(\S+)/im);
    if (finalUrl) {
      const strip = (host: string) => host.toLowerCase().replace(/^www\./, '');
      let finalHost = '';
      try {
        finalHost = strip(new URL(finalUrl[1]).hostname);
      } catch {
        finalHost = '';
      }
      // 只认「同一个站点」：`item.taobao.com` 跳到 `login.taobao.com` 也是同一域名，
      // 但那是登录墙，读到的不是商品页，必须拒。
      const requestedHost = strip(target.hostname);
      const sameSite = finalHost === requestedHost || finalHost.endsWith(`.${requestedHost}`);
      if (!sameSite) {
        throw new BadRequestException(
          '这个链接跳到了别的页面（多半是要登录或已下架），读不到标签，请手动填'
        );
      }
    }
  }

  /** 商品名取页面的第一个一级标题；没有就留空，不从正文猜。 */
  private extractProductName(text: string): string | null {
    const match = text.match(/^#\s+(.+)$/m);
    return match ? match[1].replace(/\*\*/g, '').trim().slice(0, 200) : null;
  }

  /** 把成分表那一小段原文交回去，方便人对着核。 */
  private extractLabelText(text: string): string | null {
    const index = text.search(/supplement\s*facts/i);
    if (index === -1) {
      return null;
    }
    return text.slice(index, index + LABEL_TEXT_LIMIT).trim();
  }
}
