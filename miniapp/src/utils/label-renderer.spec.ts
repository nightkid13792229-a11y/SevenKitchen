import { describe, expect, it } from 'vitest';
import { formatIngredients } from './label-renderer';
import {
  applyIngredientLabelInfo,
  formatIngredients as formatStaffProductionIngredients,
} from '../pages/staff-production/utils/label-renderer';

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
            meta: { rawBasisType: 'PER_1_G' },
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
            meta: { rawBasisType: 'PER_SERVING' },
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
            meta: { rawBasisType: 'PER_SERVING' },
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
            meta: { rawBasisType: 'PER_1_G' },
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

describe('staff production label: 添加剂组成与老订单回查', () => {
  // 生产库 SK20261030-001/002（布丁定制食谱）的真实快照：
  // 2026-10-30 03:01 下单，20 条原料，快照里一条标签分类都没有。
  const buildPuddingSnapshot = () => ({
    name: '布丁定制食谱',
    items: [
      { ingredient_id: 'f1', name: '鸡胸', ingredient_type: 'FOOD', ratio: 55.65862708719852 },
      { ingredient_id: 'f2', name: '鸡腿肉', ingredient_type: 'FOOD', ratio: 7.857688529957437 },
      { ingredient_id: 'f3', name: '狭鳕鱼柳', ingredient_type: 'FOOD', ratio: 3.928844264978719 },
      { ingredient_id: 'f4', name: '鸡蛋', ingredient_type: 'FOOD', ratio: 5.893266397468079 },
      { ingredient_id: 'f5', name: '西兰花', ingredient_type: 'FOOD', ratio: 3.928844264978719 },
      { ingredient_id: 'f6', name: '胡萝卜', ingredient_type: 'FOOD', ratio: 3.928844264978719 },
      { ingredient_id: 'f7', name: '南瓜', ingredient_type: 'FOOD', ratio: 5.893266397468079 },
      { ingredient_id: 'f8', name: '蓝莓', ingredient_type: 'FOOD', ratio: 3.928844264978719 },
      { ingredient_id: 'f9', name: '苹果', ingredient_type: 'FOOD', ratio: 3.928844264978719 },
      { ingredient_id: 'f10', name: '大米', ingredient_type: 'FOOD', ratio: 3.928844264978719 },
      { ingredient_id: 'f11', name: '姜黄粉', ingredient_type: 'FOOD', ratio: 0.4365382516643021 },
      { ingredient_id: 'f12', name: '小麦胚芽油', ingredient_type: 'FOOD', ratio: 0.5893266397468079 },
      { ingredient_id: 'f13', name: '亚麻籽油', ingredient_type: 'FOOD', ratio: 0.09822110662446798 },
      { ingredient_id: 's1', name: '碳酸钙粉', ingredient_type: 'SUPPLEMENT', ratio: 0.5456728145803776 },
      { ingredient_id: 's2', name: '海藻粉', ingredient_type: 'SUPPLEMENT', ratio: 0.1091345629160755 },
      { ingredient_id: 's3', name: '双甘氨酸亚铁胶囊', ingredient_type: 'SUPPLEMENT', ratio: 0.05456728145803776 },
      { ingredient_id: 's4', name: '氨基酸螯合铜', ingredient_type: 'SUPPLEMENT', ratio: 0.05456728145803776 },
      { ingredient_id: 's5', name: '葡萄糖酸锌片', ingredient_type: 'SUPPLEMENT', ratio: 0.04365382516643021 },
      { ingredient_id: 's6', name: '营养酵母粉', ingredient_type: 'SUPPLEMENT', ratio: 0.4365382516643021 },
      { ingredient_id: 's7', name: '鱼肝油', ingredient_type: 'SUPPLEMENT', ratio: 0.05456728145803776 },
    ],
  });

  const labelInfo = new Map([
    ['f1', { id: 'f1', labelCategory: 'FEED_MATERIAL', labelNames: ['鸡胸'] }],
    ['f2', { id: 'f2', labelCategory: 'FEED_MATERIAL', labelNames: ['鸡腿肉'] }],
    ['f3', { id: 'f3', labelCategory: 'FEED_MATERIAL', labelNames: ['狭鳕鱼柳'] }],
    ['f4', { id: 'f4', labelCategory: 'FEED_MATERIAL', labelNames: ['鸡蛋'] }],
    ['f5', { id: 'f5', labelCategory: 'FEED_MATERIAL', labelNames: ['西兰花'] }],
    ['f6', { id: 'f6', labelCategory: 'FEED_MATERIAL', labelNames: ['胡萝卜'] }],
    ['f7', { id: 'f7', labelCategory: 'FEED_MATERIAL', labelNames: ['南瓜'] }],
    ['f8', { id: 'f8', labelCategory: 'FEED_MATERIAL', labelNames: ['蓝莓'] }],
    ['f9', { id: 'f9', labelCategory: 'FEED_MATERIAL', labelNames: ['苹果'] }],
    ['f10', { id: 'f10', labelCategory: 'FEED_MATERIAL', labelNames: ['大米'] }],
    ['f11', { id: 'f11', labelCategory: 'FEED_MATERIAL', labelNames: ['姜黄粉'] }],
    ['f12', { id: 'f12', labelCategory: 'FEED_MATERIAL', labelNames: ['小麦胚芽油'] }],
    ['f13', { id: 'f13', labelCategory: 'FEED_MATERIAL', labelNames: ['亚麻籽油'] }],
    ['s1', { id: 's1', labelCategory: 'FEED_ADDITIVE', labelNames: ['碳酸钙'] }],
    ['s2', { id: 's2', labelCategory: 'FEED_MATERIAL', labelNames: ['海藻粉'] }],
    ['s3', { id: 's3', labelCategory: 'FEED_ADDITIVE', labelNames: ['甘氨酸亚铁'] }],
    ['s4', { id: 's4', labelCategory: 'FEED_ADDITIVE', labelNames: ['甘氨酸铜'] }],
    ['s5', { id: 's5', labelCategory: 'FEED_ADDITIVE', labelNames: ['葡萄糖酸锌'] }],
    ['s6', { id: 's6', labelCategory: 'FEED_MATERIAL', labelNames: ['酵母粉'] }],
    ['s7', { id: 's7', labelCategory: 'FEED_MATERIAL', labelNames: ['鱼肝油'] }],
  ]);

  it('用原料主数据补分类后，添加剂和饲料原料各归各位（真实老订单）', () => {
    const resolved = applyIngredientLabelInfo(buildPuddingSnapshot(), labelInfo);
    const formatted = formatStaffProductionIngredients(resolved, 3000);

    expect(formatted.additiveIngredients).toBe('碳酸钙、甘氨酸亚铁、甘氨酸铜、葡萄糖酸锌');
    expect(formatted.supplementIngredients).toBe('');
    expect(formatted.foodIngredients).toContain('海藻粉0.11%');
    expect(formatted.foodIngredients).toContain('酵母粉0.44%');
    expect(formatted.foodIngredients).toContain('鱼肝油0.05%');
    expect(formatted.labelIssues).toEqual([]);
    expect(formatted.hasLabelCategory).toBe(true);
  });

  it('快照没分类又查不到原料时，属于缺标签信息，打印前必须拦下', () => {
    const formatted = formatStaffProductionIngredients(buildPuddingSnapshot(), 3000);

    expect(formatted.additiveIngredients).toBe('');
    expect(formatted.hasLabelCategory).toBe(false);
    expect(formatted.labelIssues).toContain('葡萄糖酸锌片');
    expect(formatted.labelIssues).toContain('鸡胸');
  });

  it('饲料原料里的补剂（海藻粉/酵母粉/鱼肝油）进原料组成，不再被丢掉', () => {
    const formatted = formatStaffProductionIngredients(
      {
        items: [
          {
            ingredient_id: 'x1',
            ingredient_type: 'SUPPLEMENT',
            name: '海藻粉',
            ratio: 0.11,
            properties: { label_category: 'FEED_MATERIAL', label_names: ['海藻粉'] },
          },
          {
            ingredient_id: 'x2',
            ingredient_type: 'PACKAGING',
            name: '真空袋',
            properties: { label_category: 'NON_FEED' },
          },
        ],
      },
      3000,
    );

    expect(formatted.foodIngredients).toBe('海藻粉0.11%');
    expect(formatted.labelIssues).toEqual([]);
  });

  it('添加剂只写目录名称、不带克数和占比', () => {
    const formatted = formatStaffProductionIngredients(
      {
        items: [
          {
            ingredient_id: 'y1',
            ingredient_type: 'SUPPLEMENT',
            name: '葡萄糖酸锌片',
            ratio: 0.0436,
            properties: { label_category: 'FEED_ADDITIVE', label_names: ['葡萄糖酸锌'] },
          },
        ],
      },
      3000,
    );

    expect(formatted.additiveIngredients).toBe('葡萄糖酸锌');
    expect(formatted.foodIngredients).toBe('');
    expect(formatted.supplementIngredients).toBe('');
  });
});
