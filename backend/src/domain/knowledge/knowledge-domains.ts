/**
 * 知识库领域清单（全库计划 Task 5）。
 *
 * 每个领域 = 一组文档 + 来源 + 核心表 + 审计状态。
 * `audited: false` 的领域默认不能开；开之前必须有 `eval/signoff/<id>.md`。
 *
 * 初始只有 CKD 审计通过。其余领域先占位，按批次补文档、补题集、补签字。
 */

export type DomainId =
  | 'ckd'
  | 'general-nutrition'
  | 'gi'
  | 'pancreatitis'
  | 'oa'
  | 'dermatology';

export interface KnowledgeDomain {
  id: DomainId;
  label: string;
  audited: boolean;
  documentIds: readonly string[];
  sourceIds: readonly string[];
  coreTableIds: readonly string[];
}

const CKD_DOCUMENT_IDS = [
  'sacn5-chapters-SACN5-37',
  'iris-IRIS-staging-guidelines-2026',
  'iris-IRIS-DOG-Treatment-Recommendations-may-2026',
  'iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g',
  'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
] as const;

const CKD_CORE_TABLE_IDS = [
  'T0253',
  'T0497',
  'T0260',
  'T0261',
  'T0025',
  'T0026',
] as const;

export const KNOWLEDGE_DOMAINS: readonly KnowledgeDomain[] = [
  {
    id: 'ckd',
    label: 'CKD 肾脏',
    audited: true,
    documentIds: CKD_DOCUMENT_IDS,
    sourceIds: ['SACN5', 'IRIS-CKD-2026', 'AAHA-2021-NUTRITION'],
    coreTableIds: CKD_CORE_TABLE_IDS,
  },
  {
    id: 'general-nutrition',
    label: '基础营养',
    audited: true,
    documentIds: [
      'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
      'aaha-AAHA-2010-Nutritional-Assessment-Guidelines',
      'aaha-AAHA-2014-Weight-Management-Guidelines',
      'aaha-AAHA-2019-Canine-Life-Stage-Guidelines',
    ],
    sourceIds: [
      'AAHA-2021-NUTRITION',
      'AAHA-2010-NUTRITION-ASSESSMENT',
      'AAHA-2014-WEIGHT',
      'AAHA-LIFE-STAGE-2019',
    ],
    coreTableIds: [],
  },
  {
    id: 'gi',
    label: '胃肠',
    audited: false,
    documentIds: [],
    sourceIds: [],
    coreTableIds: [],
  },
  {
    id: 'pancreatitis',
    label: '胰腺炎',
    audited: false,
    documentIds: [],
    sourceIds: [],
    coreTableIds: [],
  },
  {
    id: 'oa',
    label: '骨关节',
    audited: false,
    documentIds: [],
    sourceIds: [],
    coreTableIds: [],
  },
  {
    id: 'dermatology',
    label: '皮肤',
    audited: false,
    documentIds: [],
    sourceIds: [],
    coreTableIds: [],
  },
];
