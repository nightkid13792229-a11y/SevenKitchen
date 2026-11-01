/**
 * DeepSeek 官方 Web Search 客户端（只做搜索，不做抓取）。
 *
 * 取代原来用 DuckDuckGo 做“发现”的通道：生产服务器连不上 DuckDuckGo，
 * 导致线上兜底永远返回 0，看起来像“线上没有”。DeepSeek 的 `/v1/tools/search`
 * 与模型同一个域名、同一个 Key，网络可达。
 *
 * 只负责：请求、超时、有限重试、把返回体归一化成 `{title,url,summary}`。
 * 白名单过滤与页面抓取仍由 `TrustedNutritionWebSearchService` 负责。
 */
export interface WebSearchItem {
  title: string;
  url: string;
  summary: string;
}

export interface WebSearchResult {
  query: string;
  results: WebSearchItem[];
}

export interface WebSearchPort {
  search(input: {
    query: string;
    count?: number;
  }): Promise<WebSearchResult>;
}

export interface DeepSeekWebSearchOptions {
  baseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
  retryCount?: number;
}

const SEARCH_PATH = '/tools/search';
const DEFAULT_RETRY_COUNT = 2;
const MAX_ATTEMPTS = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveApiBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function readString(entry: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function readEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of ['results', 'items', 'value']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  const data = payload.data;
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of ['results', 'items', 'value']) {
      if (Array.isArray(data[key])) return data[key] as unknown[];
    }
  }
  return [];
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class DeepSeekWebSearchClient implements WebSearchPort {
  private readonly apiBase: string;
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private readonly retryCount: number;

  constructor(options: DeepSeekWebSearchOptions) {
    this.apiBase = resolveApiBase(options.baseUrl);
    this.apiKey = options.apiKey;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  }

  async search(input: {
    query: string;
    count?: number;
  }): Promise<WebSearchResult> {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) {
      throw new Error('搜索词不能为空。');
    }
    if (!this.apiBase || !this.apiKey) {
      throw new Error('DeepSeek 搜索未配置。');
    }

    const body: Record<string, unknown> = { query };
    if (input.count !== undefined) {
      body.count = input.count;
    }

    const payload = await this.request(`${this.apiBase}${SEARCH_PATH}`, body);
    return { query, results: normalizeResults(payload) };
  }

  /** 网络错误 / 429 / 5xx 重试；超时立即失败。 */
  private async request(
    url: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const maxAttempts = Math.min(this.retryCount + 1, MAX_ATTEMPTS);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

      try {
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify(body),
          });
        } catch {
          if (attempt < maxAttempts) continue;
          throw new Error('网页搜索失败：网络错误');
        }

        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < maxAttempts) {
            continue;
          }
          throw new Error(`网页搜索失败：HTTP ${response.status}`);
        }

        return (await response.json()) as unknown;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error('网页搜索失败：网络错误');
  }
}

function normalizeResults(payload: unknown): WebSearchItem[] {
  const results: WebSearchItem[] = [];
  for (const entry of readEntries(payload)) {
    if (!isRecord(entry)) continue;
    const url = readString(entry, [
      'url',
      'link',
      'href',
      'sourceUrl',
      'source_url',
      'displayUrl',
      'display_url',
    ]);
    if (!url) continue;
    results.push({
      title: readString(entry, ['title', 'name', 'headline', 'pageTitle']),
      url,
      summary: readString(entry, [
        'summary',
        'snippet',
        'description',
        'abstract',
      ]),
    });
  }
  return results;
}
