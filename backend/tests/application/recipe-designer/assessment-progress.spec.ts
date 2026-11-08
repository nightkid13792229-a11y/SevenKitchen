import { assessmentGapSignature } from '../../../src/application/recipe-designer/agent/assessment-progress';

describe('assessmentGapSignature', () => {
  it('缺口 key/状态/数值都相同时签名相同', () => {
    const a = assessmentGapSignature({
      data: {
        isCompliant: false,
        gaps: [{ key: 'phosphorus', status: 'DEFICIENT', value: 0.63, min: 1, max: 4 }],
      },
    });
    const b = assessmentGapSignature({
      data: {
        isCompliant: false,
        gaps: [{ key: 'phosphorus', status: 'DEFICIENT', value: 0.634, min: 1, max: 4 }],
      },
    });
    expect(a).toBe(b);
  });

  it('缺口数值明显变化时签名不同', () => {
    const a = assessmentGapSignature({
      data: {
        isCompliant: false,
        gaps: [{ key: 'phosphorus', status: 'DEFICIENT', value: 0.63, min: 1, max: 4 }],
      },
    });
    const b = assessmentGapSignature({
      data: {
        isCompliant: false,
        gaps: [{ key: 'phosphorus', status: 'DEFICIENT', value: 0.9, min: 1, max: 4 }],
      },
    });
    expect(a).not.toBe(b);
  });

  it('达标或没有缺口返回可识别值', () => {
    expect(
      assessmentGapSignature({ data: { isCompliant: true, gaps: [] } }),
    ).toBe('compliant');
    expect(
      assessmentGapSignature({ data: { isCompliant: false, gaps: [] } }),
    ).toBeNull();
  });
});
