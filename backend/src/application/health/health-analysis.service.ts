import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { KnowledgeBaseService } from '../recipe-designer/knowledge-base.service';
import { callDeepSeekJson } from '../recipe-designer/deepseek-chat';
import { HealthTimelineService } from './health-timeline.service';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * AI 健康分析与建议（2026-10-01，第七期）。
 *
 * ── 老板第 19–21 条 ────────────────────────────────────────
 *   19. 健康分析与建议，"我给出的这几个选项都要涵盖到" → 七项产出
 *   20. 边界把严一点：**不做诊断，只做初步分析**
 *   21. AI 的建议可以给顾客和营养师看；给顾客看的要有免责声明
 *
 * ── 三道闸门（都有代码与测试兜着）────────────────────────
 *
 *   ① **没有出处就说不了话**
 *      提示词里只给检索到的知识条目，并要求 AI 逐条标注条目编号。
 *      某一方面没有条目支撑时，那一项必须写"现有记录不足以给出建议"，
 *      不许自己发挥。
 *
 *   ② **未审核的知识不进顾客侧**
 *      `buildPromptContext(audience:'customer')` 只放 APPROVED 的条目。
 *      新补的免疫/化验/就医时机条目目前**全部是待审**，所以顾客侧
 *      实际上拿不到这些内容 —— 这也是顾客侧默认关闭的原因之一。
 *
 *   ③ **诊断禁令写在提示词里，也写在输出校验里**
 *      提示词禁止 AI 说"得了 XX 病"；返回后再扫一遍禁用措辞，
 *      命中就把那一项降级成"请咨询兽医"。
 *
 * 免责声明**不进 AI**，由前端写死 —— AI 不该有机会改写它。
 */

/** 七项产出（老板第 19 条） */
export const HEALTH_ANALYSIS_SECTIONS = [
  'overview', // ① 健康总评
  'recordReading', // ② 记录解读
  'watchSignals', // ③ 需要留意的信号
  'nutritionAdvice', // ④ 营养与饮食建议
  'followUpAdvice', // ⑤ 复查与随访建议
  'vaccineAdvice', // ⑥ 疫苗与免疫建议
  'visitPrep', // ⑦ 就诊前准备
] as const;

export type HealthAnalysisSection = (typeof HEALTH_ANALYSIS_SECTIONS)[number];

export const HEALTH_ANALYSIS_SECTION_LABELS: Record<HealthAnalysisSection, string> = {
  overview: '健康总评',
  recordReading: '记录解读',
  watchSignals: '需要留意的信号',
  nutritionAdvice: '营养与饮食建议',
  followUpAdvice: '复查与随访建议',
  vaccineAdvice: '疫苗与免疫建议',
  visitPrep: '就诊前准备',
};

export interface HealthAnalysisItem {
  section: HealthAnalysisSection;
  label: string;
  content: string;
  /** 引用的知识条目编号（可倒查到出处） */
  citations: string[];
}

export interface HealthAnalysisResult {
  dogId: string;
  items: HealthAnalysisItem[];
  /** 这次分析用了多少条已审核知识 */
  approvedKnowledgeCount: number;
  /** 有多少条目因为没出处而拒绝作答 */
  insufficientSections: HealthAnalysisSection[];
  /** 因措辞越界被降级的项 */
  downgradedSections: HealthAnalysisSection[];
  /** 未审核知识绝不进入顾客侧 */
  audience: 'nutritionist' | 'customer';
  generatedAt: string;
}

/** 顾客侧未开放时的返回（与疫苗计划同一套做法） */
export interface HealthAnalysisUnavailable {
  available: false;
  message: string;
  enableWith: string;
}

/**
 * 这个模块在「AI / Agent 配置」里的用途标识（2026-10-01 补）。
 * 与识别那条分开配：分析用文本模型，识别用视觉模型，互不影响。
 */
export const HEALTH_ANALYSIS_PURPOSE = 'HEALTH_ANALYSIS';

/**
 * 越界措辞扫描。
 *
 * 提示词已经禁止 AI 下诊断，但**不能只靠提示词** —— 这里在返回前再扫一遍，
 * 命中就把那一项降级。宁可少说，也不能说出"你的狗得了 XX 病"。
 */
