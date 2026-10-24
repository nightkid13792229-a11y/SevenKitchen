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

/** 词典里没有中文词、模型又不可用时给调用方的固定提示。 */
export const AI_TRANSLATION_UNAVAILABLE_NOTICE =
  '词典里没有这个词，AI 翻译当前不可用';

/** 翻译一次最多要几个候选词（与需求一致：2-4 个）。 */
export const AI_TRANSLATION_MAX_TERMS = 4;
/** 翻译是检索的旁路，不能把一次查询拖到几十秒。 */
const AI_TRANSLATION_TIMEOUT_MS = 20_000;
const AI_TRANSLATION_MAX_TOKENS = 400;
const DEFAULT_LANGUAGE = 'en';
const LANGUAGE_CODE = /^[a-z]{2,3}$/u;
const HAN_SCRIPT = /\p{Script=Han}/u;

export type IngredientNameAliasSource =
  | 'MANUAL_SEED'
  | 'AI_TRANSLATION'
  | 'HUMAN_CORRECTION';

export interface IngredientNameAliasEntry {
  id: string;
  zhTerm: string;
  foreignTerm: string;
  language: string;
  source: IngredientNameAliasSource;
}

export interface AiTranslatedTerm {
  term: string;
  language: string;
}

export interface AiTranslationResult {
  model: string;
  translations: AiTranslatedTerm[];
}

