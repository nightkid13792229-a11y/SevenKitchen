/**
 * 知识库领域清单（全领域上线计划 Task 1）。
 *
 * 每个领域 = 一组文档 + 来源 + 核心表 + 审计状态。
 * `audited: false` 的领域进不了生产：`resolveKnowledgeScope` 会拒绝，
 * 只有显式 `KB_ALLOW_UNAUDITED=1`（审计用）才放行。
 *
 * 文档清单由 `npm run kb:domains -- --write` 生成，底稿是
 * `docs/knowledge-base/eval/domain-map.json`；`domain-map.spec.ts`
 * 保证两边一致。改清单先改 `propose-domains.ts` 的规则表，再重新生成，
 * 不要手改下面的数组。
 *
 * 16 个审计域 + 1 个边界域（`other-clinical`：非营养主线的临床共识，
 * 以及解析质量不可用的法规文档——归位但不开放，见计划 §2 与签字）。
 */

export type DomainId =

  | 'ckd'
  | 'general-nutrition'
  | 'gi'
  | 'pancreatitis'
  | 'oa'
  | 'dermatology'
  | 'endocrinology'
  | 'urology'
  | 'cardiology'
  | 'hepatology'
  | 'oncology'
  | 'dentistry'
  | 'infectious-disease'
  | 'reproduction'
  | 'senior-care'
  | 'reference'
  | 'other-clinical';

export interface KnowledgeDomain {
  id: DomainId;
  label: string;
  /** 只有审计通过（有 signoff）的领域才允许进生产。 */
  audited: boolean;
  /** 检索白名单：主域 + 副域（同一文档可被两个域检索，scope 会去重）。 */
  documentIds: readonly string[];
  sourceIds: readonly string[];
  coreTableIds: readonly string[];
  /** 计划批次（A/B/C）；已有的六域没有批次。 */
  batch?: 'A' | 'B' | 'C';
}

/** CKD 核心表（spec §7.5；T0253=37-1、T0497=37-9、T0260/61=37-11/12、T0025/26=AAHA 表 8）。 */
const CKD_CORE_TABLE_IDS = [
  'T0253',
  'T0497',
  'T0260',
  'T0261',
  'T0025',
  'T0026',
] as const;

/** CKD 肾脏：6 份主域文档（含副域共 8）。 */
const CKD_DOCUMENT_IDS = [
  'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
  'acvim-ACVIM-2015-心血管-肾脏轴疾病',
  'iris-IRIS-AKI-Grading-2026',
  'iris-IRIS-CAT-Treatment-Recommendations-2026',
  'iris-IRIS-DOG-Treatment-Recommendations-may-2026',
  'iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g',
  'iris-IRIS-staging-guidelines-2026',
  'sacn5-chapters-SACN5-37',
] as const;

const CKD_SOURCE_IDS = [
  'AAHA-2021-NUTRITION',
  'ACVIM-CONSENSUS',
  'IRIS-CKD-2026',
  'SACN5',
] as const;