const DIAGNOSIS_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /确诊|诊断为|得了[^。，]{1,12}病|患上了/i, reason: '疑似下诊断' },
  { pattern: /(早期|中期|晚期|第[一二三四1234]期)\s*(肾病|肝病|心衰|肿瘤)/i, reason: '疑似分期' },
  { pattern: /\d+\s*(mg|ml|毫克|毫升)\s*\/?\s*(kg|公斤)?/i, reason: '疑似给剂量' },
  { pattern: /(抗生素|激素|处方药)[^。]{0,10}(吃|服用|注射)/i, reason: '疑似给用药建议' },
  { pattern: /不用去医院|不必就医|在家观察就行|不需要看医生/i, reason: '疑似替代就医' },
];

/** 命中越界时的降级文案（写死的，不经过 AI） */
const DOWNGRADE_TEXT =
  '这部分内容超出了我们能给的范围。是否需要进一步检查或处理，请咨询执业兽医。';

/**
 * 每项对应的知识检索标签。
 *
 * 一个领域一个问题类型：标签命中越多，条目排得越靠前
 * （知识库的 searchByTags 已按命中数排序，且有条数上限）。
 */
const SECTION_TAGS: Record<HealthAnalysisSection, string[]> = {
  overview: [
    'general',
    'adult',
    'senior',
    'prevention',
    'clinical',
    'nursing',
    'breed-risk',
  ],
  recordReading: ['lab', 'clinical', 'ckd', 'renal', 'hepatic', 'cardio', 'gi'],
  watchSignals: ['red-flag', 'clinical', 'triage', 'behavior'],
  nutritionAdvice: ['general', 'renal', 'hepatic', 'gi', 'skin', 'weight', 'pancreatitis'],
  followUpAdvice: ['lab', 'followup', 'ckd', 'renal', 'senior', 'prevention', 'behavior'],
  vaccineAdvice: ['vaccine', 'immune'],
  visitPrep: ['clinical', 'prevention', 'lab', 'visit-prep'],
};

@Injectable()
export class HealthAnalysisService {
  private readonly logger = new Logger(HealthAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timelineService: HealthTimelineService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly agentProviderConfigService: AgentProviderConfigService,
  ) {}

  /** 顾客侧是否已开放（默认关闭：知识尚未经专业审核） */
  isCustomerEnabled(): boolean {
    return String(process.env.HEALTH_ANALYSIS ?? '').trim().toLowerCase() === 'customer';
  }

