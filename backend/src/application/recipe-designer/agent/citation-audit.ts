/**
 * 引用审计（C3，2026-11-22）。
 *
 * 只做一件事：把方案约束里的 citationId 和本次运行中知识库真正返回过的
 * 页/锚点对一遍。对不上只标记“未核验”，不阻断——避免因为模型写法不一致
 * 把正常方案卡死。
 */
import type { AgentNutritionPlan } from './propose-plan';

export interface CitationAudit {
  checkedAt: string;
  citedCount: number;
  verified: string[];
  unverified: string[];
}

/** 从 kb_find / kb_read 的结果里收集可被 citationId 引用的 id。 */
export function collectKnowledgeCitationIds(
  toolName: string,
  data: unknown,
): string[] {
  if (!isRecord(data)) return [];
  const ids = new Set<string>();

  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) {
      ids.add(value.trim());
    }
  };
  const addPage = (documentId: unknown, pageNo: unknown, anchor: unknown) => {
    add(anchor);
    const doc = typeof documentId === 'string' ? documentId.trim() : '';
    const page = Number(pageNo);
    if (doc && Number.isFinite(page)) {
      add(`${doc}:${page}`);
      add(`${doc}#${page}`);
      add(`${doc}:${page}:page`);
    }
  };

  if (toolName === 'kb_find' && Array.isArray(data.hits)) {
    for (const hit of data.hits) {
      if (!isRecord(hit)) continue;
      addPage(hit.documentId, hit.pageNo, hit.anchor);
      add(hit.blockId);
    }
  }
  if (toolName === 'kb_read' && Array.isArray(data.pages)) {
    for (const page of data.pages) {
      if (!isRecord(page)) continue;
      addPage(data.documentId, page.pageNo, page.anchor);
    }
  }
  return [...ids];
}

/** 对方案约束的 citationId 做核验；没有 citationId 的约束不参与。 */
export function auditPlanCitations(
  plan: AgentNutritionPlan,
  verifiedIds: Iterable<string>,
): CitationAudit {
  const verifiedSet = new Set(
    [...verifiedIds].map((id) => String(id).trim()).filter(Boolean),
  );
  const cited = (plan.constraints ?? [])
    .map((constraint) => String(constraint.citationId ?? '').trim())
    .filter(Boolean);
  const uniqueCited = [...new Set(cited)];
  const verified = uniqueCited.filter((id) => verifiedSet.has(id));
  const unverified = uniqueCited.filter((id) => !verifiedSet.has(id));
  return {
    checkedAt: new Date().toISOString(),
    citedCount: uniqueCited.length,
    verified,
    unverified,
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
