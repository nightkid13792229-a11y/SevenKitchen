import { KnowledgeBaseService } from 'src/application/recipe-designer/knowledge-base.service';
import { KNOWLEDGE_APPROVALS } from 'src/domain/recipe-designer/knowledge-base/approvals';

/**
 * 顾客侧知识门禁（2026-10-02）。
 *
 * 老板定的边界：**没人审过就不给顾客看**。合作兽医在 2026-10-02
 * 对 189 条健康知识全部通过，登记表（`knowledge-base/approvals.ts`）由此生成。
 *
 * 这组测试锁的是"门禁还灵不灵"，不是"有多少条"——
 * 条数会随知识库增长而变，但两条规矩不能变：
 *   ① 顾客侧只能看到审核过的条目
 *   ② 营养师侧不受限（专业人士看全量，用于交叉核对）
 */
describe('顾客侧知识门禁', () => {
  const service: any = new KnowledgeBaseService();

  it('兽医已通过的条目对顾客可见（当前应等于登记表条数）', () => {
    const approvedCount = Object.keys(KNOWLEDGE_APPROVALS).length;
    const customer = service.filterByAudience(service.entries, 'customer');

    expect(approvedCount).toBeGreaterThan(0);
    expect(customer.length).toBe(approvedCount);
  });

  it('营养师侧不受限：看得到全量（含未审核）', () => {
    const customer = service.filterByAudience(service.entries, 'customer');
    const nutritionist = service.filterByAudience(service.entries, 'nutritionist');

    expect(nutritionist.length).toBeGreaterThanOrEqual(customer.length);
    expect(nutritionist.length).toBe(service.entries.length);
  });

  it('没审核的条目一律不出现在顾客侧（新条目默认就是这样）', () => {
    const pending = {
      id: 'test-pending-entry',
      domain: 'CLINICAL',
      title: '测试用：未审核条目',
      keywords: ['测试'],
      applicableTo: ['clinical'],
      summary: '这条只为验证门禁，不在任何数据文件里。',
      details: [],
      caveats: [],
      citations: [],
      reviewStatus: 'PENDING_REVIEW',
    } as any;

    const filtered = service.filterByAudience([pending], 'customer');
    expect(filtered).toHaveLength(0);

    // 登记表里有的（= 兽医审过的）就放行
    const approvedId = Object.keys(KNOWLEDGE_APPROVALS)[0];
    const approved = { ...pending, id: approvedId, reviewStatus: 'PENDING_REVIEW' };
    expect(service.filterByAudience([approved], 'customer')).toHaveLength(1);
  });

  it('被驳回的条目也不出现在顾客侧', () => {
    const rejected = {
      id: 'test-rejected-entry',
      domain: 'CLINICAL',
      title: '测试用：被驳回条目',
      keywords: ['测试'],
      applicableTo: ['clinical'],
      summary: '这条只为验证门禁。',
      details: [],
      caveats: [],
      citations: [],
      reviewStatus: 'REJECTED',
    } as any;

    expect(service.filterByAudience([rejected], 'customer')).toHaveLength(0);
  });
});
