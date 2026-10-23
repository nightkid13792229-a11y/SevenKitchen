import { Injectable, Logger } from '@nestjs/common';
import {
  classifyCookingMethod,
  normalizePreparationState,
  type PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import { normalizeUnit } from '../../domain/ingredient-creation/unit-guard';
import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import { PrismaService } from '../../infrastructure/prisma.service';
import { IngredientCreationCandidateService } from './ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from './ingredient-creation-check.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import type {
  CheckItem,
  NutritionEvidenceEntry,
  ProfileDraft,
} from './ingredient-creation.types';

/**
 * 一次工具调用的结果。
 *
 * `content` 是**回灌给模型**的 JSON 文本：校验失败也走它，不抛 500 ——
 * 模型要靠错误文本自己改（AI 自纠的前提，见架构文档第七节）。
 */
export interface AgentToolExecution {
  ok: boolean;
  content: string;
  error?: string;
  /** 本次工具耗时；只用于日志与 transcript，不回灌给模型。 */
  durationMs: number;
}

/** OpenAI 兼容的 function calling 工具定义。 */
export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ExecuteAgentToolInput {
  runId: string;
  draftId: string;
  name: string;
  args: Record<string, unknown>;
}

const SEARCH_CANDIDATE_LIMIT = 8;
const ARGS_LOG_MAX = 300;
const ERROR_MESSAGE_MAX = 300;

/** 候选摘要只给模型看「能不能用」，不带整份营养档案。 */
const SEARCH_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'searchLocalNutrition',
    description:
      '在本地营养库检索某个原料的候选来源（只读）。返回来源记录 id、名称、生熟状态、必需营养素覆盖率与缺项。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description:
            '要检索的中文名或英文名，例如「鸡肝」「Chicken liver」。',
        },
        state: {
          type: 'string',
          enum: ['RAW', 'COOKED'],
          description: '找生档案还是熟档案；不传按 RAW。',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
};

const UPDATE_FIELD_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'updateNutritionField',
    description:
      '把一个营养数值写进草稿里某份营养档案的某个字段。字段必须在营养字段目录里、单位必须是目录单位；来源记录必须真实存在。任何校验失败都返回错误文本，按错误改正后可以重试。',
    parameters: {
      type: 'object',
      properties: {
        profileIndex: {
          type: 'integer',
          minimum: 0,
          description:
            '营养档案下标，从 0 开始。等于当前档案数时，会按 sourceRecordId 自动新建一份档案。',
        },
        fieldPath: {
          type: 'string',
          description: '营养字段路径，例如 macros.crudeProtein。',
        },
        value: {
          type: 'number',
          description: '目录单位下的数值，必须是非负有限数字。',
        },
        unit: {
          type: 'string',
          description:
            '目录单位：g / mg / μg / kcal / IU。必须与字段目录单位一致。',
        },
        sourceRecordId: {
          type: 'string',
          description:
            '来源记录 id（searchLocalNutrition 返回的 sourceRecordId）。有来源时这一行标 DIRECT；没有来源则标 MANUAL。',
        },
      },
      required: ['profileIndex', 'fieldPath', 'value', 'unit'],
      additionalProperties: false,
    },
  },
};

const RUN_CHECK_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'runCheck',
    description:
      '对当前草稿跑一次服务端终检（只读）。返回拦死 / 可例外 / 提醒三档结果；passed=true 表示没有拦死项。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
};

