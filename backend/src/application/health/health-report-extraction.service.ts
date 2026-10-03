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

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
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
/**
 * 这个模块在「AI / Agent 配置」里的用途标识（2026-10-01 补）。
 *
 * 后台那条配置就是健康模块**专属**的模型与密钥入口 ——
 * 老板可以给健康模块单独申请一把 DeepSeek 密钥填在这里，
 * 用量与账单在 DeepSeek 控制台天然与食谱设计分开。
 * 没有这一行时按老规矩回退到全局默认（fallbackToDefault）。
 */
export const HEALTH_REPORT_EXTRACTION_PURPOSE = 'HEALTH_REPORT_EXTRACTION';

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

/**
 * 自动判断（2026-10-01）：「拍病历 / 拍体检报告」两个入口合并成一个「从相册选择」，
 * 由后端按提示词自己判断这是哪一类文档 —— 顾客不必先选类型。
 *
 * 注意它**只是请求侧**的取值：真正落回结果里的永远是解析出的四类之一（不是 'AUTO'），
 * 前端靠这个真实类型决定这条记录填进「病历」还是「体检」。
 */
export type HealthDocumentTypeRequest = HealthDocumentType | 'AUTO';

export const HEALTH_DOCUMENT_TYPES: readonly HealthDocumentType[] = [
  'ALLERGY_REPORT',
  'CHECKUP_REPORT',
  'VACCINE_BOOK',
  'MEDICAL_RECORD',
];

export function normalizeDocumentType(value: unknown): HealthDocumentTypeRequest {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'AUTO') return 'AUTO';
  return (HEALTH_DOCUMENT_TYPES as readonly string[]).includes(key)
    ? (key as HealthDocumentType)
    : // 缺省沿用旧行为：此前只有过敏报告一条路
      'ALLERGY_REPORT';
}

/**
 * 把 AI 回复里的 documentType 解析成真实类型（只在 AUTO 流程里用）。
 *
 * 模型不一定照做，也可能只回「体检报告」这种中文说法或干脆不回，
 * 所以这里做白名单校验：认不出来一律兜底 MEDICAL_RECORD（老板定的默认项）。
 */
export function resolveAutoDocumentType(
  value: unknown,
): HealthDocumentType | 'NOT_MEDICAL' | 'IMAGING' {
  const key = String(value || '').trim().toUpperCase();
  if (key === 'NOT_MEDICAL' || key === 'IMAGING') {
    return key;
  }

  return (HEALTH_DOCUMENT_TYPES as readonly string[]).includes(key)
    ? (key as HealthDocumentType)
    : 'MEDICAL_RECORD';
}

/**
 * 「这根本不是宠物的医疗资料」时给顾客的话（2026-10-02 老板提的：
 * 传了一张身份证，结果只说"未识别到内容"，太笼统）。
 *
 * 按入口分别措辞：顾客在这个板块传图，期待的是一份具体的资料。
 */
export function buildNotMedicalWarning(
  requested: HealthDocumentTypeRequest,
): string {
  if (requested === 'VACCINE_BOOK') {
    return '这张看起来不是疫苗本（比如证件、人脸或其它照片），换一张疫苗本内页的照片试试';
  }

  if (requested === 'ALLERGY_REPORT') {
    return '这张看起来不是过敏原检测报告（比如证件、人脸或其它照片），换一张报告的照片试试';
  }

  return '这张看起来不是宠物的病历或检查报告（比如证件、人脸、风景照），换一张再试';
}

