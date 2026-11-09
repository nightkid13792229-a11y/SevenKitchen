import {
  KNOWLEDGE_DOMAINS,
  allDocumentsScope,
  resolveKnowledgeScope,
  scopeFromEnv,
} from '../../../src/domain/knowledge/knowledge-scope';

/**
 * 领域 → 范围（全库计划 Task 5）。
 *
 * 核心约束：未审计领域默认打不开；范围只能扩大，不能靠"少配一个 id"悄悄缩水。
 */

describe('KNOWLEDGE_DOMAINS', () => {
  it('6 个领域，只有 ckd 审计通过', () => {
    expect(KNOWLEDGE_DOMAINS).toHaveLength(6);
    expect(KNOWLEDGE_DOMAINS.filter((domain) => domain.audited).map((d) => d.id)).toEqual([
      'ckd',
    ]);
  });
});

describe('resolveKnowledgeScope', () => {
  it('ckd 是 5 份文档 + 3 个来源', () => {
    const scope = resolveKnowledgeScope(['ckd']);
    expect(scope.documentIds).toHaveLength(5);
    expect([...scope.sourceIds].sort()).toEqual(
      ['AAHA-2021-NUTRITION', 'IRIS-CKD-2026', 'SACN5'].sort(),
    );
    expect(scope.coreTableIds).toHaveLength(6);
    expect(scope.allDocuments).toBe(false);
  });

  it('未知领域直接拒绝', () => {
    expect(() => resolveKnowledgeScope(['nope'])).toThrow('未知领域');
  });

  it('未审计领域默认拒绝', () => {
    expect(() => resolveKnowledgeScope(['general-nutrition'])).toThrow('未审计');
  });

  it('显式放行时能开未审计领域', () => {
    const previous = process.env.KB_ALLOW_UNAUDITED;
    process.env.KB_ALLOW_UNAUDITED = '1';
    try {
      const scope = resolveKnowledgeScope(['general-nutrition']);
      expect(scope.documentIds).toHaveLength(4);
      expect(scope.domains).toEqual(['general-nutrition']);
    } finally {
      if (previous === undefined) delete process.env.KB_ALLOW_UNAUDITED;
      else process.env.KB_ALLOW_UNAUDITED = previous;
    }
  });

  it('重复领域会去重', () => {
    const scope = resolveKnowledgeScope(['ckd', 'ckd']);
    expect(scope.documentIds).toHaveLength(5);
    expect(scope.domains).toEqual(['ckd']);
  });

  it('空列表拒绝', () => {
    expect(() => resolveKnowledgeScope([])).toThrow('至少');
  });
});

describe('scopeFromEnv', () => {
  it('不配置时默认 ckd', () => {
    expect(scopeFromEnv({} as NodeJS.ProcessEnv).domains).toEqual(['ckd']);
  });

  it('逗号分隔、允许空格', () => {
    expect(
      scopeFromEnv({ KNOWLEDGE_DOMAINS: ' ckd ' } as NodeJS.ProcessEnv).domains,
    ).toEqual(['ckd']);
  });
});

describe('allDocumentsScope', () => {
  it('只给基准用，全库标记为 true', () => {
    const scope = allDocumentsScope();
    expect(scope.allDocuments).toBe(true);
    expect(scope.documentIds).toEqual([]);
  });
});
