import { extractServingSize } from '../supplement-label-parser';

describe('extractServingSize', () => {
  it('胶囊看个数', () => {
    expect(extractServingSize('Serving Size 1 Capsule')).toEqual({
      count: 1,
      grams: null,
      milliliters: null,
    });
  });

  it('粉剂看克（括号里的重量）', () => {
    const size = extractServingSize('Serving Size 1 Level Scoop (3 g)');
    expect(size.grams).toBe(3);
    expect(size.count).toBe(1);
  });

  it('粉剂看克（克数写在前面）', () => {
    expect(extractServingSize('Serving Size 2.5 g (1 scoop)').grams).toBe(2.5);
  });

  it('液体看毫升', () => {
    expect(extractServingSize('Serving Size 1 Teaspoon (5 ml)').milliliters).toBe(5);
  });

  it('中文标签', () => {
    expect(extractServingSize('每份 3 克').grams).toBe(3);
  });

  it('没写就返回 null，不回落到 1', () => {
    expect(extractServingSize('Serving Size 1 Scoop').grams).toBeNull();
  });
});
