import { KnowledgeBaseService } from '../../src/application/recipe-designer/knowledge-base.service';
import {
  HEALTH_ONLY_DOMAINS,
  type KnowledgeEntry,
} from '../../src/domain/recipe-designer/knowledge-base/types';
import { auditHealthKnowledge } from '../../scripts/audit-health-knowledge';

/**
 * 健康知识 · 入库前自检（2026-10-01）。
 *
 * 结构校验（启动时那次）管不到内容层面的问题：
 * 标题写重复、引了猫的资料、复核日期已过期、待审核领域里混进已审核。
 * 这个脚本就是补这一层，老板/兽医审核前先跑一次，能省掉一堆来回。
 */
describe('健康知识条目自检', () => {
  const service = new KnowledgeBaseService();
  const entries = service.getAll();
  const result = auditHealthKnowledge(entries, { today: '2026-10-01' });

  // 造样例必须用**健康侧**条目：自检只统计健康侧领域，
  // 拿一条食谱营养条目当模板会被过滤掉，测试就成了假通过
  const healthEntries = entries.filter((entry) =>
    (HEALTH_ONLY_DOMAINS as readonly string[]).includes(entry.domain),
  );
  const sample = healthEntries[0];

  it('只统计健康侧领域', () => {
    const healthTotal = Object.values(result.byDomain).reduce(
      (sum, count) => sum + count,
      0,
    );

    expect(healthTotal).toBe(result.total);
    expect(result.total).toBeGreaterThan(100);
    expect(result.total).toBeLessThan(entries.length);
  });

  it('当前知识库没有硬问题（重复 / 过期 / 越权标已审核）', () => {
    expect(result.problems).toEqual([]);
  });

  it('统计口径覆盖风险、紧急程度与证据强度', () => {
    const riskTotal = Object.values(result.byRisk).reduce(
      (sum, n) => sum + n,
      0,
    );
    const evidenceTotal = Object.values(result.byEvidence).reduce(
      (sum, n) => sum + n,
      0,
    );

    expect(riskTotal).toBe(result.total);
    expect(evidenceTotal).toBe(result.total);
    // 分诊类必须写死紧急程度（这条在结构校验里也有，这里再确认统计口径没漏）
    expect(result.byUrgency.IMMEDIATE).toBeGreaterThan(0);
  });

  it('重复标题会被抓出来', () => {
    const duplicated: KnowledgeEntry[] = [
      {
        ...sample,
        id: 'dup-a',
        title: '同一个标题',
      },
      {
        ...sample,
        id: 'dup-b',
        title: '同一个标题',
      },
    ];

    const fake = auditHealthKnowledge(duplicated, { today: '2026-10-01' });

    expect(fake.problems.some((item) => item.includes('标题重复'))).toBe(true);
  });

  it('复核日期已过会被标成硬问题', () => {
    const stale: KnowledgeEntry[] = [
      {
        ...sample,
        id: 'stale-1',
        reviewStatus: 'PENDING_REVIEW',
        reviewBy: '2026-01-01',
      },
    ];

    const fake = auditHealthKnowledge(stale, { today: '2026-10-01' });

    expect(fake.problems.some((item) => item.includes('复核日期已过'))).toBe(
      true,
    );
  });

  it('健康侧条目标成已审核不再算问题（登记表已撤，审核状态就写在条目上）', () => {
    const healthDomain = Object.keys(
      result.byDomain,
    )[0] as KnowledgeEntry['domain'];
    const approved: KnowledgeEntry[] = [
      {
        ...sample,
        id: 'approved-1',
        domain: healthDomain,
        reviewStatus: 'APPROVED',
      },
    ];

    const fake = auditHealthKnowledge(approved, { today: '2026-10-01' });

    // 2026-10-02：老板要求不留审核记录，approvals.ts 已撤掉，
    // 所以"健康侧标了 APPROVED"就是正常状态，不该报错。
    expect(fake.problems.some((item) => item.includes('APPROVED'))).toBe(false);
  });

  it('健康侧条目还没标 APPROVED 会提示（顾客侧看不到）', () => {
    const healthDomain = Object.keys(
      result.byDomain,
    )[0] as KnowledgeEntry['domain'];
    const pending: KnowledgeEntry[] = [
      {
        ...sample,
        id: 'pending-1',
        domain: healthDomain,
        reviewStatus: 'PENDING_REVIEW',
      },
    ];

    const fake = auditHealthKnowledge(pending, { today: '2026-10-01' });

    expect(fake.problems).toEqual([]);
    expect(
      fake.warnings.some((item) => item.includes('顾客侧看不到')),
    ).toBe(true);
  });

  it('猫专属正文会被提示（我们只做狗）', () => {
    const feline: KnowledgeEntry[] = [
      {
        ...sample,
        id: 'cat-1',
        summary: '这条内容只适用于猫。',
      },
    ];

    const fake = auditHealthKnowledge(feline, { today: '2026-10-01' });

    expect(fake.warnings.some((item) => item.includes('猫专属表述'))).toBe(
      true,
    );
  });

  it('"犬猫并列共识"的正式标题不算猫专属', () => {
    const parallel: KnowledgeEntry[] = [
      {
        ...sample,
        id: 'both-1',
        summary: '依据为 ACVIM 犬猫免疫介导性溶血性贫血诊断共识。',
      },
    ];

    const fake = auditHealthKnowledge(parallel, { today: '2026-10-01' });

    expect(fake.warnings.some((item) => item.includes('猫专属表述'))).toBe(
      false,
    );
  });
});
