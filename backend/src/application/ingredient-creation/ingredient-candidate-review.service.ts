import { Injectable, Logger } from '@nestjs/common';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig,
} from '../nutrition-governance/agent-provider-config.service';
import {
  callDeepSeekJson,
  normalizeOptionalText,
} from '../recipe-designer/deepseek-chat';
import type {
  CandidateReviewItem,
  CandidateReviewResult,
  CandidateReviewTarget,
  CandidateReviewVerdict,
} from './ingredient-creation.types';
import { INGREDIENT_INTAKE_AGENT_PURPOSES } from './ingredient-creation-intake.service';

/** 一次复核最多 12 条：再多就分批，避免把候选表塞满提示词。 */
export const CANDIDATE_REVIEW_MAX_BATCH = 12;
/** 每条理由最多 40 字（模型超了由代码截断，页面只显示一句）。 */
export const CANDIDATE_REVIEW_REASON_MAX = 40;
/** 复核是检索的旁路：最多等 20 秒，不能把一次查库拖到分钟级。 */
const CANDIDATE_REVIEW_TIMEOUT_MS = 20_000;
const CANDIDATE_REVIEW_MAX_TOKENS = 1_200;

export interface ReviewCandidatesInput {
  target: CandidateReviewTarget;
  candidates: CandidateReviewItem[];
}

/** 供测试 / 调用方使用的别名，语义与 `ReviewCandidatesInput` 相同。 */
export type CandidateReviewInput = ReviewCandidatesInput;

const REVIEW_SYSTEM_PROMPT = [
  '你是营养数据库的「候选相关性复核员」。',
  '用户会给出目标食材（中文名 / 英文名 / 生熟状态）和本地库候选列表。你只判断每个候选是不是同一个食材；不评价营养、不排序、不删除、不改写候选。',
  '判定标准：',
  '- RELEVANT：就是目标食材（同名、常见别名、同一食材的不同写法）；生熟状态或做法不同不影响食材身份；',
  '- UNCERTAIN：名字相近但无法确认是同一食材，或信息不足；',
  '- IRRELEVANT：明显是另一种食材（如目标山药出现 Yambean/jicama 凉薯、Celery 芹菜）、部位不同，或只是共享词根。',
  '要求：',
  '- 每条一句中文理由，最多 40 字，要具体说明是什么食材 / 为什么不是；',
  '- reviews 必须与输入 candidates 一一对应，不增不减、不改变顺序；',
  '- 只输出 JSON：{"reviews":[{"id":"候选 id","verdict":"RELEVANT|UNCERTAIN|IRRELEVANT","reason":"..."}]}',
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 模型输出的 verdict 归一。
 *
 * 宽容大小写与中文写法（相关 / 存疑 / 不相关），但其它任何词都算非法，
 * 由调用方降级为 UNCERTAIN —— 不猜、不把非法判断当结论。
 */
export function normalizeReviewVerdict(
  value: unknown,
): CandidateReviewVerdict | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }

  const upper = text.toUpperCase();
  if (
    upper === 'RELEVANT' ||
    upper === 'UNCERTAIN' ||
    upper === 'IRRELEVANT'
  ) {
    return upper;
  }

  // 中文写法：先判「不相关」，否则会被「相关」抢先命中。
  if (text.includes('不相关')) {
    return 'IRRELEVANT';
  }
  if (text.includes('存疑')) {
    return 'UNCERTAIN';
  }
  if (text.includes('相关')) {
    return 'RELEVANT';
  }
  return null;
}

/** 一句理由：压掉换行 / 连续空白，超过 40 字截断。 */
export function normalizeReviewReason(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const text = value.replace(/\s+/gu, ' ').trim();
  const chars = Array.from(text);
  return chars.length <= CANDIDATE_REVIEW_REASON_MAX
    ? text
    : chars.slice(0, CANDIDATE_REVIEW_REASON_MAX).join('');
}

function fallbackResults(
  candidates: readonly CandidateReviewItem[],
): CandidateReviewResult[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    verdict: 'UNCERTAIN',
    reason: '',
  }));
}

/** 从模型 payload 里容错地取出 reviews 数组（兼容 results / items）。 */
function readReviewList(payload: Record<string, unknown>): unknown[] {
  for (const key of ['reviews', 'results', 'items'] as const) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }
  return [];
}

/** 把模型输出折成 id → 判断；重复 id 以第一条为准。 */
function readReviewMap(
  payload: Record<string, unknown>,
): Map<string, CandidateReviewResult> {
  const map = new Map<string, CandidateReviewResult>();

  for (const entry of readReviewList(payload)) {
    if (!isRecord(entry)) {
      continue;
    }
    const id =
      normalizeOptionalText(entry.id) ||
      normalizeOptionalText(entry.sourceRecordId);
    if (!id || map.has(id)) {
      continue;
    }
    const verdict = normalizeReviewVerdict(entry.verdict);
    map.set(id, {
      id,
      verdict: verdict ?? 'UNCERTAIN',
      // verdict 非法时模型这一条整体不可信，理由也不采用；缺 verdict 同理。
      reason: verdict ? normalizeReviewReason(entry.reason) : '',
    });
  }

  return map;
}

