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
