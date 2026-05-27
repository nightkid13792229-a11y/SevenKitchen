import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type NutritionSourceRecord } from '@prisma/client';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import { normalizeNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import { PrismaService } from '../../infrastructure/prisma.service';
import { summarizeIngredientCreationProfileCompleteness } from './ingredient-creation-completeness';

const DRAFT_INCLUDE = {
  profiles: {
    orderBy: [{ role: 'asc' as const }, { sortOrder: 'asc' as const }],
  },
} satisfies Prisma.IngredientCreationDraftInclude;

const REQUEST_PREFIX_PATTERN = /^(新增|添加|创建|新建|录入)\s*/u;
const REQUEST_SPLIT_PATTERN = /[，,。；;、\n]/u;
const EXISTING_DRAFT_MESSAGE = '已有草稿，请编辑或拒绝后重新创建任务';
const LOW_SIGNAL_RECALL_WORDS = new Set([
  'meat',
  'fish',
  'raw',
  'boiled',
  'steamed',
  'cooked',
  'light cooked',
  '肉',
  '鱼',
  '蛋',
  '生',
  '熟',
  '水煮',
  '蒸',
  '轻烹饪',
]);

const TRANSLATED_KEYWORDS: ReadonlyArray<[RegExp, readonly string[]]> = [
  [/鸡蛋/u, ['egg']],
  [/鸭蛋/u, ['duck egg', 'egg']],
  [/鹌鹑蛋/u, ['quail egg', 'egg']],
  [/鸭胸肉|鸭胸/u, ['duck', 'breast', 'meat']],
  [/鸡胸肉|鸡胸/u, ['chicken', 'breast', 'meat']],
  [/牛肉/u, ['beef', 'meat']],
  [/羊肉/u, ['lamb', 'mutton', 'meat']],
  [/猪肉/u, ['pork', 'meat']],
  [/兔肉/u, ['rabbit', 'meat']],
  [/三文鱼|鲑鱼/u, ['salmon']],
  [/鳕鱼/u, ['cod']],
  [/鸭(?!蛋)/u, ['duck']],
  [/鸡(?!蛋)/u, ['chicken']],
  [/牛/u, ['beef']],
  [/羊/u, ['lamb', 'mutton']],
  [/猪/u, ['pork']],
  [/兔/u, ['rabbit']],
  [/鱼/u, ['fish']],
  [/蛋/u, ['egg']],
  [/肝/u, ['liver']],
  [/心/u, ['heart']],
  [/胗|砂肝/u, ['gizzard']],
  [/胸/u, ['breast']],
  [/腿/u, ['thigh', 'leg']],
  [/肉/u, ['meat']],
  [/去皮/u, ['skinless']],
  [/带皮/u, ['skin']],
  [/生/u, ['raw']],
  [/水煮|煮/u, ['boiled']],
  [/蒸/u, ['steamed']],
  [/熟/u, ['cooked']],
  [/轻烹饪/u, ['light cooked']],
];

const PREPARATION_PATTERNS = [
  {
    pattern: /raw|生/u,
    requestPattern: /raw|生/u,
    preparationState: 'RAW',
    preparationStateLabel: '生',
    processingLabel: '未加工',
    displayLabel: '生',
  },
  {
    pattern: /boiled|水煮|煮/u,
    requestPattern: /boiled|水煮|煮/u,
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    processingLabel: '水煮',
    displayLabel: '水煮',
  },
  {
    pattern: /steamed|蒸/u,
    requestPattern: /steamed|蒸/u,
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    processingLabel: '蒸',
    displayLabel: '蒸',
  },
  {
    pattern: /light cooked|cooked|熟/u,
    requestPattern: /light cooked|cooked|熟|轻烹饪/u,
    preparationState: 'COOKED',
    preparationStateLabel: '熟',
    processingLabel: '轻烹饪',
    displayLabel: '熟',
  },
];

type PreparationLabels = {
  preparationState: string;
  preparationStateLabel: string;
  processingLabel: string;
  displayLabel: string;
};

type SearchTerms = {
  all: string[];
  recall: string[];
};

type RankedCandidate = {
  record: NutritionSourceRecord;
  score: number;
  labels: PreparationLabels;
  nutritionData: NutritionProfileV2;
};

function uniqueWords(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    const normalized = word.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function resolveSuggestedName(requestText: string): string {
  const cleaned = requestText
    .trim()
    .replace(REQUEST_PREFIX_PATTERN, '')
    .split(REQUEST_SPLIT_PATTERN)[0]
    .trim();

  return cleaned || requestText.trim();
}

function translateKeywords(text: string): string[] {
  const words: string[] = [];
  for (const [pattern, translations] of TRANSLATED_KEYWORDS) {
    if (pattern.test(text)) {
      words.push(...translations);
    }
  }
  return words;
}

function normalizeFreeTextWords(text: string): string[] {
  return text
    .replace(/[，,。；;、（）()]/gu, ' ')
    .split(/\s+/u)
    .map((word) => word.trim().replace(REQUEST_PREFIX_PATTERN, ''))
    .filter((word) => word.length >= 2);
}

function isHighSignalRecallWord(word: string): boolean {
  const normalized = word.toLowerCase();
  return !LOW_SIGNAL_RECALL_WORDS.has(normalized);
}

function buildSearchTerms(
  suggestedName: string,
  searchContext: string,
): SearchTerms {
  const contextWords = normalizeFreeTextWords(searchContext);
  const translatedWords = translateKeywords(`${searchContext} ${suggestedName}`);
  const all = uniqueWords([suggestedName, ...contextWords, ...translatedWords]);
  const recall = uniqueWords(
    [suggestedName, ...contextWords, ...translatedWords].filter(
      isHighSignalRecallWord,
    ),
  );

  return {
    all,
    recall: recall.length > 0 ? recall : all,
  };
}

function buildRecallFilters(
  searchTerms: SearchTerms,
): Prisma.NutritionSourceRecordWhereInput[] {
  const recalledWords = searchTerms.recall.filter((word) => word.length >= 2);

  return recalledWords.flatMap((word) => [
    { foodName: { contains: word, mode: 'insensitive' as const } },
    { foodNameEn: { contains: word, mode: 'insensitive' as const } },
  ]);
}

function sourceSearchText(record: NutritionSourceRecord): string {
  return [
    record.foodName,
    record.foodNameEn,
    record.sourceKey,
    record.sourceTitle,
    record.sourceType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function preparationNeeds(searchWords: string[]): string {
  return searchWords.join(' ').toLowerCase();
}

function scoreSourceRecord(
  record: NutritionSourceRecord,
  searchWords: string[],
): number {
  const normalized = sourceSearchText(record);
  const needs = preparationNeeds(searchWords);
  let score = 0;

  for (const word of searchWords) {
    const normalizedWord = word.toLowerCase();
    if (normalized.includes(normalizedWord)) {
      score += normalizedWord.length > 3 ? 2 : 1;
    }
  }

  for (const preparation of PREPARATION_PATTERNS) {
    if (!preparation.pattern.test(normalized)) continue;
    score += 0.5;
    if (preparation.requestPattern.test(needs)) {
      score += 3;
    }
    if (preparation.preparationState === 'RAW') {
      score += 1.5;
    }
  }

  return score;
}

function inferPreparationLabels(foodName: string): PreparationLabels {
  const normalized = foodName.toLowerCase();
  for (const preparation of PREPARATION_PATTERNS) {
    if (preparation.pattern.test(normalized)) {
      return {
        preparationState: preparation.preparationState,
        preparationStateLabel: preparation.preparationStateLabel,
        processingLabel: preparation.processingLabel,
        displayLabel: preparation.displayLabel,
      };
    }
  }

  return {
    preparationState: 'RAW',
    preparationStateLabel: '生',
    processingLabel: '未加工',
    displayLabel: '生',
  };
}

function suggestDisplayNameZh(
  suggestedName: string,
  labels: PreparationLabels,
): string {
  return `${suggestedName}（${labels.displayLabel}）`;
}

function isPrismaNullJson(value: unknown): boolean {
  return (
    value === null || value === Prisma.JsonNull || value === Prisma.DbNull
  );
}

function hasNutritionValue(profile: NutritionProfileV2): boolean {
  const tabs = [
    profile.macros,
    profile.minerals,
    profile.vitamins,
    profile.fattyAcids,
    profile.aminoAcids,
  ];

  return (
    tabs.some((tab) =>
      Object.values(tab).some(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ),
    ) ||
    profile.customItems.some(
      (item) => typeof item.value === 'number' && Number.isFinite(item.value),
    )
  );
}

function normalizeSourceNutrition(value: unknown): NutritionProfileV2 | null {
  if (
    isPrismaNullJson(value) ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null;
  }

  try {
    const profile = normalizeNutritionProfile(value as any);
    if (!profile || !hasNutritionValue(profile)) {
      return null;
    }
    return profile;
  } catch {
    return null;
  }
}

function selectProfileCandidates(
  ranked: RankedCandidate[],
): RankedCandidate[] {
  const primary = ranked[0];
  if (!primary || ranked.length <= 2) {
    return ranked;
  }

  const secondary =
    ranked.find(
      (entry) =>
        entry.record.id !== primary.record.id &&
        entry.labels.preparationState !== primary.labels.preparationState,
    ) ?? ranked[1];

  return [primary, secondary];
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  return toJsonInput(value);
}

@Injectable()
export class IngredientCreationAgentService {
  constructor(private readonly prisma: PrismaService) {}

  async runJob(jobId: string) {
    const job = await this.prisma.ingredientCreationJob.findUnique({
      where: { id: jobId },
      include: {
        draft: { select: { id: true, status: true } },
        messages: {
          where: { role: 'USER' },
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('AI 新增食材任务不存在');
    }
    if (job.draft) {
      throw new BadRequestException(EXISTING_DRAFT_MESSAGE);
    }

    await this.prisma.ingredientCreationJob.update({
      where: { id: job.id },
      data: {
        status: 'SEARCHING_SOURCES',
        currentStage: '正在查找可信营养来源',
        progress: 25,
      },
    });
    await this.prisma.ingredientCreationMessage.create({
      data: {
        jobId: job.id,
        role: 'PROGRESS',
        content: '正在从本地营养来源库召回候选档案。',
      },
    });

    const suggestedName = resolveSuggestedName(job.requestText);
    const userMessageContext = (job.messages ?? [])
      .map((message) => message.content)
      .join(' ');
    const searchContext = [job.requestText, userMessageContext]
      .filter(Boolean)
      .join(' ');
    const searchTerms = buildSearchTerms(suggestedName, searchContext);
    const recallFilters = buildRecallFilters(searchTerms);
    const sourceRecords = await this.prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
        normalizedNutrition: { not: Prisma.DbNull },
        ...(recallFilters.length > 0 ? { OR: recallFilters } : {}),
      },
      orderBy: [{ sourceType: 'asc' }, { foodName: 'asc' }],
      take: 24,
    });

    const ranked = sourceRecords
      .map((record): RankedCandidate | null => {
        if (record.status !== 'ACTIVE') {
          return null;
        }
        const nutritionData = normalizeSourceNutrition(
          record.normalizedNutrition,
        );
        if (!nutritionData) {
          return null;
        }
        return {
          record,
          score: scoreSourceRecord(record, searchTerms.all),
          labels: inferPreparationLabels(record.foodName),
          nutritionData,
        };
      })
      .filter(
        (entry): entry is RankedCandidate =>
          entry !== null && entry.score > 0,
      )
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      const waitingQuestion = `没有找到「${suggestedName}」的可信营养来源。请补充英文名、常见别名、采购形态或可接受的近似来源。`;
      await this.prisma.ingredientCreationJob.update({
        where: { id: job.id },
        data: {
          status: 'WAITING_USER',
          waitingQuestion,
          currentStage: '等待补充食材语义',
          progress: 35,
        },
      });
      await this.prisma.ingredientCreationMessage.create({
        data: {
          jobId: job.id,
          role: 'QUESTION',
          content: waitingQuestion,
        },
      });
      throw new BadRequestException(waitingQuestion);
    }

    const selected = selectProfileCandidates(ranked);
    const profiles = selected.map(
      ({ record, score, labels, nutritionData }, index) => {
        const completenessSummary =
          summarizeIngredientCreationProfileCompleteness(nutritionData);

        return {
          role: index === 0 ? 'PRIMARY' : 'SECONDARY',
          sourceRecordId: record.id,
          sourceType: record.sourceType,
          sourceKey: record.sourceKey,
          sourceFoodName: record.foodName,
          sourceFoodNameEn: record.foodNameEn,
          suggestedDisplayNameZh: suggestDisplayNameZh(suggestedName, labels),
          preparationState: labels.preparationState,
          preparationStateLabel: labels.preparationStateLabel,
          ediblePortionLabel: '可食部',
          processingLabel: labels.processingLabel,
          nutritionData: toJsonInput(nutritionData),
          completenessSummary: toJsonInput(completenessSummary),
          fieldSourceSummary: toNullableJsonInput({
            sourceType: record.sourceType,
            sourceKey: record.sourceKey,
            sourceTitle: record.sourceTitle,
            sourceFoodName: record.foodName,
            fieldSources: completenessSummary.fieldSources,
          }),
          supplementRiskSummary: toNullableJsonInput({
            level: 'LOW',
            noteZh:
              '第一版按本地可信来源生成草稿；正式确认前仍需人工审核语义和字段来源。',
          }),
          agentRationale: `按来源名称与用户需求的语义匹配排序生成，匹配分 ${score.toFixed(
            1,
          )}。`,
          sortOrder: index,
        };
      },
    );

    await this.prisma.ingredientCreationJob.update({
      where: { id: job.id },
      data: {
        status: 'BUILDING_REPORT',
        currentStage: '正在生成草稿和审核报告',
        progress: 75,
      },
    });

    const draft = await this.prisma.ingredientCreationDraft.create({
      data: {
        jobId: job.id,
        status: 'READY_FOR_REVIEW',
        suggestedName,
        aliases: searchTerms.all.filter((word) => word !== suggestedName),
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        procurementStrategy: 'DAILY_PURCHASE',
        diyEnabled: true,
        procurementEnabled: false,
        agentSummary: '已根据本地可信营养来源生成食材标准原料草稿。',
        reviewReport: toNullableJsonInput({
          conclusionZh: '建议人工审核后创建正式原料。',
          candidateCount: ranked.length,
          selectedProfileCount: profiles.length,
        }),
        profiles: { create: profiles },
      },
      include: DRAFT_INCLUDE,
    });

    await this.prisma.ingredientCreationMessage.create({
      data: {
        jobId: job.id,
        role: 'AGENT',
        content: `已生成「${suggestedName}」草稿，包含 ${profiles.length} 个营养档案建议。`,
      },
    });
    await this.prisma.ingredientCreationJob.update({
      where: { id: job.id },
      data: {
        status: 'READY_FOR_REVIEW',
        currentStage: '草稿已生成，等待审核',
        progress: 100,
        completedAt: new Date(),
      },
    });

    return draft;
  }
}
