import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
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
  /**
   * 引用条目的标题，与 citations 一一对应（2026-10-02 补）。
   *
   * 顾客不该看到 `prev-004` 这种内部编号 —— 那看着像故障，也读不出任何信息。
   * 「依据：老年犬专项筛查包含哪些系统」才是家长能看懂、也能建立信任的写法。
   * 编号照旧保留在 citations 里（内部倒查与营养师侧仍用它）。
   */
  citationTitles: string[];
}

export interface HealthAnalysisResult {
  dogId: string;
  /** 狗狗的名字（界面标题用；取不到就不给，界面自己兜底，别编） */
  dogName?: string;
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
  /**
   * 这次是直接给的上一次结果（记录没变，没重新调模型）。
   *
   * 生成时间仍是**上一次真正生成**的时间 —— 不许把它刷成"刚刚"，
   * 界面上写"生成时间"就得是实话。
   */
  fromCache?: boolean;
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
  // 2026-10-02：影像片不做解读，也不能说"片子没问题"——
  // 我们只归档原件，看片是兽医的事。
  {
    pattern: /(片子|影像|X\s*光|B\s*超|超声|CT)[^。，]{0,8}(正常|未见异常|没问题|无异常)/i,
    reason: '疑似解读影像',
  },
  {
    pattern: /(未见明显异常|一切正常)[^。]{0,6}(片子|影像|X\s*光|B\s*超)/i,
    reason: '疑似解读影像',
  },
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

/** 缓存默认存活时间：30 分钟（可用 HEALTH_ANALYSIS_CACHE_TTL_MINUTES 覆盖） */
export const HEALTH_ANALYSIS_CACHE_TTL_MS = 30 * 60 * 1000;
/** 同时缓存的份数上限（一台上限 200 份，按插入顺序淘汰最旧的） */
export const HEALTH_ANALYSIS_CACHE_MAX_ENTRIES = 200;

/**
 * 分析结果缓存（2026-10-02，老板要求）。
 *
 * 为什么要缓存：一次分析要跑三十多秒、调一次模型。家长点进页面看一眼、退出来、
 * 再点进去，就要再等半分钟、再花一次钱 —— 而记录根本没变，结果必然一模一样。
 *
 * 三条设计取舍：
 *   · **按"记录指纹"失效，不是按时间失效**：指纹来自就诊前摘要（记录条数、各条记录的
 *     日期与内容、体重、体况、病史、饮食偏好），只要家长新记了一条、改了体重、删了记录，
 *     指纹就变，缓存立刻作废 —— 不会拿旧结论糊弄人。TTL 只是兜底。
 *   · **顾客与营养师分开存**：两边可引用的知识不同（顾客只认已审核条目），
 *     同一只狗的结果本来就不一样，混用等于把未审核内容漏给顾客。
 *   · **只缓存成功结果**：失败/未开放不缓存，否则一次网络抖动会钉住半小时。
 */
export class HealthAnalysisCache {
  private readonly entries = new Map<
    string,
    { fingerprint: string; result: HealthAnalysisResult; expiresAt: number }
  >();

  constructor(
    private readonly ttlMs: number = HEALTH_ANALYSIS_CACHE_TTL_MS,
    private readonly maxEntries: number = HEALTH_ANALYSIS_CACHE_MAX_ENTRIES,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** 命中才返回；指纹不符或过期都当作没有 */
  get(
    key: string,
    fingerprint: string,
    now: number = Date.now(),
  ): HealthAnalysisResult | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= now || hit.fingerprint !== fingerprint) {
      this.entries.delete(key);
      return null;
    }
    // 命中后挪到队尾：淘汰时先掉最久没用的那份
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.result;
  }

