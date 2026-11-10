import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_DOMAIN_IDS,
  KNOWLEDGE_DOMAINS,
  allDocumentsScope,
  defaultScope,
  resolveKnowledgeScope,
  scopeFromEnv,
} from '../../../src/domain/knowledge/knowledge-scope';

/**
 * 领域 → 范围（全领域上线计划 Task 1/2）。
 *
 * 核心约束：未审计领域默认打不开；范围只能扩大，不能靠"少配一个 id"悄悄缩水；
 * 无疾病信号时走默认营养域，而不是全库。
 */

const REPO_ROOT = resolve(__dirname, '../../../..');
const SIGNOFF_DIR = resolve(REPO_ROOT, 'docs/knowledge-base/eval/signoff');

describe('KNOWLEDGE_DOMAINS', () => {
  it('域 id 唯一', () => {
    const ids = KNOWLEDGE_DOMAINS.map((domain) => domain.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('至少 12 个域可开（计划验收线）', () => {
    expect(KNOWLEDGE_DOMAINS.length).toBeGreaterThanOrEqual(12);
  });

  it('每个已审计域都有签字文件', () => {
    const missing = KNOWLEDGE_DOMAINS.filter(
      (domain) => domain.audited && !existsSync(resolve(SIGNOFF_DIR, `${domain.id}.md`)),
    ).map((domain) => domain.id);
    expect(missing).toEqual([]);
  });

  it('边界域 other-clinical 永远不审计、不开放', () => {
    const boundary = KNOWLEDGE_DOMAINS.find(
      (domain) => domain.id === 'other-clinical',
    );
    expect(boundary?.audited).toBe(false);
  });

  it('已有六域仍然审计通过（不因扩域被降级）', () => {
    const audited = KNOWLEDGE_DOMAINS.filter((domain) => domain.audited).map(
      (domain) => domain.id,
    );
    for (const id of [
      'ckd',
      'general-nutrition',
      'gi',
      'pancreatitis',
      'oa',
      'dermatology',
    ]) {
      expect(audited).toContain(id);
    }
  });
});

describe('resolveKnowledgeScope', () => {
  it('ckd 保留原有 5 份文档与 6 张核心表', () => {
    const scope = resolveKnowledgeScope(['ckd']);
    for (const documentId of [
      'sacn5-chapters-SACN5-37',
      'iris-IRIS-staging-guidelines-2026',
      'iris-IRIS-DOG-Treatment-Recommendations-may-2026',
      'iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g',
      'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
    ]) {
      expect(scope.documentIds).toContain(documentId);
    }
    expect([...scope.sourceIds].sort()).toEqual(
      ['AAHA-2021-NUTRITION', 'ACVIM-CONSENSUS', 'IRIS-CKD-2026', 'SACN5'].sort(),
    );
    expect(scope.coreTableIds).toHaveLength(6);
    expect(scope.allDocuments).toBe(false);
  });

  it('未知领域直接拒绝', () => {
    expect(() => resolveKnowledgeScope(['nope'])).toThrow('未知领域');
  });

  it('未审计领域默认拒绝（边界域）', () => {
    const previous = process.env.KB_ALLOW_UNAUDITED;
    delete process.env.KB_ALLOW_UNAUDITED;
    try {
      expect(() => resolveKnowledgeScope(['other-clinical'])).toThrow('未审计');
    } finally {
      if (previous !== undefined) process.env.KB_ALLOW_UNAUDITED = previous;
    }
  });

  it('显式放行时能开未审计领域', () => {
    const scope = resolveKnowledgeScope(['other-clinical'], {
      allowUnaudited: true,
    });
    expect(scope.domains).toEqual(['other-clinical']);
    expect(scope.documentIds.length).toBeGreaterThan(0);
  });

  it('多域合并会去重同一份文档', () => {
    const scope = resolveKnowledgeScope(['ckd', 'general-nutrition']);
    const ids = scope.documentIds;
    expect(new Set(ids).size).toBe(ids.length);
    // AAHA 2021 同时属于 ckd 与 general-nutrition，只能出现一次
    expect(
      ids.filter(
        (id) => id === 'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
      ),
    ).toHaveLength(1);
  });

  it('重复领域会去重', () => {
    const scope = resolveKnowledgeScope(['ckd', 'ckd']);
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

describe('defaultScope（无疾病信号）', () => {
  it('只含默认域，且都是已审计域', () => {
    const scope = defaultScope({} as NodeJS.ProcessEnv);
    expect(scope.domains.length).toBeGreaterThan(0);
    for (const id of scope.domains) {
      expect(DEFAULT_DOMAIN_IDS).toContain(id);
      const domain = KNOWLEDGE_DOMAINS.find((item) => item.id === id);
      expect(domain?.audited).toBe(true);
    }
    // 通用营养问题必须能查到营养与 CKD 资料
    expect(scope.domains).toContain('general-nutrition');
    expect(scope.domains).toContain('ckd');
  });

  it('未审计的默认域自动跳过，而不是整体报错', () => {
    // 'other-clinical' 未审计：默认域里混进它也只是被跳过
    const scope = defaultScope({
      KNOWLEDGE_DEFAULT_DOMAINS: 'ckd,other-clinical',
    } as NodeJS.ProcessEnv);
    expect(scope.domains).toEqual(['ckd']);
  });

  it('KNOWLEDGE_DEFAULT_DOMAINS 可覆盖', () => {
    const scope = defaultScope({
      KNOWLEDGE_DEFAULT_DOMAINS: 'gi',
    } as NodeJS.ProcessEnv);
    expect(scope.domains).toEqual(['gi']);
  });

  it('未知默认域报错（配置写错不能静默）', () => {
    expect(() =>
      defaultScope({ KNOWLEDGE_DEFAULT_DOMAINS: 'nope' } as NodeJS.ProcessEnv),
    ).toThrow('未知默认领域');
  });

  it('默认域全部未审计时报错', () => {
    expect(() =>
      defaultScope({
        KNOWLEDGE_DEFAULT_DOMAINS: 'other-clinical',
      } as NodeJS.ProcessEnv),
    ).toThrow('全部未审计');
  });
});

describe('allDocumentsScope', () => {
  it('只给基准用，全库标记为 true', () => {
    const scope = allDocumentsScope();
    expect(scope.allDocuments).toBe(true);
    expect(scope.documentIds).toEqual([]);
  });
});
