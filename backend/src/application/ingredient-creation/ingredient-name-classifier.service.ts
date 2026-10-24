import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig,
} from '../nutrition-governance/agent-provider-config.service';
import {
  callDeepSeekJson,
  normalizeOptionalText,
} from '../recipe-designer/deepseek-chat';
import { INGREDIENT_INTAKE_AGENT_PURPOSES } from './ingredient-creation-intake.service';

/**
 * 词条名的生熟判断。
 *
 * `UNKNOWN` 不参与「生 / 熟」统计，也不硬塞进任何一档：模型没把握、
 * 证据对不上名字、模型不可用时都落在这里。
 */
export type NutritionRecordState = 'RAW' | 'COOKED' | 'UNKNOWN';

/** 词条名的加工方式；生 / 未识别都写 NONE。 */
export type NutritionRecordMethod =
  | 'BOILED'
  | 'STEAMED'
  | 'GRILLED'
  | 'FRIED'
  | 'OTHER'
  | 'NONE';

export const NUTRITION_RECORD_STATES: readonly NutritionRecordState[] = [
  'RAW',
  'COOKED',
  'UNKNOWN',
];

export const NUTRITION_RECORD_METHODS: readonly NutritionRecordMethod[] = [
  'BOILED',
  'STEAMED',
  'GRILLED',
  'FRIED',
  'OTHER',
  'NONE',
];

export interface ClassifyNameItem {
  /** `nutrition_source_record.id`。 */
  id: string;
  /** 词条名（`food_name`，或调用方拿到的展示名）。 */
  name: string;
}

export interface ClassifyNamesInput {
  /** 用户想找的目标词，例如「牛肉」；只用于给模型消歧，不参与落库。 */
  targetName: string;
  items: ClassifyNameItem[];
}

export interface NameClassification {
  id: string;
  state: NutritionRecordState;
  method: NutritionRecordMethod;
  cutLabel: string | null;
  cutGroup: string | null;
  /** 词条名里真实出现的判断依据片段；无效时为 null。 */
  evidence: string | null;
  confidence: number | null;
  /** 模型给的 evidence 不在词条名里（归一后仍找不到）时为 true。 */
  invalidEvidence?: boolean;
  /** 已经有人纠正过时，把纠正人带回给调用方（结果不会被 AI 覆盖）。 */
  correctedBy?: string | null;
  /** true 表示直接复用了表里的旧分类，本次没有调用模型。 */
  cached?: boolean;
}

export interface ClassificationCounts {
  byState: Record<NutritionRecordState, number>;
  byMethod: Record<NutritionRecordMethod, number>;
  byCutGroup: Record<string, number>;
}

export interface ClassifyNamesResult {
  results: NameClassification[];
  counts: ClassificationCounts;
}

/** 单批最多 80 条：再多会把提示词撑长，也让模型漏条的概率变高。 */
export const NAME_CLASSIFICATION_MAX_BATCH = 80;

/** 分类是检索的旁路：最多等 30 秒，不能把一次查库拖到分钟级。 */
const CLASSIFICATION_TIMEOUT_MS = 30_000;
const CLASSIFICATION_MAX_TOKENS = 8_000;

const STATE_LABELS: Record<NutritionRecordState, string> = {
  RAW: '生',
  COOKED: '熟',
  UNKNOWN: '未知',
};

const METHOD_LABELS: Record<NutritionRecordMethod, string> = {
  BOILED: '水煮',
  STEAMED: '蒸',
  GRILLED: '烤',
  FRIED: '煎/炸',
  OTHER: '其它做法',
  NONE: '无',
};