/**
 * 候选相关性复核（AI 判断，不负责召回 / 不过滤）。
 *
 * 输入是 `searchLocalNutrition` 已经召回的候选；输出与输入同序、同数量，
 * 每条只带 verdict + 一句理由。任何失败（没配模型 / 网络 / 非法 JSON /
 * 输出不是数组）都返回全 `UNCERTAIN` + 空理由，**不抛异常、不阻塞流程**。
 *
 * 设计口径（2026-10-24）：召回交给代码，判断交给 AI，选择交给人。
 * 因此这里不删候选、不重排，也不因为「不相关」去改检索结果。
 */
@Injectable()
export class IngredientCandidateReviewService {
  private readonly logger = new Logger(IngredientCandidateReviewService.name);

  constructor(
    private readonly agentProviderConfig: AgentProviderConfigService,
  ) {}

  async reviewCandidates(
    input: ReviewCandidatesInput,
  ): Promise<CandidateReviewResult[]> {
    const candidates = Array.isArray(input.candidates)
      ? input.candidates.slice(0, CANDIDATE_REVIEW_MAX_BATCH)
      : [];
    const allCandidates = Array.isArray(input.candidates)
      ? input.candidates
      : [];
    if (allCandidates.length === 0) {
      return [];
    }

    // 超出单次上限的候选不送模型：按「没复核」处理，不丢、不猜。
    const fallback = fallbackResults(candidates);

    const target = input.target;
    const zh = normalizeOptionalText(target?.zh);
    if (!zh) {
      this.logger.warn('[ingredient-review] 缺少目标中文名，全部按存疑返回');
      return [...fallback, ...fallbackResults(allCandidates.slice(candidates.length))];
    }

    const runtime = await this.loadRuntimeConfig();
    if (!runtime) {
      return [...fallback, ...fallbackResults(allCandidates.slice(candidates.length))];
    }

    try {
      const payload = await callDeepSeekJson({
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        model: runtime.model,
        requestTimeoutMs: Math.min(
          runtime.requestTimeoutMs > 0
            ? runtime.requestTimeoutMs
            : CANDIDATE_REVIEW_TIMEOUT_MS,
          CANDIDATE_REVIEW_TIMEOUT_MS,
        ),
        temperature: 0,
        maxTokens: CANDIDATE_REVIEW_MAX_TOKENS,
        // 结构化判断不需要思考链：开着只会更慢，也更容易把配额耗在推理上。
        extraBody: { thinking: { type: 'disabled' } },
        systemPrompt: REVIEW_SYSTEM_PROMPT,
        userPayload: {
          target: {
            zh,
            ...(normalizeOptionalText(target.en)
              ? { en: normalizeOptionalText(target.en) }
              : {}),
            state: target.state,
          },
          candidates: candidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            sourceType: candidate.sourceType,
            coverage: candidate.coverage,
          })),
        },
      });

      const reviewMap = readReviewMap(payload);
      const reviewed = candidates.map((candidate) => {
        const hit = reviewMap.get(candidate.id);
        return hit ?? {
          id: candidate.id,
          verdict: 'UNCERTAIN' as const,
          reason: '',
        };
      });
      const missingCount = reviewed.filter(
        (entry) => !reviewMap.has(entry.id),
      ).length;

      this.logger.log(
        `[ingredient-review] 复核完成 zh=${zh} state=${target.state} ` +
          `batch=${candidates.length}/${allCandidates.length} ` +
          `relevant=${reviewed.filter((entry) => entry.verdict === 'RELEVANT').length} ` +
          `uncertain=${reviewed.filter((entry) => entry.verdict === 'UNCERTAIN').length} ` +
          `irrelevant=${reviewed.filter((entry) => entry.verdict === 'IRRELEVANT').length} ` +
          `missing=${missingCount}`,
      );

      return [
        ...reviewed,
        ...fallbackResults(allCandidates.slice(candidates.length)),
      ];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[ingredient-review] 复核失败，全部按存疑返回 zh=${zh}: ${reason}`,
      );
      return [
        ...fallback,
        ...fallbackResults(allCandidates.slice(candidates.length)),
      ];
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
            `[ingredient-review] 使用 AI 配置 purpose=${purpose} fallbackFrom=${skipped.join(',')}`,
          );
        }
        return runtime;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        skipped.push(purpose);
        this.logger.warn(
          `[ingredient-review] 跳过 AI 配置 purpose=${purpose}: ${reason}`,
        );
      }
    }

    this.logger.warn(
      `[ingredient-review] AI 配置不可用，全部按存疑返回 tried=${INGREDIENT_INTAKE_AGENT_PURPOSES.join(',')}`,
    );
    return null;
  }
}
