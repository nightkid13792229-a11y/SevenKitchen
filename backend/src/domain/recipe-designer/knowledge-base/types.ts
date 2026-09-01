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
  | 'REPRO'; // 繁殖围产期（母犬妊娠/哺乳）

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
};

export interface KnowledgeCitation {
  /** 出处名称，如「小动物临床营养学（第5版）」「FEDIAF 犬猫营养指南」 */
  source: string;
  /** 章节或页码信息 */
  chapter?: string;
  /** 补充说明 */
  note?: string;
}

export type KnowledgePriority = 'HIGH' | 'MEDIUM' | 'LOW';

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
  /** 引用优先级 */
  priority: KnowledgePriority;
}