/** 基础营养：45 份主域文档（含副域共 51）。 */
const GENERAL_NUTRITION_DOCUMENT_IDS = [
  'aaha-AAHA-2010-Nutritional-Assessment-Guidelines',
  'aaha-AAHA-2014-Weight-Management-Guidelines',
  'aaha-AAHA-2019-Canine-Life-Stage-Guidelines',
  'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
  'aspca-ASPCA-people-foods-to-avoid',
  'sacn5-chapters-SACN5-1',
  'sacn5-chapters-SACN5-10',
  'sacn5-chapters-SACN5-11',
  'sacn5-chapters-SACN5-12',
  'sacn5-chapters-SACN5-13',
  'sacn5-chapters-SACN5-14',
  'sacn5-chapters-SACN5-16',
  'sacn5-chapters-SACN5-17',
  'sacn5-chapters-SACN5-18',
  'sacn5-chapters-SACN5-19',
  'sacn5-chapters-SACN5-20',
  'sacn5-chapters-SACN5-21',
  'sacn5-chapters-SACN5-23',
  'sacn5-chapters-SACN5-24',
  'sacn5-chapters-SACN5-25',
  'sacn5-chapters-SACN5-26',
  'sacn5-chapters-SACN5-27',
  'sacn5-chapters-SACN5-3',
  'sacn5-chapters-SACN5-4',
  'sacn5-chapters-SACN5-5',
  'sacn5-chapters-SACN5-6',
  'sacn5-chapters-SACN5-7',
  'sacn5-chapters-SACN5-8',
  'sacn5-chapters-SACN5-9',
  'wsava-nutrition-Body-Condition-Score-Cat-2025',
  'wsava-nutrition-Body-Condition-Score-Dog-2025',
  'wsava-nutrition-Calorie-Needs-Healthy-Adult-Cats-2020',
  'wsava-nutrition-Calorie-Needs-Healthy-Adult-Dogs-2020',
  'wsava-nutrition-Diet-History-Form',
  'wsava-nutrition-Feeding-Guide-Hospitalized-Dogs-Cats',
  'wsava-nutrition-Feeding-Instructions-Monitoring-Chart-Hospit',
  'wsava-nutrition-Global-Nutritional-Assesment-Guidelines-Chin',
  'wsava-nutrition-Guide-to-Treats-Cats-2025',
  'wsava-nutrition-Guide-to-Treats-Dogs-2025',
  'wsava-nutrition-Implementing-WSAVA-Nutrition-Guidelines',
  'wsava-nutrition-Interpreting-Food-Labels-2025',
  'wsava-nutrition-Muscle-Condition-Score-Cat',
  'wsava-nutrition-Muscle-Condition-Score-Dog',
  'wsava-nutrition-Nutritional-Assessment-Checklist',
  'wsava-nutrition-Principles-of-Wellness-2025',
  'wsava-nutrition-Quick-Tips-Implementing-WSAVA-Nutrition-Guid',
  'wsava-nutrition-Raw-Meat-Based-Diets-for-Pets-2021',
  'wsava-nutrition-SOP-for-Use-of-WSAVA-GNC-Toolkits-v4',
  'wsava-nutrition-Selecting-a-Pet-Food-2021',
  'wsava-nutrition-WSAVA-Nutrition-Assessment-Guidelines-2011-J',
  'wsava-position-statements-WSAVA-OneHealth-肥胖预防',
] as const;

const GENERAL_NUTRITION_SOURCE_IDS = [
  'AAHA-2010-NUTRITION-ASSESSMENT',
  'AAHA-2014-WEIGHT',
  'AAHA-2021-NUTRITION',
  'AAHA-LIFE-STAGE-2019',
  'ASPCA-POISON',
  'SACN5',
  'WSAVA-NUTRITION',
  'WSAVA-POSITION',
] as const;

/** 胃肠：24 份主域文档（含副域共 24）。 */
const GI_DOCUMENT_IDS = [
  'acvim-ACVIM-2018-胃肠道保护剂合理使用',
  'acvim-ACVIM-2022-犬慢性肠病-现状综述',
  'acvim-ACVIM-2023-猫慢性肠病-低级别肿瘤与炎症鉴别',
  'acvim-ACVIM-2026-慢性肠病诊断与治疗共识',
  'sacn5-chapters-SACN5-25',
  'sacn5-chapters-SACN5-26',
  'sacn5-chapters-SACN5-48',
  'sacn5-chapters-SACN5-50a',
  'sacn5-chapters-SACN5-51',
  'sacn5-chapters-SACN5-52',
  'sacn5-chapters-SACN5-53',
  'sacn5-chapters-SACN5-54',
  'sacn5-chapters-SACN5-55',
  'sacn5-chapters-SACN5-56',
  'sacn5-chapters-SACN5-57',
  'sacn5-chapters-SACN5-58',
  'sacn5-chapters-SACN5-59',
  'sacn5-chapters-SACN5-60',
  'sacn5-chapters-SACN5-61',
  'sacn5-chapters-SACN5-62',
  'sacn5-chapters-SACN5-63',
  'sacn5-chapters-SACN5-64',
  'sacn5-chapters-SACN5-65',
  'sacn5-chapters-SACN5-66',
] as const;

