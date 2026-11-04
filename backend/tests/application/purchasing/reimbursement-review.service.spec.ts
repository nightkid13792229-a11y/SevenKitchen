jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { ReimbursementReviewService } from '../../../src/application/purchasing/reimbursement-review.service';

describe('ReimbursementReviewService', () => {
  const prisma: any = {
    reimbursement: { findUnique: jest.fn() },
    purchaseOrderImport: { findMany: jest.fn() },
    reimbursementReview: { create: jest.fn(), findFirst: jest.fn() },
  };
  const agentConfig = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(),
  };
  const model = { callDeepSeekJson: jest.fn() };
  const service = new ReimbursementReviewService(
    prisma,
    agentConfig as any,
    model as any,
  );

  const claim = (overrides: Record<string, unknown> = {}) => ({
    id: 'reimb-1',
    status: 'PENDING_REVIEW',
    updatedAt: new Date(),
    claimNumber: 'BX202611040001',
    totalActualCost: 10,
    voucherAmount: 10,
    differenceAmount: 0,
    differenceNote: null,
    receiptUrls: ['https://img.example.com/a.jpg'],
    receiptKeys: [],
    paymentProofUrls: [],
    purchaseLists: [
      {
        id: 'list-1',
        kind: 'ORDER_DEMAND',
        records: [
          {
            id: 'rec-1',
            ingredientName: '生菜',
            procurementSkuName: '生菜 500g/袋',
            actualCost: 10,
            sourceImportId: 'imp-1',
          },
        ],
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.reimbursement.findUnique.mockResolvedValue(claim());
    prisma.purchaseOrderImport.findMany.mockResolvedValue([]);
    prisma.reimbursementReview.findFirst.mockResolvedValue(null);
    prisma.reimbursementReview.create.mockImplementation(async ({ data }: any) => ({
      id: 'review-1',
      ...data,
      createdAt: new Date(),
    }));
    agentConfig.getEnabledDeepSeekRuntimeConfig.mockResolvedValue({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'sk-test',
      requestTimeoutMs: 30000,
    });
  });

  it('模型不可用时退回规则摘要，仍然落库', async () => {
    model.callDeepSeekJson.mockRejectedValue(new Error('timeout'));

    const result = await service.generate('reimb-1', 'admin-1');

    expect(result.riskLevel).toBe('LOW');
    expect(result.summary).toContain('未发现明显异常');
    expect(prisma.reimbursementReview.create).toHaveBeenCalledTimes(1);
  });

  it('没有凭证时规则判高风险，模型摘要被采用', async () => {
    prisma.reimbursement.findUnique.mockResolvedValue(
      claim({ receiptUrls: [] }),
    );
    model.callDeepSeekJson.mockResolvedValue({
      summary: '缺少支付凭证',
      advice: '请退回补充凭证',
    });

    const result = await service.generate('reimb-1', 'admin-1');

    expect(result.riskLevel).toBe('HIGH');
    expect(result.summary).toBe('缺少支付凭证');
    expect(result.advice).toBe('请退回补充凭证');
  });

  it('latest 没有记录时返回 null', async () => {
    prisma.reimbursementReview.findFirst.mockResolvedValue(null);
    await expect(service.latest('reimb-1')).resolves.toBeNull();
  });

  it('建议比报销单旧时视为过期，不再展示', async () => {
    prisma.reimbursementReview.findFirst.mockResolvedValue({
      id: 'review-old',
      reimbursementId: 'reimb-1',
      riskLevel: 'LOW',
      findings: [],
      summary: '旧建议',
      createdAt: new Date('2026-11-01T00:00:00Z'),
      claimUpdatedAt: new Date('2026-11-01T00:00:00Z'),
    });
    prisma.reimbursement.findUnique.mockResolvedValue({
      id: 'reimb-1',
      status: 'PENDING_REVIEW',
      updatedAt: new Date('2026-11-04T00:00:00Z'),
    });

    await expect(service.latest('reimb-1')).resolves.toBeNull();
  });

  it('非待报销状态不允许生成建议', async () => {
    prisma.reimbursement.findUnique.mockResolvedValue({
      id: 'reimb-1',
      status: 'REIMBURSED',
      updatedAt: new Date(),
    });

    await expect(service.generate('reimb-1', 'admin-1')).rejects.toThrow(
      '只有待报销',
    );
  });

  it('模型没读出金额、员工补填，不按 0 元算成巨额改动', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        channel: '盒马',
        orderNo: null,
        incomplete: false,
        rawResult: { items: [{ name: '生菜', lineTotal: null }] },
        lines: [
          {
            lineNo: 1,
            isPersonal: false,
            editedByUser: true,
            lineTotal: 200,
          },
        ],
      },
    ]);
    model.callDeepSeekJson.mockResolvedValue({ summary: '有金额改动' });

    const result = await service.generate('reimb-1', 'admin-1');

    // 没有基准金额 → 只能算「改动」，不能按 200 元的差额判高风险
    expect(result.riskLevel).toBe('MEDIUM');
    const finding = result.findings.find(
      (item: any) => item.code === 'AMOUNT_EDITED_LINES',
    );
    expect(finding.message).toContain('0.00');
  });
});
