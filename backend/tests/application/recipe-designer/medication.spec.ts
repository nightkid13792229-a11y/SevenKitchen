import {
  isMedicationItem,
  stripMedicationSentences,
} from '../../../src/application/recipe-designer/agent/medication';

describe('medication-free plan text', () => {
  it('removes medication sentences but keeps nutrition content', () => {
    const text =
      '低脂、限钠、抗炎优先。用药按兽医处方，溃速平与潘飞龙不调整剂量。每日 3 餐，少量多餐。';
    expect(stripMedicationSentences(text)).toBe(
      '低脂、限钠、抗炎优先。每日 3 餐，少量多餐。',
    );
  });

  it('identifies medication non-nutrient items', () => {
    expect(
      isMedicationItem({ key: 'medication', label: '用药', value: '按处方' }),
    ).toBe(true);
    expect(
      isMedicationItem({ key: 'texture', label: '质地', value: '肉泥' }),
    ).toBe(false);
  });
});