const GI_SOURCE_IDS = [
  'ACVIM-CONSENSUS',
  'SACN5',
] as const;

/** 胰腺炎：2 份主域文档（含副域共 2）。 */
const PANCREATITIS_DOCUMENT_IDS = [
  'acvim-ACVIM-2021-猫胰腺炎共识',
  'sacn5-chapters-SACN5-67',
] as const;

const PANCREATITIS_SOURCE_IDS = [
  'ACVIM-CONSENSUS',
  'SACN5',
] as const;

/** 骨关节与疼痛：7 份主域文档（含副域共 10）。 */
const OA_DOCUMENT_IDS = [
  'aaha-AAHA-2022-Pain-Management-Guidelines',
  'acvim-ACVIM-2022-犬胸腰段椎间盘突出-诊断与管理',
  'sacn5-chapters-SACN5-33',
  'sacn5-chapters-SACN5-34',
  'wsava-pain-WSAVA-2022疼痛识别评估和治疗指南-中文',
  'wsava-pain-topic-sheets-Caesarean-section',
  'wsava-pain-topic-sheets-Cancer-Pain',
  'wsava-pain-topic-sheets-Degenerative-joint-disease',
  'wsava-pain-topic-sheets-Pregnant-or-lactating-patients',
  'wsava-pain-topic-sheets-WSAVA-Global-Pain-Council-Perceived-',
] as const;

const OA_SOURCE_IDS = [
  'AAHA-PAIN-2022',
  'ACVIM-CONSENSUS',
  'SACN5',
  'WSAVA-PAIN-2022',
] as const;

/** 皮肤：4 份主域文档（含副域共 4）。 */
const DERMATOLOGY_DOCUMENT_IDS = [
  'merck-皮肤病维生素与矿物质',
  'merck-营养性皮肤病',
  'sacn5-chapters-SACN5-31',
  'sacn5-chapters-SACN5-32',
] as const;

const DERMATOLOGY_SOURCE_IDS = [
  'MERCK-DERM',
  'SACN5',
] as const;

/** 内分泌：3 份主域文档（含副域共 4）。 */
const ENDOCRINOLOGY_DOCUMENT_IDS = [
  'aaha-AAHA-2018-Diabetes-Management-Guidelines',
  'sacn5-chapters-SACN5-27',
  'sacn5-chapters-SACN5-28',
  'sacn5-chapters-SACN5-29',
] as const;

const ENDOCRINOLOGY_SOURCE_IDS = [
  'AAHA-DIABETES-2018',
  'SACN5',
] as const;

/** 泌尿：11 份主域文档（含副域共 11）。 */
const UROLOGY_DOCUMENT_IDS = [
  'acvim-ACVIM-2016-犬猫尿石症治疗与预防共识',
  'acvim-ACVIM-2024-犬尿失禁诊断与管理',
  'sacn5-chapters-SACN5-38',
  'sacn5-chapters-SACN5-39',
  'sacn5-chapters-SACN5-40',
  'sacn5-chapters-SACN5-41',
  'sacn5-chapters-SACN5-42',
  'sacn5-chapters-SACN5-43',
  'sacn5-chapters-SACN5-44',
  'sacn5-chapters-SACN5-45',
  'sacn5-chapters-SACN5-46',
] as const;

const UROLOGY_SOURCE_IDS = [
  'ACVIM-CONSENSUS',
  'SACN5',
] as const;

