import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import {
  classifyCookingMethod,
  isCookedSourceAcceptable,
  normalizePreparationState,
  type CookingMethod,
  type PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import type {
  NutritionGovernanceSourceType,
  NutritionSourceInput,
} from '../../domain/nutrition-governance/nutrition-governance.types';
import {
  buildNutritionSourceKey,
  scoreIngredientSourceNameMatch,
} from '../../domain/nutrition-governance/nutrition-governance.utils';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  auditNutritionProfileForImport,
  type NutritionImportNutrientValue,
} from '../standard-ingredient-import/nutrition-audit';
import { TrustedNutritionWebSearchService } from '../nutrition-governance/trusted-nutrition-web-search.service';
import type { CandidateRow } from './ingredient-creation.types';

/** 线上兜底来源的 `data_type`：本地候选检索不会把它当普通人工录入。 */
export const ONLINE_FALLBACK_DATA_TYPE = 'ONLINE_TRUSTED_WEB';

/** 线上来源落在 `nutrition_source_record` 时的 sourceType（白名单抓取属于人工整理）。 */
const ONLINE_SOURCE_TYPE = 'MANUAL' as const;

/** sourceKey 命名空间，用于「同一查询第二次直接读库」的缓存前缀。 */
const ONLINE_SOURCE_KEY_NAMESPACE = 'online-fallback';

/**
 * 线上来源与查询名字的最低匹配分。
 *
 * 白名单页面往往是一整张食物成分表，解析器会把表里前几行都抓出来；
 * 不按名字过一遍，就可能把「牛肉」的页面行当成「鹌鹑蛋」的候选。
 * 与本地候选检索同一条准入线（0.35），宁缺毋滥。
 */
const MIN_ONLINE_NAME_MATCH_SCORE = 0.35;

export interface SearchOnlineInput {
  /** 中文规范名（必填）。 */
  name: string;
  /** 英文名；线上白名单页面多为英文，没有它时匹配会严格很多。 */
  nameEn?: string;
  /** 要找的是生档案还是熟档案。 */
  state: PreparationState;
}

/**
 * 线上兜底候选：比本地候选多三样溯源信息。
 *
 * `isOnline` 是字面量 `true`，前端据此统一加「线上」标记；
 * 线上数据仍然只是候选，必须走 ② → ⑥ 的人工确认，绝不自动变成已验证。
 */
export interface OnlineCandidateRow extends CandidateRow {
  sourceUrl: string;
  fetchedAt: string;
  isOnline: true;
}

export interface OnlineSearchResult {
  candidates: OnlineCandidateRow[];
  /** 本轮尝试过的白名单主机（含发现阶段实际查询过的主机）。 */
  attemptedHosts: string[];
  /** 被白名单直接拒绝的主机；这些网址从未被抓取。 */
  rejectedHosts: string[];
}

