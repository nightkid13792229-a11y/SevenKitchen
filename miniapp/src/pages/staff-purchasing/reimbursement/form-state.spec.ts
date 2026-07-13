import { describe, expect, it } from 'vitest';
import {
  calculateReimbursementTotal,
  getPurchaseListKindLabel,
  normalizeOperatingExpenseFees,
  validateReimbursementStep,
  type ReimbursementFlowStep,
} from './form-state';

describe('reimbursement form state', () => {
  it('calculates purchase, platform, and operating fee totals', () => {
    const total = calculateReimbursementTotal({
      purchaseLists: [
        { id: 'list-1', totalActualCost: 120, totalEstimatedCost: 100 },
        { id: 'list-2', totalEstimatedCost: 80 },
      ],
      selectedListIds: ['list-1', 'list-2'],
      platformShippingFee: '12.5',
      platformPackagingFee: '3.5',
      customFees: [
        { category: 'RENT', description: '6月房租', amount: '200' },
        { category: 'UTILITIES', description: '6月水电', amount: '50' },
      ],
    });

    expect(total).toBe(466);
  });

  it('drops blank operating rows and normalizes valid fees', () => {
    const result = normalizeOperatingExpenseFees([
      { category: 'RENT', description: '', amount: '200' },
      { category: 'OTHER', description: '临时停车费', amount: '30.5' },
      { category: 'TOOLS', description: '', amount: '' },
    ]);

    expect(result.ok).toBe(true);
    expect(result.fees).toEqual([
      { category: 'RENT', description: '房租', amount: 200 },
      { category: 'OTHER', description: '临时停车费', amount: 30.5 },
    ]);
  });

  it('rejects invalid operating fee rows', () => {
    expect(
      normalizeOperatingExpenseFees([
        { category: 'TOOLS', description: '剪刀', amount: '0' },
      ]),
    ).toEqual({
      ok: false,
      message: '经营费用金额需大于0',
      fees: [],
    });

    expect(
      normalizeOperatingExpenseFees([
        { category: 'OTHER', description: '', amount: '12' },
      ]),
    ).toEqual({
      ok: false,
      message: '其它费用请补充说明',
      fees: [],
    });
  });

  it('validates each reimbursement wizard step', () => {
    const assertInvalid = (
      step: ReimbursementFlowStep,
      message: string,
      overrides: Parameters<typeof validateReimbursementStep>[0] = {},
    ) => {
      expect(validateReimbursementStep({ currentStep: step, ...overrides })).toEqual({
        ok: false,
        message,
      });
    };

    assertInvalid('TYPE', '请选择报销类型');
    assertInvalid('PURCHASE_DETAILS', '请选择至少一张采购清单', {
      flowType: 'PURCHASE',
    });
    assertInvalid('OPERATING_DETAILS', '请至少填写一项经营费用', {
      flowType: 'OPERATING',
      customFees: [{ category: 'OTHER', description: '', amount: '' }],
    });
    assertInvalid('RECEIPTS', '请上传支付凭证', {
      flowType: 'OPERATING',
      customFees: [{ category: 'RENT', description: '', amount: '200' }],
    });

    expect(
      validateReimbursementStep({
        currentStep: 'PURCHASE_DETAILS',
        flowType: 'PURCHASE',
        selectedListIds: ['list-1'],
        purchaseLists: [{ id: 'list-1' }],
      }),
    ).toEqual({ ok: true });
    expect(
      validateReimbursementStep({
        currentStep: 'OPERATING_DETAILS',
        flowType: 'OPERATING',
        customFees: [{ category: 'RENT', description: '', amount: '200' }],
      }),
    ).toEqual({ ok: true });
    expect(
      validateReimbursementStep({
        currentStep: 'RECEIPTS',
        flowType: 'PURCHASE',
        selectedListIds: ['list-1'],
        receiptUrls: [{ url: 'https://example.com/receipt.jpg' }],
      }),
    ).toEqual({ ok: true });
  });

  it('rejects selected purchase list ids without loaded list data', () => {
    expect(
      validateReimbursementStep({
        currentStep: 'PURCHASE_DETAILS',
        flowType: 'PURCHASE',
        selectedListIds: ['missing-list'],
        purchaseLists: [{ id: 'list-1' }],
      }),
    ).toEqual({
      ok: false,
      message: '采购清单数据未加载，请重新进入报销',
    });
  });

  it('labels daily, replenishment, and packaging purchase lists', () => {
    expect(getPurchaseListKindLabel({ kind: 'ORDER_DEMAND', items: [] })).toBe(
      '日采',
    );
    expect(
      getPurchaseListKindLabel({ kind: 'STOCK_REPLENISHMENT', items: [] }),
    ).toBe('补货');
    expect(
      getPurchaseListKindLabel({
        kind: 'STOCK_REPLENISHMENT',
        items: [{ type: 'PACKAGING' }],
      }),
    ).toBe('包材');
  });
});
