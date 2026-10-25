/**
 * DeepSeek 官方 Web Search / Fetch 工具。
 *
 * 产品边界（2026-10 决策）：**研究免费，数据有界**。
 * - AI 可以联网查时令、库外食材、补剂替代、烹饪/法规背景；
 * - 不设意图黑名单、域名白名单、关键词黑名单、摘要-only 或单轮搜索次数上限；
 * - 官方营养数据仍然只能来自标准原料库，联网内容只作背景参考。
 *
 * 安全边界：
 * - `web_fetch` 只把**校验过的 URL** 交给 DeepSeek 的 Fetch API，本地不抓页面；
 * - 校验 http/https、禁止 URL 凭据、拒绝 localhost/.local、解析 DNS 后拒绝
 *   私有/保留 IPv4、IPv6（含 IPv4-mapped、6to4、NAT64 等嵌入形式）；
 * - 上游错误只返回安全文案，不把响应体（可能含内部信息）透给模型；
 * - 网页正文是不可信数据，长度上限 40k 字符，超长明确标注截断。
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import type { AgentToolErrorCode } from './agent-types';

const SEARCH_PATH = '/tools/search';
const FETCH_PATH = '/tools/fetch';

/** 单次 fetch 返回给模型的正文字符上限。 */
export const MAX_WEB_FETCH_CONTENT_CHARS = 40_000;
const TRUNCATION_NOTE = `\n\n[内容已截断：仅保留前 ${MAX_WEB_FETCH_CONTENT_CHARS} 字符]`;

/** 默认重试次数（与 AgentProviderConfig 的默认 retryCount 一致）。 */
const DEFAULT_RETRY_COUNT = 2;
/** 网络/429/5xx 的最大总尝试次数。 */
const MAX_ATTEMPTS = 3;

export type AgentWebSearchResultItem = {
  title: string;
  url: string;
  summary: string;
  content?: string;
  publishedAt?: string | null;
};

export interface AgentWebSearchResult {
  query: string;
  results: AgentWebSearchResultItem[];
}

export interface AgentWebFetchResult {
  url: string;
  title?: string | null;
  content: string;
}

export interface AgentWebSearchInput {
  query: string;
  count?: number;
  needContent?: boolean;
}

export interface AgentWebFetchInput {
  url: string;
}

/** 联网读端口；read-tools 只依赖这个接口。 */
export interface RecipeAgentWebPort {
  search(input: AgentWebSearchInput): Promise<AgentWebSearchResult>;
  fetch(input: AgentWebFetchInput): Promise<AgentWebFetchResult>;
}

/** 联网工具可返回的错误码；都已在 `AgentToolErrorCode` 里登记。 */
export type RecipeAgentWebErrorCode = Extract<
  AgentToolErrorCode,
  'INVALID_ARGUMENT' | 'WEB_SEARCH_FAILED' | 'WEB_FETCH_FAILED'
>;

/** 端口层带错误码的异常；read-tools 据此原样保留错误码。 */
export class RecipeAgentWebError extends Error {
  constructor(
    public readonly code: RecipeAgentWebErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecipeAgentWebError';
  }
}

/**
 * DNS 解析函数。默认用 `node:dns/promises`；测试可注入固定结果，
 * 避免真的联网。
 */
export type WebDnsLookup = (
  hostname: string,
) => Promise<ReadonlyArray<{ address: string }>>;

export interface DeepSeekWebToolsOptions {
  baseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
  /** 重试次数；最终总尝试次数不超过 3 次。 */
  retryCount?: number;
  /** 测试注入点；生产环境不传。 */
  lookup?: WebDnsLookup;
}

type WebFailureCode = 'WEB_SEARCH_FAILED' | 'WEB_FETCH_FAILED';

const defaultLookup: WebDnsLookup = async (hostname) => {
  const entries = await dnsLookup(hostname, { all: true });
  return entries.map((entry) => ({ address: entry.address }));
};

/**
 * DeepSeek 官方 Web Search / Fetch 客户端。
 *
 * 不继承任何模型调用类：它只负责两个 HTTP 端点、重试、解析和 fetch 的
 * SSRF 预校验。是否允许联网由运行时是否注入 `RecipeAgentWebPort` 决定。
 */
export class DeepSeekWebTools implements RecipeAgentWebPort {
  private readonly apiBase: string;
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private readonly retryCount: number;
  private readonly lookup: WebDnsLookup;

  constructor(options: DeepSeekWebToolsOptions) {
    this.apiBase = resolveApiBase(options.baseUrl);
    this.apiKey = options.apiKey;
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
    this.lookup = options.lookup ?? defaultLookup;
  }