const CLASSIFICATION_SYSTEM_PROMPT = [
  '你是营养数据库的词条名分类员。',
  '用户会给一个目标食材（如「牛肉」）和一批来源词条名。你只读词条名本身，逐条判断三件事：',
  '1) state：food 是生的（RAW）还是熟的（COOKED）；只看名字，认不出就 UNKNOWN。',
  '   raw / fresh / 生 / 刺身 → RAW；cooked / boiled / steamed / grilled / fried / roasted / 蒸し焼き / 水煮 / 清蒸 / 烤 / 煎 / 炸 → COOKED；',
  '   名字只写食材本身、看不出加工 → UNKNOWN。不要把「生菜」「花生」里的「生」当成熟度。',
  '2) method：熟食的加工方式。',
  '   BOILED（水煮/煮/boiled/simmered）、STEAMED（蒸/steamed/蒸し）、GRILLED（烤/烘烤/烧/grilled/roasted/baked/broiled）、',
  '   FRIED（煎/炸/炒/sautéed/pan-fried/deep-fried）、OTHER（认得出是熟但方式不属于上四类）、NONE（生或看不出做法）。',
  '   混合描述以否决项为准：蒸し焼き / boiled & fried 判 GRILLED 或 FRIED，不判 STEAMED / BOILED。',
  '3) cutLabel / cutGroup：部位。cutLabel 用中文自由文本（如「牛绞肉 85/15」），cutGroup 用稳定英文 key',
  '   （ground / tenderloin / loin / round / brisket / shank / rib / chuck / breast / thigh / wing / liver / heart / kidney / other）。',
  '   名字里没有部位信息时 cutLabel、cutGroup 都给 null，不要硬猜。',
  'evidence 必须是该条词条名里**真实出现的片段**（原样照抄，大小写不限，不能改写、不能拼接），',
  '   用它解释判断：通常是 raw / cooked / 蒸し焼き / ground / chuck 这样的词。',
  '   如果找不到能支撑判断的片段，就给 evidence=null 并把 state 设为 UNKNOWN。',
  'confidence 用 0~1 的小数，表示你对这条判断的把握。',
  '要求：',
  '- results 必须与输入 items 一一对应，不增不减、不改变顺序；',
  '- 只输出 JSON：{"results":[{"id":"...","state":"RAW|COOKED|UNKNOWN","method":"BOILED|STEAMED|GRILLED|FRIED|OTHER|NONE","cutLabel":null,"cutGroup":null,"evidence":"...","confidence":0.9}]}',
  '- 不要输出任何解释性文字。',
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** evidence 比较口径：NFKC（全角转半角）+ 小写 + 空白压成一个空格。 */
function normalizeEvidenceText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function evidenceAppearsInName(evidence: string, name: string): boolean {
  const needle = normalizeEvidenceText(evidence);
  if (!needle) {
    return false;
  }
  return normalizeEvidenceText(name).includes(needle);
}

/**
 * 模型给的状态归一。
 *
 * 只认受控词表（含中文写法）；其它任何写法都判非法，由调用方按 UNKNOWN
 * 处理 —— 不猜、不把非法判断当成结论。
 */
export function normalizeClassificationState(
  value: unknown,
): NutritionRecordState | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  const upper = text.toUpperCase();
  if (upper === 'RAW' || upper === 'COOKED' || upper === 'UNKNOWN') {
    return upper;
  }
  if (text === '生') return 'RAW';
  if (text === '熟') return 'COOKED';
  if (text === '未知' || text === '无法判断' || text === '认不出') {
    return 'UNKNOWN';
  }
  return null;
}

/** 模型给的做法归一；非法 / 缺失一律 NONE（不把「认不出」硬算成 OTHER）。 */
export function normalizeClassificationMethod(
  value: unknown,
): NutritionRecordMethod | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  const upper = text.toUpperCase();
  if ((NUTRITION_RECORD_METHODS as readonly string[]).includes(upper)) {
    return upper as NutritionRecordMethod;
  }
  const normalized = text.replace(/\s+/gu, '');
  const latin = text.toLowerCase();
  // 否决项优先：蒸し焼き / boiled & fried 这类混合描述不能被「蒸」「煮」抢先。
  if (/\b(?:grill|roast|bak|broil|barbecue|bbq|char[\s-]?grill)/u.test(latin)) {
    return 'GRILLED';
  }
  if (/\b(?:fr(?:y|ied|ying)|saut|sear|griddl|pan[\s-]?fr)/u.test(latin)) {
    return 'FRIED';
  }
  if (
    normalized.includes('烤') ||
    normalized.includes('烧') ||
    normalized.includes('焼') ||
    normalized.includes('烘')
  ) {
    return 'GRILLED';
  }
  if (
    normalized.includes('煎') ||
    normalized.includes('炸') ||
    normalized.includes('炒')
  ) {
    return 'FRIED';
  }
  if (/\bboil/u.test(latin)) return 'BOILED';
  if (/\bsteam/u.test(latin)) return 'STEAMED';
  if (
    normalized.includes('水煮') ||
    normalized.includes('煮') ||
    normalized === '汆'
  ) {
    return 'BOILED';
  }
  if (normalized.includes('蒸')) return 'STEAMED';
  if (normalized.includes('其它') || normalized.includes('其他')) {
    return 'OTHER';
  }
  if (normalized === '无' || normalized === '没有') return 'NONE';
  return null;
}

