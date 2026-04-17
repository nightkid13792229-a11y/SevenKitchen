jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { PackagingUnit } from 'src/domain/production';
import { PackagingUnitStatus } from 'src/domain/production/enums';
import type { RecipeSnapshot } from 'src/domain/recipe/types';
import { StaffProductionService } from 'src/application/production/kitchen.service';

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

  it('completes a staff production task with a finished-product shortage result', async () => {
    const unit = new PackagingUnit(
      'unit-1',
      'batch-1',
      recipeSnapshot,
      5000,
      ['order-item-1'],
      new Date('2026-04-20T08:00:00.000Z'),
      PackagingUnitStatus.IN_PROGRESS,
    );
    const productionRepository = {
      findPackagingUnitById: jest.fn().mockResolvedValue(unit),
      updatePackagingUnit: jest.fn(async (updatedUnit) => updatedUnit),
      findOrderItemsByIds: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
    };
    const productionService = {
      checkAndCompleteBatch: jest.fn(),
    };
    const service = new StaffProductionService(
      productionService as any,
      {} as any,
      productionRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await (service as any).completeProductionTask('unit-1', {
      resultStatus: 'SHORTAGE',
      shortageG: 300,
      resultPhotoUrls: ['https://example.com/shortage.jpg'],
    });

    expect(result.status).toBe(PackagingUnitStatus.COMPLETED);
    expect(result.resultStatus).toBe('SHORTAGE');
    expect(result.shortageG).toBe(300);
    expect(result.surplusG).toBe(0);
    expect(result.actualOutputG).toBe(4700);
    expect(result.resultPhotoUrls).toEqual([
      'https://example.com/shortage.jpg',
    ]);
    expect(productionRepository.updatePackagingUnit).toHaveBeenCalledWith(
      expect.objectContaining({
        resultStatus: 'SHORTAGE',
        shortageG: 300,
        actualOutputG: 4700,
      }),
    );
  });
});
