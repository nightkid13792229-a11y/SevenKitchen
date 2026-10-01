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

/**
 * 可以拍照识别的文档类型（2026-10-01，第六期）。
 *
 * 老板第 4 条：拍照自动识别覆盖到除过敏报告以外的**体检报告和疫苗本**
 * （第 6 期又加上病历，凑齐四类）。
 * 老板第 5 条：识别之后**不需要逐条确认**，让顾客确认一次就能自动录入表单。
 */
export type HealthDocumentType =
  | 'ALLERGY_REPORT' // 过敏原检测报告（此前已开放）
  | 'CHECKUP_REPORT' // 体检报告
  | 'VACCINE_BOOK' // 疫苗本（一次可能读出多条）
  | 'MEDICAL_RECORD'; // 病历

export const HEALTH_DOCUMENT_TYPES: readonly HealthDocumentType[] = [
  'ALLERGY_REPORT',
  'CHECKUP_REPORT',
  'VACCINE_BOOK',
  'MEDICAL_RECORD',
];

export function normalizeDocumentType(value: unknown): HealthDocumentType {
  const key = String(value || '').trim().toUpperCase();
  return (HEALTH_DOCUMENT_TYPES as readonly string[]).includes(key)
    ? (key as HealthDocumentType)
    : // 缺省沿用旧行为：此前只有过敏报告一条路
      'ALLERGY_REPORT';
}