interface PersistedOnlineSource {
  id: string;
  sourceType: string;
  foodName: string;
  foodNameEn: string | null;
  sourceDetail: unknown;
  normalizedNutrition: unknown;
  dataType: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readDetailString(sourceDetail: unknown, key: string): string | null {
  if (!isRecord(sourceDetail)) return null;
  return readNonEmptyString(sourceDetail[key]);
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
}

function buildQueryKey(input: SearchOnlineInput): string {
  return createHash('sha1')
    .update(
      [
        input.name.trim().toLowerCase(),
        input.nameEn?.trim().toLowerCase() ?? '',
        input.state,
      ].join('\n'),
    )
    .digest('hex')
    .slice(0, 16);
}

function buildQuerySourceKeyPrefix(queryKey: string): string {
  return buildNutritionSourceKey(
    ONLINE_SOURCE_TYPE,
    `${ONLINE_SOURCE_KEY_NAMESPACE}:${queryKey}:`,
  );
}

function buildOnlineSourceKey(queryKey: string, sourceUrl: string, foodName: string): string {
  const itemHash = createHash('sha1')
    .update(`${sourceUrl}\n${foodName}`)
    .digest('hex')
    .slice(0, 16);
  return buildNutritionSourceKey(
    ONLINE_SOURCE_TYPE,
    `${ONLINE_SOURCE_KEY_NAMESPACE}:${queryKey}:${itemHash}`,
  );
}

function tokenizeName(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function readSampleState(profile: unknown): string | null {
  if (!isRecord(profile) || !isRecord(profile.meta)) {
    return null;
  }
  return readNonEmptyString(profile.meta.sampleState);
}

/**
 * 线上来源的生熟只能从来源原文推导：
 * 先看 `meta.sampleState`，再看词条名里的 raw / cooked / 生 / 熟；
 * 做法（水煮 / 蒸 / 烤 / 煎）本身也说明是熟的。
 * 都认不出返回 null，由候选标 `STATE_UNKNOWN`，不猜。
 */
function derivePreparationState(
  foodName: string,
  foodNameEn: string | null,
  profile: unknown,
): PreparationState | null {
  const sampleState = normalizePreparationState(readSampleState(profile));
  if (sampleState) {
    return sampleState;
  }

  for (const name of [foodName, foodNameEn]) {
    for (const token of tokenizeName(name)) {
      const normalized = normalizePreparationState(token);
      if (normalized) return normalized;
    }
  }

  return classifyCookingMethod(foodName) ?? classifyCookingMethod(foodNameEn)
    ? 'COOKED'
    : null;
}

function resolveCookingMethod(
  foodName: string,
  foodNameEn: string | null,
): CookingMethod | null {
  return (
    classifyCookingMethod(foodName) ?? classifyCookingMethod(foodNameEn)
  );
}

function buildAuditNutrients(
  profile: unknown,
): Record<string, NutritionImportNutrientValue> {
  const nutrients: Record<string, NutritionImportNutrientValue> = {};
  if (!isRecord(profile)) return nutrients;

  for (const field of NUTRITION_FIELD_CATALOG) {
    const [tabKey, fieldKey] = field.fieldPath.split('.') as [string, string];
    const tab = profile[tabKey];
    if (!isRecord(tab)) continue;

    const value = tab[fieldKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;

    nutrients[fieldKey] = { value, unit: field.unit };
  }

  return nutrients;
}

function measureCoverage(profile: unknown): {
  coveragePercent: number;
  missingFields: string[];
} {
  const audit = auditNutritionProfileForImport({
    nutrients: buildAuditNutrients(profile),
  });

  return {
    coveragePercent: audit.essentialCoveragePercent,
    missingFields: [...audit.missingEssentialNutrients],
  };
}

function scoreSourceName(
  input: SearchOnlineInput,
  source: {
    foodName: string;
    foodNameEn?: string | null;
    sourceType: string;
  },
): number {
  const queryNames = [input.name, input.nameEn].filter(
    (name): name is string => Boolean(name?.trim()),
  );
  const sourceNames = [source.foodName, source.foodNameEn].filter(
    (name): name is string => Boolean(name?.trim()),
  );

  let bestScore = 0;
  for (const queryName of queryNames) {
    for (const sourceName of sourceNames) {
      const { score } = scoreIngredientSourceNameMatch({
        ingredientName: queryName,
        sourceFoodName: sourceName,
        sourceType: source.sourceType as NutritionGovernanceSourceType,
      });
      if (score > bestScore) {
        bestScore = score;
      }
    }
  }

  return bestScore;
}

function toOnlineCandidate(
  source: PersistedOnlineSource,
  input: SearchOnlineInput,
): OnlineCandidateRow | null {
  const sourceUrl = readDetailString(source.sourceDetail, 'url');
  if (!sourceUrl) {
    return null;
  }

  const preparationState = derivePreparationState(
    source.foodName,
    source.foodNameEn,
    source.normalizedNutrition,
  );
  if (input.state === 'RAW' && preparationState === 'COOKED') {
    return null;
  }
  if (input.state === 'COOKED' && preparationState === 'RAW') {
    return null;
  }

  const cookingMethod = resolveCookingMethod(
    source.foodName,
    source.foodNameEn,
  );
  if (
    input.state === 'COOKED' &&
    cookingMethod !== null &&
    !isCookedSourceAcceptable(cookingMethod)
  ) {
    return null;
  }

  const matchScore = scoreSourceName(input, source);
  if (matchScore < MIN_ONLINE_NAME_MATCH_SCORE) {
    return null;
  }

  const notes: string[] = [];
  if (preparationState === null) {
    notes.push('STATE_UNKNOWN');
  }
  if (cookingMethod !== null) {
    notes.push(`COOKING_METHOD_${cookingMethod}`);
  } else if (input.state === 'COOKED') {
    notes.push('COOKING_METHOD_UNKNOWN');
  }

  const { coveragePercent, missingFields } = measureCoverage(
    source.normalizedNutrition,
  );

  return {
    sourceRecordId: source.id,
    sourceType: source.sourceType,
    foodName: source.foodName,
    foodNameEn: source.foodNameEn,
    preparationState,
    cookingMethod,
    coveragePercent,
    missingFields,
    matchScore,
    notes,
    sourceUrl,
    fetchedAt:
      readDetailString(source.sourceDetail, 'fetchedAt') ??
      new Date().toISOString(),
    isOnline: true,
  };
}

function compareOnlineCandidates(
  left: OnlineCandidateRow,
  right: OnlineCandidateRow,
): number {
  return (
    right.coveragePercent - left.coveragePercent ||
    right.matchScore - left.matchScore ||
    left.foodName.localeCompare(right.foodName) ||
    left.sourceRecordId.localeCompare(right.sourceRecordId)
  );
}

/**
 * 本地候选先、线上候选后。
 *
 * `searchOnline` 只认识线上候选，没法在服务内部把本地候选一起排序；
 * 页面合并时必须走这个顺序（或等价的 `[...local, ...online]`）：
 * 线上来源永远只是兜底，不能因为覆盖率更高就插到本地来源前面。
 */
export function orderCandidatesLocalFirst<
  Local extends CandidateRow,
  Online extends OnlineCandidateRow,
>(
  localCandidates: readonly Local[],
  onlineCandidates: readonly Online[],
): Array<Local | Online> {
  return [...localCandidates, ...onlineCandidates];
}

/**
 * ② 营养依据站的线上白名单兜底检索。
 *
 * 只在页面「本地库零候选」时由人点按钮触发，不自动联网。所有抓取、白名单
 * 过滤与表格解析都复用 `TrustedNutritionWebSearchService`；本服务只负责：
 * - 把抓到的来源落成 `nutrition_source_record`（`dataType` 标线上、`sourceDetail`
 *   存原始网址与抓取时间），下次查询直接走本地库；
 * - 同一查询第二次直接读库，不重复抓取；
 * - 把来源适配成候选，并带上 `sourceUrl` / `fetchedAt` / `isOnline`。
 *
 * 抓取失败、超时、零结果都返回空数组 + `attemptedHosts`，不抛 500。
 */
@Injectable()
export class IngredientCreationOnlineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trustedNutritionWebSearchService: TrustedNutritionWebSearchService,
  ) {}

  async searchOnline(input: SearchOnlineInput): Promise<OnlineSearchResult> {
    const normalizedInput: SearchOnlineInput = {
      name: input.name.trim(),
      ...(input.nameEn?.trim() ? { nameEn: input.nameEn.trim() } : {}),
      state: input.state,
    };
    if (!normalizedInput.name) {
      return { candidates: [], attemptedHosts: [], rejectedHosts: [] };
    }

    const queryKey = buildQueryKey(normalizedInput);
    const cachedRows = await this.findCachedSources(queryKey);
    if (cachedRows.length > 0) {
      return this.buildCachedResult(cachedRows, normalizedInput);
    }

    let report;
    try {
      report = await this.trustedNutritionWebSearchService.searchWithReport({
        ingredientName: normalizedInput.name,
        searchTerms: normalizedInput.nameEn
          ? [normalizedInput.nameEn]
          : [],
      });
    } catch {
      // 白名单抓取是兜底能力：网络/解析异常都不该让整个 ② 站 500。
      return { candidates: [], attemptedHosts: [], rejectedHosts: [] };
    }

    const candidates: OnlineCandidateRow[] = [];
    for (const source of report.sources) {
      const row = await this.persistSource(normalizedInput, queryKey, source);
      if (!row) continue;

      const candidate = toOnlineCandidate(row, normalizedInput);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    return {
      candidates: candidates.sort(compareOnlineCandidates),
      attemptedHosts: [...new Set(report.attemptedHosts)],
      rejectedHosts: [...new Set(report.rejectedHosts)],
    };
  }

  private async findCachedSources(
    queryKey: string,
  ): Promise<PersistedOnlineSource[]> {
    const rows = await this.prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
        sourceKey: { startsWith: buildQuerySourceKeyPrefix(queryKey) },
      },
      select: {
        id: true,
        sourceType: true,
        foodName: true,
        foodNameEn: true,
        sourceDetail: true,
        normalizedNutrition: true,
        dataType: true,
      },
    });

