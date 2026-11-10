/**
 * 全库域映射（全领域上线计划 Task 1）。
 *
 * 159 份文档 → 17 个域（16 个审计域 + 1 个边界域 `other-clinical`）。
 * 每份文档恰好一个主域，可选副域（同一份文档可被两个域检索，生产 scope 去重）。
 *
 * 规则来源：文档来源 ID（DB `source_document.source_id`，非猜测）+ 文件名 +
 * SACN5 章号。SACN5 章号 → 主题的映射来自逐章小标题核对（见 CHAPTER_TOPICS）。
 *
 * 用法：
 * - `npm run kb:domains`            → 打印统计与未映射文档
 * - `npm run kb:domains -- --write` → 重写 `docs/knowledge-base/eval/domain-map.json`
 * - `npm run kb:domains -- --check` → 校验已提交的映射（不写文件）
 *
 * 只读：唯一的写操作是 `--write` 时覆盖 `domain-map.json`。
 */
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const REPO_ROOT = resolve(__dirname, '../../..');
const MAP_PATH = resolve(REPO_ROOT, 'docs/knowledge-base/eval/domain-map.json');
const COUNTS_PATH = resolve(
  REPO_ROOT,
  'docs/knowledge-base/source-layer/_expected-counts.json',
);

/** 审计域 + 边界域。顺序即文档里的展示顺序。 */
export const DOMAIN_IDS = [
  'ckd',
  'general-nutrition',
  'gi',
  'pancreatitis',
  'oa',
  'dermatology',
  'endocrinology',
  'urology',
  'cardiology',
  'hepatology',
  'oncology',
  'dentistry',
  'infectious-disease',
  'reproduction',
  'senior-care',
  'reference',
  'other-clinical',
] as const;

export type MapDomainId = (typeof DOMAIN_IDS)[number];

/** 不开放的边界域：文档归位，但不进生产 KNOWLEDGE_DOMAINS。 */
export const CLOSED_DOMAINS: readonly MapDomainId[] = ['other-clinical'];

export interface DomainAssignment {
  primary: MapDomainId;
  secondary: MapDomainId[];
  reason: string;
}

interface Rule {
  /** 匹配 `documentId`；顺序敏感，先具体后笼统。 */
  match: RegExp;
  assign: DomainAssignment | ((documentId: string) => DomainAssignment);
}

