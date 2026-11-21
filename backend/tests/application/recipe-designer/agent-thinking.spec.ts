import { shouldEnableThinking } from '../../../src/application/recipe-designer/agent/recipe-agent.service';

describe('思考模式按阶段/决策点开关', () => {
  const original = process.env.RECIPE_AGENT_THINKING;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RECIPE_AGENT_THINKING;
    } else {
      process.env.RECIPE_AGENT_THINKING = original;
    }
  });

  it('PLAN 开，SELECT 关', () => {
    process.env.RECIPE_AGENT_THINKING = 'stage';
    expect(shouldEnableThinking('PLAN', 0, false, 0)).toBe(true);
    expect(shouldEnableThinking('SELECT', 0, false, 0)).toBe(false);
  });

  it('DESIGN 第一轮/刚有评估缺口/连续改多次时开，机械工具调用时关', () => {
    process.env.RECIPE_AGENT_THINKING = 'stage';
    expect(shouldEnableThinking('DESIGN', 0, false, 0)).toBe(true);
    expect(shouldEnableThinking('DESIGN', 2, false, 0)).toBe(false);
    expect(shouldEnableThinking('DESIGN', 2, true, 0)).toBe(true);
    expect(shouldEnableThinking('DESIGN', 2, false, 8)).toBe(true);
  });

  it('RECIPE_AGENT_THINKING=off 时全关', () => {
    process.env.RECIPE_AGENT_THINKING = 'off';
    expect(shouldEnableThinking('PLAN', 0, true, 20)).toBe(false);
    expect(shouldEnableThinking('DESIGN', 0, true, 20)).toBe(false);
  });
});