  async search(input: AgentWebSearchInput): Promise<AgentWebSearchResult> {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) {
      throw invalidArgument('query 不能为空。');
    }
    if (query.length > 128) {
      throw invalidArgument('query 最多 128 个字符。');
    }

    const count = input.count;
    if (
      count !== undefined &&
      (!Number.isInteger(count) || count < 1 || count > 50)
    ) {
      throw invalidArgument('count 必须是 1–50 的整数。');
    }

    const body: Record<string, unknown> = { query };
    if (count !== undefined) body.count = count;
    if (input.needContent !== undefined) body.need_content = input.needContent;

    const payload = await this.request(
      'WEB_SEARCH_FAILED',
      `${this.apiBase}${SEARCH_PATH}`,
      body,
    );

    return { query, results: normalizeSearchResults(payload) };
  }

  async fetch(input: AgentWebFetchInput): Promise<AgentWebFetchResult> {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    const url = await this.validateFetchUrl(rawUrl);
    const payload = await this.request(
      'WEB_FETCH_FAILED',
      `${this.apiBase}${FETCH_PATH}`,
      { url },
    );
    const { title, content } = normalizeFetchPayload(payload);

    return {
      url,
      title,
      content: capFetchContent(content),
    };
  }

  /**
   * 网络错误 / 429 / 5xx 重试；超时（AbortController）不重试。
   * 其它 4xx 立即失败。错误文案只带状态码，不带响应体。
   */
  private async request(
    code: WebFailureCode,
    url: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const label =
      code === 'WEB_SEARCH_FAILED' ? '网页搜索失败' : '网页抓取失败';
    const maxAttempts = this.maxAttempts();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.requestTimeoutMs,
      );

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
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) {
            throw new RecipeAgentWebError(code, `${label}：请求超时`);
          }
          if (attempt < maxAttempts) continue;
          throw new RecipeAgentWebError(code, `${label}：网络错误`);
        }

        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < maxAttempts) {
            continue;
          }
          throw new RecipeAgentWebError(
            code,
            `${label}（HTTP ${response.status}）`,
          );
        }

        try {
          return await response.json();
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) {
            throw new RecipeAgentWebError(code, `${label}：请求超时`);
          }
          throw new RecipeAgentWebError(code, `${label}：响应格式不正确`);
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new RecipeAgentWebError(code, `${label}：请求失败`);
  }

  /** retryCount 是重试次数；总尝试次数硬上限 3 次。 */
  private maxAttempts(): number {
    const retries = Number.isInteger(this.retryCount)
      ? Math.max(0, this.retryCount)
      : DEFAULT_RETRY_COUNT;
    return Math.min(retries + 1, MAX_ATTEMPTS);
  }

  /**
   * fetch 的 URL 预校验（SSRF）。
   *
   * 这一步只做校验，不抓页面；真正的抓取仍由 DeepSeek Fetch API 完成。
   * 返回规范化后的 URL（`parsed.href`），handler 只把这一份传给上游。
   */
  private async validateFetchUrl(rawUrl: string): Promise<string> {
    if (!rawUrl) {
      throw invalidArgument('url 不能为空。');
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw invalidArgument('url 不是合法网址。');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw invalidArgument('url 只支持 http/https。');
    }
    if (parsed.username || parsed.password) {
      throw invalidArgument('url 不能带账号密码。');
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname) {
      throw invalidArgument('url 缺少主机名。');
    }
    if (isLocalHostname(hostname)) {
      throw invalidArgument('url 指向本机或内网域名，已拒绝。');
    }

    if (isIP(hostname) !== 0) {
      if (!isPublicAddress(hostname)) {
        throw invalidArgument('url 指向私有或保留 IP，已拒绝。');
      }
      return parsed.href;
    }

    let addresses: ReadonlyArray<{ address: string }>;
    try {
      addresses = await this.lookup(hostname);
    } catch {
      throw new RecipeAgentWebError(
        'WEB_FETCH_FAILED',
        '网页抓取失败：域名解析失败',
      );
    }
    if (addresses.length === 0) {
      throw new RecipeAgentWebError(
        'WEB_FETCH_FAILED',
        '网页抓取失败：域名没有可用地址',
      );
    }
    for (const entry of addresses) {
      if (!isPublicAddress(entry.address)) {
        throw invalidArgument('url 解析到私有或保留 IP，已拒绝。');
      }
    }

    return parsed.href;
  }
}

/** 已带 /v1 时保留，避免拼成 /v1/v1；`/api/v1` 这类前缀也保留。 */
function resolveApiBase(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function normalizeHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  while (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  return host;
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'local' ||
    hostname.endsWith('.local')
  );
}

