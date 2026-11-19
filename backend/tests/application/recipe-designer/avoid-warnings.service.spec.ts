import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

/**
 * 本单忌口 → 评估提醒。
 *
 * 这单的过敏状态是“无过敏”、结构化过敏记录为空，但订单备注和医嘱都写了
 * “不吃牛羊鸡肉和鸡蛋”。以前评估只查结构化过敏，加鸡肉也不会报；
 * 这里锁住“备注/医嘱里的忌口能落到具体原料上”。
 */
describe('buildDraftAllergenWarnings: avoid list', () => {
  function createService(order: any, treatment: string | null = null) {
    const service = Object.create(RecipeDesignerService.prototype) as any;
    service.prisma = {
      dog: {
        findUnique: jest.fn().mockResolvedValue({
          allergyFoods: null,
          allergyRecords: [],
        }),
      },
      customRecipeOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
      },
      medicalRecord: {
        findFirst: jest.fn().mockResolvedValue(
          treatment ? { treatment } : null,
        ),
      },
    };
    service.allergenVocabulary = null;
    service.resolveIngredientDisplayName = (item: any) =>
      item.ingredient?.name ?? null;
    return service as RecipeDesignerService;
  }

  const draft = {
    customerDogId: 'dog-1',
    series: { orderId: 'order-uuid' },
    items: [
      { id: 'i1', ingredient: { name: '鸡胸肉' } },
      { id: 'i2', ingredient: { name: '兔里脊' } },
      { id: 'i3', ingredient: { name: '牛磺酸' } },
    ],
  };

  it('flags chicken from the order note even when allergy records are empty', async () => {
    const service = createService({
      allergyText: null,
      additionalNotes: '不吃发物，牛、羊、鸡、鸡蛋不吃，低敏抗炎优先。',
      dislikedIngredients: [],
      allergies: [],
    });

    const warnings = await (service as any).buildDraftAllergenWarnings(draft);

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'i1',
          allergen: '鸡',
          kind: 'AVOID',
        }),
      ]),
    );
    expect(warnings.find((warning: any) => warning.itemId === 'i2')).toBeUndefined();
    // 牛磺酸不是牛肉
    expect(warnings.find((warning: any) => warning.itemId === 'i3')).toBeUndefined();
  });

  it('flags chicken from the latest medical treatment note', async () => {
    const service = createService(
      {
        allergyText: null,
        additionalNotes: null,
        dislikedIngredients: [],
        allergies: [],
      },
      '不吃牛羊鸡肉和鸡蛋，多吃兔、猪里脊、鱼肉',
    );

    const warnings = await (service as any).buildDraftAllergenWarnings(draft);

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'i1',
          allergen: '鸡',
          kind: 'AVOID',
        }),
      ]),
    );
  });
});
