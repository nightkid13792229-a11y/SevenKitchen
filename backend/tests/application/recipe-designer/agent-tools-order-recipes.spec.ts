import {
  executeTool,
  type ToolExecutionContext,
} from '../../../src/application/recipe-designer/agent/tools';
import type { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';
import type { RecipeCatalogPort } from '../../../src/application/recipe-designer/agent/catalog-port';
import type { KnowledgeGatewayService } from '../../../src/application/knowledge-v3/knowledge-gateway.service';

/**
 * 2026-11-24：read_order_recipes 只转发同订单食谱摘要；工具层不重新判断。
 */
describe('agent tools: 同订单已提交食谱', () => {
  const baseContext = (): ToolExecutionContext => ({
    port: {} as RecipeDraftPort,
    catalog: {} as RecipeCatalogPort,
    knowledge: {} as KnowledgeGatewayService,
    onAsk: jest.fn(),
  });

  it('转发订单食谱摘要，并给出人读概览', async () => {
    const data = {
      orderNo: 'CR20261119001',
      orderQuantity: 3,
      recipes: [
        {
          status: 'DELIVERED',
          statusLabel: '已交付',
          name: '鸡肉南瓜餐',
          lifeStage: 'ADULT',
          applicableLifeStages: ['ADULT'],
          submittedAt: '2026-11-20T02:00:00.000Z',
          hasNewerEdits: false,
          recipeCode: 'recipe-code-1',
          version: 2,
          totalWeightG: 1000,
          energyDensityKcalPerKg: 1200,
          items: [],
          steps: [],
        },
        {
          status: 'READY',
          statusLabel: '已加入待提交',
          name: '鸭肉紫薯餐',
          lifeStage: null,
          applicableLifeStages: [],
          submittedAt: '2026-11-21T02:00:00.000Z',
          hasNewerEdits: true,
          recipeCode: 'recipe-code-2',
          version: 1,
          totalWeightG: 980,
          energyDensityKcalPerKg: 1180,
          items: [],
          steps: [],
        },
      ],
    };
    const readOrderRecipes = jest.fn().mockResolvedValue(data);

    const result = await executeTool(
      'read_order_recipes',
      {},
      {
        ...baseContext(),
        port: { readOrderRecipes } as unknown as RecipeDraftPort,
      },
    );

    expect(readOrderRecipes).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(data);
    expect(result.summary).toContain('本单已有 2 份');
    expect(result.summary).toContain('鸡肉南瓜餐（已交付 · ADULT）');
    expect(result.summary).toContain('鸭肉紫薯餐（已加入待提交）');
  });

  it('没有其它食谱时回说明，不报错', async () => {
    const readOrderRecipes = jest.fn().mockResolvedValue({
      orderNo: 'CR20261119001',
      orderQuantity: 2,
      recipes: [],
      note: '本单还没有其它已提交/已交付的食谱',
    });

    const result = await executeTool(
      'read_order_recipes',
      {},
      {
        ...baseContext(),
        port: { readOrderRecipes } as unknown as RecipeDraftPort,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('还没有其它已提交/已交付的食谱');
  });
});
