/**
 * 健康报告识别（AI）
 *
 * 老板 2026-09-27 批准「先只做过敏原检测报告这一个」。
 *
 * 为什么值得做：让顾客"自由填写"过敏记录的做法实测失败 ——
 * 生产 4544 只狗里只有 24 只（0.5%）填过过敏原。而过敏是定制食谱的安全底线，
 * 也是首页推荐避雷的依据。检测报告的格式五花八门，只有 AI 能通吃；
 * 顾客上传一张照片，比让他自己回忆并手打要现实得多。
 *
 * 复用既有流水线（补剂包装识别已经在用同一套）：
 *   上传图片 → 腾讯云 OCR 读出文字 → DeepSeek 转成结构化字段 → **顾客确认后才保存**
 *
 * 三条硬约束（都是老板定过的）：
 *   1. 只做"提取"，不做"诊断"：不得推断疾病名称或严重程度
 *   2. 识别失败一律降级为手工填写，绝不卡住顾客（A2）
 *   3. 结果必须人工确认后才写入档案（不得直接落库，与决策 5/9 一致）
 */

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { callDeepSeekJson } from '../recipe-designer/deepseek-chat';

/** OCR 能力来源。绑定到与补剂包装识别同一个腾讯云实现（它就是一次通用文字识别）。 */
export const HEALTH_REPORT_OCR_PROVIDER = Symbol(
  'HEALTH_REPORT_OCR_PROVIDER',
);

export interface HealthReportOcrProvider {
  recognizeImage(input: {
    imageUrl: string;
    originalFilename?: string;
  }): Promise<{ text: string; confidence?: number }>;
}

/** 供 AI 使用的用途标识；未单独配置时回退到全局默认配置 */
const HEALTH_REPORT_EXTRACTION_PURPOSE = 'HEALTH_REPORT_EXTRACTION';

export type HealthReportConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface HealthReportExtractionResult {
  /** 从报告里读出的过敏原（已去重、去空白） */
  allergies: string[];
  /**
   * 报告中提到的既往病症名称（仅照抄报告里的字面表述）。
   *
   * 刻意只做"照抄"，不做判断 —— 系统不替顾客认定疾病或严重程度（决策 5）。
   */
  medicalConditions: string[];
  /** OCR 原文，便于顾客/客服核对识别是否可靠 */
  ocrText: string;
  confidence: HealthReportConfidence;
  /** 需要顾客/客服留意的地方（例如"未能确认是否食物过敏"） */
  warnings: string[];
}

const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 40;

function normalizeKeyword(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 归一化一个关键词列表：去空白、去重、限量 */
function normalizeKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    const keyword = normalizeKeyword(item).slice(0, MAX_KEYWORD_LENGTH);
    if (!keyword) continue;
    // 同一过敏原可能因大小写/空白差异重复出现
    const dedupeKey = keyword.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(keyword);
    if (result.length >= MAX_KEYWORDS) break;
  }

  return result;
}

function buildSystemPrompt(): string {
  return [
    '你是一名宠物营养助理，负责把「狗狗过敏原检测报告 / 病历」的识别文字整理成结构化信息。',
    '',
    '严格规则：',
    '1. 只提取文字里**明确写出**的内容，不得推断、不得补充医学常识、不得猜测。',
    '2. 不得判断疾病名称、严重程度、过敏类型（食物/环境）或是否需要治疗 —— 这些都不属于你的任务。',
    '3. 只输出 JSON，不要输出任何解释性文字。',
    '4. 过敏原要归一成常见食物名（例如「鸡胸肉」「鸡肉提取物」都写作「鸡肉」）；',
    '   若文字里是"对 XX 过敏/不耐受/过敏原阳性"这类表述，XX 即为过敏原。',
    '5. 报告里若写明"未见异常""阴性""无过敏"，则 allergies 返回空数组，',
    '   并把这一点写进 warnings，不要编造过敏原。',
    '6. 识别文字与报告无关（例如只是一张普通照片）时，两个数组都返回空，',
    '   并在 warnings 里说明"未识别到检测报告内容"。',
    '',
    '输出 JSON 结构：',
    '{',
    '  "allergies": ["鸡肉", "牛肉"],',
    '  "medicalConditions": ["胰腺炎"],',
    '  "confidence": "HIGH" | "MEDIUM" | "LOW",',
    '  "warnings": ["报告中未注明检测方法"]',
    '}',
  ].join('\n');
}

function normalizeConfidence(value: unknown): HealthReportConfidence {
  return value === 'HIGH' || value === 'MEDIUM' || value === 'LOW'
    ? value
    : 'LOW';
}

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeKeyword(item))
    .filter(Boolean)
    .slice(0, 5);
}

@Injectable()
export class HealthReportExtractionService {
  constructor(
    @Inject(HEALTH_REPORT_OCR_PROVIDER)
    private readonly ocrProvider: HealthReportOcrProvider,
    private readonly agentProviderConfigService: AgentProviderConfigService,
  ) {}

  async extractFromReport(input: {
    imageUrl: string;
    originalFilename?: string;
  }): Promise<HealthReportExtractionResult> {
    if (!input.imageUrl) {
      throw new BadRequestException('请先上传报告图片');
    }

    const ocrResult = await this.ocrProvider.recognizeImage({
      imageUrl: input.imageUrl,
      originalFilename: input.originalFilename,
    });
    const ocrText = normalizeKeyword(ocrResult.text);
    if (!ocrText) {
      throw new BadRequestException('未能识别到报告文字，请换一张更清晰的图片');
    }

    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: HEALTH_REPORT_EXTRACTION_PURPOSE,
        // 生产目前只为配方设计与文案单独配置过，这里复用全局默认（已启用）
        fallbackToDefault: true,
      });

    const parsed = await callDeepSeekJson({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      systemPrompt: buildSystemPrompt(),
      userPayload: {
        task: 'extract_dog_health_report',
        ocrText,
      },
      temperature: 0,
    });

    const allergies = normalizeKeywordList(parsed.allergies);
    const medicalConditions = normalizeKeywordList(parsed.medicalConditions);
    const warnings = normalizeWarnings(parsed.warnings);

    if (allergies.length === 0 && medicalConditions.length === 0 && warnings.length === 0) {
      // 明确告诉顾客"没识别到"，让他改用手工填写，而不是给一个空结果让人以为成功了
      warnings.push('未识别到过敏原或病史，请改用下面的选项手工补充');
    }

    return {
      allergies,
      medicalConditions,
      ocrText,
      confidence: normalizeConfidence(parsed.confidence),
      warnings,
    };
  }
}
