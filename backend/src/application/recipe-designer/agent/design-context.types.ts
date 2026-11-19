/**
 * 食谱设计 Agent 的“本单设计上下文”（2026-11-19）。
 *
 * 为什么要有这一层：Agent 过去只读草稿摘要，摘要里没有订单号、没有狗狗 id，
 * 也没有健康档案；模型只能得出“系统里拿不到档案”，转而去问用户。
 *
 * 这里把“这单是谁、给谁设计、这只狗的全部健康记录”收成一份只读快照，
 * 由 `read_design_context` 在每次运行的第一轮读取。
 *
 * 注意：这里只做数据搬运，不做医学判断；档案是主人填写/上传的，
 * 矛盾与缺失原样交给模型和设计师判断。
 */

export type AgentDesignContextMode = 'ORDER' | 'CATALOG';

export interface AgentDesignContextOrder {
  /** 对外单号（CR…），不是内部 uuid。 */
  orderNo: string;
  status: string;
  quantity: number;
  /** LOSE_WEIGHT / MAINTAIN / GAIN_WEIGHT / HEALTH_SUPPORT */
  targetGoal: string;
  needsHealthManagement: boolean;
  notes: string | null;
  allergies: string[];
  allergyText: string | null;
  /** HAS_ALLERGY / NO_ALLERGY / UNKNOWN */
  allergyStatus: string;
  medicalConditions: string[];
  preferredIngredients: string[];
  dislikedIngredients: string[];
  currentFoodMain: string | null;
  currentFoodOther: string | null;
  changeReasons: string[];
  changeReasonOther: string | null;
  stomachConditions: string[];
  stomachOther: string | null;
  requestedProteinCodes: string[];
}

export interface AgentDesignContextDog {
  name: string;
  breedName: string | null;
  birthday: string | null;
  ageMonths: number | null;
  gender: string | null;
  neutered: boolean | null;
  currentWeightKg: number | null;
  weightUpdatedAt: string | null;
  bcsScore: number | null;
  bcsScoreConfirmedAt: string | null;
  activityLevel: string | null;
  mealsPerDay: number | null;
  medicalHistory: string | null;
  allergyFoods: string | null;
  pickyFoods: string | null;
  preferredFoods: string | null;
  healthTagOverrides: unknown;
}

export type AgentDesignContextAttachmentKind = 'IMAGE' | 'PDF' | 'OTHER';
export type AgentDesignContextAttachmentRecordType =
  | 'MEDICAL'
  | 'CHECKUP'
  | 'ALLERGY';

export interface AgentDesignContextAttachment {
  /** 稳定 id：`记录类型:记录 id:序号`，模型用它指代某张原件。 */
  id: string;
  recordType: AgentDesignContextAttachmentRecordType;
  recordId: string;
  recordDate: string | null;
  kind: AgentDesignContextAttachmentKind;
  /** 给模型看的短标签，如「就诊 2026-11-12 附件1」。 */
  label: string;
  /** 原件地址。运行时注入图片后会从工具结果里摘掉，避免重复占上下文。 */
  url: string;
}

export interface AgentDesignContextMedicalRecord {
  id: string;
  visitDate: string | null;
  chiefComplaint: string;
  diagnosis: string;
  status: string;
  labValues: string | null;
  treatment: string | null;
  exams: string | null;
  vitals: string | null;
  medications: string[];
  followUpDate: string | null;
  notes: string | null;
  attachmentIds: string[];
}

export interface AgentDesignContextCheckupRecord {
  id: string;
  checkupDate: string | null;
  checkupType: string;
  findings: string | null;
  labValues: string | null;
  recommendations: string | null;
  notes: string | null;
  attachmentIds: string[];
}

export interface AgentDesignContextAllergyRecord {
  id: string;
  allergen: string;
  certainty: string;
  source: string;
  notes: string | null;
  observedAt: string | null;
  attachmentIds: string[];
}

export interface AgentDesignContextAllergyReport {
  id: string;
  testDate: string | null;
  testMethod: string;
  institution: string | null;
  summary: string | null;
  ocrText: string | null;
  attachmentIds: string[];
}

export interface AgentDesignContextWeightRecord {
  recordDate: string | null;
  weightKg: number;
  note: string | null;
}

export interface AgentDesignContextWeightPlan {
  direction: string;
  status: string;
  startWeightKg: number;
  startBcsScore: number;
  targetWeightKg: number;
  currentKcal: number;
  floorKcal: number;
  ceilingKcal: number;
  startDate: string | null;
  estimatedGoalDate: string | null;
}

export interface AgentDesignContext {
  mode: AgentDesignContextMode;
  order: AgentDesignContextOrder | null;
  dog: AgentDesignContextDog | null;
  medicalRecords: AgentDesignContextMedicalRecord[];
  checkupRecords: AgentDesignContextCheckupRecord[];
  allergyRecords: AgentDesignContextAllergyRecord[];
  allergyReports: AgentDesignContextAllergyReport[];
  weightRecords: AgentDesignContextWeightRecord[];
  weightGoalPlan: AgentDesignContextWeightPlan | null;
  dietPreferences: { liked: string[]; disliked: string[] };
  attachments: AgentDesignContextAttachment[];
  counts: {
    medicalRecords: number;
    checkupRecords: number;
    allergyRecords: number;
    allergyReports: number;
    weightRecords: number;
    attachments: number;
    images: number;
  };
  /** 缺哪些资料；不让模型把“没有记录”误当成“没有疾病”。 */
  missing: string[];
  /** 订单/狗狗读不到时的明确原因；null = 读到了。 */
  unavailableReason: string | null;
}
