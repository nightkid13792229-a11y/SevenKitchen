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

export interface NutritionCandidateReviewProvider {
  reviewFoodCandidate(
    input: NutritionCandidateReviewInput,
  ): Promise<NutritionCandidateAgentReview>;
}

export class DisabledNutritionCandidateReviewProvider
  implements NutritionCandidateReviewProvider
{
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
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const PROMPT_VERSION = 'nutrition-candidate-review-v1';
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
            content: buildSystemPrompt(),
          },
          {
            role: 'user',
            content: JSON.stringify(buildReviewPayload(input)),
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

    return normalizeAgentReview(parsed, {
      provider: 'openai',
      model: this.model,
      promptVersion: PROMPT_VERSION,
    });
  }
}

export function createNutritionCandidateReviewProvider(): NutritionCandidateReviewProvider {
  const provider = process.env.NUTRITION_CANDIDATE_REVIEW_PROVIDER?.trim().toLowerCase();

  if (provider === 'openai' || (!provider && process.env.OPENAI_API_KEY)) {
    return new OpenAINutritionCandidateReviewProvider();
  }

  return new DisabledNutritionCandidateReviewProvider();
}

function buildSystemPrompt(): string {
  return [
    'You are reviewing food nutrition database candidates for a canine recipe design system.',
    'Return only JSON matching the schema.',
    'Judge whether the source food record is suitable for the standard business ingredient.',
    'Pay special attention to raw/cooked/dried/powder/canned state, edible portion, cut, skin/bone/shell, fortified/unfortified, salted/unsalted, wild/farmed/domestic, UV-exposed, and common Chinese ingredient meanings.',
    'Do not approve a candidate as primary if identity, state, or edible portion is materially ambiguous.',
    'Use Chinese labels for preparationStateLabel, ediblePortionLabel, processingLabel, and rationale when useful for the admin reviewer.',
  ].join('\n');
}

function buildReviewPayload(input: NutritionCandidateReviewInput) {
  return {
    ingredient: input.ingredient,
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

function normalizeAgentReview(
  value: Record<string, unknown>,
  meta: Pick<NutritionCandidateAgentReview, 'provider' | 'model' | 'promptVersion'>,
): NutritionCandidateAgentReview {
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
      value.recommendedAction,
      RECOMMENDED_ACTIONS,
      'NEEDS_HUMAN_REVIEW',
    ),
    preparationState: nullableString(value.preparationState),
    preparationStateLabel: nullableString(value.preparationStateLabel),
    ediblePortionLabel: nullableString(value.ediblePortionLabel),
    processingLabel: nullableString(value.processingLabel),
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

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;

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
    preparationState: nullableStringSchema,
    preparationStateLabel: nullableStringSchema,
    ediblePortionLabel: nullableStringSchema,
    processingLabel: nullableStringSchema,
    riskFlags: {
      type: 'array',
      items: { type: 'string' },
    },
    rationale: { type: 'string' },
    confidence: { type: 'string', enum: CONFIDENCES },
  },
} as const;
