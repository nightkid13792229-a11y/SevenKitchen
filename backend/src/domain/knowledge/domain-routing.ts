/**
 * 查询 → 领域路由（全库计划 Task 10 的前置）。
 *
 * 全库放开后，同一个"磷"会同时命中 CKD、基础营养、甚至牙科文档。
 * 没有路由时，26 题在 `__all__` 范围掉到 13/26（负样本 0/4）。
 * 这里用疾病/主题信号把查询归到一个领域，再给该领域文档一个温和加成。
 *
 * 原则：只给"已知领域"的文档加权；未映射文档保持中性，避免误伤新文档。
 */
import {
  KNOWLEDGE_DOMAINS,
  type DomainId,
} from './knowledge-domains';

const DOMAIN_SIGNALS: Record<DomainId, RegExp[]> = {
  ckd: [
    /\bckd\b/i,
    /\bkidney\b/i,
    /\brenal\b/i,
    /\bcreatinine\b/i,
    /\bsdma\b/i,
    /\bupc\b/i,
    /蛋白尿/,
    /肾病/,
    /肾衰/,
    /慢性肾/,
  ],
  'general-nutrition': [
    /nutritional assessment/i,
    /nutrition assessment/i,
    /weight management/i,
    /weight loss/i,
    /body condition/i,
    /life stage/i,
    /营养评估/,
    /体重管理/,
    /减重/,
    /体况/,
    /生命阶段/,
  ],
  gi: [
    /\bdiarrh/i,
    /\bvomit/i,
    /\bgastro/i,
    /\bintestin/i,
    /\bibd\b/i,
    /\bcolitis\b/i,
    /\benteropathy\b/i,
    /腹泻/,
    /呕吐/,
    /胃肠/,
    /肠炎/,
  ],
  pancreatitis: [/\bpancrea/i, /\blipase\b/i, /胰腺/],
  oa: [
    /\barthritis\b/i,
    /\bosteoarth/i,
    /\bjoint\b/i,
    /\bmobility\b/i,
    /关节/,
    /骨关节/,
  ],
  dermatology: [
    /\bdermat/i,
    /\bskin\b/i,
    /\bitch/i,
    /\bprurit/i,
    /\bcoat\b/i,
    /皮肤/,
    /瘙痒/,
    /被毛/,
  ],
};

const DOCUMENT_DOMAINS = new Map<string, DomainId[]>();
for (const domain of KNOWLEDGE_DOMAINS) {
  for (const documentId of domain.documentIds) {
    const list = DOCUMENT_DOMAINS.get(documentId) ?? [];
    list.push(domain.id);
    DOCUMENT_DOMAINS.set(documentId, list);
  }
}

/** 查询命中的领域；没命中返回空数组（不路由）。 */
export function detectQueryDomains(query: string): DomainId[] {
  const text = String(query ?? '');
  if (!text.trim()) return [];
  return (Object.keys(DOMAIN_SIGNALS) as DomainId[]).filter((domain) =>
    DOMAIN_SIGNALS[domain].some((pattern) => pattern.test(text)),
  );
}

/**
 * 文档的领域路由权重：
 * - 查询没命中领域：1（不干预）；
 * - 文档没映射领域：1（中性，避免新文档被无端降权）；
 * - 命中所属领域：1.4；
 * - 文档属于其他已知领域：0.9。
 */
export function domainRoutingBoost(
  query: string,
  documentId: string | null | undefined,
): number {
  const detected = detectQueryDomains(query);
  if (detected.length === 0) return 1;
  const domains = DOCUMENT_DOMAINS.get(String(documentId ?? ''));
  if (!domains || domains.length === 0) return 1;
  return domains.some((domain) => detected.includes(domain)) ? 1.4 : 0.9;
}
