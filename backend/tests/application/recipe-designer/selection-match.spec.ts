import { matchSelectionToLibrary } from '../../../src/application/recipe-designer/agent/selection-match';
import type { FoodCandidate } from '../../../src/application/recipe-designer/agent/draft-port';

function candidate(name: string, id: string, isPrimary = true): FoodCandidate {
  return {
    ingredientId: id,
    nutritionFoodId: `nf-${id}`,
    name,
    category: 'MEAT',
    preparationState: '生',
    isPrimary,
  };
}

describe('selection name matching', () => {
  it('matches exact and parenthesized names to the library', async () => {
    const selection = {
      summary: 'x',
      items: [
        {
          kind: 'FOOD' as const,
          name: '猪里脊（生）',
          foodCategory: '肉类',
          reason: 'x',
          dataStatus: 'MISSING' as const,
        },
        {
          kind: 'FOOD' as const,
          name: '鸵鸟肉',
          foodCategory: '肉类',
          reason: 'x',
          dataStatus: 'MISSING' as const,
        },
      ],
    };
    const matched = await matchSelectionToLibrary(selection, async (input) => {
      if (input.search.includes('猪')) return [candidate('猪里脊（生）', '1')];
      return [];
    });

    expect(matched.items[0]).toMatchObject({
      ingredientId: '1',
      dataStatus: 'AVAILABLE',
    });
    expect(matched.items[1].dataStatus).toBe('MISSING');
  });

  it('matches common aliases like 兔肉 → 兔里脊', async () => {
    const selection = {
      summary: 'x',
      items: [
        {
          kind: 'FOOD' as const,
          name: '兔肉（去皮去脂）',
          foodCategory: '肉类',
          reason: 'x',
          dataStatus: 'MISSING' as const,
        },
      ],
    };
    const matched = await matchSelectionToLibrary(selection, async () => [
      candidate('兔里脊', 'rabbit'),
    ]);
    expect(matched.items[0]).toMatchObject({
      ingredientId: 'rabbit',
      dataStatus: 'AVAILABLE',
    });
  });

  it('uses the primary candidate when several names are equally close', async () => {
    const selection = {
      summary: 'x',
      items: [
        {
          kind: 'FOOD' as const,
          name: '鱼油',
          foodCategory: '油脂',
          reason: 'x',
          dataStatus: 'MISSING' as const,
        },
      ],
    };
    const matched = await matchSelectionToLibrary(selection, async () => [
      candidate('鱼油A', 'a', false),
      candidate('鱼油B', 'b', true),
    ]);

    expect(matched.items[0].ingredientId).toBe('b');
  });
});