function normalizeCutText(value: unknown, max: number): string | null {
  const text = normalizeOptionalText(value).replace(/\s+/gu, ' ');
  if (!text) {
    return null;
  }
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

function normalizeCutGroup(value: unknown): string | null {
  const text = normalizeCutText(value, 50);
  return text ? text.toLowerCase() : null;
}

function normalizeConfidence(value: unknown): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.min(1, Math.max(0, Math.round(numeric * 1000) / 1000));
}

function readResultList(payload: Record<string, unknown>): unknown[] {
  for (const key of ['results', 'items', 'classifications'] as const) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }
  return [];
}

function unknownClassification(id: string): NameClassification {
  return {
    id,
    state: 'UNKNOWN',
    method: 'NONE',
    cutLabel: null,
    cutGroup: null,
    evidence: null,
    confidence: null,
  };
}

/** 空计数：所有受控键都从 0 开始，调用方不用自己补。 */
export function buildClassificationCounts(
  results: readonly NameClassification[],
): ClassificationCounts {
  const byState = { RAW: 0, COOKED: 0, UNKNOWN: 0 };
  const byMethod = {
    BOILED: 0,
    STEAMED: 0,
    GRILLED: 0,
    FRIED: 0,
    OTHER: 0,
    NONE: 0,
  };
  const cutMap = new Map<string, number>();

  for (const result of results) {
    byState[result.state] += 1;
    byMethod[result.method] += 1;
    if (result.cutGroup) {
      cutMap.set(result.cutGroup, (cutMap.get(result.cutGroup) ?? 0) + 1);
    }
  }

  const byCutGroup: Record<string, number> = {};
  for (const [key, count] of [...cutMap.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )) {
    byCutGroup[key] = count;
  }

  return { byState, byMethod, byCutGroup };
}

/**
 * 用 AI 读词条名，判断生熟 / 加工方式 / 部位，并把结果落库复用。
 *
 * 设计口径（老板 2026-10-25 定）：工具只摆事实，判断交给 AI；判断结果存起来
 * 复用、可人工纠正。因此：
 * - 表里已有且非人工纠正的结果直接复用，不重复调用模型；
 * - 人工纠正过的行（`correctedBy` 非空）永不被覆盖；
 * - evidence 必须真的出现在词条名里，否则整条判 UNKNOWN；
 * - 模型不可用 / 调用失败：全部 UNKNOWN，不抛异常、不阻塞检索；
 * - 失败结果不落库，避免把一次模型故障缓存成永久结论。
 */
@Injectable()
export class IngredientNameClassifierService {
  private readonly logger = new Logger(IngredientNameClassifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentProviderConfig: AgentProviderConfigService,
  ) {}

