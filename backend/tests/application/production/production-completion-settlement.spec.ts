import { PackagingUnit } from 'src/domain/production';
import type { RecipeSnapshot } from 'src/domain/recipe/types';

const recipeSnapshot: RecipeSnapshot = {
  id: 'recipe-1',
  version: 1,
  name: '牛肉鲜食',
  production_loss_rate: 1.07,
  energy_density_kcal_per_kg: 1450,
  nutrition_standard: 'FEDIAF_2021',
  items: [],
};

describe('production completion result', () => {
  it('records finished-product surplus without requiring ingredient actual usage', () => {
    const unit = new PackagingUnit(
      'unit-1',
      'batch-1',
      recipeSnapshot,
      5000,
      ['order-item-1'],
      new Date('2026-04-20T08:00:00.000Z'),
    );

    unit.recordProductionResult({
      resultStatus: 'SURPLUS',
      surplusG: 250,
      resultPhotoUrls: ['https://example.com/result.jpg'],
    });

    expect(unit.resultStatus).toBe('SURPLUS');
    expect(unit.surplusG).toBe(250);
    expect(unit.shortageG).toBe(0);
    expect(unit.actualOutputG).toBe(5250);
    expect(unit.resultPhotoUrls).toEqual(['https://example.com/result.jpg']);
    expect(unit.completedAt).toBeInstanceOf(Date);
    expect(unit.ingredientsUsageSnapshot).toBeNull();
  });
});
