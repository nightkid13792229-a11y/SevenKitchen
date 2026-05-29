import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('life-stage warning page integration', () => {
  const diySource = readFileSync(resolve(__dirname, './recipe-diy/index.vue'), 'utf8');
  const orderSource = readFileSync(resolve(__dirname, './recipe-order/index.vue'), 'utf8');

  it('uses the same reminder copy in DIY and order pages', () => {
    expect(diySource).toContain('生命阶段提醒');
    expect(orderSource).toContain('生命阶段提醒');
    expect(diySource).toContain('{{ lifeStageReminderText }}');
    expect(orderSource).toContain('{{ lifeStageReminderText }}');
    expect(diySource).toContain('我已知晓');
    expect(orderSource).toContain('我已知晓');
  });

  it('does not only display the first applicable life stage', () => {
    expect(diySource).not.toContain('applicableLifeStages[0]');
    expect(orderSource).not.toContain('applicableLifeStages[0]');
  });

  it('routes both pages through the shared life-stage match helper', () => {
    expect(diySource).toContain('../../utils/life-stage-match');
    expect(orderSource).toContain('../../utils/life-stage-match');
    expect(diySource).toContain('resolveDogRecipeLifeStage');
    expect(orderSource).toContain('resolveDogRecipeLifeStage');
    expect(diySource).toContain('selectedDogRecipeLifeStage');
    expect(orderSource).toContain('selectedDogRecipeLifeStage');
    expect(diySource).toContain('isRecipeLifeStageMatch(');
    expect(orderSource).toContain('isRecipeLifeStageMatch(');
  });

  it('confirms mismatched life stage before entering checkout', () => {
    expect(orderSource).toContain('当前狗狗生命阶段与食谱适用阶段不一致，仍要继续下单吗？');
  });
});
