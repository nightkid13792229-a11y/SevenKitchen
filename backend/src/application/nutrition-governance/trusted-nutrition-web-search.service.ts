import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { createEmptyNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import type { NutritionSourceCode } from '../../domain/ingredient/nutrition-source-contract';
import type { NutritionSourceInput } from '../../domain/nutrition-governance/nutrition-governance.types';

const DEFAULT_TRUSTED_HOSTS = [
  'fdc.nal.usda.gov',
  'nal.usda.gov',
  'foodstandards.gov.au',
  'foodstandards.govt.nz',
  'foodcomposition.co.nz',
  'canada.ca',
  'inspection.canada.ca',
  'cnf-fce.ca',
  'frida.fooddata.dk',
  'fineli.fi',
  'r.jina.ai',
];

const URL_PATTERN = /https?:\/\/[^\s"'<>，。；、)）\]]+/giu;
const MAX_FETCHED_BYTES = 2_000_000;
const WEB_FETCH_TIMEOUT_MS = 20000;
const MAX_DISCOVERY_HOSTS = 4;
const MAX_DISCOVERED_SOURCE_URLS = 6;
const TRUSTED_WEB_SEARCH_URL = 'https://lite.duckduckgo.com/lite/';

const DEFAULT_DISCOVERY_HOSTS = [
  'foodstandards.gov.au',
  'foodcomposition.co.nz',
  'foodstandards.govt.nz',
  'canada.ca',
  'frida.fooddata.dk',
  'fineli.fi',
  'nal.usda.gov',
];

type TrustedUrlDiscoveryMode =
  | 'explicit-url'
  | 'configured-url'
  | 'whitelist-web-search';

type TrustedUrlCandidate = {
  url: string;
  discoveryMode: TrustedUrlDiscoveryMode;
};

type NutrientAssignment = {
  group: 'macros' | 'minerals' | 'vitamins';
  key: string;
  unit: string;
};

const NUTRIENT_COLUMN_MAP: Record<string, NutrientAssignment> = {
  energy: { group: 'macros', key: 'energyKcal', unit: 'kcal' },
  energykcal: { group: 'macros', key: 'energyKcal', unit: 'kcal' },
  kcal: { group: 'macros', key: 'energyKcal', unit: 'kcal' },
  water: { group: 'macros', key: 'moisture', unit: 'g' },
  moisture: { group: 'macros', key: 'moisture', unit: 'g' },
  protein: { group: 'macros', key: 'crudeProtein', unit: 'g' },
  crudeprotein: { group: 'macros', key: 'crudeProtein', unit: 'g' },
  fat: { group: 'macros', key: 'crudeFat', unit: 'g' },
  totalfat: { group: 'macros', key: 'crudeFat', unit: 'g' },
  crudefat: { group: 'macros', key: 'crudeFat', unit: 'g' },
  carbohydrate: { group: 'macros', key: 'carbohydrate', unit: 'g' },
  carbs: { group: 'macros', key: 'carbohydrate', unit: 'g' },
  ash: { group: 'macros', key: 'ash', unit: 'g' },
  fiber: { group: 'macros', key: 'fiber', unit: 'g' },
  fibre: { group: 'macros', key: 'fiber', unit: 'g' },
  calcium: { group: 'minerals', key: 'calcium', unit: 'mg' },
  ca: { group: 'minerals', key: 'calcium', unit: 'mg' },
  phosphorus: { group: 'minerals', key: 'phosphorus', unit: 'mg' },
  phosphorous: { group: 'minerals', key: 'phosphorus', unit: 'mg' },
  p: { group: 'minerals', key: 'phosphorus', unit: 'mg' },
  potassium: { group: 'minerals', key: 'potassium', unit: 'mg' },
  sodium: { group: 'minerals', key: 'sodium', unit: 'mg' },
  magnesium: { group: 'minerals', key: 'magnesium', unit: 'mg' },
  iron: { group: 'minerals', key: 'iron', unit: 'mg' },
  zinc: { group: 'minerals', key: 'zinc', unit: 'mg' },
  copper: { group: 'minerals', key: 'copper', unit: 'mg' },
  manganese: { group: 'minerals', key: 'manganese', unit: 'mg' },
  selenium: { group: 'minerals', key: 'selenium', unit: 'ug' },
  iodine: { group: 'minerals', key: 'iodine', unit: 'ug' },
  vitamina: { group: 'vitamins', key: 'vitaminA', unit: 'IU' },
  vitamind: { group: 'vitamins', key: 'vitaminD', unit: 'IU' },
  vitamine: { group: 'vitamins', key: 'vitaminE', unit: 'IU' },
  vitamink: { group: 'vitamins', key: 'vitaminK', unit: 'ug' },
  vitaminc: { group: 'vitamins', key: 'vitaminC', unit: 'mg' },
};

export interface TrustedNutritionWebSearchInput {
  ingredientName: string;
  reviewerRequirement?: string | null;
  searchTerms?: string[];
}

@Injectable()
export class TrustedNutritionWebSearchService {
  async search(
    input: TrustedNutritionWebSearchInput,
  ): Promise<NutritionSourceInput[]> {
    const urls = await this.resolveCandidateUrls(input);
    const records: NutritionSourceInput[] = [];

    for (const candidate of urls) {
      const trustedHost = resolveTrustedHost(candidate.url);
      if (!trustedHost) continue;

      const content = await fetchTrustedText(candidate.url);
      if (!content) continue;

      records.push(
        ...extractNutritionSourcesFromText({
          url: candidate.url,
          trustedHost,
          discoveryMode: candidate.discoveryMode,
          text: content,
          ingredientName: input.ingredientName,
        }),
      );
    }

    return records.slice(0, 8);
  }

  private async resolveCandidateUrls(
    input: TrustedNutritionWebSearchInput,
  ): Promise<TrustedUrlCandidate[]> {
    const candidates = new Map<string, TrustedUrlCandidate>();
    const explicitTexts = [
      input.reviewerRequirement ?? '',
      ...(input.searchTerms ?? []),
    ];
    const hasExplicitUrl = explicitTexts.some((text) =>
      Boolean(text.match(URL_PATTERN)),
    );

    for (const text of explicitTexts) {
      addUrlCandidates(candidates, text, 'explicit-url');
    }
    addUrlCandidates(
      candidates,
      process.env.NUTRITION_TRUSTED_SOURCE_URLS ?? '',
      'configured-url',
    );

    if (!hasExplicitUrl && isWhitelistWebSearchEnabled()) {
      const discoveredUrls = await discoverTrustedSourceUrls(input);
      for (const url of discoveredUrls) {
        if (!candidates.has(url)) {
          candidates.set(url, {
            url,
            discoveryMode: 'whitelist-web-search',
          });
        }
      }
    }

    return [...candidates.values()];
  }
}

function addUrlCandidates(
  candidates: Map<string, TrustedUrlCandidate>,
  text: string,
  discoveryMode: TrustedUrlDiscoveryMode,
): void {
  for (const match of text.matchAll(URL_PATTERN)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized && !candidates.has(normalized)) {
      candidates.set(normalized, { url: normalized, discoveryMode });
    }
  }
}

function isWhitelistWebSearchEnabled(): boolean {
  return !['0', 'false', 'disabled'].includes(
    (process.env.NUTRITION_TRUSTED_WEB_SEARCH_ENABLED ?? 'true').toLowerCase(),
  );
}

async function discoverTrustedSourceUrls(
  input: TrustedNutritionWebSearchInput,
): Promise<string[]> {
  const queryText = buildDiscoveryQueryText(input);
  if (!queryText) return [];

  const urls = new Set<string>();
  for (const host of getDiscoveryHosts()) {
    const discoveredUrls = await fetchSearchResultUrls(
      `${queryText} nutrition composition site:${host}`,
    );
    for (const url of discoveredUrls) {
      urls.add(url);
      if (urls.size >= MAX_DISCOVERED_SOURCE_URLS) {
        return [...urls];
      }
    }
  }

  return [...urls];
}

function buildDiscoveryQueryText(input: TrustedNutritionWebSearchInput): string {
  return [
    input.ingredientName,
    ...(input.searchTerms ?? []),
    stripUrls(input.reviewerRequirement ?? ''),
  ]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 4)
    .join(' ')
    .slice(0, 240);
}