/** SACN5 章号 → 域。章号取自 `sacn5-chapters-SACN5-<章>`。 */
const CHAPTER_TOPICS: Record<string, DomainAssignment> = {
  '1': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-1 患者评估（营养评估流程）' },
  '2': { primary: 'reference', secondary: [], reason: 'SACN5-2 循证医学规则（方法学参考）' },
  '3': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-3 健康素养与客户依从' },
  '4': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-4 营养基因组学' },
  '5': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-5 水与饮水需求' },
  '6': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-6 矿物质与维生素' },
  '7': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-7 抗氧化剂' },
  '8': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-8 商业宠物食品形态与细分' },
  '9': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-9 宠物食品标签' },
  '10': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-10 家庭自制宠物食品' },
  '11': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-11 食品安全' },
  '12': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-12 正常犬饲喂导论' },
  '13': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-13 青年成年犬饲喂' },
  '14': { primary: 'senior-care', secondary: ['general-nutrition'], reason: 'SACN5-14 中老年犬饲喂（与生命阶段重叠）' },
  '15': { primary: 'reproduction', secondary: [], reason: 'SACN5-15 繁殖犬饲喂' },
  '16': { primary: 'reproduction', secondary: ['general-nutrition'], reason: 'SACN5-16 新生/孤儿幼犬（出生到断奶）' },
  '17': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-17 幼犬生长饲喂' },
  '18': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-18 工作犬与运动犬饲喂' },
  '19': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-19 猫饲喂导论' },
  '20': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-20 青年成年猫饲喂' },
  '21': { primary: 'senior-care', secondary: ['general-nutrition'], reason: 'SACN5-21 中老年猫饲喂（与生命阶段重叠）' },
  '22': { primary: 'reproduction', secondary: [], reason: 'SACN5-22 繁殖猫饲喂' },
  '23': { primary: 'reproduction', secondary: ['general-nutrition'], reason: 'SACN5-23 新生/孤儿幼猫（出生到断奶）' },
  '24': { primary: 'general-nutrition', secondary: [], reason: 'SACN5-24 生长期幼猫饲喂' },
  '25': { primary: 'gi', secondary: ['general-nutrition'], reason: 'SACN5-25 重症监护营养与肠内辅助喂养' },
  '26': { primary: 'gi', secondary: ['general-nutrition'], reason: 'SACN5-26 肠外辅助喂养' },
  '27': { primary: 'general-nutrition', secondary: ['endocrinology'], reason: 'SACN5-27 肥胖（代谢/体重管理）' },
  '28': { primary: 'endocrinology', secondary: [], reason: 'SACN5-28 脂质代谢紊乱（高脂血症）' },
  '29': { primary: 'endocrinology', secondary: [], reason: 'SACN5-29 内分泌疾病（糖尿病/甲状腺）' },
  '30': { primary: 'oncology', secondary: [], reason: 'SACN5-30 癌症营养' },
  '31': { primary: 'dermatology', secondary: [], reason: 'SACN5-31 食物不良反应' },
  '32': { primary: 'dermatology', secondary: [], reason: 'SACN5-32 皮肤与被毛疾病' },
  '33': { primary: 'oa', secondary: [], reason: 'SACN5-33 大型犬幼犬发育性骨科疾病' },
  '34': { primary: 'oa', secondary: [], reason: 'SACN5-34 骨关节炎营养管理' },
  '35': { primary: 'senior-care', secondary: [], reason: 'SACN5-35 犬认知功能障碍' },
  '36': { primary: 'cardiology', secondary: [], reason: 'SACN5-36 心血管疾病营养' },
  '37': { primary: 'ckd', secondary: [], reason: 'SACN5-37 慢性肾病' },
  '38': { primary: 'urology', secondary: [], reason: 'SACN5-38 犬尿石症总论' },
  '39': { primary: 'urology', secondary: [], reason: 'SACN5-39 犬嘌呤/尿酸盐结石' },
  '40': { primary: 'urology', secondary: [], reason: 'SACN5-40 犬草酸钙结石' },
  '41': { primary: 'urology', secondary: [], reason: 'SACN5-41 犬磷酸钙结石' },
  '42': { primary: 'urology', secondary: [], reason: 'SACN5-42 犬胱氨酸结石' },
  '43': { primary: 'urology', secondary: [], reason: 'SACN5-43 犬鸟粪石' },
  '44': { primary: 'urology', secondary: [], reason: 'SACN5-44 犬硅石结石' },
  '45': { primary: 'urology', secondary: [], reason: 'SACN5-45 犬复合结石' },
  '46': { primary: 'urology', secondary: [], reason: 'SACN5-46 猫下泌尿道疾病（FLUTD）' },
  '47': { primary: 'dentistry', secondary: [], reason: 'SACN5-47 牙周病' },
  '48': { primary: 'gi', secondary: [], reason: 'SACN5-48 胃肠与胰腺外分泌疾病导论' },
  '49': { primary: 'dentistry', secondary: [], reason: 'SACN5-49 口腔疾病' },
  '50a': { primary: 'gi', secondary: [], reason: 'SACN5-50a 咽/食管疾病' },
  '51': { primary: 'gi', secondary: [], reason: 'SACN5-51 胃病导论' },
  '52': { primary: 'gi', secondary: [], reason: 'SACN5-52 胃炎与胃十二指肠溃疡' },
  '53': { primary: 'gi', secondary: [], reason: 'SACN5-53 胃扩张与胃扭转（GDV）' },
  '54': { primary: 'gi', secondary: [], reason: 'SACN5-54 胃动力与排空障碍' },
  '55': { primary: 'gi', secondary: [], reason: 'SACN5-55 小肠疾病导论' },
  '56': { primary: 'gi', secondary: [], reason: 'SACN5-56 急性胃肠炎' },
  '57': { primary: 'gi', secondary: [], reason: 'SACN5-57 炎症性肠病（IBD）' },
  '58': { primary: 'gi', secondary: [], reason: 'SACN5-58 蛋白丢失性肠病' },
  '59': { primary: 'gi', secondary: [], reason: 'SACN5-59 短肠综合征' },
  '60': { primary: 'gi', secondary: [], reason: 'SACN5-60 小肠细菌过度生长' },
  '61': { primary: 'gi', secondary: [], reason: 'SACN5-61 大肠疾病导论' },
  '62': { primary: 'gi', secondary: [], reason: 'SACN5-62 结肠炎' },
  '63': { primary: 'gi', secondary: [], reason: 'SACN5-63 肠易激综合征' },
  '64': { primary: 'gi', secondary: [], reason: 'SACN5-64 便秘/巨结肠' },
  '65': { primary: 'gi', secondary: [], reason: 'SACN5-65 肠胃胀气' },
  '66': { primary: 'gi', secondary: [], reason: 'SACN5-66 吸收不良' },
  '67': { primary: 'pancreatitis', secondary: [], reason: 'SACN5-67 胰腺炎' },
  '68': { primary: 'hepatology', secondary: [], reason: 'SACN5-68 肝胆疾病' },
  '69': { primary: 'reference', secondary: [], reason: 'SACN5-69 药物与营养相互作用（参考资料）' },
};