  set(
    key: string,
    fingerprint: string,
    result: HealthAnalysisResult,
    now: number = Date.now(),
  ): void {
    this.entries.delete(key);
    this.entries.set(key, { fingerprint, result, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

@Injectable()
export class HealthAnalysisService {
  private readonly logger = new Logger(HealthAnalysisService.name);
  private readonly cache = new HealthAnalysisCache(resolveCacheTtlMs());

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

    // 复用就诊前摘要：它已经把五类记录（就诊/体检/过敏/疫苗/体重）聚合好了，不用再查一遍
    const summary = await this.timelineService.getVisitSummary(customerId, dogId);

    // 记录没变就直接给上一次的结果：省掉三十多秒的等待和一次模型调用。
    // 指纹取自摘要本身，所以"家长刚记了一条/改了体重"必然命中不了旧缓存。
    const cacheKey = `${audience}:${customerId}:${dogId}`;
    const fingerprint = buildAnalysisFingerprint(summary);
    const cached = this.cache.get(cacheKey, fingerprint);
    if (cached) {
      this.logger.log(`[HealthAnalysis] 命中缓存（${audience} · ${dogId}），跳过模型调用`);
      return { ...cached, fromCache: true };
    }

    const knowledgeContext = this.buildKnowledgeContext(summary, audience);
    const approvedKnowledgeCount = countKnowledgeEntries(knowledgeContext);

    const parsed = await this.callModel(summary, knowledgeContext, audience);

    const items: HealthAnalysisItem[] = [];
    const insufficientSections: HealthAnalysisSection[] = [];
    const downgradedSections: HealthAnalysisSection[] = [];
    // 编号 → 标题：顾客侧要显示人话版的出处，不接受 `prev-004` 这种内部编号
    const titleById = this.loadCitationTitleMap();

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
          citationTitles: [],
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
          citationTitles: [],
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
          citationTitles: [],
        });
        continue;
      }

      items.push({
        section,
        label: HEALTH_ANALYSIS_SECTION_LABELS[section],
        content,
        citations,
        citationTitles: resolveCitationTitles(citations, titleById),
      });
    }

    const result: HealthAnalysisResult = {
      dogId,
      dogName: normalizeText(summary?.dog?.name, 40) || undefined,
      items,
      approvedKnowledgeCount,
      insufficientSections,
      downgradedSections,
      audience,
      generatedAt: new Date().toISOString(),
    };

    this.cache.set(cacheKey, fingerprint, result);