function getDiscoveryHosts(): string[] {
  const configuredHosts = parseConfiguredTrustedHosts();
  return [
    ...new Set([...configuredHosts, ...DEFAULT_DISCOVERY_HOSTS]),
  ].slice(0, MAX_DISCOVERY_HOSTS);
}

async function fetchSearchResultUrls(query: string): Promise<string[]> {
  const searchUrl = new URL(TRUSTED_WEB_SEARCH_URL);
  searchUrl.searchParams.set('q', query);

  const html = await fetchTrustedText(searchUrl.toString());
  if (!html) return [];

  return extractSearchResultUrls(html);
}

function extractSearchResultUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/href=(?:"|')([^"']+)(?:"|')/giu)) {
    const resultUrl = normalizeSearchResultUrl(match[1]);
    if (!resultUrl || !resolveTrustedHost(resultUrl)) continue;
    urls.add(resultUrl);
    if (urls.size >= MAX_DISCOVERED_SOURCE_URLS) break;
  }

  return [...urls];
}

function normalizeSearchResultUrl(href: string): string | null {
  const decodedHref = decodeHtmlEntities(href);
  try {
    const parsed = new URL(decodedHref, TRUSTED_WEB_SEARCH_URL);
    const encodedTarget = parsed.searchParams.get('uddg');
    const targetUrl = encodedTarget
      ? decodeURIComponent(encodedTarget)
      : parsed.toString();
    return normalizeUrl(targetUrl);
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'");
}

function stripUrls(text: string): string {
  return text.replace(URL_PATTERN, ' ');
}

function resolveTrustedHost(urlText: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlText);
  } catch {
    return null;
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./u, '');
  const trustedHosts = new Set([
    ...DEFAULT_TRUSTED_HOSTS,
    ...parseConfiguredTrustedHosts(),
  ]);

  for (const trustedHost of trustedHosts) {
    const normalizedHost = trustedHost.toLowerCase().replace(/^www\./u, '');
    if (host === normalizedHost || host.endsWith(`.${normalizedHost}`)) {
      return normalizedHost;
    }
  }

  return null;
}

