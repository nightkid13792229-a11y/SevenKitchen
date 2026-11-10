/**
 * 运行时知识范围（全库计划 Task 5）。
 *
 * 环境变量 `KNOWLEDGE_DOMAINS` 决定 Agent 能看哪些领域，默认只有 ckd。
 * 未审计领域必须显式加 `KB_ALLOW_UNAUDITED=1` 才能开，防止"配置写错一个 id
 * 就把没审过的内容放给模型"。
 */
import {
  KNOWLEDGE_DOMAINS as DOMAINS,
  type DomainId,
  type KnowledgeDomain,
} from './knowledge-domains';

export { DOMAINS as KNOWLEDGE_DOMAINS };
export type { DomainId, KnowledgeDomain };

export interface KnowledgeScope {
  /** 稳定标识，如 `ckd`、`general-nutrition+ckd`、`__all__`。 */
  id: string;
  label: string;
  domains: readonly DomainId[];
  /** 空数组 + allDocuments=true 表示全库；否则是明确的文档白名单。 */
  documentIds: readonly string[];
  sourceIds: readonly string[];
  coreTableIds: readonly string[];
  allDocuments: boolean;
}

export interface ResolveScopeOptions {
  /** 覆盖环境变量，测试用。 */
  allowUnaudited?: boolean;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * 领域列表 → 范围。
 *
 * - 未知领域：抛错（不静默忽略）；
 * - 未审计领域：默认抛错，除非 `allowUnaudited`；
 * - 重复领域：去重；
 * - 空列表：抛错（空范围最容易造成"看起来开了、其实什么都没查"）。
 */
export function resolveKnowledgeScope(
  domainIds: readonly string[],
  options: ResolveScopeOptions = {},
): KnowledgeScope {
  const ids = unique(
    domainIds.map((id) => String(id ?? '').trim()).filter(Boolean),
  );
  if (ids.length === 0) {
    throw new Error('至少选择一个知识领域（KNOWLEDGE_DOMAINS 不能为空）');
  }

  const allowUnaudited =
    options.allowUnaudited ?? process.env.KB_ALLOW_UNAUDITED === '1';

  const domains = ids.map((id) => {
    const domain = DOMAINS.find((item) => item.id === id);
    if (!domain) throw new Error(`未知领域: ${id}`);
    if (!domain.audited && !allowUnaudited) {
      throw new Error(`领域未审计: ${id}（需先完成 eval/signoff/${id}.md）`);
    }
    return domain;
  });

  return {
    id: domains.map((domain) => domain.id).sort().join('+'),
    label: domains.map((domain) => domain.label).join('、'),
    domains: domains.map((domain) => domain.id),
    documentIds: unique(domains.flatMap((domain) => domain.documentIds)),
    sourceIds: unique(domains.flatMap((domain) => domain.sourceIds)),
    coreTableIds: unique(domains.flatMap((domain) => domain.coreTableIds)),
    allDocuments: false,
  };
}

/** 从环境变量解析；未配置时只有 ckd。 */
export function scopeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): KnowledgeScope {
  const raw = String(env.KNOWLEDGE_DOMAINS ?? '').trim();
  const ids = (raw ? raw.split(',') : ['ckd'])
    .map((id) => id.trim())
    .filter(Boolean);
  return resolveKnowledgeScope(ids, {
    allowUnaudited: env.KB_ALLOW_UNAUDITED === '1',
  });
}

/** 全库范围：只给基准/覆盖率脚本用，生产永远不通过环境变量开到这里。 */
export function allDocumentsScope(): KnowledgeScope {
  return {
    id: '__all__',
    label: '全库（仅基准）',
    domains: [],
    documentIds: [],
    sourceIds: [],
    coreTableIds: [],
    allDocuments: true,
  };
}

/**
 * 无疾病信号时的默认检索域（全领域上线计划 Task 2 / §2.1）。
 *
 * 全库并库后，"狗一天喝多少水"这类通用问题不该去翻 159 份文档——噪声会
 * 淹没营养文档。默认只查「基础营养 + 参考库 + CKD」这三类通用营养资料；
 * 有疾病信号时仍按 `detectQueryDomains` 路由（见 `domain-routing.ts`）。
 *
 * `KNOWLEDGE_DEFAULT_DOMAINS` 可覆盖；未审计的域自动跳过（例如参考库
 * 还没签字时不会把它算进来），至少保留一个已审计域，否则抛错。
 */
export const DEFAULT_DOMAIN_IDS: readonly DomainId[] = [
  'general-nutrition',
  'reference',
  'ckd',
];

export function defaultScope(
  env: NodeJS.ProcessEnv = process.env,
): KnowledgeScope {
  const raw = String(env.KNOWLEDGE_DEFAULT_DOMAINS ?? '').trim();
  const requested = (raw ? raw.split(',') : [...DEFAULT_DOMAIN_IDS])
    .map((id) => id.trim())
    .filter(Boolean);

  const ids: DomainId[] = [];
  for (const id of requested) {
    const domain = DOMAINS.find((item) => item.id === id);
    if (!domain) throw new Error(`未知默认领域: ${id}`);
    if (!domain.audited) continue;
    ids.push(domain.id);
  }
  if (ids.length === 0) {
    throw new Error(
      `默认领域全部未审计：${requested.join('、')}（先完成签字，或改 KNOWLEDGE_DEFAULT_DOMAINS）`,
    );
  }
  return resolveKnowledgeScope(ids);
}