export interface HealthReportExtractionResult {
  /**
   * 这次识别的是哪类文档。
   * `NOT_MEDICAL` = 模型判定这根本不是宠物的医疗资料（2026-10-02 新增），
   * 这种情况下 drafts 一定是空的，warnings 里给一句准确的说明。
   */
  documentType: HealthDocumentType | 'NOT_MEDICAL' | 'IMAGING';
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

/**
 * 视觉识别（2026-10-01，模型名 2026-10-02 按官方文档订正）。
 *
 * 背景：原来这条路是「腾讯云 OCR 认字 → 文本模型整理」，OCR 服务没开通就整条废掉
 * （老板实测撞到 FailedOperation.UnOpenError）。现在改成**优先让模型直接看图**：
 * 少一个外部服务、少一处故障点，手写病历与表格的识别通常也更稳。
 *
 * ── 模型名以官方文档为准（api-docs.deepseek.com /models & pricing）──────────
 *   正式名字是 **`deepseek-flash`**（模型版本 **DeepSeek-V4.1-Flash**），
 *   **支持图像理解**；`deepseek-v4-pro` 是 DeepSeek-V4-Pro-0813，**不支持读图**。
 *   官方脚注写明：旧名 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`
 *   仍可调用但模型已下线，请求会由 V4.1-Flash 提供服务。
 *   → 所以这里用正式名，不再用那两个已下线的旧名。
 *
 * 开关与模型名都走环境变量（与 ENERGY_ALGORITHM / HEALTH_ANALYSIS 那套一致）：
 *   · HEALTH_REPORT_VISION=off   → 回到原来的 OCR 路径
 *   · HEALTH_REPORT_VISION_MODEL → 换模型时不用改代码
 * 视觉失败时**自动回退** OCR 路径（并在日志里留痕），不让顾客卡住。
 */
export const DEFAULT_VISION_MODEL = 'deepseek-flash';

/**
 * 结构化抽取一律**关掉思考模式**（2026-10-02 实测）。
 *
 * 新模型默认开思考（effort=high），对"照着报告抄字段"这种任务只有坏处：
 *   开着：9.9s、输出 2000 tokens 全耗在思维链上、**最终 content 为空 → 识别失败**
 *   关掉：2.8s、输出 190 tokens、JSON 正常返回
 * 另外思考模式下 temperature 不生效（官方文档写明），关掉后行为更可预期。
 */
const EXTRACTION_NO_THINKING = { thinking: { type: 'disabled' } };

export function isHealthReportVisionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(env.HEALTH_REPORT_VISION ?? '').trim().toLowerCase() !== 'off';
}

/**
 * 视觉模型用哪个（优先级从高到低）：
 *   1. 环境变量 HEALTH_REPORT_VISION_MODEL（临时切换/救火用）
 *   2. 后台「健康报告识别」那条配置里填的模型 —— 老板在界面上就能换
 *   3. 内置默认（已用生产密钥实测可读中文报告）
 *
 * 注意：这一项**必须**是能读图的模型；填成纯文本模型时识别会失败，
 * 然后自动回退 OCR 路径（见 extractFromReport）。
 */
export function resolveHealthReportVisionModel(
  env: NodeJS.ProcessEnv = process.env,
  configuredModel?: string | null,
): string {
  const fromEnv = String(env.HEALTH_REPORT_VISION_MODEL ?? '').trim();
  if (fromEnv) return fromEnv;

  const fromConfig = String(configuredModel ?? '').trim();
  if (fromConfig) return fromConfig;

  return DEFAULT_VISION_MODEL;
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
  '7. warnings 只写**真正看不清、读不准**的地方，最多两条，用家长能懂的话。',
  '   ⚠️ **必须点名到具体项目/行与位置**：例如"化验表右栏第 1 行的项目名被手指挡住，未能确认"、',
  '   "日期那一行被印章压住，只认出 2026-07"。**不许写"有部分项目名称被遮挡"这种笼统说法** ——',
  '   家长拿着这句话没法去核对。**某个字段没内容不算看不清**：',
  '   字段没内容就留空字符串，不要在 warnings 里写"未显示""未读到""没写"这类话；',
  '   更**不许**在已经填好的内容上说自己没读到（例如明明抄了化验数值，',
  '   却在 warnings 里写"化验结果值未在图中显示"）。',
];
/**
 * 四种文档类型各自的提示词正文（不含共同铁律）—— **与原实现逐字一致**。
 *
 * AUTO 提示词要把四套字段结构原样告诉模型，所以把它抽成常量复用：
 * 同一份原文，自动判断出来的字段名才不可能和显式指定时走样。
 * 注意：这四段字符串本身不得改写，否则线上显式指定类型的识别行为就变了。
 */
