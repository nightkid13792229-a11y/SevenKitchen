import {
  detectQueryDomains,
  domainRoutingBoost,
} from '../../../src/domain/knowledge/domain-routing';

describe('detectQueryDomains', () => {
  it('英文 CKD 查询', () => {
    expect(detectQueryDomains('CKD dog dietary phosphorus')).toEqual(['ckd']);
  });

  it('中文肾病查询', () => {
    expect(detectQueryDomains('慢性肾病犬的蛋白尿怎么办')).toEqual(['ckd']);
  });

  it('胃肠查询', () => {
    expect(detectQueryDomains('dog chronic diarrhea fiber')).toEqual(['gi']);
  });

  it('普通配方查询不路由', () => {
    expect(detectQueryDomains('chicken breast recipe for adult dog')).toEqual([]);
  });

  it('多个领域同时命中', () => {
    expect(detectQueryDomains('CKD dog with arthritis')).toEqual(['ckd', 'oa']);
  });
});

describe('domainRoutingBoost', () => {
  const CKD_DOC = 'sacn5-chapters-SACN5-37';
  const NUTRITION_DOC = 'aaha-AAHA-2010-Nutritional-Assessment-Guidelines';
  const UNMAPPED = 'aaha-AAHA-2019-Dental-Care-Guidelines';

  it('CKD 查询给 CKD 文档加成', () => {
    expect(domainRoutingBoost('CKD dog phosphorus', CKD_DOC)).toBe(1.4);
  });

  it('CKD 查询给其他已知领域降权', () => {
    expect(domainRoutingBoost('CKD dog phosphorus', NUTRITION_DOC)).toBe(0.9);
  });

  it('未映射文档保持中性', () => {
    expect(domainRoutingBoost('CKD dog phosphorus', UNMAPPED)).toBe(1);
  });

  it('没有领域信号时不干预', () => {
    expect(domainRoutingBoost('chicken recipe', CKD_DOC)).toBe(1);
  });
});
