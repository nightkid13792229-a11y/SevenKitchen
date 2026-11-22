import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';

describe('RecipeDraftPort.readDraft', () => {
  it('摘要里能区分食材/补剂，并带出补剂目标', async () => {
    const designer = {
      getDraft: jest.fn().mockResolvedValue({
        id: 'draft-1',
        name: '测试食谱',
        contentRevision: 3,
        fediafDogScenario: 'ADULT_MAINTENANCE',
        series: { id: 'series-1', name: '测试系列', designMode: 'ORDER' },
        totalWeightG: 500,
        assessmentContentRevision: 3,
        isCompliant: true,
        items: [
          {
            id: 'item-food',
            ingredient: { name: '鸡胸肉', type: 'FOOD' },
            weightG: 400,
            preparationMethod: '生/去皮',
            nutritionFoodId: 'nf-food-raw',
            nutritionFood: {
              name: '鸡胸肉（生）',
              displayNameZh: '鸡胸肉（生）',
              preparationState: 'RAW',
            },
            supplementTargets: null,
          },
          {
            id: 'item-supplement',
            ingredient: { name: '锌片', type: 'SUPPLEMENT' },
            weightG: 1,
            supplementTargets: [
              {
                fieldPath: 'minerals.zinc',
                label: '锌',
                unit: 'mg',
                targetValuePerKg: 20,
              },
            ],
          },
        ],
      }),
    };
    const port = new RecipeDraftPort(designer as any, {} as any, 'draft-1');

    const summary = await port.readDraft();

    expect(summary.items[0]).toMatchObject({
      itemId: 'item-food',
      name: '鸡胸肉',
      type: 'FOOD',
      preparationMethod: '生/去皮',
      nutritionFoodId: 'nf-food-raw',
      nutritionProfileName: '鸡胸肉（生）',
      nutritionPreparationState: 'RAW',
      supplementTargets: [],
    });
    expect(summary.items[1]).toMatchObject({
      itemId: 'item-supplement',
      type: 'SUPPLEMENT',
      supplementTargets: [
        {
          fieldPath: 'minerals.zinc',
          label: '锌',
          unit: 'mg',
          targetValuePerKg: 20,
        },
      ],
    });
  });
});
