import type {
  AgentProcessingVerdict,
  AgentReviewConfidence,
  AgentReviewRecommendedAction,
  AgentReviewVerdict,
  NutritionCandidateAgentReview,
} from '../../domain/nutrition-governance/agent-review.types';

export const NUTRITION_CANDIDATE_REVIEW_PROVIDER = Symbol(
  'NUTRITION_CANDIDATE_REVIEW_PROVIDER',
);

export interface NutritionCandidateReviewInput {
  ingredient: { id: string; name: string; type: string };
  reviewerRequirement?: string | null;
  sourceRecord: {
    id: string;
    sourceType?: string;
    sourceKey?: string | null;
    foodName?: string | null;
    foodNameEn?: string | null;
    category?: string | null;
    dataType?: string | null;
  };
  normalizedNutrition: unknown;
}

export interface NutritionValidationAgentReview {
  provider?: string;
  model?: string;
  promptVersion?: string;
  verdict: 'PASS' | 'NEEDS_HUMAN_REVIEW' | 'FAIL';
  confidence: AgentReviewConfidence;
  summary: string;
  riskFlags: string[];
}

export interface NutritionValidationReviewInput {
  ingredient: { id: string; name: string; type: string };
  sourceRecord: NutritionCandidateReviewInput['sourceRecord'];
  validation: unknown;
}

export interface NutritionCandidateSearchPlanInput {
  ingredient: { id: string; name: string; type: string };
  reviewerRequirement?: string | null;
}

export interface NutritionCandidateSearchPlan {
  provider?: string;
  model?: string;
  promptVersion?: string;
  searchTerms: string[];
  includeTerms: string[];
  excludeTerms: string[];
  rationale: string;
}

export interface NutritionCandidateReviewProvider {
  createFoodCandidateSearchPlan(
    input: NutritionCandidateSearchPlanInput,
  ): Promise<NutritionCandidateSearchPlan>;
  reviewFoodCandidate(
    input: NutritionCandidateReviewInput,
  ): Promise<NutritionCandidateAgentReview>;
  reviewNutritionValidation(
    input: NutritionValidationReviewInput,
  ): Promise<NutritionValidationAgentReview>;
}

