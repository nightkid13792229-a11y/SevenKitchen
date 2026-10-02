/**
 * 结构化知识库类型定义（AI 设计建议板块专用）
 *
 * 知识条目来源为本地权威资料：SACN5（小动物临床营养学第5版）、
 * NRC《犬猫营养需要》(2006)、FEDIAF 犬猫营养指南、WSAVA / AAHA 指南。
 * 每条目必须标注出处，AI 生成建议时只引用本知识库条目，不联网现找。
 */

export type KnowledgeDomain =
  | 'GENERAL' // 通用成年犬营养维护
  | 'GROWTH' // 幼犬生长
  | 'SENIOR' // 老年犬
  | 'WEIGHT' // 体重管理
  | 'RENAL' // 肾脏病
  | 'PANCREATITIS' // 胰腺炎 / 低脂
  | 'GI' // 肠道病 / IBD
  | 'SKIN' // 皮肤过敏 / 被毛
  | 'UROLITH' // 泌尿结石
  | 'ENDOCRINE' // 内分泌 / 代谢疾病（糖尿病、甲状腺）
  | 'HEPATIC' // 肝胆疾病
  | 'CARDIO' // 心血管疾病
  | 'ORTHO' // 骨关节 / 骨关节炎
  | 'ONCO' // 癌症 / 肿瘤
  | 'NEURO' // 神经认知 / 脑老化（CDS）
  | 'DENTAL' // 口腔 / 牙周病
  | 'REPRO' // 繁殖围产期（母犬妊娠/哺乳）
  | 'SAFE' // 食品安全 / 实操风险
  | 'CRITICAL' // 危重症 / 营养支持
  | 'HEMO' // 血液 / 造血营养（贫血）
  /* ---- 2026-10-01 新增：健康管理专用（食谱设计用不到，见 buildPromptContext 的 purpose） ---- */
  | 'IMMUNE' // 免疫 / 疫苗接种
  | 'LAB' // 检查指标解读
  | 'CLINICAL' // 常见病表现与就医时机
  | 'PREVENTION' // 预防与体检节奏
  | 'NURSING' // 日常护理（口腔/耳道/皮肤/被毛/指甲）
  | 'VISITPREP' // 就诊前准备与摘要
  | 'BREEDRISK' // 品种遗传风险
  | 'BEHAVIOR'; // 行为与认知（含老年认知障碍）

export const KNOWLEDGE_DOMAIN_LABELS: Record<KnowledgeDomain, string> = {
  GENERAL: '通用成年犬',
  GROWTH: '幼犬生长',
  SENIOR: '老年犬',
  WEIGHT: '体重管理',
  RENAL: '肾脏病',
  PANCREATITIS: '胰腺炎/低脂',
  GI: '肠道病/IBD',
  SKIN: '皮肤过敏/被毛',
  UROLITH: '泌尿结石',
  ENDOCRINE: '内分泌/代谢',
  HEPATIC: '肝胆疾病',
  CARDIO: '心血管疾病',
  ORTHO: '骨关节/骨关节炎',
  ONCO: '癌症/肿瘤',
  NEURO: '神经认知/脑老化',
  DENTAL: '口腔/牙周病',
  REPRO: '繁殖围产期',
  SAFE: '食品安全/实操',
  CRITICAL: '危重症/营养支持',
  HEMO: '血液/造血营养',
  IMMUNE: '免疫/疫苗',
  LAB: '检查指标解读',
  CLINICAL: '常见病与就医时机',
  PREVENTION: '预防与体检节奏',
  NURSING: '日常护理',
  VISITPREP: '就诊前准备',
  BREEDRISK: '品种遗传风险',
  BEHAVIOR: '行为与认知',
};

