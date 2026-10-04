import { KnowledgeBaseService } from 'src/application/recipe-designer/knowledge-base.service';

/**
 * 顾客侧知识门禁（2026-10-02）。
 *
 * 老板定的边界：**没人审过就不给顾客看**。合作兽医在 2026-10-02
 * 对 189 条健康知识全部通过。
 *
 * 通过怎么记：**直接标在条目自己身上**（`reviewStatus: 'APPROVED'`）。
 * 原来另有一张 `knowledge-base/approvals.ts` 登记表（带审核人/日期），
 * 老板当天说"审核人不用写、审核记录也不用写"，已撤掉 —— 状态跟着内容走，
 * 不会出现"条目删了登记表留个孤儿""编号被复用、旧审核套在新内容上"。
 *
 * 这组测试锁的是"门禁还灵不灵"，不是"有多少条"：
 *   ① 顾客侧只能看到 APPROVED
 *   ② 营养师侧不受限（专业人士看全量，用于交叉核对）
 *   ③ 改内容必须退回 PENDING_REVIEW —— 换了内容就等于没审过（写在各领域文件表头）
 */
describe('顾客侧知识门禁', () => {
  const service: any = new KnowledgeBaseService();

  it('顾客侧看到的正好是所有 APPROVED 的条目', () => {
    const approved = service.entries.filter(
      (entry: any) => entry.reviewStatus === 'APPROVED',
    );
    const customer = service.filterByAudience(service.entries, 'customer');

    expect(approved.length).toBeGreaterThan(0);
    expect(customer.length).toBe(approved.length);
    expect(customer.every((entry: any) => entry.reviewStatus === 'APPROVED')).toBe(
      true,
    );
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

    expect(service.filterByAudience([pending], 'customer')).toHaveLength(0);

    // 标成 APPROVED（= 审过了）就放行
    const approved = { ...pending, reviewStatus: 'APPROVED' };
    expect(service.filterByAudience([approved], 'customer')).toHaveLength(1);
  });

  it('缺省没写 reviewStatus 的也算未审核（不写不等于通过）', () => {
    const noStatus = {
      id: 'test-no-status-entry',
      domain: 'CLINICAL',
      title: '测试用：没写状态',
      keywords: ['测试'],
      applicableTo: ['clinical'],
      summary: '这条只为验证门禁。',
      details: [],
      caveats: [],
      citations: [],
    } as any;

    expect(service.filterByAudience([noStatus], 'customer')).toHaveLength(0);
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
