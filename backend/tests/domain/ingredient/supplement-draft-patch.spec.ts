import {
  applyDraftPatch,
  SUPPLEMENT_DRAFT_FIELDS
} from '../../../src/domain/ingredient/supplement-draft-patch';

/**
 * 草稿写入工具。
 *
 * 这里不判断"该不该写形态"，只判断"能不能写"：字段真不真、值像不像话。
 * 业务门禁在提交那一步，不在这儿——所以用例也别拿流程来说事。
 */
const draft = { name: '', servingUnitsPerDose: 2 };

describe('能写的字段', () => {
  it('正常一批字段全部写进去', () => {
    const result = applyDraftPatch(draft, {
      brand: 'NOW Foods',
      purchaseToBaseRatio: 120,
      currentPricePerPurchaseUnit: 92.79,
      labelCategory: 'FEED_ADDITIVE'
    });

    expect(result.applied.sort()).toEqual([
      'brand',
      'currentPricePerPurchaseUnit',
      'labelCategory',
      'purchaseToBaseRatio'
    ]);
    expect(result.draft.brand).toBe('NOW Foods');
    expect(result.rejected).toEqual([]);
  });

  it('营养档案按字段路径合并，不清掉其它项', () => {
    const result = applyDraftPatch(
      { ...draft, servingNutrients: { 'minerals.zinc': 15 } },
      { servingNutrients: { 'fattyAcids.epa': 325 } }
    );

    expect(result.draft.servingNutrients).toEqual({
      'minerals.zinc': 15,
      'fattyAcids.epa': 325
    });
    expect(result.applied).toContain('servingNutrients.fattyAcids.epa');
  });

  it('没写的字段保持原样', () => {
    expect(applyDraftPatch(draft, { brand: 'X' }).draft.servingUnitsPerDose).toBe(2);
  });
});

describe('写不进去的字段', () => {
  it('草稿里没有这个字段 → 拒绝并说明', () => {
    const result = applyDraftPatch(draft, { formQuality: 'good' });
    expect(result.rejected[0]).toEqual({
      field: 'formQuality',
      reason: '草稿里没有这个字段'
    });
    expect(result.draft.formQuality).toBeUndefined();
  });

  it('类型不对 → 拒绝（数字写成字符串）', () => {
    const result = applyDraftPatch(draft, { purchaseToBaseRatio: '120' });
    expect(result.rejected[0].reason).toContain('数字');
  });

  it('超出范围 → 拒绝（每份 99 粒）', () => {
    const result = applyDraftPatch(draft, { servingUnitsPerDose: 99 });
    expect(result.rejected[0].reason).toContain('不能大于');
  });

  it('枚举乱填 → 拒绝', () => {
    const result = applyDraftPatch(draft, { physicalForm: 'CHEWABLE' });
    expect(result.rejected[0].reason).toContain('只能取');
  });

  it('人必须自己定的两格，模型写不了（否则提交闸门被架空）', () => {
    for (const field of ['tagNames', 'addTiming']) {
      const result = applyDraftPatch(draft, { [field]: field === 'tagNames' ? ['锌'] : 'BEFORE_MIXING' });
      expect(result.rejected[0]).toEqual({ field, reason: '草稿里没有这个字段' });
    }
  });

  it('表单里没有开关的两格，模型也写不了（写了会骗用户说已开启）', () => {
    for (const field of ['diyEnabled', 'procurementEnabled']) {
      const result = applyDraftPatch(draft, { [field]: true });
      expect(result.rejected[0]).toEqual({ field, reason: '草稿里没有这个字段' });
    }
  });

  it('营养字段路径不认识 → 拒绝，那一项不写', () => {
    const result = applyDraftPatch(draft, {
      servingNutrients: { 'minerals.unobtainium': 1, 'minerals.zinc': 15 }
    });
    expect(result.rejected[0].field).toBe('servingNutrients.minerals.unobtainium');
    expect(result.draft.servingNutrients).toEqual({ 'minerals.zinc': 15 });
  });

  it('一条坏字段不拖累整批：其余照写', () => {
    const result = applyDraftPatch(draft, { brand: 'NOW Foods', purchaseToBaseRatio: 'x' });
    expect(result.draft.brand).toBe('NOW Foods');
    expect(result.rejected).toHaveLength(1);
  });

  it('空字符串不算有效值', () => {
    expect(applyDraftPatch(draft, { brand: '   ' }).rejected[0].reason).toContain('不能为空');
  });
});

describe('字段表本身', () => {
  it('每个字段都有类型，且没有重复定义', () => {
    for (const [field, rule] of Object.entries(SUPPLEMENT_DRAFT_FIELDS)) {
      expect(rule.kind).toBeTruthy();
      expect(field.trim()).toBe(field);
    }
  });

  it('每份粒数与损耗率的范围跟界面一致', () => {
    expect(SUPPLEMENT_DRAFT_FIELDS.servingUnitsPerDose).toMatchObject({ min: 1, max: 20 });
    expect(SUPPLEMENT_DRAFT_FIELDS.productionLossRate).toMatchObject({ min: 1, max: 2 });
  });
});
