import {
  parseSupplementLabel,
  extractServingUnits,
  toCanonicalFieldPath
} from '../../../src/domain/ingredient/supplement-label-parser';

/**
 * 补剂标签解析。
 *
 * 底下这段是**真实抓下来的 iHerb 成分表**（北欧 Naturals 儿童 DHA），
 * 不是编的例子——排版里的星号、†、♢、紧跟数字的百分号都是页面原样。
 * 解析器只要扛住这一段，就能扛住绝大部分 iHerb 商品页。
 */
const REAL_IHERB_LABEL = `**Supplement facts**
**Serving Size:** 4 Soft Gels
**Servings Per Container:**22
**Amount Per Serving****%DV 1*****%DV 2****
Calories 10
Total Fat 1 g 3%1%
Cholesterol 5 mg 2%2%
Total Omega-3s♢250 mg††
EPA (Eicosapentaenoic Acid)80 mg††
DHA (Docosahexaenoic Acid)120 mg††
*Percent Daily Values are based on a 1,000 calorie diet.  
†Daily Value not established.  
♢Includes EPA, DHA, and Other Omega-3s.`;

describe('parseSupplementLabel', () => {
  it('从真实页面里读出每份几粒', () => {
    expect(extractServingUnits(REAL_IHERB_LABEL)).toBe(4);
  });

  it('EPA / DHA 认成规范字段，数值单位都对', () => {
    const result = parseSupplementLabel(REAL_IHERB_LABEL);
    expect(result.nutrients).toEqual(
      expect.arrayContaining([
        { fieldPath: 'fattyAcids.epa', value: 80, unit: 'mg', rawName: 'EPA (Eicosapentaenoic Acid)' },
        { fieldPath: 'fattyAcids.dha', value: 120, unit: 'mg', rawName: 'DHA (Docosahexaenoic Acid)' },
      ]),
    );
  });

  it('百分号和 † 不会混进数值', () => {
    const result = parseSupplementLabel(REAL_IHERB_LABEL);
    const fat = result.nutrients.find((item) => item.fieldPath === 'macros.crudeFat');
    expect(fat?.value).toBe(1);
    expect(fat?.unit).toBe('g');
  });

  it('认不出的行照样列出来，不静默丢掉', () => {
    const result = parseSupplementLabel(REAL_IHERB_LABEL);
    expect(result.unrecognized).toContain('Total Omega-3s');
    expect(result.unrecognized).toContain('Cholesterol');
  });

  it('没有成分表的页面返回空结果，不硬猜', () => {
    const result = parseSupplementLabel('这是一段商品描述，没有成分表。');
    expect(result.nutrients).toEqual([]);
    expect(result.unrecognized).toEqual([]);
  });

  it('每份几粒读不出来时为 null，不默认成 1', () => {
    expect(extractServingUnits('**Supplement facts**\nCalories 10')).toBeNull();
  });
});

describe('toCanonicalFieldPath', () => {
  it('大小写、括号、连字符都不影响', () => {
    expect(toCanonicalFieldPath('Vitamin B-12 (Cyanocobalamin)')).toBe('vitamins.vitaminB12');
    expect(toCanonicalFieldPath('zinc')).toBe('minerals.zinc');
    expect(toCanonicalFieldPath('Alpha-Linolenic Acid')).toBe('fattyAcids.alphaLinolenicAcid');
  });

  it('认不出就返回 null，不硬套', () => {
    expect(toCanonicalFieldPath('Proprietary Blend')).toBeNull();
  });
});