/** 来源记录里本工具要用的列；`normalizedNutrition` 只在自动建档案时用来判生熟。 */
interface SourceRecordRow {
  id: string;
  status: string;
  foodName: string;
  foodNameEn: string | null;
  normalizedNutrition: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeState(value: unknown): PreparationState | null {
  return value === 'RAW' || value === 'COOKED' ? value : null;
}

/** 模型有时把数字写成字符串（"20"）；仍然要求是有限数字，不当成 0。 */
function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNonNegativeInteger(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/u.test(value.trim())
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function tokenizeName(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * 从来源记录判断生熟：先看 `meta.sampleState`，再看名称里的「生/熟」整词，
 * 最后看做法（认得出水煮/烤等就说明是熟的）。都认不出返回 null，不猜。
 */
function derivePreparationStateFromSource(
  record: SourceRecordRow,
): PreparationState | null {
  const profile = isRecord(record.normalizedNutrition)
    ? record.normalizedNutrition
    : null;
  const meta = profile && isRecord(profile.meta) ? profile.meta : null;
  const sampleState =
    meta && typeof meta.sampleState === 'string'
      ? normalizePreparationState(meta.sampleState)
      : null;
  if (sampleState) {
    return sampleState;
  }

  for (const name of [record.foodName, record.foodNameEn]) {
    if (!name) continue;
    for (const token of tokenizeName(name)) {
      const state = normalizePreparationState(token);
      if (state) return state;
    }
    if (classifyCookingMethod(name)) return 'COOKED';
  }

  return null;
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max).join('')}…`;
}

function okContent(payload: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...payload });
}

function errorContent(error: string): string {
  return JSON.stringify({ ok: false, error });
}

/** 终检三档只摘前 20 条，避免一个坏草稿把工具结果撑爆。 */
function summarizeCheckItems(
  items: readonly CheckItem[],
): Array<{ code: string; message: string; fieldPath?: string }> {
  return items.slice(0, 20).map((item) => ({
    code: item.code,
    message: truncate(item.message, 200),
    ...(item.fieldPath ? { fieldPath: item.fieldPath } : {}),
  }));
}

/**
 * AI 起草可调用的**全部**写入口。
 *
 * 边界（架构文档第四节、第七节）：
 * - 只碰草稿：不写正式原料 / 营养档案，不提交、不确认可用；
 * - 每个写工具自己做校验，非法输入当场返回错误文本，由模型自己改；
 * - 每次调用都记一条日志（工具名、参数摘要、耗时、成功/失败）。
 */
@Injectable()
export class IngredientCreationToolsService {
  private readonly logger = new Logger(IngredientCreationToolsService.name);

  constructor(
    private readonly candidateService: IngredientCreationCandidateService,
    private readonly draftService: IngredientCreationDraftService,
    private readonly checkService: IngredientCreationCheckService,
    private readonly prisma: PrismaService,
  ) {}

  getDefinitions(): readonly AgentToolDefinition[] {
    return [SEARCH_TOOL, UPDATE_FIELD_TOOL, RUN_CHECK_TOOL];
  }

  availableToolNames(): string[] {
    return this.getDefinitions().map((tool) => tool.function.name);
  }

  async execute(input: ExecuteAgentToolInput): Promise<AgentToolExecution> {
    const startedAt = Date.now();
    let execution: Omit<AgentToolExecution, 'durationMs'>;

    try {
      execution = await this.dispatch(input);
    } catch (error) {
      // 非预期异常也要变成「给模型的错误文本」，不能让一次工具失败把整轮打成 500。
      const message = error instanceof Error ? error.message : String(error);
      execution = {
        ok: false,
        error: truncate(message, ERROR_MESSAGE_MAX),
        content: errorContent(truncate(message, ERROR_MESSAGE_MAX)),
      };
    }

    const durationMs = Date.now() - startedAt;
    const logLine =
      `[agent-tool] tool=${input.name} ok=${execution.ok} durationMs=${durationMs} ` +
      `runId=${input.runId} draft=${input.draftId} args=${truncate(
        JSON.stringify(input.args),
        ARGS_LOG_MAX,
      )}` +
      (execution.error
        ? ` error=${truncate(execution.error, ERROR_MESSAGE_MAX)}`
        : '');

    if (execution.ok) {
      this.logger.log(logLine);
    } else {
      this.logger.warn(logLine);
    }

    return { ...execution, durationMs };
  }

  private async dispatch(
    input: ExecuteAgentToolInput,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    switch (input.name) {
      case 'searchLocalNutrition':
        return this.searchLocalNutrition(input.draftId, input.args);
      case 'updateNutritionField':
        return this.updateNutritionField(input.draftId, input.args);
      case 'runCheck':
        return this.runCheck(input.draftId);
      default:
        return this.error(
          `未知工具「${input.name}」。可用工具只有：${this.availableToolNames().join('、')}。`,
        );
    }
  }

  /** 工具 1：只读检索，复用现有候选服务（生熟过滤、烤煎排除、覆盖率都在那边）。 */
  private async searchLocalNutrition(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const keyword = normalizeText(args.keyword);
    if (!keyword) {
      return this.error('searchLocalNutrition 需要非空的 keyword。');
    }
    if (args.state !== undefined && normalizeState(args.state) === null) {
      return this.error('state 只能是 RAW 或 COOKED；不传按 RAW。');
    }
    const state = normalizeState(args.state) ?? 'RAW';

    // 草稿不存在时先报 404，避免给一个不存在的草稿做检索。
    await this.draftService.get(draftId);

    const result = await this.candidateService.findCandidates({
      name: keyword,
      state,
    });

    const candidates = result.candidates
      .slice(0, SEARCH_CANDIDATE_LIMIT)
      .map((candidate) => ({
        sourceRecordId: candidate.sourceRecordId,
        foodName: candidate.foodName,
        foodNameEn: candidate.foodNameEn,
        preparationState: candidate.preparationState,
        coveragePercent: candidate.coveragePercent,
        missingFields: candidate.missingFields,
        notes: candidate.notes,
      }));

    return {
      ok: true,
      content: okContent({
        keyword,
        state,
        candidateCount: result.candidates.length,
        bestCoveragePercent: result.coverage.bestCoveragePercent,
        candidates,
        ...(candidates.length === 0
          ? {
              hint: '本地库没有命中。可以换中文名/英文名再试；仍然没有就如实告诉用户库里缺数据，不要编造数值。',
            }
          : {}),
      }),
    };
  }

  /**
   * 工具 2：写草稿里的一个营养字段。
   *
   * 校验顺序固定：下标 → 字段目录 → 单位 → 数值 → 来源记录 → 档案。
   * 每一步失败都只返回错误文本，不抛 500 —— 模型可以照着改。
   */
  private async updateNutritionField(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const profileIndex = readNonNegativeInteger(args.profileIndex);
    if (profileIndex === null) {
      return this.error('profileIndex 必须是从 0 开始的整数。');
    }

    const fieldPath = normalizeText(args.fieldPath);
    const field = NUTRITION_FIELD_CATALOG.find(
      (candidate) => candidate.fieldPath === fieldPath,
    );
    if (!field) {
      return this.error(
        `字段「${fieldPath || '（空）'}」不在营养字段目录里。fieldPath 必须形如「表名.字段名」，可用路径见系统提示里的字段目录。`,
      );
    }

    const unit = normalizeText(args.unit);
    const normalizedUnit = normalizeUnit(unit);
    if (!normalizedUnit) {
      return this.error(
        `单位「${unit || '（空）'}」不合法。只接受 g / mg / μg / kcal / IU。`,
      );
    }
    const catalogUnit = normalizeUnit(field.unit) ?? field.unit;
    if (normalizedUnit !== catalogUnit) {
      return this.error(
        `字段 ${fieldPath} 的目录单位是 ${field.unit}，不接受「${unit}」（本工具不做换算）；请把 unit 改成 ${field.unit}，并把数值换算到 ${field.unit}。`,
      );
    }

    const value = readFiniteNumber(args.value);
    if (value === null) {
      return this.error('value 必须是有限数字。');
    }
    if (value < 0) {
      return this.error('value 不能是负数。');
    }

    const sourceRecordId = normalizeText(args.sourceRecordId) || null;
    const draft = await this.draftService.get(draftId);
    const profiles: ProfileDraft[] = Array.isArray(draft.payload.profiles)
      ? draft.payload.profiles
      : [];

    let sourceRecord: SourceRecordRow | null = null;
    if (sourceRecordId) {
      sourceRecord = await this.prisma.nutritionSourceRecord.findUnique({
        where: { id: sourceRecordId },
        select: {
          id: true,
          status: true,
          foodName: true,
          foodNameEn: true,
          normalizedNutrition: true,
        },
      });
      if (!sourceRecord) {
        return this.error(
          `来源记录 ${sourceRecordId} 不存在。请先用 searchLocalNutrition 检索，并把候选的 sourceRecordId 传进来。`,
        );
      }
      if (sourceRecord.status !== 'ACTIVE') {
        return this.error(
          `来源记录 ${sourceRecordId} 已停用（${sourceRecord.status}），不能作为营养来源。`,
        );
      }
    }

    const entry: NutritionEvidenceEntry = {
      fieldPath,
      finalValue: value,
      unit: field.unit,
      // 有来源 → DIRECT；没有来源 → MANUAL（架构文档第四节）。
      status: sourceRecordId ? 'DIRECT' : 'MANUAL',
      sourceRecordId,
      // 工具只收到目录单位下的值，不伪造来源原文值 / 原文单位。
      sourceValue: null,
      sourceUnit: null,
      formula: null,
      // 人没有参与这一步：标记 AI 起草，人工审核时再覆盖。
      confirmedBy: sourceRecordId ? null : 'AI_AGENT',
      confirmedAt: new Date().toISOString(),
    };

    let nextProfiles: ProfileDraft[];
    let preparationState: PreparationState;

    if (profileIndex < profiles.length) {
      const current = profiles[profileIndex];
      if (
        !current ||
        !Array.isArray(current.entries) ||
        (current.preparationState !== 'RAW' &&
          current.preparationState !== 'COOKED')
      ) {
        return this.error(
          `第 ${profileIndex} 份营养档案的数据不完整，不能写入。`,
        );
      }

      preparationState = current.preparationState;
      const nextEntries = current.entries.some(
        (candidate) => candidate.fieldPath === fieldPath,
      )
        ? current.entries.map((candidate) =>
            candidate.fieldPath === fieldPath ? entry : candidate,
          )
        : [...current.entries, entry];
      nextProfiles = profiles.map((profile, index) =>
        index === profileIndex ? { ...profile, entries: nextEntries } : profile,
      );
    } else if (profileIndex === profiles.length && sourceRecord) {
      // 新草稿没有任何档案：第一次写入时按来源记录自动建一份（状态不猜）。
      const state = derivePreparationStateFromSource(sourceRecord);
      if (!state) {
        return this.error(
          `来源记录 ${sourceRecord.id} 判断不出是生还是熟（meta.sampleState、名称、做法都没有生/熟信息）。请换一条明确生熟的候选。`,
        );
      }

      preparationState = state;
      nextProfiles = [
        ...profiles,
        {
          preparationState: state,
          sourceRecordId: sourceRecord.id,
          entries: [entry],
          notes: 'AI 起草',
        },
      ];
    } else {
      const range =
        profiles.length === 0
          ? '草稿目前还没有任何营养档案'
          : `草稿目前有 ${profiles.length} 份营养档案（可用下标 0..${profiles.length - 1}）`;
      return this.error(
        `profileIndex ${profileIndex} 超出范围：${range}` +
          (sourceRecordId
            ? '。'
            : '；要新建一份档案，请把 profileIndex 设为当前档案数并带上 sourceRecordId。'),
      );
    }

    await this.draftService.patch(draftId, draft.step, {
      profiles: nextProfiles,
    });

    const saved = nextProfiles[profileIndex];
    return {
      ok: true,
      content: okContent({
        profileIndex,
        preparationState,
        fieldPath,
        value,
        unit: field.unit,
        status: entry.status,
        entryCount: saved.entries.length,
      }),
    };
  }

  /** 工具 3：跑现有终检服务，只返回三档摘要；服务报错也变成错误文本。 */
  private async runCheck(
    draftId: string,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    try {
      const result = await this.checkService.runCheck(draftId);
      return {
        ok: true,
        content: okContent({
          passed: result.blocking.length === 0,
          counts: {
            blocking: result.blocking.length,
            exceptionable: result.exceptionable.length,
            warnings: result.warnings.length,
          },
          blocking: summarizeCheckItems(result.blocking),
          exceptionable: summarizeCheckItems(result.exceptionable),
          warnings: summarizeCheckItems(result.warnings),
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error(`runCheck 跑不了：${message}`);
    }
  }

  private error(message: string): Omit<AgentToolExecution, 'durationMs'> {
    const error = truncate(message, ERROR_MESSAGE_MAX);
    return { ok: false, error, content: errorContent(error) };
  }
}
