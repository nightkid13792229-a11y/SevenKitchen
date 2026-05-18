import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  IngredientType,
  NutritionCandidateStatus,
  NutritionFoodCategory,
  NutritionFoodStatus,
  NutritionSourceRecord,
  Prisma,
  SupplementNutritionDraftStatus,
} from '@prisma/client';
import { createReadStream } from 'fs';
import { access, readFile } from 'fs/promises';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { createInterface } from 'readline';
import { normalizeNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfile,
  NutritionProfileV2,
} from '../../domain/ingredient/types';
import type { NutritionCandidateAgentReview } from '../../domain/nutrition-governance/agent-review.types';
import type {
  NutritionGovernanceSourceType,
  NutritionMatchConfidence,
  NutritionMatchReason,
  NutritionSourceInput,
} from '../../domain/nutrition-governance/nutrition-governance.types';
import {
  evaluateNutritionCandidateHardGates,
  resolveCandidateReviewGroup,
} from '../../domain/nutrition-governance/nutrition-candidate-hard-gates';
import {
  validateNutritionCandidateData,
  type NutritionCandidateDataValidationResult,
} from '../../domain/nutrition-governance/nutrition-candidate-data-validation';
import {
  attachUsdaFdcProfileMetadata,
  attachSourceRecordProfileMetadata,
  buildUsdaFdcSourceVersion,
  buildNutritionSourceKey,
  classifyMatchConfidence,
  getSourcePriority,
  mapUsdaNutrientsToNutritionProfile,
  normalizeNameForMatch,
  scoreIngredientSourceNameMatch,
} from '../../domain/nutrition-governance/nutrition-governance.utils';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  DisabledLabelRecognitionProvider,
  LABEL_RECOGNITION_PROVIDER,
  type LabelRecognitionProvider,
} from './label-recognition.provider';
import {
  DisabledNutritionCandidateReviewProvider,
  DeepSeekNutritionCandidateReviewProvider,
  NUTRITION_CANDIDATE_REVIEW_PROVIDER,
  NutritionCandidateReviewProviderError,
  normalizeNutritionCandidateAgentReview,
  type NutritionCandidateSearchPlan,
  type NutritionValidationAgentReview,
  type NutritionCandidateReviewProvider,
} from './nutrition-candidate-review.provider';
import { AgentProviderConfigService } from './agent-provider-config.service';
import { TrustedNutritionWebSearchService } from './trusted-nutrition-web-search.service';
import {
  mapCfctRowToSourceInput,
  validateReviewedCfctRows,
  type ReviewedCfctRow,
} from '../../../prisma/import-cfct-private-source';

const FOOD_SOURCE_TYPES = ['USDA', 'NZFCD', 'CFCT', 'MANUAL'] as const;
const MANAGED_INGREDIENT_TYPES = [
  IngredientType.FOOD,
  IngredientType.SUPPLEMENT,
];
const CFCT_FULL_REPORT_DIR = 'reports/cfct-full';
const CFCT_FULL_SUMMARY_FILE = 'cfct-v6-full-review-summary.json';
const CFCT_LOCAL_LIBRARY_FILES = {
  full: 'cfct-v6-full-structured.json',
  'auto-ready': 'cfct-v6-full-auto-ready.json',
  'needs-review': 'cfct-v6-full-needs-review.json',
} as const;
const USDA_FDC_API_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const USDA_ONLINE_SEARCH_DATA_TYPES = [
  'Foundation',
  'SR Legacy',
  'Survey (FNDDS)',
] as const;
const USDA_ONLINE_SEARCH_PAGE_SIZE = 12;
const USDA_ONLINE_IMPORT_LIMIT = 8;
const TERMINAL_CANDIDATE_STATUSES: ReadonlySet<NutritionCandidateStatus> =
  new Set([
    NutritionCandidateStatus.CONFIRMED,
    NutritionCandidateStatus.REJECTED,
    NutritionCandidateStatus.SKIPPED,
  ]);

const CONFIGURABLE_CANDIDATE_STATUSES: ReadonlySet<NutritionCandidateStatus> =
  new Set([
    NutritionCandidateStatus.CANDIDATE,
    NutritionCandidateStatus.CONFIRMED,
  ]);

const CONFIRMATION_PREPARATION_STATE_OPTIONS = [
  { value: 'RAW', label: '生', aliases: ['生食', '生重', 'raw'] },
  { value: 'COOKED', label: '熟', aliases: ['熟食', '熟重', 'cooked'] },
  { value: 'DRIED', label: '干', aliases: ['干重', 'dried'] },
  {
    value: 'FREEZE_DRIED',
    label: '冻干',
    aliases: ['freeze dried', 'freeze-dried'],
  },
  { value: 'AIR_DRIED', label: '风干', aliases: ['air dried', 'air-dried'] },
  { value: 'POWDER', label: '粉', aliases: ['粉末', 'powder'] },
  { value: 'CANNED', label: '罐头', aliases: ['罐装', 'canned'] },
  { value: 'OIL', label: '油脂', aliases: ['油', 'oil'] },
  { value: 'CONCENTRATE', label: '浓缩物', aliases: ['浓缩', 'concentrate'] },
  { value: 'UNKNOWN', label: '待确认', aliases: ['未知', 'unknown'] },
] as const;

const CONFIRMATION_EDIBLE_PORTION_OPTIONS = [
  { label: '标准可食部', aliases: ['可食部'] },
  { label: '整体', aliases: ['整只', 'whole'] },
  { label: '肉', aliases: ['meat'] },
  { label: '胸肉', aliases: ['breast'] },
  { label: '腿肉', aliases: ['thigh'] },
  { label: '肝脏', aliases: ['肝', 'liver'] },
  { label: '去皮', aliases: ['skinless'] },
  { label: '带皮', aliases: ['skin on', 'skin-on'] },
  { label: '去骨', aliases: ['boneless'] },
  { label: '带骨', aliases: ['bone in', 'bone-in'] },
  { label: '去皮去骨', aliases: ['去骨去皮', 'skinless boneless'] },
  { label: '去壳', aliases: ['去壳/去皮', 'shelled'] },
  { label: '带壳', aliases: ['shell on', 'shell-on'] },
  { label: '沥干', aliases: ['drained'] },
  { label: '待确认', aliases: ['未知', 'unknown'] },
] as const;

const CONFIRMATION_PROCESSING_OPTIONS = [
  { label: '未加工', aliases: ['无加工', 'unprocessed'] },
  { label: '无盐', aliases: ['unsalted'] },
  { label: '加盐', aliases: ['salted'] },
  { label: '未强化', aliases: ['非强化', 'unfortified'] },
  { label: '强化', aliases: ['fortified'] },
  { label: '非紫外线照射', aliases: ['未经紫外线照射', 'not uv exposed'] },
  { label: '紫外线照射', aliases: ['uv exposed'] },
  { label: '烟熏', aliases: ['smoked'] },
  { label: '冷冻', aliases: ['frozen'] },
  { label: '待确认', aliases: ['未知', 'unknown'] },
] as const;

type NutritionGovernanceTransaction = Pick<
  PrismaService,
  | 'ingredient'
  | 'ingredientNutritionCandidate'
  | 'nutritionFood'
  | 'nutritionFoodMapping'
  | 'nutritionSourceRecord'
  | 'supplementNutritionDraft'
>;

export interface NutritionGovernanceOverview {
  foodIngredientCount: number;
  supplementIngredientCount: number;
  confirmedNutritionProfileCount: number;
  incompleteProfileCount: number;
  candidateCount: number;
  supplementDraftCount: number;
}

export interface ListNutritionCandidatesParams {
  status?: NutritionCandidateStatus;
  confidence?: NutritionMatchConfidence;
  reviewGroup?: string;
  ingredientId?: string;
}

export interface ListSupplementDraftsParams {
  status?: SupplementNutritionDraftStatus;
  ingredientId?: string;
}

export interface ImportUsdaSourceRecordOptions {
  ingredientId?: string;
}

export interface ImportReviewedCfctSourceRowsInput {
  rows: ReviewedCfctRow[];
}

export type CfctLocalStructuredLibraryQueue =
  keyof typeof CFCT_LOCAL_LIBRARY_FILES;

export interface GetLocalCfctStructuredLibraryInput {
  queue?: CfctLocalStructuredLibraryQueue;
}

export interface CfctLocalStructuredLibrary {
  queue: CfctLocalStructuredLibraryQueue;
  generatedAt: string | null;
  sourceFile: string;
  summaryFile: string;
  rowCount: number;
  summary: Record<string, unknown>;
  rows: ReviewedCfctRow[];
}

export interface CreateSupplementDraftFromLabelImageInput {
  ingredientId: string;
  imageUrl: string;
  imageKey: string;
  createdBy?: string;
}

export interface ConfirmCandidateFromWorkbenchInput {
  mappingRole?: 'PRIMARY' | 'SECONDARY';
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  reviewNote?: string | null;
  batchMode?: boolean;
}

export interface IngredientCandidateConfigurationEntry extends Omit<
  ConfirmCandidateFromWorkbenchInput,
  'batchMode'
> {
  candidateId: string;
  mappingRole: 'PRIMARY' | 'SECONDARY';
}

export interface ApplyIngredientCandidateConfigurationInput {
  ingredientId: string;
  entries: IngredientCandidateConfigurationEntry[];
}

export interface BatchAgentReviewInput {
  limit?: number;
  forceRerun?: boolean;
  confidence?: NutritionMatchConfidence;
  reviewGroup?: string;
}

export interface RankFoodCandidatesWithAgentInput {
  ingredientId: string;
  reviewerRequirement?: string | null;
  onlineWhitelistSearch?: boolean;
}