  async classifyNames(input: ClassifyNamesInput): Promise<ClassifyNamesResult> {
    const targetName = normalizeOptionalText(input.targetName);
    const items = this.normalizeItems(input.items);
    if (items.length === 0) {
      return { results: [], counts: buildClassificationCounts([]) };
    }

    const existing = await this.loadExisting(items.map((item) => item.id));
    const resultsById = new Map<string, NameClassification>();
    const pending: ClassifyNameItem[] = [];

    for (const item of items) {
      const cached = existing.get(item.id);
      if (!cached) {
        pending.push(item);
        continue;
      }
      resultsById.set(item.id, cached);
    }

    if (pending.length > 0) {
      const runtime = await this.loadRuntimeConfig();
      if (!runtime) {
        for (const item of pending) {
          resultsById.set(item.id, unknownClassification(item.id));
        }
      } else {
        for (
          let offset = 0;
          offset < pending.length;
          offset += NAME_CLASSIFICATION_MAX_BATCH
        ) {
          const batch = pending.slice(
            offset,
            offset + NAME_CLASSIFICATION_MAX_BATCH,
          );
          const batchResults = await this.classifyBatch(
            targetName,
            batch,
            runtime,
          );
          for (const result of batchResults) {
            resultsById.set(result.id, result);
          }
        }
      }
    }

    const results = items.map(
      (item) => resultsById.get(item.id) ?? unknownClassification(item.id),
    );
    return { results, counts: buildClassificationCounts(results) };
  }

  private normalizeItems(
    items: readonly ClassifyNameItem[] | undefined,
  ): ClassifyNameItem[] {
    if (!Array.isArray(items)) {
      return [];
    }
    const seen = new Set<string>();
    const normalized: ClassifyNameItem[] = [];
    for (const item of items) {
      if (!isRecord(item)) continue;
      const id = normalizeOptionalText(item.id);
      const name = normalizeOptionalText(item.name);
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      normalized.push({ id, name });
    }
    return normalized;
  }

  /** 读旧分类；人工纠正过的也读回来，但不会进 `pending` 被覆盖。 */
  private async loadExisting(
    ids: readonly string[],
  ): Promise<Map<string, NameClassification>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.nutritionRecordClassification.findMany({
      where: { recordId: { in: [...ids] } },
      select: {
        recordId: true,
        state: true,
        method: true,
        cutLabel: true,
        cutGroup: true,
        evidence: true,
        confidence: true,
        correctedBy: true,
      },
    });

