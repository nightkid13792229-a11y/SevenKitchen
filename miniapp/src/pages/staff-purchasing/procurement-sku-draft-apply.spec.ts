import { describe, expect, it } from 'vitest';
import { applyDraftToForm } from './procurement-sku-draft-apply';

const options = { purchaseUnits: ['g', 'kg', '袋', '箱'] };

const baseDraft = {
  name: '椰汁',
  brand: null,
  productModel: null,
  purchaseChannel: '山姆',
  purchaseUnit: '箱',
  packCount: 24,
  netContentPerPack: 330,
  netContentUnitText: 'ml',
  unitPrice: 3.5,
  missing: [] as string[],
  confidence: { purchaseChannel: 'low' as const },
};

describe('applyDraftToForm', () => {
  it('读到箱规时填 24 和 330', () => {
    const result = applyDraftToForm(baseDraft, options);

    expect(result.patch.packCountText).toBe('24');
    expect(result.patch.netContentText).toBe('330');
    expect(result.missing).toEqual([]);
  });

  it('箱规没读出来时，件数必须清空并标红，绝不能留默认的 1', () => {
    const result = applyDraftToForm(
      { ...baseDraft, packCount: null, missing: ['packCount'] },
      options,
    );

    expect(result.patch.packCountText).toBe('');
    expect(result.missing).toContain('packCount');
  });

  it('采购单位不在白名单里时不套用（免得保存被服务端拒）', () => {
    const result = applyDraftToForm(
      { ...baseDraft, purchaseUnit: '提' },
      options,
    );

    expect(result.patch.purchaseUnit).toBeUndefined();
  });

  it('没认出来的字段保持原值不动，只报告', () => {
    const result = applyDraftToForm(
      { ...baseDraft, name: null, missing: ['name'] },
      options,
    );

    expect(result.patch.name).toBeUndefined();
    expect(result.missing).toContain('name');
  });

  it('低置信度的字段带上标记，界面显示"AI 推测·可改"', () => {
    const result = applyDraftToForm(baseDraft, options);

    expect(result.confidence.purchaseChannel).toBe('low');
  });
});
