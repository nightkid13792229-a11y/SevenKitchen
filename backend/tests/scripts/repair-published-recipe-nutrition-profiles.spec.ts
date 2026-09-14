import {
  classifyNutritionProfileRepair,
  parseSnapshotNutritionFoodIds,
  pickSnapshotForVersion,
} from '../../scripts/repair-published-recipe-nutrition-profiles';

describe('repair-published-recipe-nutrition-profiles', () => {
  describe('classifyNutritionProfileRepair', () => {
    it('does nothing when the design intent is unknown', () => {
      expect(
        classifyNutritionProfileRepair({
          currentNutritionFoodId: 'food-raw',
          designNutritionFoodId: null,
          primaryNutritionFoodId: 'food-raw',
        }),
      ).toBe('noop');
    });

    it('does nothing when the recipe already matches the designer selection', () => {
      expect(
        classifyNutritionProfileRepair({
          currentNutritionFoodId: 'food-cooked',
          designNutritionFoodId: 'food-cooked',
          primaryNutritionFoodId: 'food-raw',
        }),
      ).toBe('noop');
    });

    it('restores the designer selection when the item has no profile at all', () => {
      expect(
        classifyNutritionProfileRepair({
          currentNutritionFoodId: null,
          designNutritionFoodId: 'food-cooked',
          primaryNutritionFoodId: 'food-raw',
        }),
      ).toBe('auto-fix');
    });

    it('restores the designer selection when the primary profile was substituted', () => {
      expect(
        classifyNutritionProfileRepair({
          currentNutritionFoodId: 'food-raw',
          designNutritionFoodId: 'food-cooked',
          primaryNutritionFoodId: 'food-raw',
        }),
      ).toBe('auto-fix');
    });

    it('flags other differences for manual review', () => {
      expect(
        classifyNutritionProfileRepair({
          currentNutritionFoodId: 'food-steamed',
          designNutritionFoodId: 'food-cooked',
          primaryNutritionFoodId: 'food-raw',
        }),
      ).toBe('manual-review');
    });
  });

  describe('parseSnapshotNutritionFoodIds', () => {
    it('maps ingredient ids to the nutrition profile chosen at publish time', () => {
      const map = parseSnapshotNutritionFoodIds({
        ingredientItems: [
          {
            ingredientId: 'ingredient-pepper',
            item: {
              ingredientId: 'ingredient-pepper',
              nutritionFoodId: 'food-pepper-cooked',
            },
          },
          {
            ingredientId: 'ingredient-chicken',
            item: {
              ingredientId: 'ingredient-chicken',
              nutritionFoodId: 'food-chicken-raw',
            },
          },
        ],
      });

      expect(map.get('ingredient-pepper')).toBe('food-pepper-cooked');
      expect(map.get('ingredient-chicken')).toBe('food-chicken-raw');
    });

    it('returns an empty map for malformed snapshot data', () => {
      expect(parseSnapshotNutritionFoodIds(null).size).toBe(0);
      expect(parseSnapshotNutritionFoodIds({}).size).toBe(0);
    });
  });

  describe('pickSnapshotForVersion', () => {
    const snapshots = [{ version: 1 }, { version: 3 }];

    it('uses the newest publish that is not later than the recipe version', () => {
      expect(pickSnapshotForVersion(snapshots, 2)?.version).toBe(1);
      expect(pickSnapshotForVersion(snapshots, 4)?.version).toBe(3);
    });

    it('returns null when no publish happened before that version', () => {
      expect(pickSnapshotForVersion(snapshots, 0)).toBeNull();
    });
  });
});
