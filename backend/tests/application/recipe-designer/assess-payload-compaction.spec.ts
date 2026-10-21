import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

describe('RecipeDesignerService · assessment payload compaction', () => {
  it('does not send contributors/details or raw entries in the list response', () => {
    const service = Object.create(RecipeDesignerService.prototype) as any;
    const groupedEntry = {
      nutrientKey: 'calcium',
      label: '钙',
      category: 'MINERAL',
      expressionBasis: 'PER_1000_KCAL_ME',
      unit: 'mg',
      minValue: 1,
      maxValue: 2,
      currentValue: 1.5,
      status: 'COMPLIANT',
      contributors: [{ itemId: 'i1', itemName: '牛肉' }],
      details: [{ nutrientKey: 'calcium', contributors: [] }],
      detailCount: 1,
    };
    const result = {
      scenario: 'ADULT_MER_95',
      totalWeightG: 100,
      totalEnergyKcal: 100,
      dryMatterG: 20,
      dryMatterEnergyKcalPer100g: 400,
      energyDensityKcalPerKg: 1000,
      normalizedToKg: false,
      items: [{ id: 'i1', name: '牛肉', weightG: 100, ratioPercent: 100 }],
      nutrients: {},
      macroMetrics: {},
      groupedEntries: [groupedEntry],
      entries: [{ nutrientKey: 'calcium' }],
      dataGaps: [],
      overallStatus: 'COMPLIANT',
      summary: { compliant: 1, deficient: 0, excess: 0, missingData: 0 },
      rawSummary: { compliant: 1, deficient: 0, excess: 0, missingData: 0 },
    };

    const client = service.toClientAssessmentResult(result);

    expect(client.entries).toBeUndefined();
    expect(client.groupedEntries).toHaveLength(1);
    expect(client.groupedEntries[0]).not.toHaveProperty('contributors');
    expect(client.groupedEntries[0]).not.toHaveProperty('details');
    expect(client.groupedEntries[0]).toMatchObject({
      nutrientKey: 'calcium',
      currentValue: 1.5,
    });
  });
});