const TYPE_PROMPT_BODIES: Record<HealthDocumentType, string> = {
  VACCINE_BOOK: [
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
  ].join('\n'),

  CHECKUP_REPORT: [
    '本类型的额外规则（每个字段只放它自己那一类内容，**不要互相重复**）：',
    '· findings 写**医生给出的检查结论**（照抄结论段；这张报告没写结论就留空）。',
    '· labValues 写**化验数据**：逐项一行「项目 数值 单位」，**不要**把几十项用分号串成一行；',
    '  第一行先写报告名（例如"尿常规""血生化""血常规"）。一张图里有多份报告就分段写，',
    '  每段以报告名开头。这份报告没有化验数值（例如只有一段结论的超声/影像报告）就留空。',
    '  ⚠️ **逐行读完，不许漏行**：一张报告常见"左右两栏并列"的排版（左边一栏、右边一栏），',
    '  两栏都要按从上到下的顺序抄完；抄完自己数一遍"表里有几行、我抄了几行"。',
    '  实测踩过：右栏第一行（正常色素性红细胞）被整行漏掉 —— 漏一行比抄错一个数更难被发现。',
    '  ⚠️ **看不清宁可整行不写，绝对不许猜**：化验表通常有好几栏（项目 / 单位 / **参考范围** / 检测结果），',
    '  照片糊的时候最容易把"参考范围"那一栏当成结果抄过来。分辨不出是哪一栏、或者数字看不清时，',
    '  这一行就不要输出，并在 warnings 里说清是哪一行的哪一栏看不清；',
    '  **一个"看起来合理"的编造数值比缺一行危险得多** —— 家长会当成真的拿去问医生。',
    '  **报告自己标了异常（箭头 ↑↓、标红、"偏高/偏低"）的，就在该行末尾照抄这个标记**，',
    '  例如「丙氨酸氨基转移酶(ALT) 144 U/L（偏高）」；**报告没标的一律不要自己判断**。',
    '· patientName 照抄报告上写的**动物名字**；没写就留空。',
    '· recommendations 写报告里医生给出的建议；没有就留空。',
    '· notes 写**补充说明**：报告上有、但上面字段装不下的原文要点（例如"样本存在异常：溶血+"）；',
    '  **已经填进上面字段的内容不许在这里再写一遍**；没有就留空。',
    '· checkupType 从这几个里选最贴近的：ROUTINE 常规体检 / PRE_PURCHASE 购前体检 /',
    '  SENIOR_WELLNESS 老年健康检查 / PRE_ANESTHESIA 麻醉前检查 / EMERGENCY 急诊检查 / FOLLOW_UP 复查。',
    '  判断不了就留空字符串。',
    '',
    '输出 JSON 结构：',
    '{',
    '  "drafts": [',
    '    { "checkupDate": "2026-08-30", "checkupType": "ROUTINE",',
    '      "findings": "血常规与生化未见明显异常",',
    '      "labValues": "血常规\\nWBC 10.2 x 10^9/L\\nRBC 7.99 x 10^12/L",',
    '      "patientName": "面包", "recommendations": "半年后复查", "notes": "" }',
    '  ],',
    '  "confidence": "HIGH" | "MEDIUM" | "LOW",',
    '  "warnings": []',
    '}',
  ].join('\n'),

  MEDICAL_RECORD: [
    '本类型的额外规则（每个字段只放它自己那一类内容，**不要互相重复**）：',
    '· chiefComplaint 写主人描述的或医生记录的症状（主诉）。',
    '· diagnosis 照抄病历上写的诊断结果（诊断栏）；没写就留空。',
    '· treatment 写**医嘱/回家注意**：医生交代回家要做的（怎么吃药、饮食、护理、',
    '  什么时候复查、要观察什么），照抄"医嘱/处置/回家后注意"那几段。',
    '  **不要把检查项目清单写进来**（那是 exams），也不要写"无"。',
    '· exams 写**这次做的检查项目**，从处置处方/检查单照抄，用"、"分隔，',
    '  例如"全腹部彩超、血常规、斯玛特16项生化、CRP C反应蛋白、DR×2"；没有就留空。',
    '· medications 是**处方明细数组**：照抄药名 + 处方上写的用法用量',
    '  （单次用量、每日几次、共几天），例如 ["乐妥 1片/次 每日2次 共3天", "肝必康胶囊 1粒/次 每日1次"]；',
    '  **只照抄处方上写了的，不要自己推算、不要补充说明书内容**；处方只写了药名就只写药名。',
    '· vitals 写**体征**：体温、体重、BCS 等（照抄检查结果栏），例如"体温 38.4℃、体重 6.70kg、BCS 3"。',
    '· labValues 写**化验数据**（这次就诊做的化验）：逐项一行「项目 数值 单位」，',
    '  **不要**把几十项用分号串成一行；第一行先写报告名（例如"血常规""生化""尿常规"）。',
    '  ⚠️ **逐行读完，不许漏行**（左右两栏的排版要把两栏都抄完）。',
    '  **报告自己标了异常（箭头 ↑↓、标红、"偏高/偏低"）的，就在该行末尾照抄这个标记**，',
    '  例如「丙氨酸氨基转移酶(ALT) 144 U/L（偏高）」；**报告没标的一律不要自己判断**。',
    '  这张图不是化验单（例如只有病历文字、处方笺、影像片）就留空；',
    '  影像片不要解读，只在 notes 里写检查部位（如"骨盆正位"）。',
    '· notes 写**补充说明**：报告上有、但上面这些字段都装不下的原文要点',
    '  （例如"样本存在异常：溶血+"、异常项编号、"DR 检查 2 次"）；',
    '  **已经填进上面字段的内容不许在这里再写一遍**；没有就留空。',
    '· patientName 照抄报告上写的**动物名字**；没写就留空。',
    '',
    '输出 JSON 结构：',
    '{',
    '  "drafts": [',
    '    { "visitDate": "2026-09-12", "chiefComplaint": "呕吐两次", "diagnosis": "急性胃炎",',
    '      "treatment": "回家后少量多餐，7 天后复查", "medications": ["速诺 1片/次 每日2次 共5天"],',
    '      "exams": "血常规、生化、腹部彩超", "vitals": "体温 38.4℃、体重 6.70kg、BCS 3",',
    '      "labValues": "血常规\\nWBC 10.2 x 10^9/L\\nRBC 7.99 x 10^12/L",',
    '      "patientName": "面包", "notes": "" }',
    '  ],',
    '  "confidence": "HIGH" | "MEDIUM" | "LOW",',
    '  "warnings": []',
    '}',
  ].join('\n'),

  // ALLERGY_REPORT：沿用此前那套（线上已在跑），只把输出扩成 drafts 形状
  ALLERGY_REPORT: [
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
  ].join('\n'),
};

