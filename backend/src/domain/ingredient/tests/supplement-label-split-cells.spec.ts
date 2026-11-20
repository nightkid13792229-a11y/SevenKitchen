import { parseSupplementLabel } from '../supplement-label-parser';

/**
 * 视觉模型常把表格拆成「名字一行、数值下一行」，或直接吐 markdown 表格。
 * 这两种形态都必须能解析——Swanson Ferrochel 铁那次就是这么挂的。
 */
describe('parseSupplementLabel · 非典型表格结构', () => {
  it('名字一行、数值下一行', () => {
    const text = `SupplementFacts
Serving Size 1 Capsule
Amount Per Serving
% Daily Value
Iron
18 mg
100%
Other ingredients: rice flour`;
    expect(parseSupplementLabel(text).nutrients).toEqual([
      { fieldPath: 'minerals.iron', value: 18, unit: 'mg', rawName: 'Iron' },
    ]);
  });

  it('markdown 表格', () => {
    const text = `Supplement Facts
| Amount Per Serving | % Daily Value |
| Iron | 18 mg | 100% |`;
    expect(parseSupplementLabel(text).nutrients).toEqual([
      { fieldPath: 'minerals.iron', value: 18, unit: 'mg', rawName: 'Iron' },
    ]);
  });

  it('markdown 列表星号不会被当成脚注（线上踩过）', () => {
    const text = `*   **Supplement Facts**
*   Serving Size 1 Capsule
*   Amount Per Serving
*   % Daily Value
*   Iron 18 mg 100%
*   (from Ferrochel® ferrous bisglycinate chelate)`;
    expect(parseSupplementLabel(text).nutrients).toEqual([
      { fieldPath: 'minerals.iron', value: 18, unit: 'mg', rawName: 'Iron' },
    ]);
  });

  it('中文标签与中文单位', () => {
    const text = `营养成分表
每份 1 粒
铁 18 毫克 100%`;
    expect(parseSupplementLabel(text).nutrients).toEqual([
      { fieldPath: 'minerals.iron', value: 18, unit: 'mg', rawName: '铁' },
    ]);
  });
});