function invalidArgument(message: string): RecipeAgentWebError {
  return new RecipeAgentWebError('INVALID_ARGUMENT', message);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'AbortError' ||
    error.message === 'This operation was aborted' ||
    error.message === 'The operation was aborted'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* -------------------------------------------------------------------------- */
/* 响应解析                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeSearchResults(payload: unknown): AgentWebSearchResultItem[] {
  const entries = readSearchEntries(payload);
  const results: AgentWebSearchResultItem[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const title = readTrimmedString(entry, [
      'title',
      'name',
      'headline',
      'pageTitle',
      'page_title',
    ]);
    const url = readTrimmedString(entry, [
      'url',
      'link',
      'href',
      'sourceUrl',
      'source_url',
      'displayUrl',
      'display_url',
    ]);
    const summary = readTrimmedString(entry, [
      'summary',
      'snippet',
      'description',
      'abstract',
    ]);
    const content = readStringValue(entry, [
      'content',
      'text',
      'body',
      'markdown',
    ]);
    const publishedAt = readTrimmedString(entry, [
      'publishedAt',
      'published_at',
      'publishedDate',
      'published_date',
      'publishTime',
      'publish_time',
      'date',
    ]);

    if (!title && !url && !summary && !content) continue;

    const item: AgentWebSearchResultItem = {
      title: title ?? '',
      url: url ?? '',
      summary: summary ?? '',
      publishedAt: publishedAt ?? null,
    };
    if (content) item.content = content;
    results.push(item);
  }

  return results;
}

/**
 * 兼容常见包装：`{results}` / `{data:[...]}` / `{data:{results}}` /
 * `{webPages:{value}}` / 直接数组。
 */
function readSearchEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const root = isRecord(payload) ? payload : null;
  if (!root) return [];

  const direct = firstArray(root, ['results', 'items', 'value']);
  if (direct) return direct;

  const data = root.data;
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    const nested = firstArray(data, ['results', 'items', 'value']);
    if (nested) return nested;
  }

  const webPages = isRecord(root.webPages)
    ? root.webPages
    : isRecord(root.web_pages)
      ? root.web_pages
      : null;
  if (webPages) {
    const nested = firstArray(webPages, ['value', 'results']);
    if (nested) return nested;
  }

  if (isRecord(root.result)) {
    const nested = firstArray(root.result, ['results', 'items', 'value']);
    if (nested) return nested;
  }

  return [];
}

function firstArray(
  record: Record<string, unknown>,
  keys: readonly string[],
): unknown[] | null {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function normalizeFetchPayload(payload: unknown): {
  title: string | null;
  content: string;
} {
  const root = isRecord(payload) ? payload : null;
  if (!root) {
    throw new RecipeAgentWebError(
      'WEB_FETCH_FAILED',
      '网页抓取失败：抓取结果为空',
    );
  }

  const containers: Array<Record<string, unknown>> = [root];
  for (const key of ['data', 'result']) {
    const nested = root[key];
    if (isRecord(nested)) containers.push(nested);
  }

  let title: string | undefined;
  let content: string | undefined;
  for (const container of containers) {
    title ??= readTrimmedString(container, [
      'title',
      'name',
      'headline',
      'pageTitle',
      'page_title',
    ]);
    content ??= readStringValue(container, [
      'content',
      'text',
      'markdown',
      'body',
    ]);
  }

  if (!content) {
    for (const key of ['data', 'result', 'content', 'text']) {
      const value = root[key];
      if (typeof value === 'string' && value.trim()) {
        content = value;
        break;
      }
    }
  }

  if (!content || !content.trim()) {
    throw new RecipeAgentWebError(
      'WEB_FETCH_FAILED',
      '网页抓取失败：抓取结果为空',
    );
  }

  return { title: title ?? null, content };
}

function readTrimmedString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

function readStringValue(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function capFetchContent(content: string): string {
  if (content.length <= MAX_WEB_FETCH_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_WEB_FETCH_CONTENT_CHARS)}${TRUNCATION_NOTE}`;
}

/* -------------------------------------------------------------------------- */
/* IP / 保留地址判定                                                            */
/* -------------------------------------------------------------------------- */

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const bytes = parseIpv4(address);
    return bytes !== null && !isReservedIpv4(bytes);
  }
  if (family === 6) {
    const bytes = parseIpv6(address);
    return bytes !== null && !isReservedIpv6(bytes);
  }
  return false;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

function isReservedIpv4(bytes: readonly number[]): boolean {
  const [a, b, c] = bytes;
  if (a === 0 || a === 10 || a === 127) return true;
  // 100.64.0.0/10 CGNAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 169.254.0.0/16 link-local（含云元数据 169.254.169.254）
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24、192.0.2.0/24
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  // 192.88.99.0/24 6to4 relay
  if (a === 192 && b === 88 && c === 99) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 TEST-NET-2
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 TEST-NET-3
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255
  return a >= 224;
}

/**
 * 解析 IPv6 为 16 字节；支持 `::` 压缩、内嵌 IPv4 和 zone id。
 * 不用外部依赖，保证判定逻辑可审计。
 */
function parseIpv6(address: string): number[] | null {
  let input = address.trim().toLowerCase();
  const zoneIndex = input.indexOf('%');
  if (zoneIndex >= 0) input = input.slice(0, zoneIndex);
  if (!input) return null;

  if (input.includes('.')) {
    const lastColon = input.lastIndexOf(':');
    if (lastColon < 0) return null;
    const ipv4 = parseIpv4(input.slice(lastColon + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    input = `${input.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = input.split('::');
  if (halves.length > 2) return null;
  const hasCompression = halves.length === 2;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = hasCompression && halves[1] ? halves[1].split(':') : [];

  if (!hasCompression && left.length !== 8) return null;
  if (hasCompression && left.length + right.length >= 8) return null;

  const missing = 8 - left.length - right.length;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => '0'),
    ...right,
  ];
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }
  return bytes;
}