/** 各类型提示词的开场白 —— 同样与原实现逐字一致 */
const TYPE_PROMPT_INTROS: Record<HealthDocumentType, string> = {
  VACCINE_BOOK:
    '你是一名宠物助理，负责把「狗狗疫苗本 / 免疫记录」的照片识别文字整理成接种记录。',
  CHECKUP_REPORT:
    '你是一名宠物助理，负责把「狗狗体检报告」的识别文字整理成一条体检记录。',
  MEDICAL_RECORD:
    '你是一名宠物助理，负责把「狗狗病历 / 就诊记录」的识别文字整理成一条就诊记录。',
  ALLERGY_REPORT:
    '你是一名宠物营养助理，负责把「狗狗过敏原检测报告」的识别文字整理成结构化信息。',
};

/**
 * 「让模型直接看图」版的开场白（2026-10-01）。
 *
 * 为什么需要单独一份：原开场白写的是"把**识别文字**整理成…"（先 OCR 再整理），
 * 而这条路是**把照片直接交给视觉模型**，得明确告诉它"自己看图、自己读字"。
 * 铁律（COMMON_RULES）与四类字段结构（TYPE_PROMPT_BODIES）**原样复用** ——
 * 两条路抽出来的字段名因此完全一致。
 */
const TYPE_PROMPT_IMAGE_INTROS: Record<HealthDocumentType, string> = {
  VACCINE_BOOK:
    '你是一名宠物助理。用户会给你一张「狗狗疫苗本 / 免疫记录」的照片，请自己看图读出内容，整理成接种记录。',
  CHECKUP_REPORT:
    '你是一名宠物助理。用户会给你一张「狗狗体检报告」的照片，请自己看图读出内容，整理成一条体检记录。',
  MEDICAL_RECORD:
    '你是一名宠物助理。用户会给你一张「狗狗病历 / 就诊记录」的照片，请自己看图读出内容，整理成一条就诊记录。',
  ALLERGY_REPORT:
    '你是一名宠物营养助理。用户会给你一张「狗狗过敏原检测报告」的照片，请自己看图读出内容，整理成结构化信息。',
};

