import {
  planRevisionUpdate,
  selectionSubmissionUpdate,
} from '../../../src/application/recipe-designer/agent/session-state';
import type {
  AgentNutritionPlan,
  AgentSelection,
} from '../../../src/application/recipe-designer/agent/propose-plan';

describe('Agent 阶段修订状态', () => {
  it('模型自带的 confirmed 不会把选材推进到 DESIGN', () => {
    const selection: AgentSelection = {
      summary: '鸭肉 + 南瓜',
      items: [],
      confirmed: true,
    };

    const update = selectionSubmissionUpdate(selection);

    expect(update.phase).toBe('SELECT');
    expect(update.selectionConfirmedAt).toBeNull();
    expect(update.status).toBe('WAITING_USER');
    expect(update.selection).not.toHaveProperty('confirmed');
  });

  it('方案修订只更新方案，不清空选材、不退回阶段', () => {
    const plan: AgentNutritionPlan = {
      summary: '低脂维持',
      constraints: [],
      nonNutrient: [],
    };

    const update = planRevisionUpdate(plan);

    expect(update.plan).toBe(plan);
    expect(update.planConfirmedAt).toBeNull();
    expect(update.status).toBe('WAITING_USER');
    expect(update.endedAt).toBeInstanceOf(Date);
    expect(update).not.toHaveProperty('phase');
    expect(update).not.toHaveProperty('selection');
    expect(update).not.toHaveProperty('selectionConfirmedAt');
  });
});
