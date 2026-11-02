/**
 * 知识库来源登记表（代码侧）。
 *
 * 与 `docs/knowledge-base/source-register.md` 一一对应：
 * 文档那份给人看（含本地路径、获取方式、服务器位置），
 * 这份给校验用 —— 知识条目引用的 sourceId 必须在这里登记过，
 * 写错一个字母启动就报错，而不是等到"某条知识悄悄引了一个不存在的来源"。
 *
 * 新增来源的流程见 docs/knowledge-base/intake-sop.md。
 */

/** 来源登记记录：条目出处必须是这里登记过的 ID */
export interface KnowledgeSourceRecord {
  id: string;
  /** 给人看的名字 */
  name: string;
  /** 版本/年份 */
  version: string;
  /** 档案里是否已有正本 */
  local: boolean;
  /** 用在哪 */
  role: string;
}

/**
 * 内部整理材料与未归档文献（2026-11-02 补登记）。
 *
 * 它们不是"权威来源"：内部笔记是我们自己的整理，GfE/Meyer/Klein 是引用了
 * 但没归档的文献。登记进来是为了**让出处可追溯**——至少能说出"这条依据的是
 * 什么、有没有原文"，而不是留一串自由文本。
 */
const EXTRA_SOURCES: KnowledgeSourceRecord[] = [
  {
    id: 'INTERNAL-LIVER-LOWFAT',
    name: '肝肾低脂注意事项（内部整理，无文献依据）',
    version: '2026-10',
    local: false,
    role: '内部经验：低脂饮食在肝胆与胰腺炎场景的注意事项',
  },
  {
    id: 'INTERNAL-SKIN-TARGET',
    name: '皮肤被毛功能目标（内部整理，无文献依据）',
    version: '2026-10',
    local: false,
    role: '内部经验：皮肤被毛相关营养目标设定',
  },
  {
    id: 'INTERNAL-IBD-TARGET',
    name: 'IBD/CIE 功能目标表（内部整理，无文献依据）',
    version: '2026-10',
    local: false,
    role: '内部经验：慢性肠病营养目标',
  },
  {
    id: 'INTERNAL-REVIEW-TARGET',
    name: '低脂/肝胆/尿素复盘目标表（内部整理，无文献依据）',
    version: '2026-10',
    local: false,
    role: '内部经验：复盘用目标值',
  },
  {
    id: 'GFE-2006',
    name: 'GfE 犬猫营养需要量（德国营养生理学会）',
    version: '2006',
    local: false,
    role: '参考：欧洲营养需要量口径（未归档原文）',
  },
  {
    id: 'MEYER-ZENTEK',
    name: 'Meyer H & Zentek J（犬猫营养学）',
    version: '—',
    local: false,
    role: '参考：德文营养学教科书（未归档原文）',
  },
  {
    id: 'KLEIN-ETAL',
    name: 'Klein C, Thes M, Böswald LF, et al.',
    version: '—',
    local: false,
    role: '参考：单篇文献（未归档原文）',
  },
];