/**
 * 自动判断（2026-10-01）：不预设类型，交给模型自己判断。
 *
 * 四套字段结构整段嵌进去（见 TYPE_PROMPT_BODIES），模型判断出类型后
 * 照着对应那套填，字段名与显式指定时完全一致。
 */
function buildAutoSystemPrompt(): string {
  const typeSections: string[] = [];
  for (const type of HEALTH_DOCUMENT_TYPES) {
    typeSections.push(`【${type}】`, TYPE_PROMPT_BODIES[type], '');
  }

  return [
    '你是一名宠物助理，负责识别主人拍摄的狗狗健康文档照片。',
    '',
    '第一步：自动判断这份文档属于下面五类中的哪一类，documentType 只能填这五个英文值之一：',
    '· MEDICAL_RECORD —— 病历 / 就诊记录 / 处方笺',
    '· CHECKUP_REPORT —— 体检报告 / 化验单',
    '· VACCINE_BOOK —— 疫苗本 / 免疫记录',
    '· ALLERGY_REPORT —— 过敏原检测报告',
    '· IMAGING —— 影像资料：X 光片、B 超/超声图像、CT 等**只有图像、没有可抄文字**的检查片；',
    '  这类**属于**宠物医疗资料（不要判成 NOT_MEDICAL）：照抄片子上的检查日期，',
    '  检查部位/项目写进 notes（例如"骨盆正位""脊柱侧位"），**不要解读影像内容、不要写诊断**。',
    '· NOT_MEDICAL —— 不是宠物的医疗资料：身份证/证件、人脸或自拍、风景、人的病历或处方、',
    '  宠物用品或狗粮包装、与健康无关的照片等',
    '只有确实是狗狗医疗资料时才从那几类里挑一个。**拿不准就别硬猜**：',
    '判断不了、或者看起来不是宠物的医疗资料，一律填 NOT_MEDICAL，drafts 留空数组。',
    '',
    '第二步：按判断出的类型输出 drafts —— 字段名必须与该类型下面给出的结构完全一致。',
    '疫苗本一次读出多条接种记录就输出多条，其余类型只输出一条。',
    '',
    ...COMMON_RULES,
    '',
    '各类的字段结构（先按第一步定下 documentType，再照对应那套填 drafts；',
    '判成 IMAGING 时用 CHECKUP_REPORT 那套结构，只填日期/动物名/notes）：',
    '',
    ...typeSections,
    '输出 JSON 结构（documentType 必须是你判断出的那一个，不能填 AUTO）：',
    '{',
    '  "documentType": "CHECKUP_REPORT",',
    '  "drafts": [ …按该类型的字段结构填… ],',
    '  "confidence": "HIGH" | "MEDIUM" | "LOW",',
    '  "warnings": []',
    '}',
  ].join('\n');
}