/**
 * 只服务健康管理、不参与食谱设计的领域。
 *
 * 食谱设计问的是"该给它吃什么营养"，免疫/化验解读/就医时机对配方没有输入价值 ——
 * 放进配方提示词只会占名额、稀释注意力。所以按**用途**过滤：
 *   · purpose = 'recipe-design'（默认）：排除这些领域
 *   · purpose = 'health'：全都给
 *
 * 2026-10-01 第二批（补审计第四章第 4–6、8、9 项缺口）加入：
 *   预防与体检节奏、日常护理、就诊前准备、品种遗传风险、行为与认知。
 */
export const HEALTH_ONLY_DOMAINS: readonly KnowledgeDomain[] = [
  'IMMUNE',
  'LAB',
  'CLINICAL',
  'PREVENTION',
  'NURSING',
  'VISITPREP',
  'BREEDRISK',
  'BEHAVIOR',
];

export interface KnowledgeCitation {
  /** 出处名称，如「小动物临床营养学（第5版）」「FEDIAF 犬猫营养指南」 */
  source: string;
  /** 章节或页码信息 */
  chapter?: string;
  /** 补充说明 */
  note?: string;
}

export type KnowledgePriority = 'HIGH' | 'MEDIUM' | 'LOW';

/* ===========================================================================
 * 2026-10-01 结构升级（知识结构审查的四条建议）
 *
 * 背景：原结构只有"领域"一个维度，而领域全是疾病/器官（RENAL、GI…）——
 * 但健康管理要回答的是五类**问题**（这是什么意思 / 要不要去医院 / 多久复查 /
 * 该吃什么 / 怎么预防），同一个疾病下这五类答案完全不同。
 *
 * 升级遵循"旧 202 条先不动"：下面这些字段**全部可选**，只有走新结构的条目
 * 才填；填了就要满足对应要求，由 KnowledgeBaseService 在启动时校验。
 * ========================================================================= */

/**
 * 问题类型 —— 与「领域」组成两维坐标。
 *
 * 有了它，"一条肾病知识该放 RENAL 还是放检查指标解读"才有答案：
 * 领域说它属于哪个病，问题类型说它在回答哪一类问题。
 */
export type KnowledgeQuestionType =
  | 'DEFINITION' // 定义：这是什么、怎么分期
  | 'INTERPRET' // 解读：这个数值/记录意味着什么
  | 'TRIAGE' // 分诊：要不要去医院、多急
  | 'FOLLOWUP' // 复查：多久再查、查什么
  | 'NUTRITION' // 营养：该吃什么、不该吃什么
  | 'PREVENTION' // 预防：平时怎么防、该做什么检查
  | 'IMMUNE' // 免疫：疫苗怎么打
  | 'SAFETY'; // 安全：禁忌、风险、红线

export const KNOWLEDGE_QUESTION_TYPE_LABELS: Record<
  KnowledgeQuestionType,
  string
> = {
  DEFINITION: '定义',
  INTERPRET: '解读',
  TRIAGE: '分诊',
  FOLLOWUP: '复查',
  NUTRITION: '营养',
  PREVENTION: '预防',
  IMMUNE: '免疫',
  SAFETY: '安全',
};

/**
 * 风险等级 —— 决定这条知识**需不需要两个独立来源互相印证**。
 *
 * 上一轮审查的结论：交叉验证按风险分级，不搞一刀切。
 *   · 定义类结论，多引一本教科书不增加信息；
 *   · 紧急程度、数值、禁忌这类说错了会伤到狗的，必须两个来源。
 */
export type KnowledgeRiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * 紧急程度 —— **只对"分诊"类必填**。
 *
 * 这是整个知识库里唯一不能让 AI 自由发挥的判断：
 * "怎么说"可以交给 AI 翻译成人话，"有多急"必须写死。
 */
export type KnowledgeUrgency = 'IMMEDIATE' | 'SOON' | 'OBSERVE';

export const KNOWLEDGE_URGENCY_LABELS: Record<KnowledgeUrgency, string> = {
  IMMEDIATE: '立即就医',
  SOON: '尽快就医',
  OBSERVE: '可观察',
};