/** 心脏：7 份主域文档（含副域共 7）。 */
const CARDIOLOGY_DOCUMENT_IDS = [
  'acvim-ACVIM-2015-心血管-肾脏轴疾病',
  'acvim-ACVIM-2018-系统性高血压-识别评估与管理',
  'acvim-ACVIM-2019-犬MMVD-分期与治疗-官方摘要卡片',
  'acvim-ACVIM-2019-犬MMVD-诊断与治疗共识全文',
  'acvim-ACVIM-2020-心肌病分类诊断与管理',
  'acvim-ACVIM-2020-肺动脉高压',
  'sacn5-chapters-SACN5-36',
] as const;

const CARDIOLOGY_SOURCE_IDS = [
  'ACVIM-CONSENSUS',
  'SACN5',
] as const;

/** 肝胆：3 份主域文档（含副域共 3）。 */
const HEPATOLOGY_DOCUMENT_IDS = [
  'acvim-ACVIM-2019-犬慢性肝炎诊断与治疗',
  'merck-肝功能检查',
  'sacn5-chapters-SACN5-68',
] as const;

const HEPATOLOGY_SOURCE_IDS = [
  'ACVIM-CONSENSUS',
  'MERCK-HEPATIC',
  'SACN5',
] as const;

/** 肿瘤：5 份主域文档（含副域共 5）。 */
const ONCOLOGY_DOCUMENT_IDS = [
  'acvim-ACVIM-2018-细胞毒化疗药物安全使用',
  'sacn5-chapters-SACN5-30',
  'wsava-dental-GDC-Oral-Cancer',
  'wsava-pain-topic-sheets-Cancer-Pain',
  'wsava-position-statements-WSAVA-微芯片与肿瘤立场声明',
] as const;

const ONCOLOGY_SOURCE_IDS = [
  'ACVIM-CONSENSUS',
  'SACN5',
  'WSAVA-DENTAL',
  'WSAVA-PAIN-2022',
  'WSAVA-POSITION',
] as const;

/** 牙科：5 份主域文档（含副域共 6）。 */
const DENTISTRY_DOCUMENT_IDS = [
  'aaha-AAHA-2019-Dental-Care-Guidelines',
  'sacn5-chapters-SACN5-47',
  'sacn5-chapters-SACN5-49',
  'wsava-dental-GDC-Oral-Cancer',
  'wsava-dental-GDC-Toothbrushing-Toolkit-1',
  'wsava-dental-WSAVA-Global-Dental-Guidelines-JSAPMandarin',
] as const;

const DENTISTRY_SOURCE_IDS = [
  'AAHA-DENTAL-2019',
  'SACN5',
  'WSAVA-DENTAL',
] as const;

/** 传染病与免疫：7 份主域文档（含副域共 7）。 */
const INFECTIOUS_DISEASE_DOCUMENT_IDS = [
  'aaha-AAHA-2022-Canine-Vaccination-Guidelines-2024update',
  'acvim-ACVIM-2015-治疗性抗菌药使用与耐药性',
  'acvim-ACVIM-2018-犬猫莱姆病-更新共识',
  'acvim-ACVIM-2023-犬钩端螺旋体病-更新共识',
  'wsava-vaccination-WSAVA-Vaccination-guidelines-2024',
] as const;

const INFECTIOUS_DISEASE_SOURCE_IDS = [
  'AAHA-VACC-2022',
  'ACVIM-CONSENSUS',
  'WSAVA-VACC-2024',
] as const;

/** 生殖：10 份主域文档（含副域共 10）。 */
const REPRODUCTION_DOCUMENT_IDS = [
  'sacn5-chapters-SACN5-15',
  'sacn5-chapters-SACN5-16',
  'sacn5-chapters-SACN5-22',
  'sacn5-chapters-SACN5-23',
  'wsava-hereditary-WSAVA-Hereditary-Disease-Committee-Position',
  'wsava-pain-topic-sheets-Caesarean-section',
  'wsava-pain-topic-sheets-Pregnant-or-lactating-patients',
  'wsava-reproduction-Executive-Summary',
  'wsava-reproduction-J-of-Small-Animal-Practice-2024-Romagnoli',
  'wsava-reproduction-WSAVA犬猫生殖管理指南-中文版',
] as const;

