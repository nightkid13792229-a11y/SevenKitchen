import { describe, expect, it } from 'vitest';
import { formatIngredients } from './label-renderer';

describe('label renderer ingredient formatting', () => {
  it('prints supplement ingredients as actual total amounts for the current label weight', () => {
    const recipeSnapshot = {
      items: [
        {
          ingredient_type: 'FOOD',
          name: '牛霖',
          ratio: 27.73,
        },
        {
          ingredient_type: 'SUPPLEMENT',
          name: '骨粉',
          nutrient_target_key: '钙',
          nutrient_target_value: 1100,
          unit_display_label: 'g',
          properties: {
            production_loss_rate: 1,
            active_nutrients: {
              钙: { value: 115, unit: 'mg' },
            },
          },
        },
        {
          ingredient_type: 'SUPPLEMENT',
          name: '海藻粉',
          nutrient_target_key: '碘',
          nutrient_target_value: 500,
          unit_display_label: '平勺',
          properties: {
            production_loss_rate: 1.05,
            active_nutrients: {
              碘: { value: 250, unit: 'μg' },
            },
          },
        },
      ],
    };

    const formatted = formatIngredients(recipeSnapshot, 2000);

    expect(formatted.foodIngredients).toBe('牛霖27.73%');
    expect(formatted.supplementIngredients).toBe('骨粉19.13g、海藻粉4.20平勺');
    expect(formatted.supplementIngredients).not.toContain('每kg添加');
  });
});