export interface HealthReportExtractionResult {
  /** 这次识别的是哪类文档 */
  documentType: HealthDocumentType;
  /**
   * 直接可用的表单草稿（老板第 5 条：确认一次就自动录入表单）。
   *   · 疫苗本可能读出多条 → 数组里多项
   *   · 其余类型只有一条
   * 字段名与各板块的表单一致，前端拿到即可填表。
   */
  drafts: Record<string, any>[];
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

/**
 * 所有文档类型共用的铁律。
 *
 * 这套禁令是安全底线，任何类型都不得放宽 —— 系统只做"把纸上的字搬进表单"，
 * 不做任何医学判断（老板拍板的决策 5 + 第 20 条"边界把严一点"）。
 */
const COMMON_RULES = [
  '严格规则（任何情况都不得违反）：',
  '1. 只提取文字里**明确写出**的内容，不得推断、不得补充医学常识、不得猜测。',
  '2. 不得判断疾病名称、严重程度、过敏类型（食物/环境）或是否需要治疗 —— 这些都不属于你的任务。',
  '3. 不得给出任何用药建议、剂量、诊断结论。',
  '4. 只输出 JSON，不要输出任何解释性文字。',
  '5. 识别文字与目标文档无关（例如只是一张普通照片）时，草稿返回空数组，',
  '   并在 warnings 里说明"未识别到相关内容"。',
  '6. 日期一律输出 YYYY-MM-DD；看不清或没有的日期留空字符串，不要编。',
];

function buildSystemPrompt(documentType: HealthDocumentType): string {
  if (documentType === 'VACCINE_BOOK') {
    return [
      '你是一名宠物助理，负责把「狗狗疫苗本 / 免疫记录」的照片识别文字整理成接种记录。',
      '',
      ...COMMON_RULES,
      '',
      '本类型的额外规则：',
      '· 一本疫苗本通常有**多条**接种记录，全部读出来，按接种日期从早到晚排序。',
      '· vaccineName 照抄本子上的写法（如「犬四联」「狂犬」「卫佳伍」），不要翻译、不要归类。',
      '· nextDueDate 只有本子上明确写了才填，没写就留空。',
      '',
      '输出 JSON 结构：',
      '{',
      '  "drafts": [',
      '    { "vaccineName": "犬四联", "vaccinationDate": "2025-03-10", "nextDueDate": "2026-03-10", "notes": "" }',
      '  ],',
      '  "confidence": "HIGH" | "MEDIUM" | "LOW",',
      '  "warnings": ["第三行日期被印章遮挡，未能确认"]',
      '}',
    ].join('\n');
  }

  if (documentType === 'CHECKUP_REPORT') {
    return [
      '你是一名宠物助理，负责把「狗狗体检报告」的识别文字整理成一条体检记录。',
      '',
      ...COMMON_RULES,
      '',
      '本类型的额外规则：',
      '· findings 写报告里的**检查结论**（照抄结论段，不要逐项罗列化验数值）。',
      '· recommendations 写报告里医生给出的建议；没有就留空。',
      '· checkupType 从这几个里选最贴近的：ROUTINE 常规体检 / PRE_PURCHASE 购前体检 /',
      '  SENIOR_WELLNESS 老年健康检查 / PRE_ANESTHESIA 麻醉前检查 / EMERGENCY 急诊检查 / FOLLOW_UP 复查。',
      '  判断不了就留空字符串。',
      '',
      '输出 JSON 结构：',
      '{',
      '  "drafts": [',
      '    { "checkupDate": "2026-08-30", "checkupType": "ROUTINE",',
      '      "findings": "血常规与生化未见明显异常", "recommendations": "半年后复查",',
      '      "veterinarian": "", "notes": "" }',
      '  ],',
      '  "confidence": "HIGH" | "MEDIUM" | "LOW",',
      '  "warnings": []',
      '}',
    ].join('\n');
  }

  if (documentType === 'MEDICAL_RECORD') {
    return [
      '你是一名宠物助理，负责把「狗狗病历 / 就诊记录」的识别文字整理成一条就诊记录。',
      '',
      ...COMMON_RULES,
      '',
      '本类型的额外规则：',
      '· diagnosis 照抄病历上写的诊断结果；没写就留空。',
      '· chiefComplaint 写主人描述的或医生记录的症状。',
      '· treatment 写处理方式；medications 是**药名数组**，只照抄药名，不要写剂量与用法。',
      '',
      '输出 JSON 结构：',
      '{',
      '  "drafts": [',
      '    { "visitDate": "2026-09-12", "chiefComplaint": "呕吐两次", "diagnosis": "急性胃炎",',
      '      "treatment": "禁食 12 小时后少量多餐", "medications": ["速诺"],',
      '      "veterinarian": "", "notes": "" }',
      '  ],',
      '  "confidence": "HIGH" | "MEDIUM" | "LOW",',
      '  "warnings": []',
      '}',
    ].join('\n');
  }

  // ALLERGY_REPORT：沿用此前那套（线上已在跑），只把输出扩成 drafts 形状
  return [
    '你是一名宠物营养助理，负责把「狗狗过敏原检测报告」的识别文字整理成结构化信息。',
    '',
    ...COMMON_RULES,
    '',
    '本类型的额外规则：',
    '· 过敏原要归一成常见食物名（例如「鸡胸肉」「鸡肉提取物」都写作「鸡肉」）；',
    '  若文字里是"对 XX 过敏/不耐受/过敏原阳性"这类表述，XX 即为过敏原。',
    '· 报告里若写明"未见异常""阴性""无过敏"，则 drafts 返回空数组，',
    '  并把这一点写进 warnings，不要编造过敏原。',
    '· medicalConditions 照抄报告里提到的既往病症名称，不做判断。',
    '',
    '输出 JSON 结构：',
    '{',
    '  "drafts": [ { "allergen": "鸡肉", "notes": "" } ],',
    '  "medicalConditions": ["胰腺炎"],',
    '  "confidence": "HIGH" | "MEDIUM" | "LOW",',
    '  "warnings": ["报告中未注明检测方法"]',
    '}',
  ].join('\n');
}

/** 日期归一化：只认 YYYY-MM-DD，其余一律丢空（不猜、不补） */
export function normalizeDraftDate(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const matched = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!matched) return '';
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  if (year < 1990 || year > 2100) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDraftText(value: unknown, maxLength = 500): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

const CHECKUP_TYPES = new Set([
  'ROUTINE',
  'PRE_PURCHASE',
  'SENIOR_WELLNESS',
  'PRE_ANESTHESIA',
  'EMERGENCY',
  'FOLLOW_UP',
]);

/**
 * 把 AI 输出归一成"可以直接填进表单"的草稿。
 *
 * 两张安全网：
 *   · 日期一律走 normalizeDraftDate —— 认不出来就留空，宁可让顾客自己填
 *   · 未知字段一律丢弃 —— 每种类型只保留白名单里的键
 */
export function normalizeDrafts(
  documentType: HealthDocumentType,
  parsed: Record<string, unknown>,
): Record<string, any>[] {
  const raw = Array.isArray(parsed.drafts) ? parsed.drafts : [];

  if (documentType === 'VACCINE_BOOK') {
    return raw
      .map((item: any) => ({
        vaccineName: normalizeDraftText(item?.vaccineName, 100),
        vaccinationDate: normalizeDraftDate(item?.vaccinationDate),
        nextDueDate: normalizeDraftDate(item?.nextDueDate),
        notes: normalizeDraftText(item?.notes, 200),
      }))
      // 没有疫苗名的记录没有意义，丢掉
      .filter((draft) => draft.vaccineName)
      .slice(0, 20);
  }

  if (documentType === 'CHECKUP_REPORT') {
    return raw
      .map((item: any) => {
        const type = String(item?.checkupType || '').trim().toUpperCase();
        return {
          checkupDate: normalizeDraftDate(item?.checkupDate),
          checkupType: CHECKUP_TYPES.has(type) ? type : '',
          findings: normalizeDraftText(item?.findings),
          recommendations: normalizeDraftText(item?.recommendations),
          veterinarian: normalizeDraftText(item?.veterinarian, 60),
          notes: normalizeDraftText(item?.notes),
          attachments: [],
        };
      })
      .filter((draft) => draft.checkupDate || draft.findings)
      .slice(0, 1);
  }

  if (documentType === 'MEDICAL_RECORD') {
    return raw
      .map((item: any) => ({
        visitDate: normalizeDraftDate(item?.visitDate),
        chiefComplaint: normalizeDraftText(item?.chiefComplaint),
        diagnosis: normalizeDraftText(item?.diagnosis),
        treatment: normalizeDraftText(item?.treatment),
        medications: Array.isArray(item?.medications)
          ? item.medications
              .map((name: unknown) => normalizeDraftText(name, 60))
              .filter(Boolean)
              .slice(0, 20)
          : [],
        veterinarian: normalizeDraftText(item?.veterinarian, 60),
        notes: normalizeDraftText(item?.notes),
        status: 'PENDING_CONFIRMATION',
        attachments: [],
      }))
      .filter((draft) => draft.visitDate || draft.diagnosis || draft.chiefComplaint)
      .slice(0, 1);
  }

  // ALLERGY_REPORT：优先用 drafts；模型若仍按旧形状只返回 allergies，
  // 这里兜底接住 —— 提示词换了不代表模型一定照做，丢数据的代价太大。
  const fromDrafts = raw
    .map((item: any) => ({
      allergen: normalizeDraftText(item?.allergen, 40),
      notes: normalizeDraftText(item?.notes, 200),
    }))
    .filter((draft) => draft.allergen)
    .slice(0, MAX_KEYWORDS);

  if (fromDrafts.length > 0) {
    return fromDrafts;
  }

  return normalizeKeywordList(parsed.allergies).map((allergen) => ({
    allergen,
    notes: '',
  }));
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
    /** 识别哪类文档（老板第 4 条：从过敏报告扩到体检报告与疫苗本） */
    documentType?: string;
  }): Promise<HealthReportExtractionResult> {
    const documentType = normalizeDocumentType(input.documentType);
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
      systemPrompt: buildSystemPrompt(documentType),
      userPayload: {
        task: 'extract_dog_health_document',
        documentType,
        ocrText,
      },
      temperature: 0,
    });

    const drafts = normalizeDrafts(documentType, parsed as Record<string, unknown>);
    const medicalConditions = normalizeKeywordList(parsed.medicalConditions);
    const warnings = normalizeWarnings(parsed.warnings);

    // 过敏流程沿用旧字段（线上已经在跑），其余类型用 drafts
    const allergies =
      documentType === 'ALLERGY_REPORT'
        ? drafts.map((draft) => String(draft.allergen || '')).filter(Boolean)
        : normalizeKeywordList(parsed.allergies);

    if (drafts.length === 0 && warnings.length === 0) {
      // 明确告诉顾客"没识别到"，让他改用手工填写，而不是给一个空结果让人以为成功了。
      // 过敏流程沿用顾客已经熟悉的那句（线上一直在跑），其余类型给更贴合的措辞。
      warnings.push(
        documentType === 'ALLERGY_REPORT'
          ? '未识别到过敏原或病史，请改用下面的选项手工补充'
          : '未识别到可用内容，请换一张更清晰的图片，或改用手工填写',
      );
    }

    return {
      documentType,
      drafts,
      allergies,
      medicalConditions,
      ocrText,
      confidence: normalizeConfidence(parsed.confidence),
      warnings,
    };
  }
}