export interface GenerateFoodCandidatesOptions {
  reviewerRequirement?: string | null;
  searchPlan?: NutritionCandidateSearchPlan | null;
}

export interface CandidateNutritionValidationWithAgentResult {
  system: NutritionCandidateDataValidationResult;
  agent: NutritionValidationAgentReview | null;
}

interface UsdaFoodData extends Record<string, unknown> {
  fdcId?: string | number;
  description?: string;
  dataType?: string;
  publicationDate?: string;
  foodCategory?: {
    description?: string;
  };
  foodNutrients?: Array<{
    nutrient?: { id?: number; name?: string; unitName?: string };
    amount?: number;
  }>;
}

interface UsdaFoodSearchResult extends Record<string, unknown> {
  foods?: Array<{
    fdcId?: string | number;
    description?: string;
    dataType?: string;
  }>;
}

interface LocalUsdaFoodDataResult {
  food: UsdaFoodData;
  dataDir: string;
}

type CandidateMatchScore = {
  score: number;
  reasons: NutritionMatchReason[];
} | null;

const SEARCH_TERM_GENERIC_TOKENS = new Set([
  'raw',
  'fresh',
  'cooked',
  'dried',
  'dry',
  'boiled',
  'roasted',
  'frozen',
  'common',
  'standard',
  'food',
  'vegetable',
  'vegetables',
  'product',
  'products',
]);

const SEARCH_TERM_DESCRIPTOR_TOKENS = new Set([
  'green',
  'white',
  'red',
  'yellow',
  'black',
  'brown',
  'purple',
  'head',
  'long',
  'medium',
  'regular',
  'freshly',
  'harvest',
  'harvested',
  'stored',
  'enriched',
]);

function resolveCandidateMatchScore(matches: CandidateMatchScore[]): {
  score: number;
  reasons: NutritionMatchReason[];
} {
  const validMatches = matches.filter(
    (match): match is NonNullable<CandidateMatchScore> => !!match,
  );
  if (!validMatches.length) {
    return { score: 0, reasons: [] };
  }

  return validMatches.reduce((best, current) =>
    current.score > best.score ? current : best,
  );
}

function scoreSourceRecordAgainstSearchPlan(
  sourceRecord: NutritionSourceRecord,
  searchPlan: NutritionCandidateSearchPlan,
): { score: number; reasons: NutritionMatchReason[] } {
  const sourceText = [
    sourceRecord.foodName,
    sourceRecord.foodNameEn,
    sourceRecord.category,
    sourceRecord.dataType,
  ]
    .filter(Boolean)
    .join(' ');
  const termGroups = [
    {
      terms: searchPlan.searchTerms,
      label: 'Agent 推荐搜索词匹配',
      baseScore: 0.82,
      contributesToScore: true,
    },
    {
      terms: searchPlan.includeTerms,
      label: 'Agent 宽召回词匹配',
      baseScore: 0.58,
      contributesToScore: true,
    },
    {
      terms: searchPlan.excludeTerms,
      label: 'Agent 标记的易混淆词命中',
      baseScore: 0.01,
      contributesToScore: false,
    },
  ];
  let bestScore = 0;
  const reasons: NutritionMatchReason[] = [];

  for (const group of termGroups) {
    for (const term of group.terms) {
      const score = scoreSearchTermAgainstSource(
        term,
        sourceText,
        group.baseScore,
      );
      if (score <= 0) continue;

      if (group.contributesToScore && score > bestScore) {
        bestScore = score;
      }
      reasons.push({
        code: 'MANUAL',
        label: `${group.label}: ${term}`,
        scoreDelta: group.contributesToScore ? score : 0,
      });
    }
  }

  if (bestScore > 0 && sourceRecord.sourceType === 'USDA') {
    bestScore += 0.05;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: 'USDA 优先来源',
      scoreDelta: 0.05,
    });
  } else if (bestScore > 0 && sourceRecord.sourceType === 'NZFCD') {
    bestScore += 0.045;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: '新西兰食物成分数据库来源',
      scoreDelta: 0.045,
    });
  } else if (bestScore > 0 && sourceRecord.sourceType === 'CFCT') {
    bestScore += 0.04;
    reasons.push({
      code: 'SOURCE_PRIORITY',
      label: '中国食物成分表第二来源',
      scoreDelta: 0.04,
    });
  }

  return {
    score: Math.max(0, Math.min(bestScore, 1)),
    reasons,
  };
}

function scoreSearchTermAgainstSource(
  term: string,
  sourceText: string,
  baseScore: number,
): number {
  const normalizedTerm = normalizeNameForMatch(term);
  const normalizedSource = normalizeNameForMatch(sourceText);
  if (!normalizedTerm || !normalizedSource) {
    return 0;
  }

  if (normalizedSource.includes(normalizedTerm)) {
    return baseScore;
  }

  const termTokens = tokenizeSearchText(term);
  const sourceTokens = new Set(tokenizeSearchText(sourceText));
  const meaningfulTokens = termTokens.filter(
    (token) => !SEARCH_TERM_GENERIC_TOKENS.has(token),
  );
  const coreTokens = meaningfulTokens.filter(
    (token) => !SEARCH_TERM_DESCRIPTOR_TOKENS.has(token),
  );
  if (
    !termTokens.length ||
    !meaningfulTokens.length ||
    !coreTokens.some((token) => sourceTokens.has(token))
  ) {
    return 0;
  }

  const matchedMeaningfulCount = meaningfulTokens.filter((token) =>
    sourceTokens.has(token),
  ).length;
  const coverage = matchedMeaningfulCount / meaningfulTokens.length;
  if (coverage <= 0.5) {
    return 0;
  }

  return Math.max(0.2, baseScore * coverage);
}

