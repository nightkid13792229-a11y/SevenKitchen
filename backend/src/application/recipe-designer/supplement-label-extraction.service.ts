import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';

export type SupplementLabelConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type SupplementLabelBasisType =
  | 'PER_1_G'
  | 'PER_100_G'
  | 'PER_1_ML'
  | 'PER_100_ML'
  | 'PER_SERVING';

export type SupplementLabelUsageUnit =
  | 'g'
  | 'ml'
  | '粒'
  | '片'
  | '胶囊'
  | '平勺'
  | '份';

export interface SupplementLabelExtractionInput {
  imageUrl: string;
  originalFilename?: string;
  requestedBy?: string;
}

export interface SupplementLabelExtractionResult {
  ingredientName: string;
  profileName: string;
  usageUnit: SupplementLabelUsageUnit;
  basisType: SupplementLabelBasisType;
  servingWeightG?: number;
  densityGPerMl?: number;
  nutrients: Record<string, number>;
  rawIngredientsText?: string;
  ocrText: string;
  ocrConfidence?: number;
  warnings: string[];
  confidence: SupplementLabelConfidence;
}

export interface SupplementLabelOcrLine {
  text: string;
  confidence?: number;
}

export interface SupplementLabelOcrResult {
  text: string;
  confidence?: number;
  lines: SupplementLabelOcrLine[];
}

export interface SupplementLabelOcrProvider {
  recognizeImage(input: {
    imageUrl: string;
    originalFilename?: string;
  }): Promise<SupplementLabelOcrResult>;
}

export const SUPPLEMENT_LABEL_OCR_PROVIDER = Symbol(
  'SUPPLEMENT_LABEL_OCR_PROVIDER',
);

const TENCENT_OCR_HOST = 'ocr.tencentcloudapi.com';
const TENCENT_OCR_SERVICE = 'ocr';
const TENCENT_OCR_ACTION = 'GeneralBasicOCR';
const TENCENT_OCR_VERSION = '2018-11-19';
const DEFAULT_TENCENT_OCR_REGION = 'ap-guangzhou';
const DEEPSEEK_CHAT_PATH = '/chat/completions';

const SUPPORTED_USAGE_UNITS = new Set<SupplementLabelUsageUnit>([
  'g',
  'ml',
  '粒',
  '片',
  '胶囊',
  '平勺',
  '份',
]);

const SUPPORTED_BASIS_TYPES = new Set<SupplementLabelBasisType>([
  'PER_1_G',
  'PER_100_G',
  'PER_1_ML',
  'PER_100_ML',
  'PER_SERVING',
]);

const SUPPORTED_NUTRIENT_KEYS = new Set([
  'minerals.calcium',
  'minerals.phosphorus',
  'minerals.potassium',
  'minerals.sodium',
  'minerals.magnesium',
  'minerals.chloride',
  'minerals.iron',
  'minerals.zinc',
  'minerals.copper',
  'minerals.manganese',
  'minerals.selenium',
  'minerals.iodine',
  'vitamins.vitaminA',
  'vitamins.vitaminD',
  'vitamins.vitaminE',
  'vitamins.vitaminK',
  'vitamins.vitaminB1',
  'vitamins.vitaminB2',
  'vitamins.vitaminB3',
  'vitamins.vitaminB5',
  'vitamins.vitaminB6',
  'vitamins.vitaminB7',
  'vitamins.vitaminB9',
  'vitamins.vitaminB12',
  'vitamins.choline',
  'vitamins.vitaminC',
  'fattyAcids.saturatedFattyAcids',
  'fattyAcids.monounsaturatedFattyAcids',
  'fattyAcids.polyunsaturatedFattyAcids',
  'fattyAcids.linoleicAcid',
  'fattyAcids.alphaLinolenicAcid',
  'fattyAcids.arachidonicAcid',
  'fattyAcids.epa',
  'fattyAcids.dpa',
  'fattyAcids.dha',
  'aminoAcids.arginine',
  'aminoAcids.lysine',
  'aminoAcids.methionine',
  'aminoAcids.cystine',
  'aminoAcids.taurine',
  'aminoAcids.tryptophan',
  'aminoAcids.threonine',
  'aminoAcids.leucine',
  'aminoAcids.isoleucine',
  'aminoAcids.valine',
  'aminoAcids.phenylalanine',
  'aminoAcids.tyrosine',
  'aminoAcids.histidine',
  'aminoAcids.glutamicAcid',
  'aminoAcids.glycine',
  'aminoAcids.proline',
  'macros.energyKcal',
  'macros.moisture',
  'macros.crudeProtein',
  'macros.crudeFat',
  'macros.ash',
  'macros.carbohydrate',
  'macros.fiber',
  'macros.solubleFiber',
  'macros.insolubleFiber',
]);