function isReservedIpv6(bytes: readonly number[]): boolean {
  const zero = (start: number, end: number): boolean => {
    for (let i = start; i < end; i += 1) {
      if (bytes[i] !== 0) return false;
    }
    return true;
  };

  // ::/128 unspecified、::1/128 loopback
  if (zero(0, 16)) return true;
  if (zero(0, 15) && bytes[15] === 1) return true;

  const first = bytes[0];
  const second = bytes[1];

  // fc00::/7 unique local
  if ((first & 0xfe) === 0xfc) return true;
  // fe80::/10 link-local
  if (first === 0xfe && (second & 0xc0) === 0x80) return true;
  // fec0::/10 deprecated site-local
  if (first === 0xfe && (second & 0xc0) === 0xc0) return true;
  // ff00::/8 multicast
  if (first === 0xff) return true;
  // 100::/64 discard-only
  if (first === 0x01 && second === 0x00 && zero(2, 8)) return true;

  // 2001:db8::/32 documentation
  if (
    first === 0x20 &&
    second === 0x01 &&
    bytes[2] === 0x0d &&
    bytes[3] === 0xb8
  ) {
    return true;
  }
  // 2001:2::/48 benchmarking
  if (
    first === 0x20 &&
    second === 0x01 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x02 &&
    bytes[4] === 0x00 &&
    bytes[5] === 0x00
  ) {
    return true;
  }
  // 2001:10::/28 / 2001:20::/28 ORCHID
  if (
    first === 0x20 &&
    second === 0x01 &&
    bytes[2] === 0x00 &&
    ((bytes[3] & 0xf0) === 0x10 || (bytes[3] & 0xf0) === 0x20)
  ) {
    return true;
  }
  // 3fff::/20 documentation
  if (first === 0x3f && second === 0xff && (bytes[2] & 0xf0) === 0xf0) {
    return true;
  }
  // 64:ff9b:1::/48 local-use NAT64
  if (
    first === 0x00 &&
    second === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes[4] === 0x00 &&
    bytes[5] === 0x01
  ) {
    return true;
  }
  // 64:ff9b::/96 NAT64：内嵌 IPv4 必须公开
  if (
    first === 0x00 &&
    second === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    zero(4, 12)
  ) {
    return isReservedIpv4(bytes.slice(12, 16));
  }
  // ::ffff:0:0/96 IPv4-mapped（URL 解析常把 ::ffff:127.0.0.1 写成 ::ffff:7f00:1）
  if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isReservedIpv4(bytes.slice(12, 16));
  }
  // ::/96 IPv4-compatible（已废弃，但可能被用来绕过）
  if (zero(0, 12)) {
    return isReservedIpv4(bytes.slice(12, 16));
  }
  // 2002::/16 6to4：内嵌 IPv4 在 bytes 2-5
  if (first === 0x20 && second === 0x02) {
    return isReservedIpv4(bytes.slice(2, 6));
  }
  // 2001:0000::/32 Teredo：客户端 IPv4 在最后 4 字节且按位取反
  if (
    first === 0x20 &&
    second === 0x01 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x00
  ) {
    if (isReservedIpv4(bytes.slice(4, 8))) return true;
    const client = bytes.slice(12, 16).map((byte) => byte ^ 0xff);
    return isReservedIpv4(client);
  }

  return false;
}
