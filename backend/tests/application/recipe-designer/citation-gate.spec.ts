import { citationGatePassed } from '../../../src/application/recipe-designer/agent/citation-judge';

/**
 * 引用门禁（全库计划 Task 2）。
 *
 * 背景：原门禁只看"未引用/无效引用/不支持"，裁判接口失败会被记成
 * not_checkable，而 not_checkable 不拦 —— 裁判一挂，门禁全绿。
 * 这里把"判不了"和"裁判失败"都钉成失败。
 */

const base = {
  uncitedClinicalClaims: 0,
  invalidCitationCount: 0,
  unsupported: 0,
  notCheckable: 0,
  judgeError: null as string | null,
  judgedClaims: 3,
  citedClinicalClaims: 3,
};

describe('citationGatePassed（引用门禁）', () => {
  it('干净引用通过', () => {
    expect(citationGatePassed(base)).toBe(true);
  });

  it('有判不了的结论不通过', () => {
    expect(citationGatePassed({ ...base, notCheckable: 1 })).toBe(false);
  });

  it('裁判接口失败不通过', () => {
    expect(citationGatePassed({ ...base, judgeError: 'timeout' })).toBe(false);
  });

  it('unsupported 仍不通过', () => {
    expect(citationGatePassed({ ...base, unsupported: 1 })).toBe(false);
  });

  it('未引用临床结论仍不通过', () => {
    expect(citationGatePassed({ ...base, uncitedClinicalClaims: 1 })).toBe(false);
  });
});
