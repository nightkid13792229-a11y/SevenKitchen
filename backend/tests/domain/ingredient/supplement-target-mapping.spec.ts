import { inferSupplementTargetFieldFromIngredientName } from '../../../src/domain/ingredient/supplement-target-mapping';

describe('inferSupplementTargetFieldFromIngredientName', () => {
  it.each([
    ['葡萄糖酸锌', 'minerals.zinc'],
    ['双甘氨酸亚铁', 'minerals.iron'],
    ['双甘氨酸铜', 'minerals.copper'],
    ['胆碱', 'vitamins.choline'],
    ['牛磺酸', 'aminoAcids.taurine'],
    ['海带粉', 'minerals.iodine'],
    ['海带片', 'minerals.iodine'],
    ['海藻粉', 'minerals.iodine'],
    ['碳酸钙粉', 'minerals.calcium'],
    ['鸡蛋壳粉', 'minerals.calcium'],
  ])('按清理后的物质名 %s 认出目标营养素', (name, fieldPath) => {
    expect(inferSupplementTargetFieldFromIngredientName(name)?.fieldPath).toBe(
      fieldPath,
    );
  });

  it.each([
    ['葡萄糖酸锌片', 'minerals.zinc'],
    ['双甘氨酸亚铁胶囊', 'minerals.iron'],
    ['双甘氨酸铜片', 'minerals.copper'],
    ['胆碱片', 'vitamins.choline'],
    ['牛磺酸胶囊', 'aminoAcids.taurine'],
  ])('旧名字 %s 仍然认得（历史快照兼容）', (name, fieldPath) => {
    expect(inferSupplementTargetFieldFromIngredientName(name)?.fieldPath).toBe(
      fieldPath,
    );
  });

  it('认不出的名称返回 null', () => {
    expect(inferSupplementTargetFieldFromIngredientName('鱼油')).toBeNull();
    expect(inferSupplementTargetFieldFromIngredientName('')).toBeNull();
  });
});