@Injectable()
export class TencentCloudSupplementLabelOcrProvider
  implements SupplementLabelOcrProvider
{
  async recognizeImage(input: {
    imageUrl: string;
    originalFilename?: string;
  }): Promise<SupplementLabelOcrResult> {
    const secretId =
      process.env.TENCENTCLOUD_SECRET_ID ||
      process.env.TENCENT_SECRET_ID ||
      process.env.COS_SECRET_ID ||
      '';
    const secretKey =
      process.env.TENCENTCLOUD_SECRET_KEY ||
      process.env.TENCENT_SECRET_KEY ||
      process.env.COS_SECRET_KEY ||
      '';

    if (!secretId || !secretKey) {
      throw new BadRequestException('腾讯云 OCR 密钥未配置');
    }

    const region =
      process.env.TENCENT_OCR_REGION ||
      process.env.COS_REGION ||
      DEFAULT_TENCENT_OCR_REGION;
    const payload = JSON.stringify({ ImageUrl: input.imageUrl });
    const timestamp = Math.floor(Date.now() / 1000);
    const authorization = buildTencentCloudAuthorization({
      secretId,
      secretKey,
      host: TENCENT_OCR_HOST,
      service: TENCENT_OCR_SERVICE,
      timestamp,
      payload,
    });

    const response = await fetch(`https://${TENCENT_OCR_HOST}`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: TENCENT_OCR_HOST,
        'X-TC-Action': TENCENT_OCR_ACTION,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': TENCENT_OCR_VERSION,
        'X-TC-Region': region,
      },
      body: payload,
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BadRequestException('腾讯云 OCR 请求失败');
    }

    const body = asRecord(responseBody).Response;
    const responseRecord = asRecord(body);
    const error = asRecord(responseRecord.Error);
    if (error.Message) {
      throw new BadRequestException(String(error.Message));
    }

    const detections = Array.isArray(responseRecord.TextDetections)
      ? responseRecord.TextDetections
      : [];
    const lines = detections
      .map((item): SupplementLabelOcrLine | null => {
        const record = asRecord(item);
        const text = normalizeOptionalText(record.DetectedText);
        if (!text) return null;
        const confidence = normalizeOptionalPositiveNumber(record.Confidence);
        return confidence === undefined ? { text } : { text, confidence };
      })
      .filter((item): item is SupplementLabelOcrLine => item !== null);
    const confidence = averageConfidence(lines);

    return {
      text: lines.map((line) => line.text).join('\n'),
      confidence,
      lines,
    };
  }
}

@Injectable()
export class SupplementLabelExtractionService {
  constructor(
    @Inject(SUPPLEMENT_LABEL_OCR_PROVIDER)
    private readonly ocrProvider: SupplementLabelOcrProvider,
    private readonly agentProviderConfigService: AgentProviderConfigService,
  ) {}

  async extractFromImage(
    input: SupplementLabelExtractionInput,
  ): Promise<SupplementLabelExtractionResult> {
    const ocrResult = await this.ocrProvider.recognizeImage({
      imageUrl: input.imageUrl,
      originalFilename: input.originalFilename,
    });
    const ocrText = normalizeOptionalText(ocrResult.text);
    if (!ocrText) {
      throw new BadRequestException('未能识别到包装文字，请换一张更清晰的图片');
    }

    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig();
    const parsed = await this.extractDraftWithDeepSeek({
      ocrText,
      imageUrl: input.imageUrl,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
    });

    return normalizeExtractionResult(parsed, {
      ocrText,
      ocrConfidence: ocrResult.confidence,
    });
  }

