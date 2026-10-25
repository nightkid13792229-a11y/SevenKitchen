import type { AgentToolResult } from 'src/application/recipe-designer/agent/agent-types';
import type { RecipeAgentControlPort } from 'src/application/recipe-designer/agent/recipe-agent.port';
import { createRecipeAgentToolkit } from 'src/application/recipe-designer/agent/toolkit';
import { createFakeRecipeAgentPort } from '../../../helpers/fake-recipe-agent-port';

const tagPolicy = { isAllowedTag: (name: string) => ['低脂', '易消化'].includes(name) };

function createFakeControlPort(
  overrides: Partial<RecipeAgentControlPort> = {},
): RecipeAgentControlPort {
  return {
    askUser: jest.fn(),
    requestException: jest.fn(),
    finishDraft: jest.fn(),
    getApprovalState: jest
      .fn()
      .mockResolvedValue({ approvedException: false, confirmedOmissions: [] }),
    ...overrides,
  };
}

/** 每一步都要成功；失败时把整个结果打出来，方便看错误码和原因。 */
async function expectOk<T>(
  result: Promise<AgentToolResult<T>>,
): Promise<AgentToolResult<T>> {
  const resolved = await result;
  expect(resolved).toMatchObject({ ok: true });
  return resolved;
}

describe('recipe agent toolkit', () => {
  it('把 22 个工具定义和同名 handler 组装在一起', () => {
    const toolkit = createRecipeAgentToolkit({
      port: createFakeRecipeAgentPort(),
      controlPort: createFakeControlPort(),
      tagPolicy,
      draftId: 'draft-1',
    });

    expect(toolkit.definitions).toHaveLength(22);
    for (const definition of toolkit.definitions) {
      expect(typeof toolkit.handlers[definition.name]).toBe('function');
    }
  });

  it('一条完整链路：读草稿 → 查原料 → 加原料 → 写文案 → 评估 → 检查 → 交付', async () => {
    const port = createFakeRecipeAgentPort({ assessment: null }); // 第一次评估前没有结果
    const controlPort = createFakeControlPort();
    const toolkit = createRecipeAgentToolkit({
      port,
      controlPort,
      draftId: 'draft-1',
      tagPolicy,
    });

    await expectOk(toolkit.handlers.get_draft({}));
    await expectOk(toolkit.handlers.search_ingredients({ category: 'MUSHROOM' }));
    await expectOk(
      toolkit.handlers.add_ingredient({ nutritionFoodId: 'nf-8', weightG: 40 }),
    );
    // 文案放在最后一次评估之前：评估之后再改任何字段，内容版本会 +1，评估就过期了。
    await expectOk(
      toolkit.handlers.set_copy({
        name: '鸭肉南瓜餐',
        sellingPoint: '鲜鸭配南瓜',
      }),
    );
    await expectOk(toolkit.handlers.run_assessment({}));
    await expectOk(toolkit.handlers.check_ready({}));
    await expectOk(toolkit.handlers.finish_draft({ summary: '做好了' }));

    expect(controlPort.finishDraft).toHaveBeenCalledTimes(1);
  });
});
