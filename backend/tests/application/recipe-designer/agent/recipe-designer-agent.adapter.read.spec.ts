import { RecipeDesignerAgentAdapter } from 'src/application/recipe-designer/agent/recipe-designer-agent.adapter';

function createAdapter(service: any, prisma: any = {}) {
  return new RecipeDesignerAgentAdapter(
    service,
    prisma,
    { userId: 'u1', role: 'STAFF' },
    'draft-1',
  );
}

describe('RecipeDesignerAgentAdapter read', () => {
  it('适配器能构造，四个读方法都存在', () => {
    const adapter = createAdapter({}, {});
    expect(typeof adapter.getDraft).toBe('function');
    expect(typeof adapter.searchIngredients).toBe('function');
    expect(typeof adapter.getIngredient).toBe('function');
    expect(typeof adapter.getCatalogUsage).toBe('function');
  });
});