/** 章号不在表里 → 直接报错，不静默归到某个域。 */
function sacn5Assignment(documentId: string): DomainAssignment {
  const match = /^sacn5-chapters-SACN5-(.+)$/.exec(documentId);
  const chapter = match?.[1] ?? '';
  const assignment = CHAPTER_TOPICS[chapter];
  if (!assignment) {
    throw new Error(
      `SACN5 第 ${chapter || '?'} 章没有域映射（${documentId}）；请在 CHAPTER_TOPICS 补一行`,
    );
  }
  return assignment;
}

/**
 * 规则表：按顺序首条命中。
 *
 * 这里只写「文件名/来源→域」，不写业务判断；判断写在各条的 reason 里，
 * 便于复核时逐条追问。
 */
export const RULES: readonly Rule[] = [
  // 肾脏
  { match: /^iris-/, assign: () => ({ primary: 'ckd', secondary: [], reason: 'IRIS CKD/AKI 官方文档' }) },
  { match: /^sacn5-chapters-/, assign: (id) => sacn5Assignment(id) },

  // AAHA
  { match: /^aaha-AAHA-2018-Diabetes/, assign: () => ({ primary: 'endocrinology', secondary: [], reason: 'AAHA 2018 糖尿病管理' }) },
  { match: /^aaha-AAHA-2019-Dental/, assign: () => ({ primary: 'dentistry', secondary: [], reason: 'AAHA 2019 牙科护理' }) },
  { match: /^aaha-AAHA-2022-Canine-Vaccination/, assign: () => ({ primary: 'infectious-disease', secondary: [], reason: 'AAHA 2022 犬免疫' }) },
  { match: /^aaha-AAHA-2022-Pain/, assign: () => ({ primary: 'oa', secondary: [], reason: 'AAHA 2022 疼痛管理' }) },
  { match: /^aaha-AAHA-2023-Senior/, assign: () => ({ primary: 'senior-care', secondary: [], reason: 'AAHA 2023 老年护理（含工具包）' }) },
  // AAHA 2021 同时是 CKD 域的核心表来源（T0025/T0026 = AAHA 表 8），保留副域，
  // 否则 CKD 的核心表与 26 题会失去证据。
  { match: /^aaha-AAHA-2021-Nutrition/, assign: () => ({ primary: 'general-nutrition', secondary: ['ckd'], reason: 'AAHA 2021 营养与体重管理（CKD 核心表来源）' }) },
  { match: /^aaha-/, assign: () => ({ primary: 'general-nutrition', secondary: [], reason: 'AAHA 营养/体重/生命阶段指南' }) },

  // ACVIM（同来源多病种，按文件名分）
  { match: /^acvim-ACVIM-2015-心血管-肾脏轴/, assign: () => ({ primary: 'cardiology', secondary: ['ckd'], reason: 'ACVIM 2015 心肾轴疾病' }) },
  { match: /^acvim-ACVIM-2015-治疗性抗菌药/, assign: () => ({ primary: 'infectious-disease', secondary: [], reason: 'ACVIM 2015 抗菌药使用与耐药' }) },
  { match: /^acvim-ACVIM-2015-犬癫痫/, assign: () => ({ primary: 'other-clinical', secondary: [], reason: 'ACVIM 2015 犬癫痫（非营养主线）' }) },
  { match: /^acvim-ACVIM-2016-犬猫尿石症/, assign: () => ({ primary: 'urology', secondary: [], reason: 'ACVIM 2016 尿石症共识' }) },
  { match: /^acvim-ACVIM-2018-犬猫莱姆病/, assign: () => ({ primary: 'infectious-disease', secondary: [], reason: 'ACVIM 2018 莱姆病' }) },
  { match: /^acvim-ACVIM-2018-系统性高血压/, assign: () => ({ primary: 'cardiology', secondary: [], reason: 'ACVIM 2018 系统性高血压' }) },
  { match: /^acvim-ACVIM-2018-细胞毒化疗/, assign: () => ({ primary: 'oncology', secondary: [], reason: 'ACVIM 2018 化疗药物安全' }) },
  { match: /^acvim-ACVIM-2018-胃肠道保护剂/, assign: () => ({ primary: 'gi', secondary: [], reason: 'ACVIM 2018 胃肠保护剂' }) },
  { match: /^acvim-ACVIM-2019-免疫介导性溶血性贫血/, assign: () => ({ primary: 'other-clinical', secondary: [], reason: 'ACVIM 2019 IMHA（非营养主线）' }) },
  { match: /^acvim-ACVIM-2019-犬MMVD/, assign: () => ({ primary: 'cardiology', secondary: [], reason: 'ACVIM 2019 犬 MMVD' }) },
  { match: /^acvim-ACVIM-2019-犬慢性肝炎/, assign: () => ({ primary: 'hepatology', secondary: [], reason: 'ACVIM 2019 犬慢性肝炎' }) },
  { match: /^acvim-ACVIM-2020-/, assign: () => ({ primary: 'cardiology', secondary: [], reason: 'ACVIM 2020 心肌病/肺动脉高压' }) },
  { match: /^acvim-ACVIM-2021-猫胰腺炎/, assign: () => ({ primary: 'pancreatitis', secondary: [], reason: 'ACVIM 2021 猫胰腺炎' }) },
  { match: /^acvim-ACVIM-2022-犬慢性肠病/, assign: () => ({ primary: 'gi', secondary: [], reason: 'ACVIM 2022 犬慢性肠病' }) },
  { match: /^acvim-ACVIM-2022-犬胸腰段椎间盘突出/, assign: () => ({ primary: 'oa', secondary: [], reason: 'ACVIM 2022 IVDD（疼痛/活动管理）' }) },
  { match: /^acvim-ACVIM-2023-犬钩端螺旋体/, assign: () => ({ primary: 'infectious-disease', secondary: [], reason: 'ACVIM 2023 钩端螺旋体' }) },
  { match: /^acvim-ACVIM-2023-猫慢性肠病/, assign: () => ({ primary: 'gi', secondary: [], reason: 'ACVIM 2023 猫慢性肠病' }) },
  { match: /^acvim-ACVIM-2024-免疫性血小板减少症/, assign: () => ({ primary: 'other-clinical', secondary: [], reason: 'ACVIM 2024 ITP（非营养主线）' }) },
  { match: /^acvim-ACVIM-2024-犬尿失禁/, assign: () => ({ primary: 'urology', secondary: [], reason: 'ACVIM 2024 犬尿失禁' }) },
  { match: /^acvim-ACVIM-2024-癫痫持续状态/, assign: () => ({ primary: 'other-clinical', secondary: [], reason: 'ACVIM 2024 癫痫持续状态（非营养主线）' }) },
  { match: /^acvim-ACVIM-2026-慢性肠病/, assign: () => ({ primary: 'gi', secondary: [], reason: 'ACVIM 2026 慢性肠病共识' }) },
  { match: /^acvim-/, assign: () => { throw new Error('ACVIM 文档没有匹配到规则'); } },

  // 其他来源
  { match: /^aspca-/, assign: () => ({ primary: 'general-nutrition', secondary: [], reason: 'ASPCA 应避免的人食（食品安全）' }) },
  { match: /^cn-regulation-/, assign: () => ({ primary: 'infectious-disease', secondary: [], reason: '中国动物防疫/狂犬病法规' }) },
  { match: /^fediaf-/, assign: () => ({ primary: 'reference', secondary: [], reason: 'FEDIAF 营养指南（法规基线）' }) },
  { match: /^nrc-/, assign: () => ({ primary: 'reference', secondary: [], reason: 'NRC 2006 犬猫营养需求' }) },
  { match: /^merck-临床生化/, assign: () => ({ primary: 'reference', secondary: [], reason: 'MERCK 临床生化（检验参考）' }) },
  { match: /^merck-临床血液学/, assign: () => ({ primary: 'reference', secondary: [], reason: 'MERCK 临床血液学（检验参考）' }) },
  { match: /^merck-肝功能检查/, assign: () => ({ primary: 'hepatology', secondary: [], reason: 'MERCK 肝功能检查' }) },
  { match: /^merck-/, assign: () => ({ primary: 'dermatology', secondary: [], reason: 'MERCK 皮肤病/营养性皮肤病' }) },

  // WSAVA（按子系列）
  { match: /^wsava-dental-GDC-Oral-Cancer/, assign: () => ({ primary: 'oncology', secondary: ['dentistry'], reason: 'WSAVA 口腔肿瘤' }) },
  { match: /^wsava-dental-/, assign: () => ({ primary: 'dentistry', secondary: [], reason: 'WSAVA 牙科' }) },
  { match: /^wsava-hereditary-/, assign: () => ({ primary: 'reproduction', secondary: [], reason: 'WSAVA 遗传病与健康育种' }) },
  { match: /^wsava-nutrition-/, assign: () => ({ primary: 'general-nutrition', secondary: [], reason: 'WSAVA 营养工具包' }) },
  { match: /^wsava-pain-topic-sheets-Caesarean/, assign: () => ({ primary: 'reproduction', secondary: ['oa'], reason: 'WSAVA 剖宫产疼痛' }) },
  { match: /^wsava-pain-topic-sheets-Cancer-Pain/, assign: () => ({ primary: 'oncology', secondary: ['oa'], reason: 'WSAVA 癌痛' }) },
  { match: /^wsava-pain-topic-sheets-Pregnant-or-lactating/, assign: () => ({ primary: 'reproduction', secondary: ['oa'], reason: 'WSAVA 孕/哺乳期疼痛' }) },
  { match: /^wsava-pain-topic-sheets-Degenerative-joint-disease/, assign: () => ({ primary: 'oa', secondary: [], reason: 'WSAVA 退行性关节病疼痛' }) },
  { match: /^wsava-pain-topic-sheets-/, assign: () => ({ primary: 'oa', secondary: [], reason: 'WSAVA 疼痛专题' }) },
  { match: /^wsava-pain-/, assign: () => ({ primary: 'oa', secondary: [], reason: 'WSAVA 2022 疼痛指南' }) },
  { match: /^wsava-position-statements-WSAVA-OneHealth/, assign: () => ({ primary: 'general-nutrition', secondary: [], reason: 'WSAVA 肥胖预防（One Health）' }) },
  { match: /^wsava-position-statements-/, assign: () => ({ primary: 'oncology', secondary: [], reason: 'WSAVA 立场声明（微芯片与肿瘤）' }) },
  { match: /^wsava-reproduction-/, assign: () => ({ primary: 'reproduction', secondary: [], reason: 'WSAVA 生殖管理指南' }) },
  { match: /^wsava-vaccination-/, assign: () => ({ primary: 'infectious-disease', secondary: [], reason: 'WSAVA 2024 免疫指南' }) },
  { match: /^wsava-welfare-/, assign: () => ({ primary: 'other-clinical', secondary: [], reason: 'WSAVA 动物福利（非营养主线）' }) },
  { match: /^wsava-/, assign: () => { throw new Error('WSAVA 文档没有匹配到规则'); } },
];