    return rows.filter(
      (row) =>
        row.dataType === ONLINE_FALLBACK_DATA_TYPE &&
        row.normalizedNutrition !== null &&
        row.normalizedNutrition !== undefined,
    );
  }

  private buildCachedResult(
    rows: PersistedOnlineSource[],
    input: SearchOnlineInput,
  ): OnlineSearchResult {
    const candidates: OnlineCandidateRow[] = [];
    for (const row of rows) {
      const candidate = toOnlineCandidate(row, input);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    const attemptedHosts = new Set<string>();
    for (const row of rows) {
      const host = readDetailString(row.sourceDetail, 'trustedDomain');
      if (host) {
        attemptedHosts.add(host);
      }
    }

    return {
      candidates: candidates.sort(compareOnlineCandidates),
      attemptedHosts: [...attemptedHosts],
      rejectedHosts: [],
    };
  }

  private async persistSource(
    input: SearchOnlineInput,
    queryKey: string,
    source: NutritionSourceInput,
  ): Promise<PersistedOnlineSource | null> {
    const sourceUrl = readDetailString(source.sourceDetail, 'url');
    if (!sourceUrl) {
      return null;
    }
    // 白名单页面常是整张成分表：名字对不上的行不落库，免得污染本地来源库。
    if (scoreSourceName(input, source) < MIN_ONLINE_NAME_MATCH_SCORE) {
      return null;
    }

    const fetchedAt =
      readDetailString(source.sourceDetail, 'fetchedAt') ??
      new Date().toISOString();
    const sourceKey = buildOnlineSourceKey(
      queryKey,
      sourceUrl,
      source.foodName,
    );
    const sourceDetail: Prisma.InputJsonValue = {
      ...(isRecord(source.sourceDetail) ? source.sourceDetail : {}),
      url: sourceUrl,
      fetchedAt,
      isOnlineFallback: true,
      onlineQuery: {
        name: input.name,
        nameEn: input.nameEn ?? null,
        state: input.state,
      },
    };

    const createData: Prisma.NutritionSourceRecordUncheckedCreateInput = {
      sourceType: ONLINE_SOURCE_TYPE,
      sourceKey,
      sourceTitle: source.sourceTitle,
      sourceDetail,
      foodName: source.foodName,
      foodNameEn: source.foodNameEn ?? null,
      dataType: ONLINE_FALLBACK_DATA_TYPE,
      category: source.category ?? 'Trusted online source',
      rawData: source.rawData as Prisma.InputJsonValue,
      normalizedNutrition: toNullableJsonInput(source.normalizedNutrition),
      status: 'ACTIVE',
    };
    const updateData: Prisma.NutritionSourceRecordUncheckedUpdateInput = {
      sourceTitle: createData.sourceTitle,
      sourceDetail: createData.sourceDetail,
      foodName: createData.foodName,
      foodNameEn: createData.foodNameEn,
      dataType: createData.dataType,
      category: createData.category,
      rawData: createData.rawData,
      normalizedNutrition: createData.normalizedNutrition,
    };

    return this.prisma.nutritionSourceRecord.upsert({
      where: {
        sourceType_sourceKey: {
          sourceType: ONLINE_SOURCE_TYPE,
          sourceKey,
        },
      },
      create: createData,
      update: updateData,
    });
  }
}