    return result;
  }

  /** 知识条目全表 → id/标题 映射；取不到就返回空表（出处退回显示编号） */
  private loadCitationTitleMap(): Map<string, string> {
    try {
      return buildCitationTitleMap(this.knowledgeBaseService.getAll());
    } catch (error) {
      // 标题只是给顾客看的润色，绝不能因为它让整次分析失败
      this.logger.warn(
        `[HealthAnalysis] 取知识条目标题失败，出处退回显示编号：${(error as Error)?.message}`,
      );
      return new Map<string, string>();
    }
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
    '【给你的记录怎么看】',
    'healthRecords 里每一项的字段含义（都是主人自己记录或拍照识别来的）：',
    '· diagnosis / findings = 医生或报告给出的结论；chiefComplaint = 主人描述的症状；',
    '· treatment = **医嘱/回家注意**（医生交代回家要做的）；medications = 处方上的药与用法；',
    '  recommendations = 报告里医生给的建议；exams = 这次做了哪些检查（2026-10-02 新增）；',
    '  vitals = 体征（体温、体重、BCS）；',
    '· **labValues = 化验数据**，逐项一行的"项目 数值 单位"（如"肌酐 72.2 umol/L"）；',
    '  它来自化验单照片的识别，**通常没有参考区间**，因此：只能说清"做了哪些化验项目、',
    '  涉及哪些方面、建议把原件带给兽医看"，**不要自行判断某项是高还是低**。',
    '  例外：**报告自己标了"偏高/偏低"的**（行尾带这个标记），可以照说"报告标为偏高"，',
    '  但仍然不许据此下结论、不许建议用药。',
    '· status = 这条记录现在的状态。**「未标注结果」只是说家长没有标注这条的结局，',
    '  不代表现在还在生病** —— 不要据此写"正在患病/还没好/仍在治疗"；',
    '  只有明确写着「治疗中」「慢性」的才算还没结束的问题（2026-10-02 起表单里不再问状态，',
    '  所以绝大多数记录都会是"未标注结果"）；',
    '· notes = 主人额外补充的话；attachmentCount = 这条记录带了几份原件（报告照片）。',
    '',
    '【影像片与附件的边界（硬规矩）】',
    '· 我们**只归档原件、不解读影像**：X 光、B 超/超声、CT 这类只有图像的资料，',
    '  系统没有读取过片子内容，**你也不许根据它判断病情**。',
    '· 绝对不要写"片子正常""影像未见异常""X 光没问题"这类话；',
    '  最多说"档案里留了一次影像检查的原件，需要看片请把原件带给执业兽医"。',
    '· attachmentOnly 为 true 的记录，就是"只有原件、没有任何文字结论"的那种。',
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
    // 2026-10-02：把 labValues（化验数值）也拼进来 ——
    // 肌酐/蛋白尿/甘油三酯这些决定饮食方向的词本来就在化验栏里；
    // 食谱设计器与营养师端的标签派生早就这么做了，这里对齐口径。
    ...(summary?.ongoingConditions || []).map(
      (item: any) => `${item.diagnosis ?? ''} ${item.labValues ?? ''}`,
    ),
    ...(summary?.recentVisits || []).map(
      (item: any) => `${item.diagnosis ?? ''} ${item.labValues ?? ''}`,
    ),
    ...(summary?.recentCheckups || []).map(
      (item: any) =>
        `${item.findings ?? ''} ${item.labValues ?? ''} ${item.recommendations ?? ''}`,
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

/**
 * 知识条目全表 → id/标题 映射（2026-10-02）。
 *
 * 顾客侧要显示的是「老年犬专项筛查包含哪些系统」这种标题，
 * 不是 `prev-004` 这种内部编号 —— 编号给顾客看像故障，也读不出信息。
 * 没标题或没编号的条目直接跳过：宁可退回显示编号，也不要显示空白出处。
 */
export function buildCitationTitleMap(
  entries: Array<{ id?: string; title?: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries || []) {
    const id = String(entry?.id ?? '').trim();
    const title = String(entry?.title ?? '').trim();
    if (id && title) {
      map.set(id, title);
    }
  }
  return map;
}

/** 编号列表 → 标题列表；查不到标题的条目退回显示编号 */
export function resolveCitationTitles(
  citations: string[],
  titleById: Map<string, string>,
): string[] {
  return (citations || []).map((id) => titleById.get(id) || id);
}

/** 缓存 TTL 可以按环境变量调（分钟）；给不出合法值就用默认 30 分钟 */
export function resolveCacheTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(String(env.HEALTH_ANALYSIS_CACHE_TTL_MINUTES ?? '').trim());
  if (!Number.isFinite(raw) || raw <= 0) {
    return HEALTH_ANALYSIS_CACHE_TTL_MS;
  }
  return raw * 60 * 1000;
}

/**
 * 记录指纹：摘要内容变了，指纹就变（2026-10-02）。
 *
 * 只把 `generatedAt` 摘掉 —— 它每次调用都是新的，留着会让缓存永远命中不了；
 * 其余字段（五类记录的条数、每条的日期与内容、体重、体况、病史、饮食偏好）
 * 全部参与，所以任何一次真实的记录变动都会让旧结果作废。
 */
export function buildAnalysisFingerprint(summary: unknown): string {
  if (!summary || typeof summary !== 'object') {
    return 'empty';
  }
  const { generatedAt: _generatedAt, ...stable } = summary as Record<string, unknown>;
  return createHash('sha1').update(JSON.stringify(stable)).digest('hex');
}