function tokenizeSearchText(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function buildEffectiveCandidateSearchRequirement(
  ingredientName: string,
  reviewerRequirement?: string | null,
): string {
  const trimmedRequirement = reviewerRequirement?.trim();
  if (trimmedRequirement) {
    return trimmedRequirement;
  }

  return [
    `请仅根据标准原料「${ingredientName}」生成 USDA/CFCT 候选搜索计划。`,
    '请给出常见英文名、中文别名、可能的数据库搜索词和易混淆项。',
    '优先召回通常食用状态、默认生/未加工来源；不要把易混淆项硬过滤，保留给后续 Agent 排序和人工审核。',
  ].join('');
}

function buildUsdaOnlineSearchQuery(input: {
  ingredientName: string;
  reviewerRequirement: string;
  searchPlan?: NutritionCandidateSearchPlan | null;
}): string {
  const query = [
    ...(input.searchPlan?.searchTerms ?? []),
    ...(input.searchPlan?.includeTerms ?? []),
    input.reviewerRequirement,
    input.ingredientName,
  ]
    .map((term) => term.trim())
    .find(Boolean);

  return query?.slice(0, 120) ?? '';
}

function dedupeUsdaFdcIds(
  foods: UsdaFoodSearchResult['foods'] | null | undefined,
): string[] {
  const ids = new Set<string>();

  for (const food of foods ?? []) {
    const fdcId = food.fdcId?.toString().trim();
    if (fdcId) {
      ids.add(fdcId);
    }
  }

  return [...ids];
}

@Injectable()
export class NutritionGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(LABEL_RECOGNITION_PROVIDER)
    private readonly labelRecognitionProvider?: LabelRecognitionProvider,
    @Optional()
    @Inject(NUTRITION_CANDIDATE_REVIEW_PROVIDER)
    private readonly candidateReviewProvider?: NutritionCandidateReviewProvider,
    @Optional()
    private readonly agentProviderConfigService?: AgentProviderConfigService,
    @Optional()
    private readonly trustedNutritionWebSearchService?: TrustedNutritionWebSearchService,
  ) {}

  async getOverview(): Promise<NutritionGovernanceOverview> {
    const managedIngredientsWhere: Prisma.IngredientWhereInput = {
      type: { in: MANAGED_INGREDIENT_TYPES },
    };

    const [
      foodIngredientCount,
      supplementIngredientCount,
      confirmedNutritionProfileCount,
      incompleteProfileCount,
      candidateCount,
      supplementDraftCount,
    ] = await Promise.all([
      this.prisma.ingredient.count({
        where: { type: IngredientType.FOOD },
      }),
      this.prisma.ingredient.count({
        where: { type: IngredientType.SUPPLEMENT },
      }),
      this.prisma.ingredient.count({
        where: {
          ...managedIngredientsWhere,
          nutritionProfile: { not: Prisma.AnyNull },
        },
      }),
      this.prisma.ingredient.count({
        where: {
          ...managedIngredientsWhere,
          nutritionProfile: { equals: Prisma.AnyNull },
        },
      }),
      this.prisma.ingredientNutritionCandidate.count({
        where: { status: NutritionCandidateStatus.CANDIDATE },
      }),
      this.prisma.supplementNutritionDraft.count({
        where: { status: SupplementNutritionDraftStatus.DRAFT },
      }),
    ]);

    return {
      foodIngredientCount,
      supplementIngredientCount,
      confirmedNutritionProfileCount,
      incompleteProfileCount,
      candidateCount,
      supplementDraftCount,
    };
  }

  async upsertSourceRecord(input: NutritionSourceInput) {
    const sourceKey = buildNutritionSourceKey(
      input.sourceType,
      input.externalId,
    );
    const sourceDetail = toNullableJsonInput(input.sourceDetail);
    const rawData = toJsonInput(input.rawData);
    const normalizedNutrition = toNullableJsonInput(input.normalizedNutrition);
    const createData = {
      sourceType: input.sourceType,
      sourceKey,
      sourceTitle: input.sourceTitle,
      sourceDetail,
      foodName: input.foodName,
      foodNameEn: input.foodNameEn ?? null,
      dataType: input.dataType ?? null,
      category: input.category ?? null,
      rawData,
      normalizedNutrition,
      status: 'ACTIVE',
    } satisfies Prisma.NutritionSourceRecordUncheckedCreateInput;
    const updateData = {
      sourceTitle: input.sourceTitle,
      sourceDetail,
      foodName: input.foodName,
      foodNameEn: input.foodNameEn ?? null,
      dataType: input.dataType ?? null,
      category: input.category ?? null,
      rawData,
      normalizedNutrition,
    } satisfies Prisma.NutritionSourceRecordUncheckedUpdateInput;

    return this.prisma.nutritionSourceRecord.upsert({
      where: {
        sourceType_sourceKey: {
          sourceType: input.sourceType,
          sourceKey,
        },
      },
      create: createData,
      update: updateData,
    });
  }

  async importUsdaSourceRecord(
    fdcId: string,
    options: ImportUsdaSourceRecordOptions = {},
  ) {
    const requestedFdcId = fdcId.trim();
    if (!requestedFdcId) {
      throw new BadRequestException('USDA FDC ID不能为空');
    }

    let linkedIngredient: {
      id: string;
      name: string;
      type: IngredientType;
    } | null = null;
    if (options.ingredientId) {
      linkedIngredient = await this.prisma.ingredient.findUnique({
        where: { id: options.ingredientId },
        select: { id: true, name: true, type: true },
      });

      if (!linkedIngredient || linkedIngredient.type !== IngredientType.FOOD) {
        throw new NotFoundException('食材原料不存在');
      }
    }

    const existingSourceRecord =
      await this.prisma.nutritionSourceRecord.findUnique({
        where: {
          sourceType_sourceKey: {
            sourceType: 'USDA',
            sourceKey: buildNutritionSourceKey('USDA', requestedFdcId),
          },
        },
      });

    if (existingSourceRecord) {
      await this.createManualUsdaCandidateIfNeeded(
        linkedIngredient,
        existingSourceRecord,
      );
      return existingSourceRecord;
    }

    let food: UsdaFoodData;
    const localData = await findLocalUsdaFoodDataByFdcId(requestedFdcId);
    if (localData) {
      food = localData.food;
    } else {
      const apiKey = process.env.USDA_API_KEY;

      if (!apiKey) {
        throw new BadRequestException(
          'USDA API密钥未配置，且本地 USDA 数据中未找到该 FDC ID',
        );
      }

      try {
        const response = await fetch(
          `${USDA_FDC_API_BASE_URL}/food/${encodeURIComponent(requestedFdcId)}?api_key=${apiKey}`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        );

        if (!response.ok) {
          throw new BadRequestException('USDA API请求失败');
        }

        food = (await response.json()) as UsdaFoodData;
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException('USDA API请求失败');
      }
    }

    const externalId = String(food.fdcId ?? requestedFdcId);
    const description = food.description ?? '';
    const profile = mapUsdaNutrientsToNutritionProfile(
      food.foodNutrients || [],
    );
    attachUsdaFdcProfileMetadata(profile, {
      externalId,
      sourceVersion: buildUsdaFdcSourceVersion(food.publicationDate),
      sourceTitle: 'USDA FoodData Central',
      confidenceLevel: 'MEDIUM',
    });
    if (!hasMappedNutritionValues(profile)) {
      throw new BadRequestException('USDA 营养数据为空');
    }

    const sourceRecord = await this.upsertSourceRecord({
      sourceType: 'USDA',
      externalId,
      sourceTitle: 'USDA FoodData Central',
      foodName: description,
      foodNameEn: description,
      dataType: food.dataType ?? null,
      category: food.foodCategory?.description ?? null,
      sourceDetail: {
        fdcId: externalId,
        provider: 'USDA FoodData Central',
        sourceProvider: 'USDA FoodData Central',
        publicationDate: food.publicationDate ?? null,
        importMode: localData ? 'local-usda-csv' : 'usda-api',
      },
      rawData: food,
      normalizedNutrition: profile,
    });

    await this.createManualUsdaCandidateIfNeeded(
      linkedIngredient,
      sourceRecord,
    );

    return sourceRecord;
  }

  async getLocalCfctStructuredLibrary(
    input: GetLocalCfctStructuredLibraryInput = {},
  ): Promise<CfctLocalStructuredLibrary> {
    const queue = input.queue ?? 'auto-ready';
    const sourceFile = CFCT_LOCAL_LIBRARY_FILES[queue];
    if (!sourceFile) {
      throw new BadRequestException('未知的 CFCT 本地中间库队列');
    }

    const reportDir = resolve(
      process.env.CFCT_FULL_REPORT_DIR ??
        join(process.cwd(), CFCT_FULL_REPORT_DIR),
    );
    const [sourcePayload, summary] = await Promise.all([
      this.readLocalCfctJsonFile(join(reportDir, sourceFile)),
      this.readLocalCfctJsonFile(join(reportDir, CFCT_FULL_SUMMARY_FILE)),
    ]);
    const rows = Array.isArray(sourcePayload.rows)
      ? (sourcePayload.rows as ReviewedCfctRow[])
      : [];

    return {
      queue,
      generatedAt: toNullableString(
        sourcePayload.generatedAt ?? summary.generatedAt,
      ),
      sourceFile,
      summaryFile: CFCT_FULL_SUMMARY_FILE,
      rowCount: rows.length,
      summary,
      rows,
    };
  }

  async importReviewedCfctSourceRows(input: ImportReviewedCfctSourceRowsInput) {
    const rows = input.rows ?? [];
    try {
      validateReviewedCfctRows(rows);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'CFCT 审核行格式无效',
      );
    }

    const records: NutritionSourceRecord[] = [];
    for (const row of rows) {
      records.push(await this.upsertSourceRecord(mapCfctRowToSourceInput(row)));
    }

    return {
      importedCount: records.length,
      records,
    };
  }

  async generateFoodCandidatesForIngredient(
    ingredientId: string,
    options: GenerateFoodCandidatesOptions = {},
  ) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    if (!ingredient || ingredient.type !== IngredientType.FOOD) {
      throw new NotFoundException('食材原料不存在');
    }

    const sourceRecords = await this.prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
        sourceType: { in: [...FOOD_SOURCE_TYPES] },
      },
      orderBy: [{ sourceType: 'asc' }, { foodName: 'asc' }],
    });

    const candidates = [];

    for (const sourceRecord of sourceRecords) {
      if (!sourceRecord.normalizedNutrition) continue;

      const sourceType =
        sourceRecord.sourceType as NutritionGovernanceSourceType;
      const baseMatch = scoreIngredientSourceNameMatch({
        ingredientName: ingredient.name,
        sourceFoodName: sourceRecord.foodName,
        sourceType,
      });
      const requirement = options.reviewerRequirement?.trim();
      const requirementMatch = requirement
        ? scoreIngredientSourceNameMatch({
            ingredientName: `${ingredient.name} ${requirement}`,
            sourceFoodName: sourceRecord.foodName,
            sourceType,
          })
        : null;
      const searchPlanMatch = options.searchPlan
        ? scoreSourceRecordAgainstSearchPlan(sourceRecord, options.searchPlan)
        : null;
      const { score, reasons } = resolveCandidateMatchScore([
        baseMatch,
        requirementMatch,
        searchPlanMatch,
      ]);

      if (score < (options.searchPlan ? 0.2 : 0.35)) continue;

      const candidate = await this.upsertFoodCandidateFromSource(
        ingredient,
        sourceRecord,
        { score, reasons },
      );

      if (candidate) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }

  async listCandidates(params: ListNutritionCandidatesParams = {}) {
    return this.prisma.ingredientNutritionCandidate.findMany({
      where: {
        ...(params.status && { status: params.status }),
        ...(params.confidence && { confidence: params.confidence }),
        ...(params.reviewGroup && { reviewGroup: params.reviewGroup }),
        ...(params.ingredientId && { ingredientId: params.ingredientId }),
      },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            type: true,
            nutritionProfile: true,
          },
        },
        sourceRecord: true,
      },
      orderBy: [
        { sourcePriority: 'asc' },
        { score: 'desc' },
        { ingredient: { name: 'asc' } },
        { sourceRecord: { foodName: 'asc' } },
        { id: 'asc' },
      ],
    });
  }

  async reviewCandidateWithAgent(candidateId: string) {
    const candidate = await this.prisma.ingredientNutritionCandidate.findUnique(
      {
        where: { id: candidateId },
        include: {
          ingredient: true,
          sourceRecord: true,
        },
      },
    );

    if (!candidate) {
      throw new NotFoundException('营养候选不存在');
    }

    const rawAgentReview = await (
      await this.getBatchCandidateReviewProvider()
    ).reviewFoodCandidate({
      ingredient: {
        id: candidate.ingredient.id,
        name: candidate.ingredient.name,
        type: candidate.ingredient.type,
      },
      sourceRecord: candidate.sourceRecord,
      normalizedNutrition: candidate.normalizedNutrition,
    });
    const agentReview = normalizeProviderAgentReview(rawAgentReview);
    const hardGateResults = evaluateNutritionCandidateHardGates({
      normalizedNutrition: candidate.normalizedNutrition,
      sourceRecord: candidate.sourceRecord,
      agentReview,
    });
    const reviewGroup = resolveCandidateReviewGroup(
      hardGateResults,
      agentReview,
    );

    return this.prisma.ingredientNutritionCandidate.update({
      where: { id: candidate.id },
      data: {
        agentReview: toJsonInput(agentReview),
        agentReviewStatus: 'COMPLETED',
        hardGateResults: toJsonInput(hardGateResults),
        reviewGroup,
        preparationState: agentReview.preparationState ?? null,
        preparationStateLabel: agentReview.preparationStateLabel ?? null,
        ediblePortionLabel: agentReview.ediblePortionLabel ?? null,
        processingLabel: agentReview.processingLabel ?? null,
      },
      include: {
        ingredient: true,
        sourceRecord: true,
      },
    });
  }

  async rankFoodCandidatesWithAgent(input: RankFoodCandidatesWithAgentInput) {
    const provider = await this.getBatchCandidateReviewProvider();
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: input.ingredientId },
      select: { id: true, name: true, type: true },
    });

    if (!ingredient || ingredient.type !== IngredientType.FOOD) {
      throw new NotFoundException('食材原料不存在');
    }

    const explicitReviewerRequirement =
      input.reviewerRequirement?.trim() || null;
    const reviewerRequirement = buildEffectiveCandidateSearchRequirement(
      ingredient.name,
      input.reviewerRequirement,
    );

    let searchPlan: NutritionCandidateSearchPlan | null = null;
    try {
      searchPlan = await provider.createFoodCandidateSearchPlan({
        ingredient: {
          id: ingredient.id,
          name: ingredient.name,
          type: ingredient.type,
        },
        reviewerRequirement,
      });
    } catch {
      searchPlan = null;
    }

    if (input.onlineWhitelistSearch) {
      await this.importWhitelistedOnlineFoodSources({
        ingredientName: ingredient.name,
        reviewerRequirement,
        searchPlan,
      });
    }

    await this.generateFoodCandidatesForIngredient(input.ingredientId, {
      reviewerRequirement: explicitReviewerRequirement,
      searchPlan,
    });

    const candidates = await this.prisma.ingredientNutritionCandidate.findMany({
      where: {
        ingredientId: input.ingredientId,
        status: {
          in: [
            NutritionCandidateStatus.CANDIDATE,
            NutritionCandidateStatus.CONFIRMED,
          ],
        },
      },
      include: {
        ingredient: {
          select: { id: true, name: true, type: true },
        },
        sourceRecord: true,
      },
      orderBy: [{ sourcePriority: 'asc' }, { score: 'desc' }],
    });

    const reviewedCandidates = [];

    for (const candidate of candidates as any[]) {
      let agentReviewStatus = 'COMPLETED';
      let agentReview: NutritionCandidateAgentReview;
      try {
        const rawAgentReview = await provider.reviewFoodCandidate({
          ingredient: {
            id: candidate.ingredient.id,
            name: candidate.ingredient.name,
            type: candidate.ingredient.type,
          },
          reviewerRequirement,
          sourceRecord: candidate.sourceRecord,
          normalizedNutrition: candidate.normalizedNutrition,
        });
        agentReview = normalizeProviderAgentReview(rawAgentReview);
      } catch (error) {
        agentReviewStatus = 'FAILED';
        agentReview = buildFailedAgentReview(error);
      }
      const hardGateResults = evaluateNutritionCandidateHardGates({
        normalizedNutrition: candidate.normalizedNutrition,
        sourceRecord: candidate.sourceRecord,
        agentReview,
      });
      const reviewGroup = resolveCandidateReviewGroup(
        hardGateResults,
        agentReview,
      );

      if (candidate.status !== NutritionCandidateStatus.CANDIDATE) {
        reviewedCandidates.push({
          ...candidate,
          agentReview,
          agentReviewStatus,
          hardGateResults,
          reviewGroup,
          preparationState: agentReview.preparationState ?? null,
          preparationStateLabel: agentReview.preparationStateLabel ?? null,
          ediblePortionLabel: agentReview.ediblePortionLabel ?? null,
          processingLabel: agentReview.processingLabel ?? null,
        });
        continue;
      }

      const updatedCandidate =
        await this.prisma.ingredientNutritionCandidate.update({
          where: { id: candidate.id },
          data: {
            agentReview: toJsonInput(agentReview),
            agentReviewStatus,
            hardGateResults: toJsonInput(hardGateResults),
            reviewGroup,
            preparationState: agentReview.preparationState ?? null,
            preparationStateLabel: agentReview.preparationStateLabel ?? null,
            ediblePortionLabel: agentReview.ediblePortionLabel ?? null,
            processingLabel: agentReview.processingLabel ?? null,
          },
          include: {
            ingredient: {
              select: { id: true, name: true, type: true },
            },
            sourceRecord: true,
          },
        });

      reviewedCandidates.push(updatedCandidate);
    }

    return sortAgentRankedCandidates(reviewedCandidates);
  }

  async validateCandidateNutritionWithAgent(
    candidateId: string,
  ): Promise<CandidateNutritionValidationWithAgentResult> {
    const candidate = await this.prisma.ingredientNutritionCandidate.findUnique(
      {
        where: { id: candidateId },
        include: {
          ingredient: {
            select: { id: true, name: true, type: true },
          },
          sourceRecord: true,
        },
      },
    );

    if (!candidate) {
      throw new NotFoundException('营养候选不存在');
    }

    const systemValidation = validateNutritionCandidateData({
      sourceType: candidate.sourceRecord.sourceType,
      rawData: candidate.sourceRecord.rawData,
      normalizedNutrition: candidate.normalizedNutrition,
    });

    const provider = await this.getReviewCandidateReviewProvider();
    const agentReview = await provider.reviewNutritionValidation({
      ingredient: {
        id: candidate.ingredient.id,
        name: candidate.ingredient.name,
        type: candidate.ingredient.type,
      },
      sourceRecord: candidate.sourceRecord,
      validation: systemValidation,
    });

    return {
      system: systemValidation,
      agent: agentReview,
    };
  }

  async getAgentSettings() {
    return this.getAgentProviderConfigService().getSettings();
  }

  async updateAgentSettings(input: unknown, userId: string) {
    return this.getAgentProviderConfigService().updateSettings(
      input as any,
      userId,
    );
  }

  async testAgentSettings() {
    const runtime =
      await this.getAgentProviderConfigService().getEnabledDeepSeekRuntimeConfig();
    const provider = new DeepSeekNutritionCandidateReviewProvider(runtime);
    const review = await provider.reviewFoodCandidate({
      ingredient: { id: 'test', name: '鸡胸肉', type: 'FOOD' },
      sourceRecord: {
        id: 'test-source',
        sourceType: 'USDA',
        sourceKey: 'TEST',
        foodName: 'Chicken breast, raw',
      },
      normalizedNutrition: {
        macros: { energyKcal: 120, crudeProtein: 20, crudeFat: 5 },
        meta: { rawBasisType: 'PER_100_G' },
      },
    });

    return {
      ok: true,
      provider: review.provider,
      model: review.model,
      recommendedAction: review.recommendedAction,
    };
  }

  async startBatchAgentReview(
    input: BatchAgentReviewInput = {},
    userId?: string,
  ) {
    const limit = clampInteger(input.limit ?? 50, 1, 500);
    const forceRerun = Boolean(input.forceRerun);
    const provider = await this.getBatchCandidateReviewProvider();
    const job = await this.prisma.nutritionAgentReviewJob.create({
      data: {
        status: 'RUNNING',
        provider: 'DEEPSEEK',
        model: 'configured',
        scope: toJsonInput({
          confidence: input.confidence ?? null,
          reviewGroup: input.reviewGroup ?? null,
        }),
        forceRerun,
        limit,
        createdBy: userId ?? null,
        startedAt: new Date(),
      },
    });

    const candidates = await this.prisma.ingredientNutritionCandidate.findMany({
      where: {
        status: NutritionCandidateStatus.CANDIDATE,
        ...(input.confidence && { confidence: input.confidence }),
        ...(input.reviewGroup && { reviewGroup: input.reviewGroup }),
      },
      include: {
        ingredient: {
          select: { id: true, name: true, type: true },
        },
        sourceRecord: true,
      },
      orderBy: [{ sourcePriority: 'asc' }, { score: 'desc' }],
      take: limit,
    });

    const failures: Array<{ candidateId: string; message: string }> = [];
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const candidate of candidates as any[]) {
      if (candidate.agentReview && !forceRerun) {
        skippedCount += 1;
        continue;
      }

      processedCount += 1;
      try {
        const agentReview = await this.reviewCandidateWithRetry(
          provider,
          candidate,
        );
        const hardGateResults = evaluateNutritionCandidateHardGates({
          normalizedNutrition: candidate.normalizedNutrition,
          sourceRecord: candidate.sourceRecord,
          agentReview,
        });
        const reviewGroup = resolveCandidateReviewGroup(
          hardGateResults,
          agentReview,
        );

        await this.prisma.ingredientNutritionCandidate.update({
          where: { id: candidate.id },
          data: {
            agentReview: toJsonInput(agentReview),
            agentReviewStatus: 'COMPLETED',
            hardGateResults: toJsonInput(hardGateResults),
            reviewGroup,
            preparationState: agentReview.preparationState ?? null,
            preparationStateLabel: agentReview.preparationStateLabel ?? null,
            ediblePortionLabel: agentReview.ediblePortionLabel ?? null,
            processingLabel: agentReview.processingLabel ?? null,
          },
        });
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        const message = sanitizeErrorMessage(error);
        failures.push({ candidateId: candidate.id, message });
        await this.prisma.ingredientNutritionCandidate.update({
          where: { id: candidate.id },
          data: {
            agentReviewStatus: 'FAILED',
            reviewGroup: 'NEEDS_REVIEW',
            hardGateResults: toJsonInput({
              canBatchConfirm: false,
              blockingReasons: ['AGENT_REVIEW_FAILED'],
              warningReasons: [],
            }),
          },
        });
      }
    }

    const status = failedCount > 0 ? 'PARTIAL_FAILED' : 'SUCCEEDED';
    return this.prisma.nutritionAgentReviewJob.update({
      where: { id: job.id },
      data: {
        status,
        totalCount: candidates.length,
        processedCount,
        successCount,
        failedCount,
        skippedCount,
        failureDetails: failures.length ? toJsonInput(failures) : undefined,
        lastError: failures.at(-1)?.message ?? null,
        finishedAt: new Date(),
      },
    });
  }

  async getLatestAgentReviewJob() {
    return this.prisma.nutritionAgentReviewJob.findFirst({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAgentReviewJob(jobId: string) {
    const job = await this.prisma.nutritionAgentReviewJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Agent 审核任务不存在');
    }

    return job;
  }

  async createSupplementDraftFromLabelImage(
    input: CreateSupplementDraftFromLabelImageInput,
  ) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: input.ingredientId },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    if (!ingredient || ingredient.type !== IngredientType.SUPPLEMENT) {
      throw new NotFoundException('补剂原料不存在');
    }

    const extraction = await this.getLabelProvider().extractFromImage({
      imageUrl: input.imageUrl,
      ingredientName: ingredient.name,
    });

    return this.prisma.supplementNutritionDraft.create({
      data: {
        ingredientId: ingredient.id,
        imageUrl: input.imageUrl,
        imageKey: input.imageKey,
        ocrText: extraction.ocrText,
        aiExtraction: toJsonInput(extraction),
        normalizedNutrition: toNullableJsonInput(
          extraction.normalizedNutrition,
        ),
        missingFields: extraction.missingFields,
        status: SupplementNutritionDraftStatus.DRAFT,
        createdBy: input.createdBy ?? null,
      },
    });
  }

  async listSupplementDrafts(params: ListSupplementDraftsParams = {}) {
    return this.prisma.supplementNutritionDraft.findMany({
      where: {
        ...(params.status && { status: params.status }),
        ...(params.ingredientId && { ingredientId: params.ingredientId }),
      },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
            type: true,
            nutritionProfile: true,
          },
        },
        sourceRecord: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async confirmSupplementDraft(draftId: string, userId: string) {
    const draft = await this.prisma.supplementNutritionDraft.findUnique({
      where: { id: draftId },
      include: {
        ingredient: true,
        sourceRecord: true,
      },
    });

    if (!draft) {
      throw new NotFoundException('补剂草稿不存在');
    }

    if (draft.status !== SupplementNutritionDraftStatus.DRAFT) {
      throw new BadRequestException('仅草稿状态可以确认');
    }

    if (draft.ingredient.type !== IngredientType.SUPPLEMENT) {
      throw new BadRequestException('补剂草稿关联的原料类型无效');
    }

    if (!draft.normalizedNutrition) {
      throw new BadRequestException('草稿缺少标准化营养数据');
    }

    const profile = normalizeNutritionProfile(
      draft.normalizedNutrition as unknown as NutritionProfile,
    );

    if (!profile) {
      throw new BadRequestException('草稿缺少标准化营养数据');
    }

    const confirmedAt = new Date();
    const confirmedProfile = withConfirmationMeta(profile, {
      sourceType: 'SUPPLEMENT_LABEL',
      sourceTitle: `${draft.ingredient.name} 补剂标签`,
      sourceProvider: 'Product label',
      confidenceLevel: draft.missingFields.length > 0 ? 'MEDIUM' : 'HIGH',
      versionNote: `Confirmed from supplement label image: ${draft.imageKey}`,
    });

    return this.prisma.$transaction(async (tx) => {
      const client = tx as NutritionGovernanceTransaction;
      const sourceRecord = await client.nutritionSourceRecord.upsert({
        where: {
          sourceType_sourceKey: {
            sourceType: 'SUPPLEMENT_LABEL',
            sourceKey: buildNutritionSourceKey('SUPPLEMENT_LABEL', draft.id),
          },
        },
        create: {
          sourceType: 'SUPPLEMENT_LABEL',
          sourceKey: buildNutritionSourceKey('SUPPLEMENT_LABEL', draft.id),
          sourceTitle: `${draft.ingredient.name} 补剂标签`,
          sourceDetail: toJsonInput({
            provider: 'Product label',
            sourceProvider: 'Product label',
            imageUrl: draft.imageUrl,
            imageKey: draft.imageKey,
          }),
          foodName: draft.ingredient.name,
          foodNameEn: null,
          dataType: 'PRODUCT_LABEL',
          category: 'SUPPLEMENT',
          rawData: toJsonInput({
            draftId: draft.id,
            imageUrl: draft.imageUrl,
            imageKey: draft.imageKey,
            ocrText: draft.ocrText,
            aiExtraction: draft.aiExtraction,
          }),
          normalizedNutrition: toJsonInput(confirmedProfile),
          status: 'ACTIVE',
        },
        update: {
          sourceTitle: `${draft.ingredient.name} 补剂标签`,
          sourceDetail: toJsonInput({
            provider: 'Product label',
            sourceProvider: 'Product label',
            imageUrl: draft.imageUrl,
            imageKey: draft.imageKey,
          }),
          foodName: draft.ingredient.name,
          foodNameEn: null,
          dataType: 'PRODUCT_LABEL',
          category: 'SUPPLEMENT',
          rawData: toJsonInput({
            draftId: draft.id,
            imageUrl: draft.imageUrl,
            imageKey: draft.imageKey,
            ocrText: draft.ocrText,
            aiExtraction: draft.aiExtraction,
          }),
          normalizedNutrition: toJsonInput(confirmedProfile),
        },
      });

      await client.ingredient.update({
        where: { id: draft.ingredientId },
        data: {
          nutritionProfile: toJsonInput(confirmedProfile),
        },
      });

      return client.supplementNutritionDraft.update({
        where: { id: draft.id },
        data: {
          sourceRecordId: sourceRecord.id,
          normalizedNutrition: toJsonInput(confirmedProfile),
          status: SupplementNutritionDraftStatus.CONFIRMED,
          confirmedBy: userId,
          confirmedAt,
        },
      });
    });
  }

  async confirmCandidate(candidateId: string, userId: string) {
    return this.confirmCandidateFromWorkbench(candidateId, userId, {
      mappingRole: 'PRIMARY',
    });
  }

  async applyIngredientCandidateConfiguration(
    input: ApplyIngredientCandidateConfigurationInput,
    userId: string,
  ) {
    const entries = input.entries ?? [];
    if (!input.ingredientId || entries.length === 0) {
      throw new BadRequestException('原料营养配置不能为空');
    }

    const primaryEntries = entries.filter(
      (entry) => entry.mappingRole === 'PRIMARY',
    );
    if (primaryEntries.length !== 1) {
      throw new BadRequestException('每次保存必须且只能选择一个主档案');
    }

    const candidateIds = entries.map((entry) => entry.candidateId);
    const uniqueCandidateIds = [...new Set(candidateIds)];
    if (
      uniqueCandidateIds.length !== candidateIds.length ||
      uniqueCandidateIds.some((id) => !id)
    ) {
      throw new BadRequestException('候选档案不能重复或为空');
    }

    const candidates = await this.prisma.ingredientNutritionCandidate.findMany({
      where: { id: { in: uniqueCandidateIds } },
      include: {
        ingredient: true,
        sourceRecord: true,
      },
    });

    if (candidates.length !== uniqueCandidateIds.length) {
      throw new NotFoundException('部分营养候选不存在');
    }

    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );
    const orderedCandidates = await Promise.all(
      entries.map(async (entry) => {
        const candidate = candidatesById.get(entry.candidateId);
        if (!candidate) {
          throw new NotFoundException('部分营养候选不存在');
        }
        if (candidate.ingredientId !== input.ingredientId) {
          throw new BadRequestException('只能一次保存同一个原料的营养配置');
        }
        if (!CONFIGURABLE_CANDIDATE_STATUSES.has(candidate.status)) {
          throw new BadRequestException(
            '仅待确认或已确认候选可以保存到原料配置',
          );
        }
        const detailedCandidate =
          await this.refreshUsdaCandidateNutritionFromLocalCsvIfAvailable(
            candidate,
          );
        if (!detailedCandidate.normalizedNutrition) {
          throw new BadRequestException('候选缺少标准化营养数据');
        }
        return detailedCandidate;
      }),
    );

    const confirmedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const client = tx as NutritionGovernanceTransaction;
      const results = [];

      for (const [index, entry] of entries.entries()) {
        results.push(
          await this.persistCandidateConfirmation({
            client,
            candidate: orderedCandidates[index],
            input: entry,
            userId,
            confirmedAt,
          }),
        );
      }

      return results;
    });
  }

  async confirmCandidateFromWorkbench(
    candidateId: string,
    userId: string,
    input: ConfirmCandidateFromWorkbenchInput = {},
  ) {
    let candidate = await this.prisma.ingredientNutritionCandidate.findUnique({
      where: { id: candidateId },
      include: {
        ingredient: true,
        sourceRecord: true,
      },
    });

    if (!candidate) {
      throw new NotFoundException('营养候选不存在');
    }

    if (candidate.status !== NutritionCandidateStatus.CANDIDATE) {
      throw new BadRequestException('仅待确认候选可以确认');
    }

    candidate =
      await this.refreshUsdaCandidateNutritionFromLocalCsvIfAvailable(
        candidate,
      );

    if (!candidate.normalizedNutrition) {
      throw new BadRequestException('候选缺少标准化营养数据');
    }

    const profile = normalizeNutritionProfile(
      candidate.normalizedNutrition as unknown as NutritionProfile,
    );

    if (!profile) {
      throw new BadRequestException('候选缺少标准化营养数据');
    }

    if (input.batchMode && !candidateCanBatchConfirm(candidate)) {
      throw new BadRequestException('该候选未通过批量确认硬闸门');
    }

    const confirmedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      return this.persistCandidateConfirmation({
        client: tx as NutritionGovernanceTransaction,
        candidate,
        input,
        userId,
        confirmedAt,
      });
    });
  }

  async batchConfirmCandidatesFromWorkbench(
    candidateIds: string[],
    userId: string,
  ) {
    const results = [];

    for (const candidateId of candidateIds) {
      results.push(
        await this.confirmCandidateFromWorkbench(candidateId, userId, {
          mappingRole: 'PRIMARY',
          batchMode: true,
        }),
      );
    }

    return results;
  }

  async rejectCandidate(candidateId: string) {
    const candidate = await this.prisma.ingredientNutritionCandidate.findUnique(
      {
        where: { id: candidateId },
        select: { id: true, status: true },
      },
    );

    if (!candidate) {
      throw new NotFoundException('营养候选不存在');
    }

    if (candidate.status !== NutritionCandidateStatus.CANDIDATE) {
      throw new BadRequestException('仅待确认候选可以拒绝');
    }

    return this.prisma.ingredientNutritionCandidate.update({
      where: { id: candidateId },
      data: { status: NutritionCandidateStatus.REJECTED },
    });
  }

  async rejectSupplementDraft(draftId: string) {
    const draft = await this.prisma.supplementNutritionDraft.findUnique({
      where: { id: draftId },
      select: { id: true, status: true },
    });

    if (!draft) {
      throw new NotFoundException('补剂草稿不存在');
    }

    if (draft.status !== SupplementNutritionDraftStatus.DRAFT) {
      throw new BadRequestException('仅草稿状态可以拒绝');
    }

    return this.prisma.supplementNutritionDraft.update({
      where: { id: draftId },
      data: { status: SupplementNutritionDraftStatus.REJECTED },
    });
  }

  private async upsertFoodCandidateFromSource(
    ingredient: { id: string; name: string; type: IngredientType },
    sourceRecord: NutritionSourceRecord,
    match: {
      score: number;
      reasons: Array<{ code: string; label: string; scoreDelta: number }>;
    },
  ) {
    if (!sourceRecord.normalizedNutrition) {
      return null;
    }

    const candidateWhere = {
      ingredientId_sourceRecordId: {
        ingredientId: ingredient.id,
        sourceRecordId: sourceRecord.id,
      },
    };
    const existingCandidate =
      await this.prisma.ingredientNutritionCandidate.findUnique({
        where: candidateWhere,
        select: { id: true, status: true },
      });

    if (
      existingCandidate &&
      TERMINAL_CANDIDATE_STATUSES.has(existingCandidate.status)
    ) {
      return null;
    }

    const detailedSourceRecord =
      await this.refreshUsdaSourceRecordFromLocalCsvIfAvailable(sourceRecord);
    if (!detailedSourceRecord.normalizedNutrition) {
      return null;
    }

    const sourceType =
      detailedSourceRecord.sourceType as NutritionGovernanceSourceType;

    return this.prisma.ingredientNutritionCandidate.upsert({
      where: candidateWhere,
      create: {
        ingredientId: ingredient.id,
        sourceRecordId: detailedSourceRecord.id,
        sourcePriority: getSourcePriority(sourceType),
        confidence: classifyMatchConfidence(match.score),
        score: match.score,
        matchReasons: toJsonInput(match.reasons),
        normalizedNutrition: toJsonInput(
          detailedSourceRecord.normalizedNutrition,
        ),
        status: NutritionCandidateStatus.CANDIDATE,
      },
      update: {
        sourcePriority: getSourcePriority(sourceType),
        confidence: classifyMatchConfidence(match.score),
        score: match.score,
        matchReasons: toJsonInput(match.reasons),
        normalizedNutrition: toJsonInput(
          detailedSourceRecord.normalizedNutrition,
        ),
        status: NutritionCandidateStatus.CANDIDATE,
      },
    });
  }

  private async refreshUsdaSourceRecordFromLocalCsvIfAvailable(
    sourceRecord: NutritionSourceRecord,
  ): Promise<NutritionSourceRecord> {
    if (sourceRecord.sourceType !== 'USDA') {
      return sourceRecord;
    }

    const currentDetail = toPlainRecord(sourceRecord.sourceDetail);
    if (currentDetail.importMode === 'local-usda-csv') {
      return sourceRecord;
    }

    const fdcId = getUsdaFdcIdFromSourceRecord(sourceRecord);
    if (!fdcId) {
      return sourceRecord;
    }

    const localData = await findLocalUsdaFoodDataByFdcId(fdcId);
    if (!localData) {
      return sourceRecord;
    }

    const externalId = String(localData.food.fdcId ?? fdcId);
    const description = localData.food.description ?? sourceRecord.foodName;
    const profile = mapUsdaNutrientsToNutritionProfile(
      localData.food.foodNutrients || [],
    );
    attachUsdaFdcProfileMetadata(profile, {
      externalId,
      sourceVersion: buildUsdaFdcSourceVersion(localData.food.publicationDate),
      sourceTitle: 'USDA FoodData Central',
      confidenceLevel: 'MEDIUM',
    });

    if (!hasMappedNutritionValues(profile)) {
      return sourceRecord;
    }

    return this.prisma.nutritionSourceRecord.update({
      where: { id: sourceRecord.id },
      data: {
        sourceTitle: 'USDA FoodData Central',
        foodName: description,
        foodNameEn: description,
        dataType: localData.food.dataType ?? sourceRecord.dataType,
        category: sourceRecord.category ?? null,
        sourceDetail: toJsonInput({
          ...currentDetail,
          fdcId: externalId,
          provider: 'USDA FoodData Central',
          sourceProvider: 'USDA FoodData Central',
          publicationDate:
            localData.food.publicationDate ??
            currentDetail.publicationDate ??
            null,
          importMode: 'local-usda-csv',
        }),
        rawData: toJsonInput(localData.food),
        normalizedNutrition: toJsonInput(profile),
      },
    });
  }

  private async refreshUsdaCandidateNutritionFromLocalCsvIfAvailable<
    T extends {
      id: string;
      normalizedNutrition?: unknown;
      sourceRecord?: NutritionSourceRecord | null;
    },
  >(candidate: T): Promise<T> {
    if (!candidate.sourceRecord) {
      return candidate;
    }

    const detailedSourceRecord =
      await this.refreshUsdaSourceRecordFromLocalCsvIfAvailable(
        candidate.sourceRecord,
      );
    if (detailedSourceRecord === candidate.sourceRecord) {
      return candidate;
    }

    await this.prisma.ingredientNutritionCandidate.update({
      where: { id: candidate.id },
      data: {
        normalizedNutrition: toJsonInput(
          detailedSourceRecord.normalizedNutrition,
        ),
      },
    });

    return {
      ...candidate,
      sourceRecord: detailedSourceRecord,
      normalizedNutrition: detailedSourceRecord.normalizedNutrition,
    };
  }

  private async createManualUsdaCandidateIfNeeded(
    ingredient: { id: string; name: string; type: IngredientType } | null,
    sourceRecord: NutritionSourceRecord,
  ) {
    if (!ingredient) {
      return null;
    }

    return this.upsertFoodCandidateFromSource(ingredient, sourceRecord, {
      score: 0.95,
      reasons: [
        {
          code: 'MANUAL',
          label: '人工指定 USDA FDC ID',
          scoreDelta: 0.8,
        },
        {
          code: 'SOURCE_PRIORITY',
          label: 'USDA 优先来源',
          scoreDelta: 0.15,
        },
      ],
    });
  }

  private async readLocalCfctJsonFile(
    path: string,
  ): Promise<Record<string, unknown>> {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as Record<
        string,
        unknown
      >;
    } catch (error) {
      if (isFileNotFoundError(error)) {
        throw new BadRequestException(
          'CFCT 全量中间库尚未生成，请先运行 npm run structure:cfct-full',
        );
      }
      if (error instanceof SyntaxError) {
        throw new BadRequestException('CFCT 全量中间库 JSON 格式无效');
      }
      throw error;
    }
  }

  private mapIngredientTypeToNutritionFoodCategory(
    type: IngredientType,
  ): NutritionFoodCategory {
    if (type === IngredientType.SUPPLEMENT) {
      return NutritionFoodCategory.SUPPLEMENT;
    }

    return NutritionFoodCategory.OTHER;
  }

  private getLabelProvider(): LabelRecognitionProvider {
    return (
      this.labelRecognitionProvider ?? new DisabledLabelRecognitionProvider()
    );
  }

  private async getBatchCandidateReviewProvider(): Promise<NutritionCandidateReviewProvider> {
    if (this.agentProviderConfigService) {
      try {
        const runtime =
          await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig();
        return new DeepSeekNutritionCandidateReviewProvider(runtime);
      } catch (error) {
        if (
          !this.candidateReviewProvider ||
          this.candidateReviewProvider instanceof
            DisabledNutritionCandidateReviewProvider
        ) {
          throw error;
        }
      }
    }

    if (this.candidateReviewProvider) {
      return this.candidateReviewProvider;
    }

    return new DisabledNutritionCandidateReviewProvider();
  }

  private async getReviewCandidateReviewProvider(): Promise<NutritionCandidateReviewProvider> {
    if (this.agentProviderConfigService) {
      try {
        const runtime =
          await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
            purpose: 'REVIEW',
          });
        return new DeepSeekNutritionCandidateReviewProvider(runtime);
      } catch (error) {
        if (
          !this.candidateReviewProvider ||
          this.candidateReviewProvider instanceof
            DisabledNutritionCandidateReviewProvider
        ) {
          throw error;
        }
      }
    }

    if (this.candidateReviewProvider) {
      return this.candidateReviewProvider;
    }

    return new DisabledNutritionCandidateReviewProvider();
  }

  private async importWhitelistedOnlineFoodSources(input: {
    ingredientName: string;
    reviewerRequirement: string;
    searchPlan?: NutritionCandidateSearchPlan | null;
  }): Promise<NutritionSourceRecord[]> {
    const records: NutritionSourceRecord[] = [];

    records.push(...(await this.importUsdaOnlineSearchResults(input)));

    const trustedSourceInputs =
      await this.getTrustedNutritionWebSearchService().search({
        ingredientName: input.ingredientName,
        reviewerRequirement: input.reviewerRequirement,
        searchTerms: [
          ...(input.searchPlan?.searchTerms ?? []),
          ...(input.searchPlan?.includeTerms ?? []),
        ],
      });

    for (const sourceInput of trustedSourceInputs) {
      records.push(await this.upsertSourceRecord(sourceInput));
    }

    return records;
  }

  private async importUsdaOnlineSearchResults(input: {
    ingredientName: string;
    reviewerRequirement: string;
    searchPlan?: NutritionCandidateSearchPlan | null;
  }): Promise<NutritionSourceRecord[]> {
    const apiKey = process.env.USDA_API_KEY;
    if (!apiKey) {
      return [];
    }

    const query = buildUsdaOnlineSearchQuery(input);
    if (!query) {
      return [];
    }

    let searchResult: UsdaFoodSearchResult;
    try {
      const response = await fetch(
        `${USDA_FDC_API_BASE_URL}/foods/search?api_key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            pageSize: USDA_ONLINE_SEARCH_PAGE_SIZE,
            dataType: USDA_ONLINE_SEARCH_DATA_TYPES,
          }),
        },
      );

      if (!response.ok) {
        throw new BadRequestException('USDA 白名单搜索请求失败');
      }

      searchResult = (await response.json()) as UsdaFoodSearchResult;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('USDA 白名单搜索请求失败');
    }

    const fdcIds = dedupeUsdaFdcIds(searchResult.foods)
      .slice(0, USDA_ONLINE_IMPORT_LIMIT);
    const importedRecords: NutritionSourceRecord[] = [];

    for (const fdcId of fdcIds) {
      importedRecords.push(await this.importUsdaSourceRecord(fdcId));
    }

    return importedRecords;
  }

  private getAgentProviderConfigService(): AgentProviderConfigService {
    if (!this.agentProviderConfigService) {
      throw new BadRequestException('Agent 设置服务未注册');
    }

    return this.agentProviderConfigService;
  }

  private getTrustedNutritionWebSearchService(): TrustedNutritionWebSearchService {
    return (
      this.trustedNutritionWebSearchService ??
      new TrustedNutritionWebSearchService()
    );
  }

  private async persistCandidateConfirmation(params: {
    client: NutritionGovernanceTransaction;
    candidate: any;
    input: ConfirmCandidateFromWorkbenchInput;
    userId: string;
    confirmedAt: Date;
  }) {
    const { client, candidate, input, userId, confirmedAt } = params;
    const profile = normalizeNutritionProfile(
      candidate.normalizedNutrition as unknown as NutritionProfile,
    );

    if (!profile) {
      throw new BadRequestException('候选缺少标准化营养数据');
    }

    const isPrimary = (input.mappingRole ?? 'PRIMARY') === 'PRIMARY';
    const candidateReviewData = candidate as Record<string, any>;
    const preparationState = normalizeConfirmationPreparationState(
      input.preparationState ?? candidateReviewData.preparationState,
      input.preparationStateLabel ?? candidateReviewData.preparationStateLabel,
    );
    const preparationStateLabel = normalizeConfirmationPreparationStateLabel(
      preparationState,
      input.preparationStateLabel ?? candidateReviewData.preparationStateLabel,
    );
    const ediblePortionLabel = normalizeConfirmationLabel(
      CONFIRMATION_EDIBLE_PORTION_OPTIONS,
      input.ediblePortionLabel ?? candidateReviewData.ediblePortionLabel,
    );
    const processingLabel = normalizeConfirmationLabel(
      CONFIRMATION_PROCESSING_OPTIONS,
      input.processingLabel ?? candidateReviewData.processingLabel,
    );
    const reviewNote = input.reviewNote ?? null;
    const confirmedProfile = attachSourceRecordProfileMetadata(profile, {
      sourceType: candidate.sourceRecord
        .sourceType as NutritionGovernanceSourceType,
      sourceKey: candidate.sourceRecord.sourceKey,
      sourceTitle: candidate.sourceRecord.sourceTitle,
      sourceDetail: candidate.sourceRecord.sourceDetail,
      confidenceLevel: candidate.confidence as NutritionMatchConfidence,
      versionNote: `Confirmed from ${candidate.sourceRecord.sourceTitle}`,
    });

    if (isPrimary) {
      await client.ingredient.update({
        where: { id: candidate.ingredientId },
        data: {
          nutritionProfile: toJsonInput(confirmedProfile),
        },
      });
    }

    const nutritionFood = await client.nutritionFood.upsert({
      where: {
        name_dataSource_version: {
          name: candidate.sourceRecord.foodName,
          dataSource: candidate.sourceRecord.sourceType,
          version: 1,
        },
      },
      create: {
        name: candidate.sourceRecord.foodName,
        nameEn: candidate.sourceRecord.foodNameEn,
        category: this.mapIngredientTypeToNutritionFoodCategory(
          candidate.ingredient.type,
        ),
        dataSource: candidate.sourceRecord.sourceType,
        externalId: candidate.sourceRecord.sourceKey,
        version: 1,
        status: NutritionFoodStatus.VERIFIED,
        preparationState,
        preparationStateLabel,
        ediblePortionLabel,
        processingLabel,
        nutritionData: toJsonInput(confirmedProfile),
        notes: reviewNote ?? candidate.sourceRecord.sourceTitle,
        verifiedBy: userId,
        verifiedAt: confirmedAt,
      },
      update: {
        nameEn: candidate.sourceRecord.foodNameEn,
        category: this.mapIngredientTypeToNutritionFoodCategory(
          candidate.ingredient.type,
        ),
        externalId: candidate.sourceRecord.sourceKey,
        status: NutritionFoodStatus.VERIFIED,
        preparationState,
        preparationStateLabel,
        ediblePortionLabel,
        processingLabel,
        nutritionData: toJsonInput(confirmedProfile),
        notes: reviewNote ?? candidate.sourceRecord.sourceTitle,
        verifiedBy: userId,
        verifiedAt: confirmedAt,
      },
    });

    if (isPrimary) {
      await client.nutritionFoodMapping.updateMany({
        where: {
          ingredientId: candidate.ingredientId,
          isPrimary: true,
          NOT: {
            nutritionFoodId: nutritionFood.id,
          },
        },
        data: {
          isPrimary: false,
        },
      });
    }

    await client.nutritionFoodMapping.upsert({
      where: {
        nutritionFoodId_ingredientId: {
          nutritionFoodId: nutritionFood.id,
          ingredientId: candidate.ingredientId,
        },
      },
      create: {
        nutritionFoodId: nutritionFood.id,
        ingredientId: candidate.ingredientId,
        yieldRate: 1,
        isPrimary,
        notes: reviewNote ?? candidate.sourceRecord.sourceTitle,
      },
      update: {
        isPrimary,
        notes: reviewNote ?? candidate.sourceRecord.sourceTitle,
      },
    });

    return client.ingredientNutritionCandidate.update({
      where: { id: candidate.id },
      data: {
        status: NutritionCandidateStatus.CONFIRMED,
        confirmedBy: userId,
        confirmedAt,
        preparationState,
        preparationStateLabel,
        ediblePortionLabel,
        processingLabel,
        reviewNote,
        confirmationSnapshot: toJsonInput({
          ingredientId: candidate.ingredientId,
          sourceRecordId: candidate.sourceRecordId,
          sourceType: candidate.sourceRecord.sourceType,
          sourceTitle: candidate.sourceRecord.sourceTitle,
          confidence: candidate.confidence,
          score: candidate.score,
          mappingRole: isPrimary ? 'PRIMARY' : 'SECONDARY',
          agentReview: candidateReviewData.agentReview ?? null,
          hardGateResults: candidateReviewData.hardGateResults ?? null,
          preparationState,
          preparationStateLabel,
          ediblePortionLabel,
          processingLabel,
          reviewNote,
          confirmedBy: userId,
          confirmedAt: confirmedAt.toISOString(),
          nutritionProfile: confirmedProfile,
        }),
      },
    });
  }

  private async reviewCandidateWithRetry(
    provider: NutritionCandidateReviewProvider,
    candidate: any,
  ) {
    const retryCount = this.agentProviderConfigService
      ? (await this.agentProviderConfigService.getSettings()).retryCount
      : 2;
    let attempt = 0;

    while (true) {
      try {
        const agentReview = await provider.reviewFoodCandidate({
          ingredient: {
            id: candidate.ingredient.id,
            name: candidate.ingredient.name,
            type: candidate.ingredient.type,
          },
          sourceRecord: candidate.sourceRecord,
          normalizedNutrition: candidate.normalizedNutrition,
        });
        return normalizeProviderAgentReview(agentReview);
      } catch (error) {
        if (!shouldRetryProviderError(error) || attempt >= retryCount) {
          throw error;
        }

        attempt += 1;
        await delay(10 * attempt);
      }
    }
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getUsdaFdcIdFromSourceRecord(
  sourceRecord: Pick<NutritionSourceRecord, 'sourceKey' | 'sourceDetail'>,
): string | null {
  const detail = toPlainRecord(sourceRecord.sourceDetail);
  const detailFdcId = detail.fdcId ?? detail.externalId;
  if (typeof detailFdcId === 'string' && detailFdcId.trim()) {
    return detailFdcId.trim();
  }
  if (typeof detailFdcId === 'number' && Number.isFinite(detailFdcId)) {
    return String(detailFdcId);
  }

  const sourceKey = sourceRecord.sourceKey?.trim();
  if (!sourceKey) {
    return null;
  }
  return sourceKey.startsWith('USDA:') ? sourceKey.slice(5) : sourceKey;
}

function normalizeProviderAgentReview(value: any) {
  return normalizeNutritionCandidateAgentReview(
    value as Record<string, unknown>,
    {
      provider: value?.provider,
      model: value?.model,
      promptVersion: value?.promptVersion,
    },
  );
}

function buildFailedAgentReview(error: unknown): NutritionCandidateAgentReview {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : '未知错误';

  return {
    provider: 'deepseek',
    model: undefined,
    promptVersion: 'nutrition-candidate-review-v1',
    identityVerdict: 'UNKNOWN',
    stateVerdict: 'UNKNOWN',
    ediblePortionVerdict: 'UNKNOWN',
    processingVerdict: 'UNKNOWN',
    recommendedAction: 'NEEDS_HUMAN_REVIEW',
    preparationState: 'UNKNOWN',
    preparationStateLabel: '待确认',
    ediblePortionLabel: '待确认',
    processingLabel: '待确认',
    riskFlags: ['AGENT_REVIEW_FAILED'],
    rationale: `Agent 审核失败：${message}`,
    confidence: 'LOW',
  };
}

function normalizeConfirmationPreparationState(
  value?: string | null,
  label?: string | null,
): string | null {
  const option =
    findConfirmationOption(CONFIRMATION_PREPARATION_STATE_OPTIONS, value) ??
    findConfirmationOption(CONFIRMATION_PREPARATION_STATE_OPTIONS, label);

  return option?.value ?? null;
}

function normalizeConfirmationPreparationStateLabel(
  value?: string | null,
  label?: string | null,
): string | null {
  const option =
    findConfirmationOption(CONFIRMATION_PREPARATION_STATE_OPTIONS, value) ??
    findConfirmationOption(CONFIRMATION_PREPARATION_STATE_OPTIONS, label);

  return option?.label ?? null;
}

function normalizeConfirmationLabel(
  options: readonly { label: string; aliases?: readonly string[] }[],
  label?: string | null,
): string | null {
  return findConfirmationOption(options, label)?.label ?? null;
}

function findConfirmationOption<
  TOption extends {
    label: string;
    value?: string;
    aliases?: readonly string[];
  },
>(options: readonly TOption[], value?: string | null): TOption | undefined {
  const normalized = normalizeConfirmationText(value);
  if (!normalized) return undefined;

  return options.find((option) => {
    if (
      option.value &&
      normalizeConfirmationText(option.value) === normalized
    ) {
      return true;
    }
    if (normalizeConfirmationText(option.label) === normalized) {
      return true;
    }
    return option.aliases?.some(
      (alias) => normalizeConfirmationText(alias) === normalized,
    );
  });
}

function normalizeConfirmationText(value?: string | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }

  return toJsonInput(value);
}

function candidateCanBatchConfirm(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const hardGateResults = (candidate as Record<string, unknown>)
    .hardGateResults;

  return (
    !!hardGateResults &&
    typeof hardGateResults === 'object' &&
    !Array.isArray(hardGateResults) &&
    (hardGateResults as Record<string, unknown>).canBatchConfirm === true
  );
}

function sortAgentRankedCandidates<
  T extends { agentReview?: any; sourcePriority?: number; score?: number },
>(candidates: T[]): T[] {
  const actionRank: Record<string, number> = {
    CONFIRM_PRIMARY: 0,
    CONFIRM_SECONDARY: 1,
    NEEDS_HUMAN_REVIEW: 2,
    FIND_ALTERNATIVE_SOURCE: 3,
    REJECT: 4,
  };

  return [...candidates].sort((left, right) => {
    const leftRank =
      actionRank[left.agentReview?.recommendedAction as string] ?? 5;
    const rightRank =
      actionRank[right.agentReview?.recommendedAction as string] ?? 5;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftSourcePriority = left.sourcePriority ?? Number.MAX_SAFE_INTEGER;
    const rightSourcePriority = right.sourcePriority ?? Number.MAX_SAFE_INTEGER;
    if (leftSourcePriority !== rightSourcePriority) {
      return leftSourcePriority - rightSourcePriority;
    }

    return (right.score ?? 0) - (left.score ?? 0);
  });
}

function getSourceProvider(
  sourceDetail: Prisma.JsonValue | null,
): string | null {
  if (
    !sourceDetail ||
    typeof sourceDetail !== 'object' ||
    Array.isArray(sourceDetail)
  ) {
    return null;
  }

  const provider = sourceDetail.provider ?? sourceDetail.sourceProvider;

  return typeof provider === 'string' && provider.trim()
    ? provider.trim()
    : null;
}

function withConfirmationMeta(
  profile: NutritionProfileV2,
  meta: Pick<
    NutritionProfileV2['meta'],
    | 'sourceType'
    | 'sourceTitle'
    | 'sourceProvider'
    | 'confidenceLevel'
    | 'versionNote'
  >,
): NutritionProfileV2 {
  return {
    ...profile,
    meta: {
      ...profile.meta,
      ...meta,
    },
  };
}

function hasMappedNutritionValues(profile: NutritionProfileV2): boolean {
  const groupedTabs = [
    profile.macros,
    profile.minerals,
    profile.vitamins,
    profile.fattyAcids,
    profile.aminoAcids,
  ];

  return groupedTabs.some((tab) =>
    Object.values(tab).some((value) => typeof value === 'number'),
  );
}

async function findLocalUsdaFoodDataByFdcId(
  fdcId: string,
): Promise<LocalUsdaFoodDataResult | null> {
  const dataDir = await resolveLocalUsdaDataDir();
  if (!dataDir) {
    return null;
  }

  const foodPath = join(dataDir, 'food.csv');
  const nutrientPath = join(dataDir, 'nutrient.csv');
  const foodNutrientPath = join(dataDir, 'food_nutrient.csv');
  const matchedFoodRows: Array<Record<string, string>> = [];

  await forEachCsvRecord(foodPath, (record) => {
    if (record.fdc_id === fdcId) {
      matchedFoodRows.push(record);
    }
  });

  const foodRow = matchedFoodRows[0];
  if (!foodRow) {
    return null;
  }

  const nutrientMeta = new Map<
    string,
    { id: number; name?: string; unitName?: string }
  >();
  await forEachCsvRecord(nutrientPath, (record) => {
    const id = parseInteger(record.id);
    if (id === null) return;
    nutrientMeta.set(record.id, {
      id,
      name: record.name || undefined,
      unitName: record.unit_name || undefined,
    });
  });

  const foodNutrients: NonNullable<UsdaFoodData['foodNutrients']> = [];
  await forEachCsvRecord(foodNutrientPath, (record) => {
    if (record.fdc_id !== fdcId) return;

    const amount = parseFiniteNumber(record.amount);
    if (amount === null) return;

    const nutrientId = parseInteger(record.nutrient_id);
    if (nutrientId === null) return;

    const meta = nutrientMeta.get(record.nutrient_id);
    foodNutrients.push({
      nutrient: {
        id: nutrientId,
        name: meta?.name,
        unitName: meta?.unitName,
      },
      amount,
    });
  });

  return {
    dataDir,
    food: {
      fdcId,
      description: foodRow.description,
      dataType: foodRow.data_type,
      publicationDate: foodRow.publication_date,
      foodCategoryId: foodRow.food_category_id,
      foodNutrients,
    },
  };
}

async function resolveLocalUsdaDataDir(): Promise<string | null> {
  for (const dir of getLocalUsdaDataDirCandidates()) {
    if (await hasLocalUsdaCsvFiles(dir)) {
      return dir;
    }
  }

  return null;
}

function getLocalUsdaDataDirCandidates(): string[] {
  const configured = [
    process.env.USDA_LOCAL_DATA_DIR,
    process.env.USDA_FDC_LOCAL_DATA_DIR,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (configured.length > 0) {
    return dedupeStrings(configured.map((value) => resolve(value)));
  }

  const home = homedir();
  return dedupeStrings([
    resolve(process.cwd(), 'data/downloads/usda'),
    resolve(process.cwd(), '../data/downloads/usda'),
    resolve(process.cwd(), '../../data/downloads/usda'),
    join(home, 'Documents/petrecipedesigner/data/downloads/usda'),
    join(home, 'Documents/SevenKitchen/data/downloads/usda'),
  ]);
}

async function hasLocalUsdaCsvFiles(dir: string): Promise<boolean> {
  try {
    await Promise.all(
      ['food.csv', 'nutrient.csv', 'food_nutrient.csv'].map((fileName) =>
        access(join(dir, fileName)),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

async function forEachCsvRecord(
  path: string,
  callback: (record: Record<string, string>) => void,
): Promise<void> {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let headers: string[] | null = null;

  for await (const line of reader) {
    if (!line.trim()) continue;

    const columns = parseCsvLine(line);
    if (!headers) {
      headers = columns.map((column) => column.replace(/^\uFEFF/, ''));
      continue;
    }

    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = columns[index] ?? '';
    });
    callback(record);
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseInteger(value?: string): number | null {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFiniteNumber(value?: string): number | null {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function clampInteger(value: number, min: number, max: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, integer));
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 500);
  }

  return String(error).slice(0, 500);
}

function shouldRetryProviderError(error: unknown): boolean {
  if (error instanceof NutritionCandidateReviewProviderError) {
    return error.status === 429 || Boolean(error.status && error.status >= 500);
  }

  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