export class DisabledNutritionCandidateReviewProvider
  implements NutritionCandidateReviewProvider
{
  async createFoodCandidateSearchPlan(
    input: NutritionCandidateSearchPlanInput,
  ): Promise<NutritionCandidateSearchPlan> {
    const terms = [
      input.ingredient.name,
      input.reviewerRequirement || '',
    ].filter((term) => term.trim());

    return {
      provider: 'disabled',
      model: 'disabled',
      promptVersion: SEARCH_PLAN_PROMPT_VERSION,
      searchTerms: terms,
      includeTerms: terms,
      excludeTerms: [],
      rationale:
        'Agent search planning provider is not configured; using the ingredient name and reviewer requirement as broad search terms.',
    };
  }

  async reviewFoodCandidate(): Promise<NutritionCandidateAgentReview> {
    return {
      provider: 'disabled',
      model: 'disabled',
      promptVersion: 'nutrition-candidate-review-v1',
      identityVerdict: 'UNKNOWN',
      stateVerdict: 'UNKNOWN',
      ediblePortionVerdict: 'UNKNOWN',
      processingVerdict: 'UNKNOWN',
      recommendedAction: 'NEEDS_HUMAN_REVIEW',
      preparationState: null,
      preparationStateLabel: null,
      ediblePortionLabel: null,
      processingLabel: null,
      riskFlags: ['AGENT_REVIEW_PROVIDER_DISABLED'],
      rationale: 'Agent review provider is not configured; manual review is required.',
      confidence: 'MEDIUM',
    };
  }

  async reviewNutritionValidation(
    input: NutritionValidationReviewInput,
  ): Promise<NutritionValidationAgentReview> {
    const status = (input.validation as any)?.status;
    return {
      provider: 'disabled',
      model: 'disabled',
      promptVersion: 'nutrition-data-validation-v1',
      verdict: status === 'PASS' ? 'PASS' : 'NEEDS_HUMAN_REVIEW',
      confidence: 'MEDIUM',
      summary:
        status === 'PASS'
          ? '系统校验未发现来源值和标准化营养档案不一致。'
          : 'Agent 校验服务未配置；请查看系统校验结果后人工复核。',
      riskFlags: status === 'PASS' ? [] : ['AGENT_REVIEW_PROVIDER_DISABLED'],
    };
  }
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
const PROMPT_VERSION = 'nutrition-candidate-review-v1';
const SEARCH_PLAN_PROMPT_VERSION = 'nutrition-candidate-search-plan-v1';
const VALIDATION_PROMPT_VERSION = 'nutrition-data-validation-v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

const IDENTITY_VERDICTS = [
  'MATCH',
  'POSSIBLE_MATCH',
  'MISMATCH',
  'UNKNOWN',
  'NOT_APPLICABLE',
] as const;
const PROCESSING_VERDICTS = [
  'ACCEPTABLE',
  'RISKY',
  'INCOMPATIBLE',
  'UNKNOWN',
] as const;
const RECOMMENDED_ACTIONS = [
  'CONFIRM_PRIMARY',
  'CONFIRM_SECONDARY',
  'NEEDS_HUMAN_REVIEW',
  'REJECT',
  'FIND_ALTERNATIVE_SOURCE',
] as const;
const CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;

const PREPARATION_STATE_OPTIONS = [
  { value: 'RAW', label: '生', aliases: ['生食', '生重', 'raw'] },
  { value: 'COOKED', label: '熟', aliases: ['熟食', '熟重', 'cooked'] },
  { value: 'DRIED', label: '干', aliases: ['干重', 'dried'] },
  { value: 'FREEZE_DRIED', label: '冻干', aliases: ['freeze dried', 'freeze-dried'] },
  { value: 'AIR_DRIED', label: '风干', aliases: ['air dried', 'air-dried'] },
  { value: 'POWDER', label: '粉', aliases: ['粉末', 'powder'] },
  { value: 'CANNED', label: '罐头', aliases: ['罐装', 'canned'] },
  { value: 'OIL', label: '油脂', aliases: ['油', 'oil'] },
  { value: 'CONCENTRATE', label: '浓缩物', aliases: ['浓缩', 'concentrate'] },
  { value: 'UNKNOWN', label: '待确认', aliases: ['未知', 'unknown'] },
] as const;

const EDIBLE_PORTION_OPTIONS = [
  { value: 'STANDARD_EDIBLE_PORTION', label: '标准可食部', aliases: ['可食部'] },
  { value: 'WHOLE', label: '整体', aliases: ['整只', 'whole'] },
  { value: 'MEAT_ONLY', label: '肉', aliases: ['meat'] },
  { value: 'BREAST_MEAT', label: '胸肉', aliases: ['breast'] },
  { value: 'THIGH_MEAT', label: '腿肉', aliases: ['thigh'] },
  { value: 'ORGAN_LIVER', label: '肝脏', aliases: ['肝', 'liver'] },
  { value: 'SKINLESS', label: '去皮', aliases: ['skinless'] },
  { value: 'SKIN_ON', label: '带皮', aliases: ['skin on', 'skin-on'] },
  { value: 'BONELESS', label: '去骨', aliases: ['boneless'] },
  { value: 'BONE_IN', label: '带骨', aliases: ['bone in', 'bone-in'] },
  { value: 'SKINLESS_BONELESS', label: '去皮去骨', aliases: ['去骨去皮', 'skinless boneless'] },
  { value: 'SHELLED', label: '去壳', aliases: ['去壳/去皮', 'shelled'] },
  { value: 'SHELL_ON', label: '带壳', aliases: ['shell on', 'shell-on'] },
  { value: 'DRAINED', label: '沥干', aliases: ['drained'] },
  { value: 'UNKNOWN', label: '待确认', aliases: ['未知', 'unknown'] },
] as const;

const PROCESSING_OPTIONS = [
  { value: 'UNPROCESSED', label: '未加工', aliases: ['无加工', 'unprocessed'] },
  { value: 'UNSALTED', label: '无盐', aliases: ['unsalted'] },
  { value: 'SALTED', label: '加盐', aliases: ['salted'] },
  { value: 'UNFORTIFIED', label: '未强化', aliases: ['非强化', 'unfortified'] },
  { value: 'FORTIFIED', label: '强化', aliases: ['fortified'] },
  { value: 'NON_UV_EXPOSED', label: '非紫外线照射', aliases: ['未经紫外线照射', 'not uv exposed'] },
  { value: 'UV_EXPOSED', label: '紫外线照射', aliases: ['uv exposed'] },
  { value: 'SMOKED', label: '烟熏', aliases: ['smoked'] },
  { value: 'FROZEN', label: '冷冻', aliases: ['frozen'] },
  { value: 'UNKNOWN', label: '待确认', aliases: ['未知', 'unknown'] },
] as const;

export class OpenAINutritionCandidateReviewProvider
  implements NutritionCandidateReviewProvider
{
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY?.trim() || '';
    this.model =
      process.env.OPENAI_NUTRITION_REVIEW_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      DEFAULT_MODEL;
  }

  async createFoodCandidateSearchPlan(
    input: NutritionCandidateSearchPlanInput,
  ): Promise<NutritionCandidateSearchPlan> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: 'system',
            content: buildNutritionCandidateSearchPlanSystemPrompt(),
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'nutrition_candidate_search_plan',
            strict: true,
            schema: SEARCH_PLAN_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const message = await safeReadResponseText(response);
      throw new Error(`OpenAI candidate search plan failed: ${message}`);
    }

    return normalizeNutritionCandidateSearchPlan(parseOpenAIJsonOutput(await response.json()), {
      provider: 'openai',
      model: this.model,
      promptVersion: SEARCH_PLAN_PROMPT_VERSION,
    });
  }

  async reviewFoodCandidate(
    input: NutritionCandidateReviewInput,
  ): Promise<NutritionCandidateAgentReview> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: 'system',
            content: buildNutritionCandidateReviewSystemPrompt(),
          },
          {
            role: 'user',
            content: JSON.stringify(buildNutritionCandidateReviewPayload(input)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'nutrition_candidate_agent_review',
            strict: true,
            schema: AGENT_REVIEW_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const message = await safeReadResponseText(response);
      throw new Error(`OpenAI candidate review failed: ${message}`);
    }

    const responseBody = await response.json();
    const parsed = parseOpenAIJsonOutput(responseBody);

    return normalizeNutritionCandidateAgentReview(parsed, {
      provider: 'openai',
      model: this.model,
      promptVersion: PROMPT_VERSION,
    });
  }

  async reviewNutritionValidation(
    input: NutritionValidationReviewInput,
  ): Promise<NutritionValidationAgentReview> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: 'system',
            content: buildNutritionValidationReviewSystemPrompt(),
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'nutrition_validation_agent_review',
            strict: true,
            schema: VALIDATION_REVIEW_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const message = await safeReadResponseText(response);
      throw new Error(`OpenAI nutrition validation review failed: ${message}`);
    }

    return normalizeNutritionValidationAgentReview(parseOpenAIJsonOutput(await response.json()), {
      provider: 'openai',
      model: this.model,
      promptVersion: VALIDATION_PROMPT_VERSION,
    });
  }
}