  /**
   * 生成健康分析。
   *
   * @param audience 'customer' 时受开关与"只放已审核知识"双重约束
   */
  async analyze(
    customerId: string,
    dogId: string,
    audience: 'nutritionist' | 'customer' = 'customer',
  ): Promise<HealthAnalysisResult | HealthAnalysisUnavailable> {
    if (audience === 'customer' && !this.isCustomerEnabled()) {
      return {
        available: false,
        message:
          '健康分析还在做专业审核，暂时只对内部开放。审核通过后这里会给出基于权威指南的初步分析与建议。',
        enableWith: 'HEALTH_ANALYSIS=customer',
      };
    }

    // 复用就诊前摘要：它已经把六类记录聚合好了，不用再查一遍
    const summary = await this.timelineService.getVisitSummary(customerId, dogId);

    const knowledgeContext = this.buildKnowledgeContext(summary, audience);
    const approvedKnowledgeCount = countKnowledgeEntries(knowledgeContext);

    const parsed = await this.callModel(summary, knowledgeContext, audience);

    const items: HealthAnalysisItem[] = [];
    const insufficientSections: HealthAnalysisSection[] = [];
    const downgradedSections: HealthAnalysisSection[] = [];

    for (const section of HEALTH_ANALYSIS_SECTIONS) {
      const raw = (parsed?.[section] || {}) as Record<string, unknown>;
      const content = normalizeText(raw.content);
      const citations = normalizeCitationList(raw.citations).filter((id) =>
        // 只保留真实出现在本次上下文里的条目编号，防止 AI 编造出处
        knowledgeContext.includes(`[${id}]`),
      );

      // 没内容 → 这一项没有依据，明说而不是编
      if (!content) {
        insufficientSections.push(section);
        items.push({
          section,
          label: HEALTH_ANALYSIS_SECTION_LABELS[section],
          content: '现有记录还不足以给出这方面的分析。多记几条之后可以再看。',
          citations: [],
        });
        continue;
      }

      // 有内容但一条出处都没有 → 同样视为没有依据
      if (citations.length === 0) {
        insufficientSections.push(section);
        items.push({
          section,
          label: HEALTH_ANALYSIS_SECTION_LABELS[section],
          content: '这项分析暂时没有可引用的权威依据，先不给结论。',
          citations: [],
        });
        continue;
      }

      // 越界措辞 → 降级
      const violation = DIAGNOSIS_PATTERNS.find((item) => item.pattern.test(content));
      if (violation) {
        this.logger.warn(
          `[HealthAnalysis] 第 ${section} 项措辞越界（${violation.reason}），已降级`,
        );
        downgradedSections.push(section);
        items.push({
          section,
          label: HEALTH_ANALYSIS_SECTION_LABELS[section],
          content: DOWNGRADE_TEXT,
          citations: [],
        });
        continue;
      }

      items.push({
        section,
        label: HEALTH_ANALYSIS_SECTION_LABELS[section],
        content,
        citations,
      });
    }

    return {
      dogId,
      items,
      approvedKnowledgeCount,
      insufficientSections,
      downgradedSections,
      audience,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * 员工用（营养师/管理端）：不受顾客侧开关限制。
   *
   * 营养师看得懂"这条还没审"，所以未审核条目也放进来 ——
   * 这正是他们审核知识、判断 AI 说得对不对的依据。
   */
  async analyzeForStaff(dogId: string): Promise<HealthAnalysisResult> {
    const dog = await this.prisma.dog.findUnique({ where: { id: dogId } });
    if (!dog) {
      throw new NotFoundException('爱犬不存在');
    }
    const result = await this.analyze(dog.ownerId, dogId, 'nutritionist');
    if ('available' in result) {
      // 营养师侧不该走到这里（开关只约束顾客侧）；真走到了说明代码有问题，
      // 与其静默返回一个不可用对象，不如明说。
      throw new BadRequestException('营养师侧不应受顾客开关限制');
    }
    return result;
  }

  /**
   * 按七个方面分别检索知识。
   *
   * 为什么要分开检索：一次塞进所有标签，检索结果会被"命中标签最多"的
   * 那几类条目占满（知识库有 24 条上限），疫苗建议就一条都排不进来。
   */
  private buildKnowledgeContext(
    summary: any,
    audience: 'nutritionist' | 'customer',
  ): string {
    const profileTags = deriveProfileTags(summary);
    const blocks: string[] = [];

    for (const section of HEALTH_ANALYSIS_SECTIONS) {
      const tags = [...profileTags, ...SECTION_TAGS[section]];
      const context = this.knowledgeBaseService.buildPromptContext(tags, [], {
        audience,
        purpose: 'health',
        // 每项只取 6 条：七项加起来仍在上限之内，也不会把提示词撑爆
        limit: 6,
      });
      if (context) {
        blocks.push(`【${HEALTH_ANALYSIS_SECTION_LABELS[section]}可引用的条目】\n${context}`);
      }
    }

    return blocks.join('\n\n');
  }

  private async callModel(
    summary: any,
    knowledgeContext: string,
    audience: 'nutritionist' | 'customer',
  ): Promise<Record<string, any>> {
    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: HEALTH_ANALYSIS_PURPOSE,
        fallbackToDefault: true,
      });

    return callDeepSeekJson({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      systemPrompt: buildSystemPrompt(audience),
      userPayload: {
        task: 'dog_health_analysis',
        audience,
        dogProfile: {
          name: summary?.dog?.name,
          breedName: summary?.dog?.breedName,
          ageText: summary?.dog?.ageText,
          gender: summary?.dog?.gender,
          isNeutered: summary?.dog?.isNeutered,
          currentWeightKg: summary?.dog?.currentWeightKg,
          bcsScore: summary?.dog?.bcsScore,
        },
        healthRecords: {
          allergies: summary?.allergies,
          ongoingConditions: summary?.ongoingConditions,
          recentVisits: summary?.recentVisits,
          recentCheckups: summary?.recentCheckups,
          vaccines: summary?.vaccines,
          weight: summary?.weight,
          diet: summary?.diet,
          medicalHistory: summary?.medicalHistory,
          counts: summary?.counts,
        },
        knowledgeContext,
      },
      temperature: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

export function buildSystemPrompt(audience: 'nutritionist' | 'customer'): string {
  return [
    '你是一名宠物健康助理。你的任务是把主人**自己记录的健康信息**整理成一份供参考的分析。',
    '',
    '【绝对不能做的事】',
    '1. 不下诊断：不能说"你的狗得了 XX 病""确诊为……"。',
    '2. 不判断严重程度、不做分期（不说"早期肾病""第 2 期"这类话）。',
    '3. 不给药物名称、剂量或用法。',
    '4. 不替代就医：不能说"在家观察就行""不用去医院"。',
    '5. 不能把过敏当成不爱吃（过敏是安全底线，两者必须分开说）。',
    '6. **只能引用下面给出的知识条目**，不许使用你自己的医学常识，不许编造出处。',
    '7. 每一段的 citations 里必须列出你引用了哪些条目编号（如 ["lab-003"]）。',
    '   如果某一方面没有条目支撑，content 就写"现有记录还不足以给出这方面的分析"，citations 留空 ——',
    '   **宁可不答，也不要自己发挥**。',
    '',
    '【语气与措辞】',
    '· 用家长看得懂的话，不用专业术语堆砌；非用不可时先用大白话解释一遍。',
    '· 涉及需要医生判断的事，统一说"建议咨询执业兽医"，不要给结论。',
    '· 不要吓人，也不要给虚假的安心；如实说"记录里有什么、说明不了什么"。',
    audience === 'customer'
      ? '· 读者是宠物主人本人。'
      : '· 读者是宠物营养师（专业人士），可以保留必要的专业表述。',
    '',
    '【输出七项，只输出 JSON】',
    '{',
    ...HEALTH_ANALYSIS_SECTIONS.map(
      (section) =>
        `  "${section}": { "content": "……", "citations": ["条目编号"] },  // ${HEALTH_ANALYSIS_SECTION_LABELS[section]}`,
    ),
    '}',
  ].join('\n');
}

/** 从就诊摘要里推出这只狗的标签（与食谱设计那套一致的思路） */
export function deriveProfileTags(summary: any): string[] {
  const tags = new Set<string>(['all']);

  const ageText = String(summary?.dog?.ageText || '');
  if (/个月/.test(ageText) && !/岁/.test(ageText)) {
    tags.add('puppy');
    tags.add('growth');
  } else if (/^(\d+)\s*岁/.test(ageText) && Number(RegExp.$1) >= 8) {
    tags.add('senior');
    tags.add('geriatric');
  } else {
    tags.add('adult');
  }

  const bcs = Number(summary?.dog?.bcsScore);
  if (Number.isFinite(bcs)) {
    if (bcs >= 7) {
      tags.add('overweight');
      tags.add('obese');
    } else if (bcs <= 3) {
      tags.add('underweight');
    }
  }

  if (Array.isArray(summary?.allergies) && summary.allergies.length > 0) {
    tags.add('food-allergy');
    tags.add('skin');
  }

  // 从自由文本里认领域（与食谱设计同思路：关键词命中即加标签）
  const text = [
    summary?.medicalHistory ?? '',
    ...(summary?.ongoingConditions || []).map((item: any) => item.diagnosis ?? ''),
    ...(summary?.recentVisits || []).map((item: any) => item.diagnosis ?? ''),
    ...(summary?.recentCheckups || []).map(
      (item: any) => `${item.findings ?? ''} ${item.recommendations ?? ''}`,
    ),
  ].join(' ');

  if (/肾|肌酐|蛋白尿/.test(text)) tags.add('ckd'), tags.add('renal');
  if (/胰腺|高脂|甘油三酯/.test(text)) tags.add('pancreatitis'), tags.add('low-fat');
  if (/肠|腹泻|呕吐|IBD/i.test(text)) tags.add('gi'), tags.add('ibd');
  if (/皮肤|瘙痒|掉毛/.test(text)) tags.add('skin'), tags.add('coat');
  if (/结石|泌尿|膀胱/.test(text)) tags.add('urolith'), tags.add('urinary');
  if (/糖尿|血糖/.test(text)) tags.add('diabetes'), tags.add('endocrine');
  if (/肝|胆/.test(text)) tags.add('hepatic'), tags.add('liver');
  if (/心脏|心衰|心肌/.test(text)) tags.add('cardio'), tags.add('heart');
  if (/关节|骨关节炎/.test(text)) tags.add('ortho'), tags.add('joint');
  if (/牙|口腔/.test(text)) tags.add('dental'), tags.add('oral');
  if (/贫血/.test(text)) tags.add('hemo'), tags.add('anemia');

  return [...tags];
}

export function countKnowledgeEntries(context: string): number {
  return (context.match(/^- \[/gm) || []).length;
}

function normalizeText(value: unknown, maxLength = 1200): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function normalizeCitationList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? '').trim())
        .filter((item) => /^[a-z]+-\d+$/i.test(item)),
    ),
  ).slice(0, 10);
}