function parseConfiguredTrustedHosts(): string[] {
  return (process.env.NUTRITION_TRUSTED_SOURCE_HOSTS ?? '')
    .split(/[,\n]/u)
    .map((host) => host.trim())
    .filter(Boolean);
}

function normalizeUrl(urlText: string): string | null {
  try {
    const parsed = new URL(urlText);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchTrustedText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept:
          'text/csv, text/plain, text/html, application/json, application/xml;q=0.9, */*;q=0.8',
        'User-Agent': 'SevenKitchenNutritionBot/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    return text.slice(0, MAX_FETCHED_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractNutritionSourcesFromText(input: {
  url: string;
  trustedHost: string;
  discoveryMode: TrustedUrlDiscoveryMode;
  text: string;
  ingredientName: string;
}): NutritionSourceInput[] {
  const tableRows = parseCsvLikeRows(input.text);
  if (tableRows.length < 2) {
    return [];
  }

  const [headers, ...rows] = tableRows;
  const foodNameIndex = headers.findIndex((header) =>
    ['foodname', 'food', 'name', 'description', '食品名称', '食物名称'].includes(
      normalizeColumnName(header),
    ),
  );
  if (foodNameIndex < 0) {
    return [];
  }

  const nutrientColumns = headers
    .map((header, index) => ({
      header,
      index,
      assignment: NUTRIENT_COLUMN_MAP[normalizeColumnName(header)],
    }))
    .filter((column) => column.assignment);

  if (!nutrientColumns.length) {
    return [];
  }

  const results: NutritionSourceInput[] = [];
  for (const row of rows) {
    const foodName = row[foodNameIndex]?.trim();
    if (!foodName) continue;

    const profile = createEmptyNutritionProfile();
    const sourceCode = resolveSourceCodeForHost(input.trustedHost);
    let mappedFieldCount = 0;
    const fieldSources: NonNullable<NutritionProfileV2['meta']['fieldSources']> = {};
    const sourceForms: NonNullable<NutritionProfileV2['meta']['sourceForms']> = {};

    for (const column of nutrientColumns) {
      const value = parseNumber(row[column.index]);
      if (value === null) continue;

      const { group, key, unit } = column.assignment;
      (profile[group] as Record<string, number | null>)[key] = value;
      const fieldPath = `${group}.${key}`;
      sourceForms[fieldPath] = {
        sourceNutrientName: column.header,
        originalValue: value,
        originalUnit: unit,
        canonicalValue: value,
        canonicalUnit: unit,
        basisType: 'PER_100_G',
      };
      fieldSources[fieldPath] = {
        ...sourceForms[fieldPath],
        sourceRole: 'PROFILE_PRIMARY',
        sourceType: 'MANUAL',
        sourceKind: 'FOOD_DATABASE',
        sourceCode,
        sourceTitle: `Trusted web source: ${input.trustedHost}`,
        sourceProvider: input.trustedHost,
        compatibility: 'EXACT_FOOD',
        confidenceLevel: 'MEDIUM',
        noteZh: '来自白名单网页抓取的结构化营养表，需人工确认原始来源口径。',
      };
      mappedFieldCount += 1;
    }

    if (!mappedFieldCount) continue;

    const externalId = buildTrustedWebExternalId(input.url, foodName);
    profile.meta = {
      ...profile.meta,
      rawBasisType: 'PER_100_G',
      sourceType: 'MANUAL',
      sourceKind: 'FOOD_DATABASE',
      sourceCode,
      externalId,
      sourceTitle: `Trusted web source: ${input.trustedHost}`,
      sourceProvider: input.trustedHost,
      confidenceLevel: 'MEDIUM',
      sourceForms,
      fieldSources,
      versionNote: '白名单网页抓取草稿，需人工核对原始来源后确认。',
    };

    results.push({
      sourceType: 'MANUAL',
      externalId,
      sourceTitle: `Trusted web source: ${input.trustedHost}`,
      foodName,
      dataType: 'Trusted web table',
      category: 'Trusted online source',
      sourceDetail: {
        provider: 'Trusted whitelist web source',
        trustedDomain: input.trustedHost,
        url: input.url,
        discoveryMode: input.discoveryMode,
        extractionMode: 'trusted-web-table',
        fetchedAt: new Date().toISOString(),
        ingredientName: input.ingredientName,
      },
      rawData: {
        url: input.url,
        trustedDomain: input.trustedHost,
        headers,
        row,
      },
      normalizedNutrition: profile,
    });
  }

  return results;
}