export function classifyDocument(documentId: string): DomainAssignment {
  for (const rule of RULES) {
    if (rule.match.test(documentId)) {
      return typeof rule.assign === 'function'
        ? rule.assign(documentId)
        : rule.assign;
    }
  }
  throw new Error(
    `文档没有域映射：${documentId}；请在 RULES 补一行（不允许孤儿文档）`,
  );
}

interface DocumentRow {
  id: string;
  title: string | null;
  sourceId: string | null;
}

export interface DomainMapEntry {
  id: string;
  title: string | null;
  sourceId: string | null;
  primaryDomain: MapDomainId;
  secondaryDomains: MapDomainId[];
  candidateDomains: MapDomainId[];
  reason: string;
}

export interface DomainMapFile {
  version: string;
  generatedAt: string;
  generator: string;
  note: string;
  totals: { documents: number; domains: number };
  domains: Array<{
    id: MapDomainId;
    documents: number;
    /** 该域检索用的文档清单（主域 + 副域），供 `knowledge-domains.ts` 校对。 */
    documentIds: string[];
    sourceIds: string[];
  }>;
  documents: DomainMapEntry[];
}

function build(rows: DocumentRow[], expectedDocuments: number): DomainMapFile {
  const entries: DomainMapEntry[] = rows.map((row) => {
    const assignment = classifyDocument(row.id);
    return {
      id: row.id,
      title: row.title,
      sourceId: row.sourceId,
      primaryDomain: assignment.primary,
      secondaryDomains: assignment.secondary,
      candidateDomains: [assignment.primary, ...assignment.secondary],
      reason: assignment.reason,
    };
  });

  if (entries.length !== expectedDocuments) {
    throw new Error(
      `文档数不一致：库里 ${entries.length} 份，快照 ${expectedDocuments} 份`,
    );
  }

  const domains = DOMAIN_IDS.map((id) => {
    const primary = entries.filter((entry) => entry.primaryDomain === id);
    const members = entries.filter(
      (entry) =>
        entry.primaryDomain === id || entry.secondaryDomains.includes(id),
    );
    return {
      id,
      documents: primary.length,
      documentIds: members.map((entry) => entry.id).sort(),
      sourceIds: [
        ...new Set(
          members
            .map((entry) => entry.sourceId)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    };
  });

  // 159/159：主域恰好一个，且主域计数之和等于文档总数。
  const primaryTotal = domains.reduce((sum, domain) => sum + domain.documents, 0);
  if (primaryTotal !== entries.length) {
    throw new Error(
      `主域归属数不一致：主域计数 ${primaryTotal}，文档 ${entries.length}`,
    );
  }
  const empty = domains.filter((domain) => domain.documents === 0);
  if (empty.length > 0) {
    throw new Error(`空域：${empty.map((domain) => domain.id).join('、')}`);
  }

  return {
    version: '1.0',
    generatedAt: new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
    generator: 'backend/scripts/knowledge-base/propose-domains.ts',
    note: '每份文档恰好一个主域 + 可选副域；domain-map 是审计底稿，运行时清单以 knowledge-domains.ts 为准（tests/domain/knowledge/domain-map.spec.ts 保证两者一致）。',
    // 审计状态不写在这里：真源是 `knowledge-domains.ts` 的 `audited`，
    // 由 `knowledge-scope.spec.ts` 用 signoff 文件校验。
    totals: {
      documents: entries.length,
      domains: DOMAIN_IDS.length,
    },
    domains,
    documents: entries,
  };
}

function readExpectedDocuments(): number {
  const snapshot = JSON.parse(readFileSync(COUNTS_PATH, 'utf8')) as {
    documents?: number;
  };
  const documents = Number(snapshot.documents);
  if (!Number.isFinite(documents) || documents <= 0) {
    throw new Error(`${COUNTS_PATH} 里没有有效的 documents 计数`);
  }
  return documents;
}

async function loadDocuments(prisma: PrismaClient): Promise<DocumentRow[]> {
  const rows = await prisma.sourceDocument.findMany({
    select: { id: true, title: true, sourceId: true },
    orderBy: { id: 'asc' },
  });
  return rows;
}

function summarize(map: DomainMapFile): void {
  console.log(`文档 ${map.totals.documents} 份 → 域 ${map.totals.domains} 个`);
  for (const domain of map.domains) {
    const closed = CLOSED_DOMAINS.includes(domain.id) ? '（边界域·不开放）' : '';
    console.log(
      `  ${domain.id.padEnd(20)} ${String(domain.documents).padStart(3)} 份` +
        `${domain.documentIds.length !== domain.documents ? `（含副域共 ${domain.documentIds.length}）` : ''}${closed}`,
    );
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const check = argv.includes('--check');
  const expected = readExpectedDocuments();

  if (check) {
    if (!existsSync(MAP_PATH)) throw new Error(`缺少 ${MAP_PATH}`);
    const committed = JSON.parse(readFileSync(MAP_PATH, 'utf8')) as DomainMapFile;
    if (committed.totals.documents !== expected) {
      throw new Error(
        `domain-map 文档数 ${committed.totals.documents}，快照 ${expected}`,
      );
    }
    console.log(
      `✓ domain-map 覆盖 ${committed.totals.documents}/${expected} 份文档、${committed.totals.domains} 个域`,
    );
    return;
  }

  const prisma = new PrismaClient();
  try {
    const rows = await loadDocuments(prisma);
    const map = build(rows, expected);
    summarize(map);
    if (write) {
      writeFileSync(MAP_PATH, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
      console.log(`\n已写入 ${MAP_PATH}`);
    } else {
      console.log('\n（未写文件；加 --write 覆盖 domain-map.json）');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(`✗ ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
