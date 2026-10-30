import { createReadTools } from 'src/application/recipe-designer/agent/read-tools';
import { buildRecipeAgentSystemPrompt } from 'src/application/recipe-designer/agent/recipe-agent-run.service';
import { RecipeDesignerAgentAdapter } from 'src/application/recipe-designer/agent/recipe-designer-agent.adapter';
import { AGENT_TOOL_DEFINITIONS } from 'src/application/recipe-designer/agent/tool-registry';
import type { RecipeAgentDraftPort } from 'src/application/recipe-designer/agent/recipe-agent.port';
import type {
  AgentDogRecipeHistory,
  AgentToolResult,
} from 'src/application/recipe-designer/agent/agent-types';

/**
 * 这只狗的历史食谱（2026-10-28）
 *
 * ## 为什么要有这个工具
 *
 * 老板问 AI「提莫最近一次牛肉食谱」，AI 手里只有当前订单 + 狗狗档案，
 * 工具箱里没有「这只狗吃过什么」，于是它拿全站食谱库搜索，把一条
 * **已发布的目录食谱**当成了提莫的历史，还拿它的蔬菜当基准。
 *
 * 这里锁三件事：
 *   ① 工具存在，且只查当前订单绑定的狗狗（不许传别的狗）；
 *   ② 过滤 / 条数在适配器里做，名字和原料都能命中；
 *   ③ 提示词明确禁止用全站 search_recipes 冒充这只狗的历史。
 */
const HISTORY: AgentDogRecipeHistory = {
  dogName: '提莫',
  total: 2,
  recipes: [
    {
      id: 'recipe-beef',
      name: '牛肉',
      kind: 'FINISHED',
      date: '2026-09-30T00:00:00.000Z',
      status: 'COMPLETED',
      ingredients: ['牛里脊', '西兰花', '红甜椒'],
    },
    {
      id: 'recipe-pork',
      name: '猪里脊',
      kind: 'FINISHED',
      date: '2026-09-30T00:00:00.000Z',
      status: 'COMPLETED',
      ingredients: ['猪里脊', '南瓜'],
    },
  ],
};

function readToolsWith(history: AgentDogRecipeHistory) {
  const port = {
    getDogRecipeHistory: jest.fn(async () => history),
  } as unknown as RecipeAgentDraftPort;
  return { port, tools: createReadTools(port, 'draft-1') };
}

function okResult<T>(result: AgentToolResult<T>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.message}`);
  return result;
}

describe('get_dog_recipe_history · 工具', () => {
  it('把关键词和条数透传给端口，并在摘要里带日期和菜名', async () => {
    const { port, tools } = readToolsWith(HISTORY);

    const result = okResult(
      await tools.get_dog_recipe_history({
        keyword: '牛肉',
        limit: 1,
      }),
    );

    expect(port.getDogRecipeHistory).toHaveBeenCalledWith({
      keyword: '牛肉',
      limit: 1,
    });
    expect(result.summary).toContain('2026-09-30');
    expect(result.summary).toContain('牛肉');
    expect(result.summary).toContain('真实');
  });

  it('没有匹配时明确说没有，并禁止拿全站食谱补位', async () => {
    const { tools } = readToolsWith({ dogName: '提莫', total: 0, recipes: [] });

    const result = okResult(
      await tools.get_dog_recipe_history({ keyword: '鹿肉' }),
    );

    expect(result.summary).toContain('没有');
    expect(result.summary).toContain('不要拿全站食谱补位');
  });

  it('产品线设计没有绑定狗狗时，明确说查不了，而不是回退到全站搜索', async () => {
    const { tools } = readToolsWith({ dogName: null, total: 0, recipes: [] });

    const result = okResult(await tools.get_dog_recipe_history({}));

    expect(result.summary).toContain('没有绑定狗狗');
  });

  it('工具定义注册到工具表里', () => {
    expect(AGENT_TOOL_DEFINITIONS.map((item) => item.name)).toContain(
      'get_dog_recipe_history',
    );
  });
});

describe('get_dog_recipe_history · 适配器', () => {
  function createAdapter(history: any[]) {
    const service = {
      getDogRecipeHistory: jest.fn(async () => history),
    };
    const prisma = {
      orderRecipeDesign: {
        findUnique: jest.fn(async () => ({
          dogId: 'dog-1',
          order: { dog: { name: '提莫' } },
        })),
      },
    };
    const adapter = new RecipeDesignerAgentAdapter(
      service as any,
      prisma as any,
      { userId: 'u1', role: 'STAFF' },
      'draft-1',
    );
    return { adapter, service, prisma };
  }

  it('只查当前订单绑定的狗狗，名字和原料都能按关键词命中', async () => {
    const { adapter, service } = createAdapter([
      {
        id: 'recipe-beef',
        name: '牛肉',
        kind: 'FINISHED',
        date: '2026-09-30T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [
          { name: '牛里脊', amount: '50g' },
          { name: '西兰花', amount: '20g' },
        ],
        macros: [],
      },
      {
        id: 'recipe-pork',
        name: '猪里脊',
        kind: 'FINISHED',
        date: '2026-09-30T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [{ name: '南瓜', amount: '20g' }],
        macros: [],
      },
    ]);

    const byName = await adapter.getDogRecipeHistory({ keyword: '牛肉' });
    expect(service.getDogRecipeHistory).toHaveBeenCalledWith(
      'dog-1',
      expect.objectContaining({ userId: 'u1' }),
    );
    expect(byName.dogName).toBe('提莫');
    expect(byName.recipes.map((item) => item.name)).toEqual(['牛肉']);

    const byIngredient = await adapter.getDogRecipeHistory({
      keyword: '西兰花',
    });
    expect(byIngredient.recipes.map((item) => item.name)).toEqual(['牛肉']);
  });

  it('按条数截断，但仍返回过滤后的总数', async () => {
    const { adapter } = createAdapter([
      {
        id: 'r1',
        name: '牛肉',
        kind: 'FINISHED',
        date: '2026-09-30T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [{ name: '牛里脊', amount: '50g' }],
        macros: [],
      },
      {
        id: 'r2',
        name: '牛肉南瓜',
        kind: 'CUSTOM',
        date: '2026-10-01T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [{ name: '牛肉', amount: '50g' }],
        macros: [],
      },
    ]);

    const result = await adapter.getDogRecipeHistory({ limit: 1 });

    expect(result.total).toBe(2);
    expect(result.recipes).toHaveLength(1);
  });

  it('产品线 / 没有订单绑定的草稿不查历史，返回空而不是全站食谱', async () => {
    const service = { getDogRecipeHistory: jest.fn() };
    const prisma = {
      orderRecipeDesign: { findUnique: jest.fn(async () => null) },
    };
    const adapter = new RecipeDesignerAgentAdapter(
      service as any,
      prisma as any,
      { userId: 'u1', role: 'STAFF' },
      'draft-1',
    );

    const result = await adapter.getDogRecipeHistory({ keyword: '牛肉' });

    expect(result).toEqual({ dogName: null, total: 0, recipes: [] });
    expect(service.getDogRecipeHistory).not.toHaveBeenCalled();
  });
});

describe('get_dog_recipe_history · 提示词', () => {
  it('明确规定这只狗的历史必须查工具，不能拿全站搜索冒充', () => {
    const prompt = buildRecipeAgentSystemPrompt(
      new Date('2026-10-28T00:00:00.000Z'),
    );

    expect(prompt).toContain('get_dog_recipe_history');
    expect(prompt).toContain('禁止');
    expect(prompt).toContain('search_recipes 是全站食谱库');
  });
});