const REPRODUCTION_SOURCE_IDS = [
  'SACN5',
  'WSAVA-HEREDITARY',
  'WSAVA-PAIN-2022',
  'WSAVA-REPRO',
] as const;

/** 老年护理：5 份主域文档（含副域共 5）。 */
const SENIOR_CARE_DOCUMENT_IDS = [
  'aaha-AAHA-2023-Senior-Care-Guidelines',
  'aaha-AAHA-2023-Senior-Care-Toolkit',
  'sacn5-chapters-SACN5-14',
  'sacn5-chapters-SACN5-21',
  'sacn5-chapters-SACN5-35',
] as const;

const SENIOR_CARE_SOURCE_IDS = [
  'AAHA-SENIOR-2023',
  'SACN5',
] as const;

/** 参考库：6 份主域文档（含副域共 6）。 */
const REFERENCE_DOCUMENT_IDS = [
  'fediaf-FEDIAF-Nutritional-Guidelines-2025-ONLINE',
  'merck-临床生化',
  'merck-临床血液学',
  'nrc-NRC-2006-Nutrient-Requirements-Dogs-Cats',
  'sacn5-chapters-SACN5-2',
  'sacn5-chapters-SACN5-69',
] as const;

const REFERENCE_SOURCE_IDS = [
  'FEDIAF-2025',
  'MERCK-CLINICAL-BIOCHEM',
  'MERCK-HEME',
  'NRC-2006',
  'SACN5',
] as const;

/** 其他临床（不开放）：9 份主域文档（含副域共 9）。 */
const OTHER_CLINICAL_DOCUMENT_IDS = [
  'acvim-ACVIM-2015-犬癫痫管理',
  'acvim-ACVIM-2019-免疫介导性溶血性贫血-治疗',
  'acvim-ACVIM-2019-免疫介导性溶血性贫血-诊断',
  'acvim-ACVIM-2024-免疫性血小板减少症-治疗',
  'acvim-ACVIM-2024-免疫性血小板减少症-诊断',
  'acvim-ACVIM-2024-癫痫持续状态与集群发作',
  'cn-regulation-中华人民共和国动物防疫法-全国人大公报版',
  'cn-regulation-狂犬病防治技术规范-中国动物疫病预防控制中心',
  'wsava-welfare-PWG-福祉提示',
  'wsava-welfare-WSAVA-Animal-Welfare-Charter-Feb-2020',
  'wsava-welfare-WSAVA-Animal-Welfare-Guidelines-2018',
] as const;

const OTHER_CLINICAL_SOURCE_IDS = [
  'ACVIM-CONSENSUS',
  'CN-EPIDEMIC-LAW',
  'CN-RABIES-TECH',
  'WSAVA-WELFARE',
] as const;

