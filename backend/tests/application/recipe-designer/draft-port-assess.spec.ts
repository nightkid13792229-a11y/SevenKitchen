import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';

describe('RecipeDraftPort · assess 缺口', () => {
  it('把评估的真实字段映射成模型能看懂的缺口', async () => {
    const designer = {
      assessDraftForAgent: jest.fn().mockResolvedValue({
        assessment: {
          isCompliant: false,
          totalEnergyKcal: 1681.58,
          summary: {
            compliant: 38,
            deficient: 1,
            excess: 0,
            missingData: 0,
          },
          groupedEntries: [
            {
              nutrientKey: 'phosphorus',
              label: '磷',
              status: 'DEFICIENT',
              unit: '%DM',
              currentValue: 0.18,
              minValue: 0.2,
              maxValue: 0.5,
            },
          ],
        },
        contentRevision: 35,
        allergenWarnings: [],
      }),
    };
    const port = new RecipeDraftPort(
      designer as any,
      { userId: 'u1' } as any,
      'draft-1',
    );

    const summary = await port.assess();

    expect(summary.gaps).toEqual([
      {
        key: 'phosphorus',
        label: '磷',
        status: 'DEFICIENT',
        value: 0.18,
        min: 0.2,
        max: 0.5,
        unit: '%DM',
        deficit: 0.020000000000000018,
        contributors: [],
      },
    ]);
  });
});


describe('RecipeDraftPort · assess 合规标志', () => {
  it('评估只返回 overallStatus 时也能映射成 isCompliant', async () => {
    const designer = {
      assessDraftForAgent: jest.fn().mockResolvedValue({
        assessment: {
          overallStatus: 'COMPLIANT',
          totalEnergyKcal: 1859.58,
          summary: {
            compliant: 39,
            deficient: 0,
            excess: 0,
            missingData: 0,
          },
          groupedEntries: [],
        },
        contentRevision: 44,
        allergenWarnings: [],
      }),
    };
    const port = new RecipeDraftPort(
      designer as any,
      { userId: 'u1' } as any,
      'draft-1',
    );

    const summary = await port.assess();
    expect(summary.isCompliant).toBe(true);
  });

  it('overallStatus 非 COMPLIANT 时为 false', async () => {
    const designer = {
      assessDraftForAgent: jest.fn().mockResolvedValue({
        assessment: {
          overallStatus: 'NON_COMPLIANT',
          totalEnergyKcal: 1859.58,
          summary: {
            compliant: 38,
            deficient: 1,
            excess: 0,
            missingData: 0,
          },
          groupedEntries: [],
        },
        contentRevision: 44,
        allergenWarnings: [],
      }),
    };
    const port = new RecipeDraftPort(
      designer as any,
      { userId: 'u1' } as any,
      'draft-1',
    );

    const summary = await port.assess();
    expect(summary.isCompliant).toBe(false);
  });
});


describe('RecipeDraftPort · 缺数据与补剂剂量', () => {
  it('全缺字段归到缺数据，碘给出还差多少和片数', async () => {
    const chlorideContributors = Array.from({ length: 11 }, (_, index) => ({
      itemId: `food-${index}`,
      itemName: `食物${index}`,
      amountUnit: 'g',
      ingredientType: 'FOOD',
      amount: 0,
      unit: 'g',
      missing: false,
      missingAsZero: true,
    }));
    const designer = {
      assessDraftForAgent: jest.fn().mockResolvedValue({
        assessment: {
          overallStatus: 'NON_COMPLIANT',
          totalEnergyKcal: 3515,
          summary: {
            compliant: 2,
            deficient: 2,
            excess: 0,
            missingData: 0,
          },
          groupedEntries: [
            {
              nutrientKey: 'chloride',
              label: '氯',
              status: 'DEFICIENT',
              unit: 'g',
              currentValue: 0,
              minValue: 0.38,
              maxValue: 5.87,
              missingAsZero: true,
              contributors: chlorideContributors,
            },
            {
              nutrientKey: 'iodine',
              label: '碘',
              status: 'DEFICIENT',
              unit: 'mg',
              currentValue: 0.064,
              minValue: 0.26,
              maxValue: 2.72,
              missingAsZero: true,
              contributors: [
                {
                  itemId: 'supp-1',
                  itemName: '碘钾片',
                  amountUnit: '片',
                  ingredientType: 'SUPPLEMENT',
                  amount: 0.225,
                  unit: 'mg',
                  missing: false,
                },
              ],
            },
          ],
        },
        contentRevision: 35,
        allergenWarnings: [],
      }),
    };
    const port = new RecipeDraftPort(
      designer as any,
      { userId: 'u1' } as any,
      'draft-1',
    );

    const summary = await port.assess();
    expect(summary.missingData).toEqual([
      {
        key: 'chloride',
        label: '氯',
        missingItemCount: 11,
        totalItemCount: 11,
        allMissing: true,
      },
    ]);
    expect(summary.gaps[0]).toMatchObject({
      key: 'iodine',
      deficit: 0.196,
      doseGuidance: '1片 ≈ 0.064mg/1000kcal；目标 0.26mg；约需 4片',
    });
  });
});