  private async extractDraftWithDeepSeek(input: {
    ocrText: string;
    imageUrl: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    requestTimeoutMs: number;
  }): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.requestTimeoutMs);
    try {
      const response = await fetch(
        `${input.baseUrl.replace(/\/+$/, '')}${DEEPSEEK_CHAT_PATH}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: input.model,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: buildSupplementExtractionSystemPrompt(),
              },
              {
                role: 'user',
                content: JSON.stringify({
                  task: 'extract_supplement_label_draft',
                  imageUrl: input.imageUrl,
                  ocrText: input.ocrText,
                  supportedNutrientKeys: Array.from(SUPPORTED_NUTRIENT_KEYS),
                }),
              },
            ],
            temperature: 0,
          }),
        },
      );

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new BadRequestException('DeepSeek 补剂包装解析失败');
      }

      return parseDeepSeekJsonOutput(responseBody);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildSupplementExtractionSystemPrompt(): string {
  return [
    '你是宠物营养补剂包装信息结构化助手。',
    '你会收到 OCR 文本，请只根据 OCR 文本提取补剂草稿，不要猜测未出现的数据。',
    '输出必须是 JSON 对象，字段包括 ingredientName, profileName, usageUnit, basisType, servingWeightG, densityGPerMl, nutrients, rawIngredientsText, warnings, confidence。',
    'usageUnit 只能是 g, ml, 粒, 片, 胶囊, 平勺, 份。',
    'basisType 只能是 PER_1_G, PER_100_G, PER_1_ML, PER_100_ML, PER_SERVING。',
    'nutrients 的 key 必须来自 supportedNutrientKeys，值必须是数字，单位使用字段约定单位。',
    '如果包装按每粒/每片/每胶囊/每平勺/每份标注营养，basisType 使用 PER_SERVING。',
    '无法确定的字段留空或省略，并在 warnings 中提醒用户核对。',
  ].join('\n');
}

function normalizeExtractionResult(
  parsed: Record<string, unknown>,
  context: { ocrText: string; ocrConfidence?: number },
): SupplementLabelExtractionResult {
  const warnings = normalizeStringArray(parsed.warnings);
  const nutrients: Record<string, number> = {};
  const rawNutrients = asRecord(parsed.nutrients);
  for (const [key, rawValue] of Object.entries(rawNutrients)) {
    if (!SUPPORTED_NUTRIENT_KEYS.has(key)) {
      warnings.push(`已忽略无法识别的营养字段 ${key}`);
      continue;
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    nutrients[key] = value;
  }

  if (
    typeof context.ocrConfidence === 'number' &&
    Number.isFinite(context.ocrConfidence) &&
    context.ocrConfidence > 0 &&
    context.ocrConfidence < 80
  ) {
    warnings.push('OCR 置信度较低，请核对包装文字和营养数字');
  }

  const ingredientName =
    normalizeOptionalText(parsed.ingredientName) || '未命名补剂';
  const profileName =
    normalizeOptionalText(parsed.profileName) || `${ingredientName} AI识别档案`;
  const usageUnit = normalizeUsageUnit(parsed.usageUnit);
  const basisType = normalizeBasisType(parsed.basisType, usageUnit);
  const confidence =
    Object.keys(nutrients).length === 0
      ? 'LOW'
      : normalizeConfidence(parsed.confidence);

  return {
    ingredientName,
    profileName,
    usageUnit,
    basisType,
    servingWeightG: normalizeOptionalPositiveNumber(parsed.servingWeightG),
    densityGPerMl: normalizeOptionalPositiveNumber(parsed.densityGPerMl),
    nutrients,
    rawIngredientsText: normalizeOptionalText(parsed.rawIngredientsText),
    ocrText: context.ocrText,
    ocrConfidence: context.ocrConfidence,
    warnings: Array.from(new Set(warnings)),
    confidence,
  };
}

function normalizeUsageUnit(value: unknown): SupplementLabelUsageUnit {
  const text = normalizeOptionalText(value);
  return text && SUPPORTED_USAGE_UNITS.has(text as SupplementLabelUsageUnit)
    ? (text as SupplementLabelUsageUnit)
    : 'g';
}

function normalizeBasisType(
  value: unknown,
  usageUnit: SupplementLabelUsageUnit,
): SupplementLabelBasisType {
  const text = normalizeOptionalText(value);
  if (text && SUPPORTED_BASIS_TYPES.has(text as SupplementLabelBasisType)) {
    return text as SupplementLabelBasisType;
  }
  if (usageUnit === 'ml') return 'PER_1_ML';
  if (usageUnit !== 'g') return 'PER_SERVING';
  return 'PER_1_G';
}

function normalizeConfidence(value: unknown): SupplementLabelConfidence {
  const text = normalizeOptionalText(value)?.toUpperCase();
  return text === 'HIGH' || text === 'MEDIUM' || text === 'LOW'
    ? text
    : 'MEDIUM';
}

function parseDeepSeekJsonOutput(responseBody: unknown): Record<string, unknown> {
  const choices = asRecord(responseBody).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new BadRequestException('DeepSeek 未返回补剂解析结果');
  }
  const content = asRecord(asRecord(choices[0]).message).content;
  const text = normalizeOptionalText(content);
  if (!text) {
    throw new BadRequestException('DeepSeek 补剂解析结果为空');
  }

  try {
    const parsed = JSON.parse(stripJsonCodeFence(text));
    return asRecord(parsed);
  } catch {
    throw new BadRequestException('DeepSeek 补剂解析结果不是有效 JSON');
  }
}

function stripJsonCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function buildTencentCloudAuthorization(input: {
  secretId: string;
  secretKey: string;
  host: string;
  service: string;
  timestamp: number;
  payload: string;
}): string {
  const date = new Date(input.timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${input.host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedRequestPayload = sha256(input.payload);
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n');
  const credentialScope = `${date}/${input.service}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(input.timestamp),
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');
  const secretDate = hmac(Buffer.from(`TC3${input.secretKey}`), date);
  const secretService = hmac(secretDate, input.service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = hmac(secretSigning, stringToSign, 'hex') as string;

  return [
    `TC3-HMAC-SHA256 Credential=${input.secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(
  key: string | Buffer,
  value: string,
  encoding?: 'hex',
): Buffer | string {
  const digest = createHmac('sha256', key).update(value);
  return encoding ? digest.digest(encoding) : digest.digest();
}

function averageConfidence(lines: SupplementLabelOcrLine[]): number | undefined {
  const values = lines
    .map((line) => line.confidence)
    .filter((value): value is number => Number.isFinite(value));
  if (values.length === 0) return undefined;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2),
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeOptionalText(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalPositiveNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