/**
 * 审核状态。
 *
 * 老板把边界定得很清楚：**未经专业审核的兽医内容不得对顾客开放**。
 * 所以新补的条目一律先标 PENDING_REVIEW，顾客侧检索时会被过滤掉，
 * 营养师侧照常可见（他们看得懂"这条还没审"）。
 */
export type KnowledgeReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

/**
 * 结构化出处（取代自由文本）。
 *
 * 原来的 `citations` 是字符串数组，于是同一份指南有 2–3 种写法
 * （AAHA 2021 有两种、NRC 有三种），既统计不了也反查不了
 * "哪些条目引用了已被取代的版本"。
 * 新条目一律用来源 ID，ID 必须在 source-registry 里登记过。
 */
export interface KnowledgeSourceRef {
  /** 来源登记表里的 ID，如 WSAVA-VACC-2024 */
  sourceId: string;
  /** 具体定位：章节 / 页码 / 表号 */
  locator?: string;
  /** 补充说明 */
  note?: string;
}

/**
 * 证据强度 —— 由出处**自动推导**，不用人填。
 * 高风险条目如果是"单源"，启动校验会直接报错。
 */
export type KnowledgeEvidenceStrength =
  | 'SINGLE_SOURCE'
  | 'TWO_SOURCES'
  | 'MULTI_SOURCE'
  | 'CONFLICT';

export interface KnowledgeConflict {
  /** 分歧双方（来源 ID） */
  a: string;
  b: string;
  /** 分歧点 */
  difference: string;
  /** 我们取哪个 */
  adopted: string;
  /** 为什么这么取 */
  rationale: string;
}

export interface KnowledgeEntry {
  /** 唯一 ID，如 renal-001 */
  id: string;
  domain: KnowledgeDomain;
  /** 中文标题 */
  title: string;
  /** 检索关键词（中英文） */
  keywords: string[];
  /** 适用条件标签（如 ckd、senior、puppy、overweight） */
  applicableTo: string[];
  /** 结论性建议（中文，供 AI 直接引用） */
  summary: string;
  /** 要点明细 */
  details: string[];
  /** 注意事项 / 禁忌 / 需兽医确认事项 */
  caveats: string[];
  /** 出处（必须至少 1 条） */
  citations: KnowledgeCitation[];
  /** 引用优先级（决定喂给 AI 时先给哪条，不是证据强度） */
  priority: KnowledgePriority;

  /* ---- 以下为 2026-10-01 新增，走新结构的条目才填 ---- */

  /** 问题类型；填了就算"新结构条目"，要满足下面各项要求 */
  questionType?: KnowledgeQuestionType;
  /** 风险等级；HIGH 时必须有两个及以上独立来源 */
  riskLevel?: KnowledgeRiskLevel;
  /** 紧急程度；questionType 为 TRIAGE 时必填 */
  urgency?: KnowledgeUrgency;
  /** 结构化出处；填了就以它为准（旧的 citations 仍保留兼容） */
  sources?: KnowledgeSourceRef[];
  /** 来源之间的真冲突；有冲突时必须在结论里说清取舍 */
  conflicts?: KnowledgeConflict[];
  /** 下次复核日期 YYYY-MM-DD（配合复核 SOP） */
  reviewBy?: string;
  /**
   * 审核状态；**缺省视为未审核**，顾客侧看不到。
   *
   * 2026-10-02 起这是顾客侧放行的**唯一凭据**（原来另有一张 approvals.ts 登记表，
   * 老板说不用留审核记录，已撤掉）。两条纪律：
   *   · 新条目一律先写 `PENDING_REVIEW`，审核通过才改 `APPROVED`；
   *   · **改动某条内容就把它退回 `PENDING_REVIEW`** —— 换了内容就等于没审过。
   */
  reviewStatus?: KnowledgeReviewStatus;
}
