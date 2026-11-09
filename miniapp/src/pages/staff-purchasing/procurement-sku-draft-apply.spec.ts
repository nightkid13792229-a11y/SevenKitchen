import { describe, expect, it } from 'vitest';
import { applyDraftToForm } from './procurement-sku-draft-apply';
import type { ProcurementSkuDraft } from './api/purchasing';

const options = { purchaseUnits: ['g', 'kg', '袋', '箱', '盒'] };

const baseDraft: ProcurementSkuDraft = {
  name: '椰汁',
  brand: null,
  productModel: '24×330ml',
  purchaseChannel: '山姆',
  purchaseUnit: '箱',
  packCount: 24,
  netContentPerPack: 330,
  netContentUnitText: '毫升',
  specChain: [
    { count: 24, unit: '瓶' },
    { count: 330, unit: '毫升' },
  ],
  specText: '24×330ml',
  specChainResolved: true,
  netContentSource: 'printed',
  totalNetContentInBase: 7920,
  unitPrice: 3.5,
  missing: [],
  confidence: { purchaseChannel: 'low' },
};

describe('applyDraftToForm', () => {
  it('读到箱规时，计数层填 24 瓶、基准数量填 330', () => {
    const result = applyDraftToForm(baseDraft, options);

    expect(result.patch.specLinks).toEqual([{ count: '24', unit: '瓶' }]);
    expect(result.patch.netContentText).toBe('330');
    expect(result.missing).toEqual([]);
  });

  it('★ 鸡蛋「30枚 1.59kg」：填 30 枚 × 53 克，并标成"折算"', () => {
    const result = applyDraftToForm(
      {
        ...baseDraft,
        purchaseUnit: '盒',
        packCount: 30,
        netContentPerPack: 53,
        netContentUnitText: '克',
        specChain: [
          { count: 30, unit: '枚' },
          { count: 53, unit: '克' },
        ],
        specText: '30枚 1.59kg',
        netContentSource: 'derived',
        totalNetContentInBase: 1590,
      },
      options,
    );

    expect(result.patch.specLinks).toEqual([{ count: '30', unit: '枚' }]);
    expect(result.patch.netContentText).toBe('53');
    expect(result.patch.netContentDerived).toBe(true);
    expect(result.patch.totalNetContentInBase).toBe(1590);
  });

  it('单件商品没有计数层，只填基准数量', () => {
    const result = applyDraftToForm(
      {
        ...baseDraft,
        purchaseUnit: '袋',
        packCount: 1,
        netContentPerPack: 5000,
        specChain: [{ count: 5000, unit: '克' }],
        specText: '净含量 5kg',
        netContentSource: 'printed',
        totalNetContentInBase: 5000,
      },
      options,
    );

    expect(result.patch.specLinks).toEqual([]);
    expect(result.patch.netContentText).toBe('5000');
  });

  it('净含量没读出来时留空，绝不填一个默认重量的坑', () => {
    const result = applyDraftToForm(
      {
        ...baseDraft,
        netContentPerPack: null,
        specChain: [{ count: 30, unit: '枚' }],
        missing: ['netContentPerPack'],
      },
      options,
    );

    expect(result.patch.netContentText).toBe('');
    expect(result.missing).toContain('netContentPerPack');
  });

  it('老后端没有规格链时，退回"件数 + 单件净含量"', () => {
    const result = applyDraftToForm(
      { ...baseDraft, specChain: null, specText: null },
      options,
    );

    expect(result.patch.specLinks).toEqual([{ count: '24', unit: '件' }]);
    expect(result.patch.netContentText).toBe('330');
  });

  it('★ 链折算失败时只灌计数层，重量留空（不把 330ml 当件数）', () => {
    const result = applyDraftToForm(
      {
        ...baseDraft,
        netContentPerPack: null,
        specChain: [{ count: 24, unit: '瓶' }],
        specChainResolved: false,
        missing: ['netContentPerPack', 'packCount'],
      },
      options,
    );

    expect(result.patch.specLinks).toEqual([{ count: '24', unit: '瓶' }]);
    expect(result.patch.netContentText).toBe('');
    expect(result.patch.specChainResolved).toBe(false);
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
