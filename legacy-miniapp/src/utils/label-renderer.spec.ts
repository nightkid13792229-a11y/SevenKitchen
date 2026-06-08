import { describe, expect, it } from 'vitest';
import { formatIngredients } from './label-renderer';
import { formatIngredients as formatStaffProductionIngredients } from '../pages/staff-production/utils/label-renderer';

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

  it('prints supplements that only use v2 supplement targets', () => {
    const recipeSnapshot = {
      items: [
        {
          ingredient_type: 'FOOD',
          name: '牛霖',
          ratio: 41.33654839820875,
        },
        {
          ingredient_type: 'SUPPLEMENT',
          name: '碳酸钙粉',
          supplement_targets: [
            {
              unit: 'mg',
              label: '钙',
              fieldPath: 'minerals.calcium',
              targetValuePerKg: 2160,
            },
          ],
          nutrition_profile_snapshot: {
            minerals: { calcium: 353 },
          },
          unit_display_label: 'g',
          properties: {
            production_loss_rate: 1.02,
          },
        },
        {
          ingredient_type: 'SUPPLEMENT',
          name: '海藻粉',
          supplement_targets: [
            {
              unit: 'μg',
              label: '碘',
              fieldPath: 'minerals.iodine',
              targetValuePerKg: 660,
            },
          ],
          nutrition_profile_snapshot: {
            minerals: { iodine: 450 },
          },
          unit_display_label: '平勺',
          properties: {
            production_loss_rate: 1.02,
          },
        },
        {
          ingredient_type: 'SUPPLEMENT',
          name: '鱼油胶囊',
          supplement_targets: [
            {
              unit: 'mg',
              label: 'EPA',
              fieldPath: 'fattyAcids.epa',
              targetValuePerKg: 360,
            },
            {
              unit: 'mg',
              label: 'DHA',
              fieldPath: 'fattyAcids.dha',
              targetValuePerKg: 240,
            },
          ],
          nutrition_profile_snapshot: {
            fattyAcids: {
              epa: 180,
              dha: 120,
            },
          },
          unit_display_label: '粒',
          properties: {
            production_loss_rate: 1.05,
          },
        },
      ],
    };

    const formatted = formatIngredients(recipeSnapshot, 2520);

    expect(formatted.supplementIngredients).toContain('碳酸钙粉15.73g');
    expect(formatted.supplementIngredients).toContain('海藻粉3.77平勺');
    expect(formatted.supplementIngredients).toContain('鱼油胶囊5.29粒');
  });

  it('keeps the staff production label renderer compatible with v2 supplement targets', () => {
    const recipeSnapshot = {
      items: [
        {
          ingredient_type: 'SUPPLEMENT',
          name: '碳酸钙粉',
          supplement_targets: [
            {
              unit: 'mg',
              label: '钙',
              fieldPath: 'minerals.calcium',
              targetValuePerKg: 2160,
            },
          ],
          nutrition_profile_snapshot: {
            minerals: { calcium: 353 },
          },
          unit_display_label: 'g',
          properties: {
            production_loss_rate: 1.02,
          },
        },
      ],
    };

    expect(formatStaffProductionIngredients(recipeSnapshot, 2520).supplementIngredients).toBe(
      '碳酸钙粉15.73g',
    );
  });
});
