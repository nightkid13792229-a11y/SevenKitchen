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