function resolveSourceCodeForHost(host: string): NutritionSourceCode {
  if (host.includes('usda.gov')) return 'USDA_FDC';
  if (
    host.includes('foodcomposition.co.nz') ||
    host.includes('foodstandards.govt.nz')
  ) {
    return 'NZFCD_FOODFILES';
  }
  if (host.includes('foodstandards.gov.au')) return 'AUSNUT';
  if (host.includes('canada.ca') || host.includes('cnf-fce.ca')) return 'CNF';
  if (host.includes('frida.fooddata.dk')) return 'NEVO';
  if (host.includes('fineli.fi')) return 'NEVO';
  return 'LITERATURE';
}

function parseCsvLikeRows(text: string): string[][] {
  const normalized = text.includes('<table')
    ? htmlTablesToDelimitedText(text)
    : text;

  return normalized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDelimitedLine)
    .filter((row) => row.length > 1);
}

function htmlTablesToDelimitedText(html: string): string {
  return html
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/giu, ',')
    .replace(/<\/tr>\s*<tr[^>]*>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&');
}

function parseDelimitedLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeColumnName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/gu, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, '');
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/gu, '').trim();
  if (!normalized || normalized === '-' || normalized === '—') {
    return null;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function buildTrustedWebExternalId(url: string, foodName: string): string {
  const digest = createHash('sha1')
    .update(`${url}\n${foodName}`)
    .digest('hex')
    .slice(0, 16);
  return `trusted-web-${digest}`;
}