export const KNOWLEDGE_SOURCES: readonly KnowledgeSourceRecord[] = [
  // ── 免疫 ────────────────────────────────────────────────
  {
    id: 'WSAVA-VACC-2024',
    name: 'WSAVA 疫苗接种指南',
    version: '2024（Squires 等）',
    local: true,
    role: '免疫领域的首要依据：核心与非核心疫苗、幼犬首免、成年加强、抗体滴度、接种禁忌',
  },
  {
    id: 'WSAVA-VACC-2015',
    name: 'WSAVA 疫苗接种指南（历史版）',
    version: '2015',
    local: false,
    role: '⚠️ 2026-11-01 已停用并删除原件（被 2024 版取代）；不再作为依据',
  },
  {
    id: 'AAHA-VACC-2022',
    name: 'AAHA 犬免疫指南',
    version: '2022（2024 更新）',
    local: true,
    role: '把 WSAVA 的建议落到具体场景，如钩端螺旋体是否列为核心',
  },
  {
    id: 'CN-EPIDEMIC-LAW',
    name: '中华人民共和国动物防疫法',
    version: '现行',
    local: true,
    role: '国内强制免疫要求、犬只免疫证明；国家层面口径，地方差异提示以当地为准',
  },
  {
    id: 'CN-RABIES-TECH',
    name: '狂犬病防治技术规范',
    version: '现行',
    local: true,
    role: '狂犬病免疫的具体要求',
  },

  // ── 营养 ────────────────────────────────────────────────
  {
    id: 'WSAVA-NUTRITION',
    name: 'WSAVA 营养指南与工具包',
    version: '2011–2025',
    local: true,
    role: '饮食史、体况、肌况、营养筛查、热量起点、食品标签、零食、生食风险',
  },
  {
    id: 'FEDIAF-2025',
    name: 'FEDIAF 犬猫营养指南',
    version: '2025',
    local: true,
    role: '欧洲营养基线、最低量与最高量',
  },
  {
    id: 'NRC-2006',
    name: 'NRC《犬猫营养需要》',
    version: '2006',
    local: true,
    role: '营养需要的基础科学、安全上限',
  },
  {
    id: 'SACN5',
    name: '小动物临床营养学（第 5 版）',
    version: '5th',
    local: true,
    role: '疾病营养解读、关键营养素、自制膳食风险（现有 202 条的主力出处）',
  },
  {
    id: 'AAHA-2021-NUTRITION',
    name: 'AAHA 营养与体重管理指南',
    version: '2021',
    local: true,
    role: '个体化营养评估、体重管理、自制膳食风险',
  },
  {
    id: 'AAHA-2010-NUTRITION-ASSESSMENT',
    name: 'AAHA 营养评估指南',
    version: '2010',
    local: true,
    role: '营养筛查与扩展评估流程（历史流程参考）',
  },
  {
    id: 'AAHA-2014-WEIGHT',
    name: 'AAHA 体重管理指南',
    version: '2014',
    local: true,
    role: '减重详细方案：供能、速率、蛋白、监测与维持的总纲；AAHA 2021 版明确指向本文件',
  },

  {
    id: 'AAHA-DIABETES-2018',
    name: 'AAHA 糖尿病管理指南',
    version: '2018',
    local: true,
    role: '糖尿病管理：诊断、胰岛素、监测与营养配合',
  },

  // ── 检查指标解读 ────────────────────────────────────────
  {
    id: 'IRIS-CKD-2026',
    name: 'IRIS 肾病指南',
    version: '2026',
    local: true,
    role: '肾病分期口径、SDMA 与肌酐判读前提、AKI 分级、复查节奏',
  },
  {
    id: 'MERCK-CLINICAL-BIOCHEM',
    name: 'Merck 兽医手册 · 临床生化',
    version: '在线',
    local: true,
    role: '尿素、肌酐、肝酶、胆汁酸、胆固醇、胰酶的解读要点与陷阱（只做背景与警示）',
  },
  {
    id: 'MERCK-HEME',
    name: 'Merck 兽医手册 · 临床血液学',
    version: '在线',
    local: true,
    role: '血常规指标解读（只做背景与警示）',
  },
  {
    id: 'MERCK-HEPATIC',
    name: 'Merck 兽医手册 · 肝功能检查',
    version: '在线',
    local: true,
    role: '胆汁酸、胆管淤积、门体分流判读（只做背景与警示）',
  },

  {
    id: 'MERCK-DERM',
    name: 'Merck 兽医手册 · 皮肤病维生素与矿物质/营养性皮肤病',
    version: '在线',
    local: true,
    role: '营养性皮肤病背景（只做背景与警示）',
  },

  // ── 常见病与就医时机 ────────────────────────────────────
  {
    id: 'ACVIM-CONSENSUS',
    name: 'ACVIM 共识 / 背书声明',
    version: '2011–2026（已归档 25 份）',
    local: true,
    role: '各专科疾病的当前口径：肠道、肝胆、血液、心脏、泌尿、神经急症、感染、代谢',
  },
  {
    id: 'WSAVA-PAIN-2022',
    name: 'WSAVA 疼痛识别、评估与治疗指南',
    version: '2022',
    local: true,
    role: '疼痛识别——家长最容易忽略的一块',
  },
  {
    id: 'WSAVA-DENTAL',
    name: 'WSAVA 全球牙科指南',
    version: '现行',
    local: true,
    role: '口腔与牙周病的分级、处理时机、家庭护理',
  },
  {
    id: 'WSAVA-REPRO',
    name: 'WSAVA 犬猫生殖管理指南',
    version: '2024',
    local: true,
    role: '繁殖、绝育相关',
  },
  {
    id: 'WSAVA-RENAL',
    name: 'WSAVA 肾脏标准化指南',
    version: '现行',
    local: true,
    role: '肾小球疾病诊断标准化',
  },
  {
    id: 'WSAVA-HEREDITARY',
    name: 'WSAVA 遗传病委员会立场文件',
    version: '现行',
    local: true,
    role: '品种遗传风险',
  },
  {
    id: 'WSAVA-WELFARE',
    name: 'WSAVA 动物福利指南',
    version: '2018 / 2020',
    local: true,
    role: '福利与饲养边界',
  },
  {
    id: 'WSAVA-POSITION',
    name: 'WSAVA 立场声明',
    version: '现行',
    local: true,
    role: 'One Health 肥胖预防、微芯片与肿瘤',
  },
  {
    id: 'AAHA-SENIOR-2023',
    name: 'AAHA 老年犬猫护理指南',
    version: '2023',
    local: true,
    role: '老年犬的检查节奏与常见问题（2026-11-01 已补入 JAAHA 指南全文，工具包同时保留）',
  },
  {
    id: 'AAHA-LIFE-STAGE-2019',
    name: 'AAHA 犬生命阶段指南',
    version: '2019',
    local: true,
    role: '各生命阶段该做什么检查、多久一次',
  },
  {
    id: 'AAHA-PAIN-2022',
    name: 'AAHA 犬猫疼痛管理指南',
    version: '2022',
    local: true,
    role: '疼痛识别、评估与多模式管理；补 WSAVA 疼痛指南中文扫描件不可读的空缺',
  },
  {
    id: 'AAHA-DENTAL-2019',
    name: 'AAHA 牙科护理指南',
    version: '2019',
    local: true,
    role: '口腔护理与洁牙时机',
  },
  {
    id: 'ASPCA-POISON',
    name: 'ASPCA 有毒食物清单',
    version: '在线',
    local: true,
    role: '有毒食物警示（只做警示，不作营养依据）',
  },
];

