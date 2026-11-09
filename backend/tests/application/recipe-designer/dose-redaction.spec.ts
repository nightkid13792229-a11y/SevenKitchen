import { redactDrugDoses } from '../../../src/application/recipe-designer/agent/dose-redaction';

describe('redactDrugDoses', () => {
  it('去掉 mg/kg 剂量', () => {
    const result = redactDrugDoses('磷结合剂起始 30–60 mg/kg/天分次拌食。');
    expect(result.text).toContain('按兽医处方');
    expect(result.text).not.toContain('mg/kg');
    expect(result.redactions).toBe(1);
  });

  it('去掉每日/每次剂量', () => {
    expect(redactDrugDoses('每日 10 mg 口服。').text).not.toContain('10 mg');
    expect(redactDrugDoses('每次 5 ml，一天两次。').text).not.toContain('5 ml');
  });

  it('营养目标与血清口径不动', () => {
    const text = '膳食磷 0.2–0.5% DM；血磷 <4.6 mg/dl；钙 1.25 g/1000kcal。';
    const result = redactDrugDoses(text);
    expect(result.text).toBe(text);
    expect(result.redactions).toBe(0);
  });

  it('只说"不涉及剂量"不动', () => {
    const text = '本食谱不涉及药物剂量，用药按兽医处方。';
    expect(redactDrugDoses(text).redactions).toBe(0);
  });
});
