import { RecipeAgentService } from '../../../src/application/recipe-designer/agent/recipe-agent.service';
import { buildSessionStateMessages } from '../../../src/application/recipe-designer/agent/session-state';
import type { AgentNutritionPlan, AgentSelection } from '../../../src/application/recipe-designer/agent/propose-plan';

function plan(summary = '低脂维持'): AgentNutritionPlan {
  return {
    summary,
    constraints: [],
    nonNutrient: [],
  };
}

function selection(summary = '鸭肉 + 南瓜'): AgentSelection {
  return {
    summary,
    items: [
      {
        kind: 'FOOD',
        name: '鸭胸肉',
        reason: '低脂',
        dataStatus: 'AVAILABLE',
      },
    ],
  };
}

describe('Agent 会话状态上下文', () => {
  it('未确认的方案也要注入，并告诉模型在此基础上改', () => {
    const messages = buildSessionStateMessages({
      plan: plan(),
      planConfirmedAt: null,
      selection: null,
      selectionConfirmedAt: null,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('当前待确认营养方案');
    expect(messages[0]?.content).toContain('低脂维持');
    expect(messages[0]?.content).toContain('不要重造方案');
  });

  it('已确认方案保持原来的“已确认”文案', () => {
    const messages = buildSessionStateMessages({
      plan: plan(),
      planConfirmedAt: new Date(),
      selection: null,
      selectionConfirmedAt: null,
    });

    expect(messages[0]?.content).toContain('已确认营养方案');
    expect(messages[0]?.content).not.toContain('当前待确认营养方案');
  });

  it('未确认的选材也要注入，并告诉模型在此基础上增删', () => {
    const messages = buildSessionStateMessages({
      plan: null,
      planConfirmedAt: null,
      selection: selection(),
      selectionConfirmedAt: null,
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toContain('当前待确认选材');
    expect(messages[0]?.content).toContain('鸭胸肉');
    expect(messages[0]?.content).toContain('不要重造清单');
  });

  it('方案和选材都没有时不产生消息', () => {
    expect(
      buildSessionStateMessages({
        plan: null,
        planConfirmedAt: null,
        selection: null,
        selectionConfirmedAt: null,
      }),
    ).toEqual([]);
  });

  it('buildMessages 会把未确认状态放进模型上下文', async () => {
    const service = Object.create(RecipeAgentService.prototype) as any;
    service.prisma = {
      recipeDesignAgentMessage: {
        findMany: jest.fn().mockResolvedValue([{ role: 'USER', content: 'hi' }]),
      },
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          plan: plan(),
          planConfirmedAt: null,
          selection: null,
          selectionConfirmedAt: null,
        }),
      },
    };

    const messages = await service.buildMessages('session-1', 'hi', 'DESIGN');
    expect(
      messages.some(
        (message: any) =>
          message.role === 'system' &&
          String(message.content).includes('当前待确认营养方案'),
      ),
    ).toBe(true);
  });
});