/** 一条「模型翻译 + 实际命中来源」的记录；只有命中的词才会传进来。 */
export interface AiTranslationHit extends AiTranslatedTerm {
  sourceRecordId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueNonEmptyTerms(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const term = value.trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

/**
 * 从模型输出里取外文候选词。
 *
 * 宽容两种写法（对象数组 / 纯字符串数组），但只收「外文」：
 * 中文、空词、超长词一律丢掉；language 非法时回落到 en。
 */
function parseTranslatedTerms(
  payload: Record<string, unknown>,
): AiTranslatedTerm[] {
  const rawList = Array.isArray(payload.translations)
    ? payload.translations
    : [];

  const translations: AiTranslatedTerm[] = [];
  const seen = new Set<string>();

  for (const entry of rawList) {
    let rawTerm = '';
    let rawLanguage = '';

    if (typeof entry === 'string') {
      rawTerm = entry;
    } else if (isRecord(entry)) {
      rawTerm =
        normalizeOptionalText(entry.term) ||
        normalizeOptionalText(entry.name) ||
        normalizeOptionalText(entry.foreignTerm);
      rawLanguage = normalizeOptionalText(entry.language).toLowerCase();
    }

    const term = rawTerm.replace(/\s+/gu, ' ').trim();
    if (!term || HAN_SCRIPT.test(term) || term.length > 200) continue;

    const language = LANGUAGE_CODE.test(rawLanguage)
      ? rawLanguage
      : DEFAULT_LANGUAGE;
    const key = `${term.toLowerCase()}\u0000${language}`;
    if (seen.has(key)) continue;
    seen.add(key);
    translations.push({ term, language });

    if (translations.length >= AI_TRANSLATION_MAX_TERMS) break;
  }

  return translations;
}

function buildTranslationPrompt(): string {
  return [
    '你是营养数据库的食材术语翻译助手。',
    '用户会给一个中文食材名，请给出 2-4 个常用于营养数据库（USDA / CFCT / CIQUAL 等）的外文检索词。',
    '只输出 JSON：{"translations":[{"term":"watercress","language":"en"}]}',
    '要求：',
    '- term 用常见外文名（优先英文），小写、不带解释、不带括号注释；可以是同义词，最多 4 个；',
    '- language 用 ISO 639-1 两字母代码，如 en / ja / de；',
    '- 不要输出中文词，不要编造不存在的名称；',
    '- 至少给 2 个候选词。',
  ].join('\n');
}

/**
 * 会自己长的食材别名词典 + 模型翻译。
 *
 * 检索链路只通过它读写 `ingredient_name_alias`：
 * - `findAliases`：中文词查词典；
 * - `markAliasesHit`：词典命中后累加使用次数；
 * - `translateToForeignTerms`：词典没有时让模型翻译（复用 AgentProviderConfig 回落链）；
 * - `recordAiTranslation`：翻译的词真的命中了来源，才沉淀回词典。
 *
 * 翻译失败一律返回 null / 不抛异常：检索是主流程，AI 只是增强，
 * 不能因为模型没配就把候选接口打成 500。
 */
@Injectable()
export class IngredientNameAliasService {
  private readonly logger = new Logger(IngredientNameAliasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentProviderConfig: AgentProviderConfigService,
  ) {}

  async findAliases(
    zhTerms: readonly string[],
  ): Promise<IngredientNameAliasEntry[]> {
    const terms = uniqueNonEmptyTerms(zhTerms);
    if (terms.length === 0) {
      return [];
    }

    return this.prisma.ingredientNameAlias.findMany({
      where: { zhTerm: { in: terms } },
      select: {
        id: true,
        zhTerm: true,
        foreignTerm: true,
        language: true,
        source: true,
      },
      // 用得多的排前面：同分时优先拿验证次数最多的词。
      orderBy: [{ hitCount: 'desc' }, { foreignTerm: 'asc' }],
    });
  }

  async markAliasesHit(aliasIds: readonly string[]): Promise<void> {
    const ids = [...new Set(aliasIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) {
      return;
    }

    await this.prisma.ingredientNameAlias.updateMany({
      where: { id: { in: ids } },
      data: {
        hitCount: { increment: 1 },
        lastHitAt: new Date(),
      },
    });
  }

  /**
   * 让模型把中文词翻译成 2-4 个外文检索词。
   *
   * 没配模型、配置被禁用、请求失败、返回不是有效 JSON —— 全部返回 null，
   * 由调用方降级成「只用词典」。这里刻意不抛异常。
   */
  async translateToForeignTerms(
    zhTerm: string,
  ): Promise<AiTranslationResult | null> {
    const term = zhTerm.trim();
    if (!term) {
      return null;
    }

    const runtime = await this.loadRuntimeConfig();
    if (!runtime) {
      return null;
    }

    try {
      const payload = await callDeepSeekJson({
        baseUrl: runtime.baseUrl,
        apiKey: runtime.apiKey,
        model: runtime.model,
        requestTimeoutMs: Math.min(
          runtime.requestTimeoutMs > 0
            ? runtime.requestTimeoutMs
            : AI_TRANSLATION_TIMEOUT_MS,
          AI_TRANSLATION_TIMEOUT_MS,
        ),
        temperature: 0,
        maxTokens: AI_TRANSLATION_MAX_TOKENS,
        // 结构化翻译不需要思考链：开着只会更慢，还容易把配额耗在推理上。
        extraBody: { thinking: { type: 'disabled' } },
        systemPrompt: buildTranslationPrompt(),
        userPayload: { zhTerm: term },
      });

      const translations = parseTranslatedTerms(payload);
      if (translations.length === 0) {
        this.logger.warn(
          `[ingredient-alias] 模型没有给出可用的外文候选 zh=${term}`,
        );
        return null;
      }

      return { model: runtime.model, translations };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[ingredient-alias] 翻译失败，本次只用词典 zh=${term}: ${reason}`,
      );
      return null;
    }
  }

  /**
   * 把「实际命中了来源」的翻译写回词典。
   *
   * 只接收命中的词：一个都没命中的翻译不落库，避免把错译沉淀成词典。
   * `sourceRecordId` 只记第一次；已有值时不覆盖。
   */
  async recordAiTranslation(input: {
    zhTerm: string;
    translations: readonly AiTranslationHit[];
  }): Promise<void> {
    const zhTerm = input.zhTerm.trim();
    if (!zhTerm || input.translations.length === 0) {
      return;
    }

    const now = new Date();
    for (const translation of input.translations) {
      const foreignTerm = translation.term.trim();
      if (!foreignTerm) continue;
      const language = translation.language.trim() || DEFAULT_LANGUAGE;

      await this.prisma.ingredientNameAlias.upsert({
        where: {
          zhTerm_foreignTerm_language: { zhTerm, foreignTerm, language },
        },
        create: {
          zhTerm,
          foreignTerm,
          language,
          source: 'AI_TRANSLATION',
          hitCount: 1,
          lastHitAt: now,
          sourceRecordId: translation.sourceRecordId,
        },
        update: {
          hitCount: { increment: 1 },
          lastHitAt: now,
        },
      });

      // 首次命中的来源只补空值，不覆盖已经记下的那一条。
      if (translation.sourceRecordId) {
        await this.prisma.ingredientNameAlias.updateMany({
          where: {
            zhTerm,
            foreignTerm,
            language,
            sourceRecordId: null,
          },
          data: { sourceRecordId: translation.sourceRecordId },
        });
      }
    }
  }

  /** 与 intake / draft agent 同一条回落链：INGREDIENT_INTAKE → DEFAULT → RECIPE_DESIGN。 */
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
            `[ingredient-alias] 使用 AI 配置 purpose=${purpose} fallbackFrom=${skipped.join(',')}`,
          );
        }
        return runtime;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        skipped.push(purpose);
        this.logger.warn(
          `[ingredient-alias] 跳过 AI 配置 purpose=${purpose}: ${reason}`,
        );
      }
    }

    this.logger.warn(
      `[ingredient-alias] AI 配置不可用，本次只用词典 tried=${INGREDIENT_INTAKE_AGENT_PURPOSES.join(',')}`,
    );
    return null;
  }
}