    const map = new Map<string, NameClassification>();
    for (const row of rows) {
      const state = normalizeClassificationState(row.state) ?? 'UNKNOWN';
      const method = normalizeClassificationMethod(row.method) ?? 'NONE';
      map.set(row.recordId, {
        id: row.recordId,
        state,
        method,
        cutLabel: row.cutLabel ?? null,
        cutGroup: row.cutGroup ?? null,
        evidence: row.evidence ?? null,
        confidence:
          typeof row.confidence === 'number' && Number.isFinite(row.confidence)
            ? row.confidence
            : null,
        ...(row.correctedBy ? { correctedBy: row.correctedBy } : {}),
        cached: true,
      });
    }
    return map;
  }

  private async classifyBatch(
    targetName: string,
    batch: readonly ClassifyNameItem[],
    runtime: DeepSeekRuntimeConfig,
  ): Promise<NameClassification[]> {
    try {
      const payload = await callDeepSeekJson({
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        model: runtime.model,
        requestTimeoutMs: Math.min(
          runtime.requestTimeoutMs > 0
            ? runtime.requestTimeoutMs
            : CLASSIFICATION_TIMEOUT_MS,
          CLASSIFICATION_TIMEOUT_MS,
        ),
        temperature: 0,
        maxTokens: CLASSIFICATION_MAX_TOKENS,
        // 结构化分类不需要思考链：开着更慢，还容易把 token 配额耗在推理上。
        extraBody: { thinking: { type: 'disabled' } },
        systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
        userPayload: {
          targetName,
          items: batch.map((item) => ({ id: item.id, name: item.name })),
        },
      });

      const parsed = this.parseBatchResults(payload, batch);
      await this.persistBatch(parsed, runtime.model);
      this.logger.log(
        `[ingredient-classifier] 分类完成 target=${targetName || '（空）'} ` +
          `batch=${batch.length} ` +
          `raw=${parsed.filter((entry) => entry.state === 'RAW').length} ` +
          `cooked=${parsed.filter((entry) => entry.state === 'COOKED').length} ` +
          `unknown=${parsed.filter((entry) => entry.state === 'UNKNOWN').length} ` +
          `invalidEvidence=${parsed.filter((entry) => entry.invalidEvidence).length}`,
      );
      return parsed;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[ingredient-classifier] 分类失败，本批按 UNKNOWN 返回 target=${
          targetName || '（空）'
        } batch=${batch.length}: ${reason}`,
      );
      // 失败不落库：下一次模型恢复后还能重新判断。
      return batch.map((item) => ({
        ...unknownClassification(item.id),
        confidence: null,
      }));
    }
  }

  private parseBatchResults(
    payload: Record<string, unknown>,
    batch: readonly ClassifyNameItem[],
  ): NameClassification[] {
    const byId = new Map<string, Record<string, unknown>>();
    for (const entry of readResultList(payload)) {
      if (!isRecord(entry)) continue;
      const id = normalizeOptionalText(entry.id);
      if (!id || byId.has(id)) continue;
      byId.set(id, entry);
    }

    return batch.map((item) => {
      const entry = byId.get(item.id);
      if (!entry) {
        return unknownClassification(item.id);
      }

      const rawEvidence = normalizeOptionalText(entry.evidence);
      const evidenceValid =
        Boolean(rawEvidence) && evidenceAppearsInName(rawEvidence, item.name);
      const state =
        normalizeClassificationState(entry.state) ?? 'UNKNOWN';
      const method =
        normalizeClassificationMethod(entry.method) ?? 'NONE';

      if (!evidenceValid) {
        return {
          id: item.id,
          state: 'UNKNOWN',
          method: 'NONE',
          cutLabel: null,
          cutGroup: null,
          evidence: null,
          confidence: normalizeConfidence(entry.confidence),
          invalidEvidence: true,
        };
      }

      return {
        id: item.id,
        state,
        // 生 / 未知没有「加工方式」：模型给了也按 NONE 落库，避免自相矛盾。
        method: state === 'COOKED' ? method : 'NONE',
        cutLabel: normalizeCutText(entry.cutLabel, 100),
        cutGroup: normalizeCutGroup(entry.cutGroup),
        evidence: rawEvidence,
        confidence: normalizeConfidence(entry.confidence),
      };
    });
  }

  private async persistBatch(
    results: readonly NameClassification[],
    model: string,
  ): Promise<void> {
    const classifiedAt = new Date();
    for (const result of results) {
      await this.prisma.nutritionRecordClassification.upsert({
        where: { recordId: result.id },
        create: {
          recordId: result.id,
          state: result.state,
          method: result.method,
          cutLabel: result.cutLabel,
          cutGroup: result.cutGroup,
          evidence: result.evidence,
          confidence: result.confidence,
          model,
          classifiedAt,
        },
        update: {
          state: result.state,
          method: result.method,
          cutLabel: result.cutLabel,
          cutGroup: result.cutGroup,
          evidence: result.evidence,
          confidence: result.confidence,
          model,
          classifiedAt,
        },
      });
    }
  }

  /** 与 intake / draft agent / 词典翻译同一条回落链。 */
  private async loadRuntimeConfig(): Promise<DeepSeekRuntimeConfig | null> {
    const skipped: string[] = [];

    for (const purpose of INGREDIENT_INTAKE_AGENT_PURPOSES) {
      try {
        const runtime =
          await this.agentProviderConfig.getEnabledDeepSeekRuntimeConfig({
            purpose,
            fallbackToDefault: false,
          });
        if (skipped.length > 0) {
          this.logger.log(
            `[ingredient-classifier] 使用 AI 配置 purpose=${purpose} fallbackFrom=${skipped.join(',')}`,
          );
        }
        return runtime;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        skipped.push(purpose);
        this.logger.warn(
          `[ingredient-classifier] 跳过 AI 配置 purpose=${purpose}: ${reason}`,
        );
      }
    }

    this.logger.warn(
      `[ingredient-classifier] AI 配置不可用，全部按 UNKNOWN 返回 tried=${INGREDIENT_INTAKE_AGENT_PURPOSES.join(',')}`,
    );
    return null;
  }
}

/** 展示用：状态 / 做法中文标签（页面与问句共用一套口径）。 */
export function classificationStateLabel(state: NutritionRecordState): string {
  return STATE_LABELS[state];
}

export function classificationMethodLabel(
  method: NutritionRecordMethod,
): string {
  return METHOD_LABELS[method];
}