const ALL_SOURCES: readonly KnowledgeSourceRecord[] = [
  ...KNOWLEDGE_SOURCES,
  ...EXTRA_SOURCES,
];

const SOURCE_IDS = new Set(ALL_SOURCES.map((source) => source.id));

export function isKnownSourceId(sourceId: string): boolean {
  return SOURCE_IDS.has(String(sourceId || '').trim());
}

export function getKnowledgeSource(
  sourceId: string,
): KnowledgeSourceRecord | undefined {
  const key = String(sourceId || '').trim();
  return ALL_SOURCES.find((source) => source.id === key);
}

/** 机构前缀：判断两个来源算不算"互相独立"时用 */
export function sourceOrganization(sourceId: string): string {
  const key = String(sourceId || '').trim().toUpperCase();
  if (key.startsWith('WSAVA')) return 'WSAVA';
  if (key.startsWith('AAHA')) return 'AAHA';
  if (key.startsWith('ACVIM')) return 'ACVIM';
  if (key.startsWith('FEDIAF')) return 'FEDIAF';
  if (key.startsWith('NRC')) return 'NRC';
  if (key.startsWith('IRIS')) return 'IRIS';
  if (key.startsWith('MERCK')) return 'MERCK';
  if (key.startsWith('SACN')) return 'SACN';
  // 国内两类来源是不同的发布主体，不能算同源：
  //   法律由全国人大制定，技术规范由农业农村主管部门发布。
  if (key === 'CN-EPIDEMIC-LAW') return 'CN-NPC';
  if (key === 'CN-RABIES-TECH') return 'CN-MOA';
  if (key.startsWith('CN-')) return 'CN';
  return key.split('-')[0] || key;
}