export const KNOWLEDGE_DOMAINS: readonly KnowledgeDomain[] = [
  {
    id: 'ckd',
    label: 'CKD 肾脏',
    audited: true,
    documentIds: CKD_DOCUMENT_IDS,
    sourceIds: CKD_SOURCE_IDS,
    coreTableIds: CKD_CORE_TABLE_IDS,
  },
  {
    id: 'general-nutrition',
    label: '基础营养',
    audited: true,
    documentIds: GENERAL_NUTRITION_DOCUMENT_IDS,
    sourceIds: GENERAL_NUTRITION_SOURCE_IDS,
    coreTableIds: [],
  },
  {
    id: 'gi',
    label: '胃肠',
    audited: true,
    documentIds: GI_DOCUMENT_IDS,
    sourceIds: GI_SOURCE_IDS,
    coreTableIds: [],
  },
  {
    id: 'pancreatitis',
    label: '胰腺炎',
    audited: true,
    documentIds: PANCREATITIS_DOCUMENT_IDS,
    sourceIds: PANCREATITIS_SOURCE_IDS,
    coreTableIds: [],
  },
  {
    id: 'oa',
    label: '骨关节与疼痛',
    audited: true,
    documentIds: OA_DOCUMENT_IDS,
    sourceIds: OA_SOURCE_IDS,
    coreTableIds: [],
  },
  {
    id: 'dermatology',
    label: '皮肤',
    audited: true,
    documentIds: DERMATOLOGY_DOCUMENT_IDS,
    sourceIds: DERMATOLOGY_SOURCE_IDS,
    coreTableIds: [],
  },
  {
    id: 'endocrinology',
    label: '内分泌',
    audited: true,
    documentIds: ENDOCRINOLOGY_DOCUMENT_IDS,
    sourceIds: ENDOCRINOLOGY_SOURCE_IDS,
    coreTableIds: [],
    batch: 'A',
  },
  {
    id: 'urology',
    label: '泌尿',
    audited: true,
    documentIds: UROLOGY_DOCUMENT_IDS,
    sourceIds: UROLOGY_SOURCE_IDS,
    coreTableIds: [],
    batch: 'A',
  },
  {
    id: 'cardiology',
    label: '心脏',
    audited: true,
    documentIds: CARDIOLOGY_DOCUMENT_IDS,
    sourceIds: CARDIOLOGY_SOURCE_IDS,
    coreTableIds: [],
    batch: 'A',
  },
  {
    id: 'hepatology',
    label: '肝胆',
    audited: true,
    documentIds: HEPATOLOGY_DOCUMENT_IDS,
    sourceIds: HEPATOLOGY_SOURCE_IDS,
    coreTableIds: [],
    batch: 'A',
  },
  {
    id: 'oncology',
    label: '肿瘤',
    audited: true,
    documentIds: ONCOLOGY_DOCUMENT_IDS,
    sourceIds: ONCOLOGY_SOURCE_IDS,
    coreTableIds: [],
    batch: 'B',
  },
  {
    id: 'dentistry',
    label: '牙科',
    audited: true,
    documentIds: DENTISTRY_DOCUMENT_IDS,
    sourceIds: DENTISTRY_SOURCE_IDS,
    coreTableIds: [],
    batch: 'B',
  },
  {
    id: 'infectious-disease',
    label: '传染病与免疫',
    audited: false,
    documentIds: INFECTIOUS_DISEASE_DOCUMENT_IDS,
    sourceIds: INFECTIOUS_DISEASE_SOURCE_IDS,
    coreTableIds: [],
    batch: 'B',
  },
  {
    id: 'reproduction',
    label: '生殖',
    audited: true,
    documentIds: REPRODUCTION_DOCUMENT_IDS,
    sourceIds: REPRODUCTION_SOURCE_IDS,
    coreTableIds: [],
    batch: 'B',
  },
  {
    id: 'senior-care',
    label: '老年护理',
    audited: true,
    documentIds: SENIOR_CARE_DOCUMENT_IDS,
    sourceIds: SENIOR_CARE_SOURCE_IDS,
    coreTableIds: [],
    batch: 'C',
  },
  {
    id: 'reference',
    label: '参考库',
    audited: true,
    documentIds: REFERENCE_DOCUMENT_IDS,
    sourceIds: REFERENCE_SOURCE_IDS,
    coreTableIds: [],
    batch: 'C',
  },
  {
    id: 'other-clinical',
    label: '其他临床（不开放）',
    audited: false,
    documentIds: OTHER_CLINICAL_DOCUMENT_IDS,
    sourceIds: OTHER_CLINICAL_SOURCE_IDS,
    coreTableIds: [],
  },
];
