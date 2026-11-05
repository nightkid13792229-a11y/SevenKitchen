import {
  buildFallbackSummary,
  evaluateReimbursement,
  type ReviewClaimInput,
} from '../../../src/application/purchasing/reimbursement-review.rules';

const base = (overrides: Partial<ReviewClaimInput> = {}): ReviewClaimInput => ({
  claimNumber: 'BX202611040001',
  totalActualCost: 32.46,
  voucherAmount: 134.86,
  differenceAmount: 102.4,
  differenceNote: '含个人采购 ¥102.40',
  receiptCount: 1,
  hasPaymentProof: false,
  records: [
    {
      id: 'r1',
      ingredientName: '生菜',
      procurementSkuName: '生菜 500g/袋',
      actualCost: 31.46,
      hasSourceImport: true,
    },
  ],
  imports: [
    {
      channel: '盒马',
      orderNo: '512738841924500221',
      incomplete: false,
      amountDiff: 0,
      personalAmount: 102.4,
      matchEditedLines: 0,
      amountEditedLines: 0,
      maxAmountDelta: 0,
    },
  ],
  listKinds: ['ORDER_DEMAND'],
  ...overrides,
});

describe('evaluateReimbursement', () => {
  it('金额、凭证、截图都正常 → 低风险', () => {
    const result = evaluateReimbursement(base());
    expect(result.riskLevel).toBe('LOW');
    expect(result.findings.some((item) => item.code === 'PERSONAL_ITEMS')).toBe(true);
  });

  it('没有凭证 → 高风险', () => {
    const result = evaluateReimbursement(base({ receiptCount: 0 }));
    expect(result.riskLevel).toBe('HIGH');
    expect(result.findings.map((item) => item.code)).toContain('NO_RECEIPT');
  });

  it('截图不完整（员工确认后生成）→ 只提示中风险，不直接判高风险', () => {
    const result = evaluateReimbursement(
      base({ imports: [{ ...base().imports[0], incomplete: true }] }),
    );
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.findings[0].code).toBe('INCOMPLETE_SCREENSHOT');
  });

  it('商品金额与各行合计有差额 → 中风险提示并写明差额', () => {
    const result = evaluateReimbursement(
      base({ imports: [{ ...base().imports[0], amountDiff: 1 }] }),
    );
    expect(result.riskLevel).toBe('MEDIUM');
    const finding = result.findings.find((item) => item.code === 'AMOUNT_DIFF');
    expect(finding?.message).toContain('1.00');
  });

  it('只是换原料/标个人 → 只提示，不升风险', () => {
    const result = evaluateReimbursement(
      base({ imports: [{ ...base().imports[0], matchEditedLines: 3 }] }),
    );
    expect(result.riskLevel).toBe('LOW');
    expect(result.findings.some((item) => item.code === 'MATCH_EDITED_LINES')).toBe(true);
  });

  it('金额被改 → 中风险并给出最大差额', () => {
    const result = evaluateReimbursement(
      base({
        imports: [
          {
            ...base().imports[0],
            amountEditedLines: 1,
            maxAmountDelta: 8.5,
          },
        ],
      }),
    );
    expect(result.riskLevel).toBe('MEDIUM');
    expect(result.findings.some((item) => item.code === 'AMOUNT_EDITED_LINES')).toBe(true);
  });

  it('金额改动超过 100 元 → 高风险', () => {
    const result = evaluateReimbursement(
      base({
        imports: [
          {
            ...base().imports[0],
            amountEditedLines: 1,
            maxAmountDelta: 120,
          },
        ],
      }),
    );
    expect(result.riskLevel).toBe('HIGH');
  });

  it('个人采购金额大于凭证差额 → 高风险（防多报）', () => {
    const result = evaluateReimbursement(
      base({
        differenceAmount: 30,
        imports: [{ ...base().imports[0], personalAmount: 102.4 }],
      }),
    );
    expect(result.riskLevel).toBe('HIGH');
    expect(result.findings.some((item) => item.code === 'PERSONAL_EXCEEDS_DIFFERENCE')).toBe(true);
  });

  it('个人采购有金额但没差额说明 → 提醒', () => {
    const result = evaluateReimbursement(
      base({ differenceNote: '' }),
    );
    expect(result.findings.some((item) => item.code === 'PERSONAL_WITHOUT_NOTE')).toBe(true);
  });

  it('有差额但没标个人 → 中风险', () => {
    const result = evaluateReimbursement(
      base({
        imports: [{ ...base().imports[0], personalAmount: 0 }],
      }),
    );
    expect(result.findings.some((item) => item.code === 'DIFFERENCE_WITHOUT_PERSONAL')).toBe(true);
    expect(result.riskLevel).toBe('MEDIUM');
  });

  it('凭证金额小于报销金额 → 高风险', () => {
    const result = evaluateReimbursement(base({ voucherAmount: 10 }));
    expect(result.riskLevel).toBe('HIGH');
    expect(result.findings.some((item) => item.code === 'VOUCHER_LESS_THAN_CLAIM')).toBe(true);
  });

  it('同一订单号重复 → 提醒', () => {
    const second = { ...base().imports[0], channel: '盒马' };
    const result = evaluateReimbursement(
      base({ imports: [base().imports[0], second] }),
    );
    expect(result.findings.some((item) => item.code === 'DUPLICATE_ORDER')).toBe(true);
  });

  it('兜底摘要覆盖三档风险', () => {
    const low = evaluateReimbursement(base());
    expect(buildFallbackSummary(low)).toContain('未发现明显异常');

    const medium = evaluateReimbursement(
      base({
        imports: [
          {
            ...base().imports[0],
            amountEditedLines: 1,
            maxAmountDelta: 5,
          },
        ],
      }),
    );
    expect(buildFallbackSummary(medium)).toContain('建议复核');

    const high = evaluateReimbursement(base({ receiptCount: 0 }));
    expect(buildFallbackSummary(high)).toContain('必须处理');
  });
});