export interface DeepSeekNutritionCandidateReviewProviderOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  requestTimeoutMs?: number;
}

export class NutritionCandidateReviewProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NutritionCandidateReviewProviderError';
  }
}

export class DeepSeekNutritionCandidateReviewProvider
  implements NutritionCandidateReviewProvider
{
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly requestTimeoutMs: number;

  constructor(options: DeepSeekNutritionCandidateReviewProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl || DEFAULT_DEEPSEEK_BASE_URL).replace(
      /\/+$/,
      '',
    );
    this.model = options.model?.trim() || DEFAULT_DEEPSEEK_MODEL;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 90000;
  }

  async createFoodCandidateSearchPlan(
    input: NutritionCandidateSearchPlanInput,
  ): Promise<NutritionCandidateSearchPlan> {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: buildNutritionCandidateSearchPlanSystemPrompt(),
            },
            {
              role: 'user',
              content: JSON.stringify(input),
            },
          ],
          response_format: { type: 'json_object' },
          stream: false,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const message = await safeReadResponseText(response);
        throw new NutritionCandidateReviewProviderError(
          `DeepSeek candidate search plan failed: ${message}`,
          response.status,
        );
      }

      return normalizeNutritionCandidateSearchPlan(
        parseDeepSeekJsonOutput(await response.json()),
        {
          provider: 'deepseek',
          model: this.model,
          promptVersion: SEARCH_PLAN_PROMPT_VERSION,
        },
      );
    } catch (error) {
      if (error instanceof NutritionCandidateReviewProviderError) {
        throw error;
      }

      if ((error as Error)?.name === 'AbortError') {
        throw new NutritionCandidateReviewProviderError(
          'DeepSeek candidate search plan failed: request timeout',
          408,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async reviewFoodCandidate(
    input: NutritionCandidateReviewInput,
  ): Promise<NutritionCandidateAgentReview> {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: buildNutritionCandidateReviewSystemPrompt(),
            },
            {
              role: 'user',
              content: JSON.stringify(buildNutritionCandidateReviewPayload(input)),
            },
          ],
          response_format: { type: 'json_object' },
          stream: false,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const message = await safeReadResponseText(response);
        throw new NutritionCandidateReviewProviderError(
          `DeepSeek candidate review failed: ${message}`,
          response.status,
        );
      }

      const responseBody = await response.json();
      const parsed = parseDeepSeekJsonOutput(responseBody);

      return normalizeNutritionCandidateAgentReview(parsed, {
        provider: 'deepseek',
        model: this.model,
        promptVersion: PROMPT_VERSION,
      });
    } catch (error) {
      if (error instanceof NutritionCandidateReviewProviderError) {
        throw error;
      }

      if ((error as Error)?.name === 'AbortError') {
        throw new NutritionCandidateReviewProviderError(
          'DeepSeek candidate review failed: request timeout',
          408,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async reviewNutritionValidation(
    input: NutritionValidationReviewInput,
  ): Promise<NutritionValidationAgentReview> {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: buildNutritionValidationReviewSystemPrompt(),
            },
            {
              role: 'user',
              content: JSON.stringify(input),
            },
          ],
          response_format: { type: 'json_object' },
          stream: false,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        const message = await safeReadResponseText(response);
        throw new NutritionCandidateReviewProviderError(
          `DeepSeek nutrition validation review failed: ${message}`,
          response.status,
        );
      }

      return normalizeNutritionValidationAgentReview(
        parseDeepSeekJsonOutput(await response.json()),
        {
          provider: 'deepseek',
          model: this.model,
          promptVersion: VALIDATION_PROMPT_VERSION,
        },
      );
    } catch (error) {
      if (error instanceof NutritionCandidateReviewProviderError) {
        throw error;
      }

      if ((error as Error)?.name === 'AbortError') {
        throw new NutritionCandidateReviewProviderError(
          'DeepSeek nutrition validation review failed: request timeout',
          408,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createNutritionCandidateReviewProvider(): NutritionCandidateReviewProvider {
  const provider = process.env.NUTRITION_CANDIDATE_REVIEW_PROVIDER?.trim().toLowerCase();

  if (provider === 'openai' || (!provider && process.env.OPENAI_API_KEY)) {
    return new OpenAINutritionCandidateReviewProvider();
  }

  return new DisabledNutritionCandidateReviewProvider();
}

export function buildNutritionCandidateReviewSystemPrompt(): string {
  return [
    'You are reviewing food nutrition database candidates for a canine recipe design system.',
    'Return only JSON matching the schema.',
    'Use these exact JSON keys: identityVerdict, stateVerdict, ediblePortionVerdict, processingVerdict, recommendedAction, preparationState, preparationStateLabel, ediblePortionLabel, processingLabel, riskFlags, rationale, confidence.',
    'Judge whether the source food record is suitable for the standard business ingredient.',
    'When reviewerRequirement is provided, treat it as the admin reviewer’s exact matching requirement and use it to rank primary/secondary/reject decisions.',
    'Pay special attention to raw/cooked/dried/powder/canned state, edible portion, cut, skin/bone/shell, fortified/unfortified, salted/unsalted, wild/farmed/domestic, UV-exposed, and common Chinese ingredient meanings.',
    'Do not approve a candidate as primary if identity, state, or edible portion is materially ambiguous.',
    'Use preparationState only from RAW, COOKED, DRIED, FREEZE_DRIED, AIR_DRIED, POWDER, CANNED, OIL, CONCENTRATE, UNKNOWN.',
    'Use preparationStateLabel only from 生, 熟, 干, 冻干, 风干, 粉, 罐头, 油脂, 浓缩物, 待确认.',
    'Use ediblePortionLabel only from 标准可食部, 整体, 肉, 胸肉, 腿肉, 肝脏, 去皮, 带皮, 去骨, 带骨, 去皮去骨, 去壳, 带壳, 沥干, 待确认.',
    'Use processingLabel only from 未加工, 无盐, 加盐, 未强化, 强化, 非紫外线照射, 紫外线照射, 烟熏, 冷冻, 待确认.',
    'Use Chinese rationale when useful for the admin reviewer.',
  ].join('\n');
}

export function buildNutritionCandidateReviewPayload(
  input: NutritionCandidateReviewInput,
) {
  return {
    ingredient: input.ingredient,
    reviewerRequirement: input.reviewerRequirement ?? null,
    sourceRecord: input.sourceRecord,
    normalizedNutritionSummary: summarizeNutrition(input.normalizedNutrition),
    expectedOutputMeaning: {
      CONFIRM_PRIMARY:
        'Good default profile for the standard ingredient when recipes do not specify a nutrition state.',
      CONFIRM_SECONDARY:
        'Valid profile for the ingredient, but not the default primary profile.',
      NEEDS_HUMAN_REVIEW:
        'Possibly useful but should be reviewed before confirmation.',
      REJECT: 'Not suitable for this standard ingredient.',
      FIND_ALTERNATIVE_SOURCE:
        'The source does not fit; USDA/CFCT/product label alternatives should be searched.',
    },
  };
}

export function buildNutritionCandidateSearchPlanSystemPrompt(): string {
  return [
    'You are preparing broad search terms for matching a standard Chinese business ingredient to USDA/CFCT food composition database records.',
    'Return only JSON matching the schema.',
    'Do not choose the final source record. Your job is to generate search terms that recall enough possible candidates for later Agent ranking and human review.',
    'Prefer English USDA-style terms, but include useful Chinese aliases when relevant.',
    'searchTerms should include the most likely precise food names.',
    'includeTerms should be broader family terms that may recall useful or confusable candidates.',
    'excludeTerms should list known confusable variants, state mismatches, or product forms, but these are review warnings only; they are not hard filters.',
    'When reviewerRequirement is provided, include it in the interpretation.',
    'Use concise Chinese rationale.',
  ].join('\n');
}

export function buildNutritionValidationReviewSystemPrompt(): string {
  return [
    'You are reviewing deterministic nutrition data validation results for a canine recipe design system.',
    'Return only JSON matching the schema.',
    'Do not recalculate nutrients yourself. Read the system validation result and explain the practical risk for the admin reviewer.',
    'PASS means the candidate can be trusted from a source-value and conversion perspective.',
    'NEEDS_HUMAN_REVIEW means warnings or missing traceability require review.',
    'FAIL means source values that should be mapped are missing or mismatched.',
    'Use concise Chinese summary.',
  ].join('\n');
}

function summarizeNutrition(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const profile = value as Record<string, any>;

  return {
    macros: profile.macros
      ? {
          energyKcal: profile.macros.energyKcal,
          crudeProtein: profile.macros.crudeProtein,
          crudeFat: profile.macros.crudeFat,
          moisture: profile.macros.moisture,
        }
      : null,
    minerals: profile.minerals
      ? {
          calcium: profile.minerals.calcium,
          phosphorus: profile.minerals.phosphorus,
        }
      : null,
    meta: profile.meta
      ? {
          rawBasisType: profile.meta.rawBasisType,
          sourceCode: profile.meta.sourceCode,
          sourceTitle: profile.meta.sourceTitle,
        }
      : null,
  };
}

async function safeReadResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function parseOpenAIJsonOutput(responseBody: unknown): Record<string, unknown> {
  const outputText = extractOutputText(responseBody);

  if (!outputText) {
    throw new Error('OpenAI response did not include output text');
  }

  const parsed = JSON.parse(outputText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenAI response was not a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function parseDeepSeekJsonOutput(responseBody: unknown): Record<string, unknown> {
  if (!responseBody || typeof responseBody !== 'object') {
    throw new Error('DeepSeek response was not a JSON object');
  }

  const body = responseBody as Record<string, any>;
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('DeepSeek response did not include message content');
  }

  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('DeepSeek response content was not a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function extractOutputText(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== 'object') {
    return null;
  }

  const body = responseBody as Record<string, any>;
  if (typeof body.output_text === 'string') {
    return body.output_text;
  }

  if (!Array.isArray(body.output)) {
    return null;
  }

  for (const outputItem of body.output) {
    const contentItems = outputItem?.content;
    if (!Array.isArray(contentItems)) continue;

    for (const content of contentItems) {
      if (typeof content?.text === 'string') {
        return content.text;
      }
    }
  }

  return null;
}

export function normalizeNutritionCandidateAgentReview(
  value: Record<string, unknown>,
  meta: Pick<NutritionCandidateAgentReview, 'provider' | 'model' | 'promptVersion'>,
): NutritionCandidateAgentReview {
  const preparationState = reviewOptionValue(
    PREPARATION_STATE_OPTIONS,
    value.preparationState,
    value.preparationStateLabel,
  );
  const recommendedActionValue = value.recommendedAction ?? value.decision;

  return {
    ...meta,
    identityVerdict: enumValue(value.identityVerdict, IDENTITY_VERDICTS, 'UNKNOWN'),
    stateVerdict: enumValue(value.stateVerdict, IDENTITY_VERDICTS, 'UNKNOWN'),
    ediblePortionVerdict: enumValue(
      value.ediblePortionVerdict,
      IDENTITY_VERDICTS,
      'UNKNOWN',
    ),
    processingVerdict: enumValue(
      value.processingVerdict,
      PROCESSING_VERDICTS,
      'UNKNOWN',
    ),
    recommendedAction: enumValue(
      recommendedActionValue,
      RECOMMENDED_ACTIONS,
      'NEEDS_HUMAN_REVIEW',
    ),
    preparationState,
    preparationStateLabel: reviewOptionLabel(
      PREPARATION_STATE_OPTIONS,
      preparationState,
      value.preparationStateLabel,
    ),
    ediblePortionLabel: reviewOptionLabel(
      EDIBLE_PORTION_OPTIONS,
      value.ediblePortionLabel,
    ),
    processingLabel: reviewOptionLabel(PROCESSING_OPTIONS, value.processingLabel),
    riskFlags: Array.isArray(value.riskFlags)
      ? value.riskFlags.filter((item): item is string => typeof item === 'string')
      : [],
    rationale:
      typeof value.rationale === 'string' && value.rationale.trim()
        ? value.rationale.trim()
        : '模型未提供审核理由。',
    confidence: enumValue(value.confidence, CONFIDENCES, 'MEDIUM'),
  };
}

export function normalizeNutritionValidationAgentReview(
  value: Record<string, unknown>,
  meta: Pick<NutritionValidationAgentReview, 'provider' | 'model' | 'promptVersion'>,
): NutritionValidationAgentReview {
  return {
    ...meta,
    verdict: enumValue(
      value.verdict,
      ['PASS', 'NEEDS_HUMAN_REVIEW', 'FAIL'] as const,
      'NEEDS_HUMAN_REVIEW',
    ),
    confidence: enumValue(value.confidence, CONFIDENCES, 'MEDIUM'),
    summary:
      typeof value.summary === 'string' && value.summary.trim()
        ? value.summary.trim()
        : '模型未提供营养数据校验说明。',
    riskFlags: Array.isArray(value.riskFlags)
      ? value.riskFlags.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

export function normalizeNutritionCandidateSearchPlan(
  value: Record<string, unknown>,
  meta: Pick<NutritionCandidateSearchPlan, 'provider' | 'model' | 'promptVersion'>,
): NutritionCandidateSearchPlan {
  const searchTerms = normalizeStringArray(value.searchTerms);
  const includeTerms = normalizeStringArray(value.includeTerms);
  const excludeTerms = normalizeStringArray(value.excludeTerms);

  return {
    ...meta,
    searchTerms,
    includeTerms,
    excludeTerms,
    rationale:
      typeof value.rationale === 'string' && value.rationale.trim()
        ? value.rationale.trim()
        : '模型未提供搜索计划说明。',
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function reviewOptionValue(
  options: readonly {
    value: string;
    label: string;
    aliases?: readonly string[];
  }[],
  value?: unknown,
  label?: unknown,
): string | null {
  const option =
    findReviewOption(options, nullableString(value)) ??
    findReviewOption(options, nullableString(label));

  return option?.value ?? null;
}

function reviewOptionLabel(
  options: readonly {
    value: string;
    label: string;
    aliases?: readonly string[];
  }[],
  value?: unknown,
  label?: unknown,
): string | null {
  const option =
    findReviewOption(options, nullableString(value)) ??
    findReviewOption(options, nullableString(label));

  return option?.label ?? null;
}

function findReviewOption(
  options: readonly {
    value: string;
    label: string;
    aliases?: readonly string[];
  }[],
  value?: string | null,
) {
  const normalized = normalizeReviewText(value);
  if (!normalized) return undefined;

  return options.find((option) => {
    if (normalizeReviewText(option.value) === normalized) return true;
    if (normalizeReviewText(option.label) === normalized) return true;
    return option.aliases?.some(
      (alias) => normalizeReviewText(alias) === normalized,
    );
  });
}

function normalizeReviewText(value?: string | null): string {
  return (value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && allowed.includes(value as T)
    ? (value as T)
    : fallback;
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const nullableEnumSchema = (values: readonly string[]) =>
  ({
    anyOf: [{ type: 'string', enum: values }, { type: 'null' }],
  }) as const;

const AGENT_REVIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'identityVerdict',
    'stateVerdict',
    'ediblePortionVerdict',
    'processingVerdict',
    'recommendedAction',
    'preparationState',
    'preparationStateLabel',
    'ediblePortionLabel',
    'processingLabel',
    'riskFlags',
    'rationale',
    'confidence',
  ],
  properties: {
    identityVerdict: { type: 'string', enum: IDENTITY_VERDICTS },
    stateVerdict: { type: 'string', enum: IDENTITY_VERDICTS },
    ediblePortionVerdict: { type: 'string', enum: IDENTITY_VERDICTS },
    processingVerdict: { type: 'string', enum: PROCESSING_VERDICTS },
    recommendedAction: { type: 'string', enum: RECOMMENDED_ACTIONS },
    preparationState: nullableEnumSchema(
      PREPARATION_STATE_OPTIONS.map((option) => option.value),
    ),
    preparationStateLabel: nullableEnumSchema(
      PREPARATION_STATE_OPTIONS.map((option) => option.label),
    ),
    ediblePortionLabel: nullableEnumSchema(
      EDIBLE_PORTION_OPTIONS.map((option) => option.label),
    ),
    processingLabel: nullableEnumSchema(
      PROCESSING_OPTIONS.map((option) => option.label),
    ),
    riskFlags: {
      type: 'array',
      items: { type: 'string' },
    },
    rationale: { type: 'string' },
    confidence: { type: 'string', enum: CONFIDENCES },
  },
} as const;

const SEARCH_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['searchTerms', 'includeTerms', 'excludeTerms', 'rationale'],
  properties: {
    searchTerms: {
      type: 'array',
      items: { type: 'string' },
    },
    includeTerms: {
      type: 'array',
      items: { type: 'string' },
    },
    excludeTerms: {
      type: 'array',
      items: { type: 'string' },
    },
    rationale: { type: 'string' },
  },
} as const;

const VALIDATION_REVIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'confidence', 'summary', 'riskFlags'],
  properties: {
    verdict: { type: 'string', enum: ['PASS', 'NEEDS_HUMAN_REVIEW', 'FAIL'] },
    confidence: { type: 'string', enum: CONFIDENCES },
    summary: { type: 'string' },
    riskFlags: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const;