/**
 * 拼系统提示词。
 *
 * @param source 'ocr'（默认）= 线上原行为：先 OCR 出文字，再让模型整理；
 *               'image' = 视觉模型直接看图（2026-10-01 新增）。
 *               两者只有开场白不同，铁律与字段结构共用同一份常量。
 */
export function buildSystemPrompt(
  documentType: HealthDocumentTypeRequest,
  source: 'ocr' | 'image' = 'ocr',
): string {
  if (documentType === 'AUTO') {
    return buildAutoSystemPrompt();
  }

  const intro = source === 'image'
    ? TYPE_PROMPT_IMAGE_INTROS[documentType]
    : TYPE_PROMPT_INTROS[documentType];

  return [
    intro,
    '',
    ...COMMON_RULES,
    '',
    TYPE_PROMPT_BODIES[documentType],
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
          // 化验数据与动物名（2026-10-02）：数值单独一栏，名字只用于核对提醒
          labValues: normalizeDraftText(item?.labValues, 4000),
          patientName: normalizeDraftText(item?.patientName, 40),
          recommendations: normalizeDraftText(item?.recommendations),
          // 2026-10-02：表单删掉了「兽医」，识别也就不再产出这一栏 ——
          // 留着一个顾客看不到、改不了的字段只会让人困惑（老板提的）
          notes: normalizeDraftText(item?.notes),
          attachments: [],
        };
      })
      // 认内容、不认"只有落款"：日期 / 检查结论 / 医生建议 任一有值就算一条。
      // 2026-10-01 第九期补上 recommendations —— 多页报告合成一条之后，
      // 尾页常常只有"医生建议"，按老规则（只要日期或结论）会被整页丢掉。
      .filter((draft) => draft.checkupDate || draft.findings || draft.recommendations)
      .slice(0, 1);
  }

  if (documentType === 'MEDICAL_RECORD') {
    return raw
      .map((item: any) => ({
        visitDate: normalizeDraftDate(item?.visitDate),
        chiefComplaint: normalizeDraftText(item?.chiefComplaint),
        diagnosis: normalizeDraftText(item?.diagnosis),
        // treatment = 医嘱/回家注意（2026-10-02 语义收窄）；
        // exams = 这次做的检查；vitals = 体征（体温/体重/BCS）
        treatment: normalizeDraftText(item?.treatment),
        exams: normalizeDraftText(item?.exams, 600),
        vitals: normalizeDraftText(item?.vitals, 300),
        medications: Array.isArray(item?.medications)
          ? item.medications
              .map((name: unknown) => normalizeDraftText(name, 60))
              .filter(Boolean)
              .slice(0, 20)
          : [],
        // 2026-10-02：就诊里传的化验单，数字落在这条就诊记录里（老板定的口径），
        // 所以病历草稿也要有 labValues —— 之前白名单里没有，模型抄了也会被丢掉。
        labValues: normalizeDraftText(item?.labValues, 4000),
        notes: normalizeDraftText(item?.notes),
        patientName: normalizeDraftText(item?.patientName, 40),
        status: 'PENDING_CONFIRMATION',
        attachments: [],
      }))
      // 同理（2026-10-01 第九期）：处理方式 / 用药 也算内容 ——
      // 一份病历的第二页可能只有处置与药单，那一页不该整页消失。
      .filter(
        (draft) =>
          draft.visitDate ||
          draft.diagnosis ||
          draft.chiefComplaint ||
          draft.treatment ||
          draft.exams ||
          draft.vitals ||
          draft.medications.length > 0,
      )
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

/**
 * 模型偶尔会在 warnings 里"自相矛盾"（2026-10-02 老板实测）。
 *
 * 实例：它明明把 19 项生化数值抄进了 labValues，却在 warnings 里写
 * 「化验结果值未在图中显示」「动物名字未在图中显示」—— 家长看到只会更困惑。
 * 提示词已经写死不许这么写（见 COMMON_RULES 第 7 条），但**提示词不等于保证**，
 * 所以在出口再拦一道：**凡是与已提取内容矛盾的 warning 一律丢掉**。
 *
 * 判定用关键词 + 该字段是否真的有值 —— 宁可少显示一条提示，也不给顾客添乱。
 */
const CONTRADICTION_RULES: { match: RegExp; hasValue: (draft: any) => boolean }[] = [
  {
    match: /(化验|数值|指标|结果值|检验)/,
    hasValue: (draft) => Boolean(String(draft?.labValues || '').trim()),
  },
  {
    match: /(动物名|宠物名|狗名|名字|昵称)/,
    hasValue: (draft) => Boolean(String(draft?.patientName || '').trim()),
  },
  {
    match: /(日期|时间)/,
    hasValue: (draft) =>
      Boolean(
        String(draft?.visitDate || draft?.checkupDate || draft?.vaccinationDate || '').trim(),
      ),
  },
];

export function filterContradictoryWarnings(
  warnings: string[],
  draft: Record<string, any> | undefined,
): string[] {
  if (!draft) return warnings;

  return warnings.filter(
    (warning) =>
      !CONTRADICTION_RULES.some(
        (rule) => rule.match.test(warning) && rule.hasValue(draft),
      ),
  );
}

@Injectable()
export class HealthReportExtractionService {
  private readonly logger = new Logger(HealthReportExtractionService.name);

  constructor(
    @Inject(HEALTH_REPORT_OCR_PROVIDER)
    private readonly ocrProvider: HealthReportOcrProvider,
    private readonly agentProviderConfigService: AgentProviderConfigService,
  ) {}

  async extractFromReport(input: {
    imageUrl: string;
    originalFilename?: string;
    /**
     * 识别哪类文档（老板第 4 条：从过敏报告扩到体检报告与疫苗本）。
     * 传 'AUTO' 表示由 AI 自己判断类型（2026-10-01 合并拍照入口）。
     */
    documentType?: string;
  }): Promise<HealthReportExtractionResult> {
    const requestedDocumentType = normalizeDocumentType(input.documentType);
    if (!input.imageUrl) {
      throw new BadRequestException('请先上传报告图片');
    }

    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: HEALTH_REPORT_EXTRACTION_PURPOSE,
        // 生产目前只为配方设计与文案单独配置过，这里复用全局默认（已启用）
        fallbackToDefault: true,
      });

    /**
     * ① 先试"视觉模型直接看图"（2026-10-01）。
     *
     * 图片地址是公开可读的（顾客报告存在自有 COS 域名下），所以直接把 URL 交给模型，
     * 不用先下载再转 base64 —— 省一次流量、也少一个环节。
     */
    let parsed: Record<string, unknown> | null = null;
    let ocrText = '';

    if (isHealthReportVisionEnabled()) {
      const configuredModel =
        await this.agentProviderConfigService.getConfiguredPurposeModel(
          HEALTH_REPORT_EXTRACTION_PURPOSE,
        );
      const preferredModel = resolveHealthReportVisionModel(
        process.env,
        configuredModel,
      );

      /**
       * 后台那条配置是**手填**的模型名，写错（多一个字母/少一个点）就会 400。
       * 所以多留一次机会：后台填的模型失败后，再用内置默认（已实测可读中文报告）
       * 试一次 —— 而不是直接掉到 OCR（OCR 可能根本没开通）。
       */
      const candidateModels = preferredModel === DEFAULT_VISION_MODEL
        ? [preferredModel]
        : [preferredModel, DEFAULT_VISION_MODEL];

      for (const model of candidateModels) {
        try {
          parsed = await callDeepSeekJson({
            baseUrl: config.baseUrl,
            model,
            extraBody: EXTRACTION_NO_THINKING,
            apiKey: config.apiKey,
            requestTimeoutMs: config.requestTimeoutMs,
            systemPrompt: buildSystemPrompt(requestedDocumentType, 'image'),
            userContent: [
              {
                type: 'text',
                text: '请阅读这张图片，并按系统提示的规则与 JSON 结构输出。',
              },
              { type: 'image_url', image_url: { url: input.imageUrl } },
            ],
            temperature: 0,
          });
          break;
        } catch (error) {
          // 视觉这条路失败不影响顾客：先试下一个模型，最后再回退 OCR，并留日志
          this.logger.warn(
            `视觉识别失败（模型 ${model}）：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          parsed = null;
        }
      }
    }

    // ② 回退路径：OCR 认字 → 文本模型整理（与改造前完全一致）
    if (!parsed) {
      const ocrResult = await this.ocrProvider.recognizeImage({
        imageUrl: input.imageUrl,
        originalFilename: input.originalFilename,
      });
      ocrText = normalizeKeyword(ocrResult.text);
      if (!ocrText) {
        throw new BadRequestException('未能识别到报告文字，请换一张更清晰的图片');
      }

      parsed = await callDeepSeekJson({
        baseUrl: config.baseUrl,
        model: config.model,
        extraBody: EXTRACTION_NO_THINKING,
        apiKey: config.apiKey,
        requestTimeoutMs: config.requestTimeoutMs,
        systemPrompt: buildSystemPrompt(requestedDocumentType),
        userPayload: {
          task: 'extract_dog_health_document',
          documentType: requestedDocumentType,
          ocrText,
        },
        temperature: 0,
      });
    }

    const parsedRecord = parsed as Record<string, unknown>;

    /**
     * AUTO 时必须**先**从响应里解析出真实类型，再据此归一化 drafts ——
     * 字段结构是按类型定的，顺序反了就会用错白名单把字段全丢掉。
     */
    const resolvedType =
      requestedDocumentType === 'AUTO'
        ? resolveAutoDocumentType(parsedRecord.documentType)
        : requestedDocumentType;

    // 模型明说"这不是宠物医疗资料"：一条草稿都不产出，
    // 只回一句准确的话（原来会硬塞成病历再报"未识别到内容"，让顾客以为是照片不清楚）
    if (resolvedType === 'NOT_MEDICAL') {
      return {
        documentType: 'NOT_MEDICAL',
        drafts: [],
        allergies: [],
        medicalConditions: [],
        ocrText: '',
        confidence: 'LOW',
        warnings: [buildNotMedicalWarning(requestedDocumentType)],
      };
    }

    // 影像片（X 光/超声）：只把日期、动物名、检查部位抄下来 ——
    // **不解读片子内容**（那是兽医的事），原件由前端作为附件存进档案。
    if (resolvedType === 'IMAGING') {
      const imageDrafts = normalizeDrafts('CHECKUP_REPORT', parsedRecord);

      return {
        documentType: 'IMAGING',
        drafts: imageDrafts,
        allergies: [],
        medicalConditions: [],
        ocrText: '',
        confidence: normalizeConfidence(parsed.confidence),
        warnings: [
          '这是影像片（X 光/超声），AI 不解读片子上的内容；片子原件会一起存进档案',
          ...filterContradictoryWarnings(
            normalizeWarnings(parsedRecord.warnings),
            imageDrafts[0],
          ),
        ],
      };
    }

    const documentType = resolvedType;
    const drafts = normalizeDrafts(documentType, parsedRecord);
    const medicalConditions = normalizeKeywordList(parsedRecord.medicalConditions);
    // 与已提取内容矛盾的提示直接丢掉（见 filterContradictoryWarnings）
    const warnings = filterContradictoryWarnings(
      normalizeWarnings(parsedRecord.warnings),
      drafts[0],
    );

    // 过敏流程沿用旧字段（线上已经在跑），其余类型用 drafts
    const allergies =
      documentType === 'ALLERGY_REPORT'
        ? drafts.map((draft) => String(draft.allergen || '')).filter(Boolean)
        : normalizeKeywordList(parsedRecord.allergies);

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
