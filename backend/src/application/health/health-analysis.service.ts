import { Injectable } from '@nestjs/common';

/**
 * AI 健康分析与建议（2026-10-01，第七期）。
 *
 * 2026-11-11 知识库 v3：387 条结论层（含出处/引用）整体删除，
 * 健康分析暂时失去了唯一可引用的结论来源，因此本服务降级为“明确不可用”。
 *
 * 为什么不是静默返回空结果：
 *   前端与营养师端需要一句能显示给人看的话，而不是假装分析成功却什么都不给。
 *   等新的“原文阅读方案”（`HEALTH_ANALYSIS_V3`）接入后，再恢复真实分析。
 *
 * 保留七项常量与返回类型：controller 与前端类型仍引用它们，
 * 入口契约不能因为后端暂停而崩掉。
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
  /** 引用条目的标题，与 citations 一一对应 */
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
  audience: 'nutritionist' | 'customer';
  generatedAt: string;
}

/** 顾客侧/员工侧暂不可用时的返回（与疫苗计划同一套做法） */
export interface HealthAnalysisUnavailable {
  available: false;
  message: string;
  enableWith: string;
}

@Injectable()
export class HealthAnalysisService {
  async analyze(
    customerId: string,
    dogId: string,
    audience: 'nutritionist' | 'customer' = 'customer',
  ): Promise<HealthAnalysisUnavailable> {
    return {
      available: false,
      message: '知识库结论层已下线，健康分析暂停，等待新的原文阅读方案。',
      enableWith: 'HEALTH_ANALYSIS_V3',
    };
  }

  async analyzeForStaff(dogId: string): Promise<HealthAnalysisUnavailable> {
    return this.analyze('', dogId, 'nutritionist');
  }
}
