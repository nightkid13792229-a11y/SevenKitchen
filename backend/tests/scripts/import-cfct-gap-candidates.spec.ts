import {
  buildCfctGapSupplementPlan,
  type CfctGapStructuredRow,
} from '../../scripts/import-cfct-gap-candidates';

const row = (
  foodName: string,
  overrides: Partial<CfctGapStructuredRow> = {},
): CfctGapStructuredRow => ({
  volume: '第六版 第一册',
  page: 60,
  row: 25,
  foodName,
  foodCode: '019008',
  nutrients: {
    energyKcal: 361,
    crudeProtein: 12.8,
    crudeFat: 3.3,
  },
  qualityFlags: [],
  reviewStatus: 'AUTO_STRUCTURED',
  ...overrides,
});

describe('CFCT gap candidate import planning', () => {
  it('selects exact auto-ready coix seed for yi ren mi and rejects processed variants', () => {
    const plan = buildCfctGapSupplementPlan([
      row('薏米［薏仁米,苡米］'),
      row('薏米面', { row: 26, foodCode: '019009' }),
      row('米粉（亨氏淮山薏米营养米', {
        volume: '第六版 第二册',
        page: 187,
        row: 13,
        foodCode: '134006',
      }),
    ]);

    const target = plan.targets.find((item) => item.ingredientName === '薏仁米');

    expect(target?.autoImportRows.map((item) => item.foodName)).toEqual([
      '薏米［薏仁米,苡米］',
    ]);
    expect(target?.rejectedRows.map((item) => item.foodName)).toEqual([
      '薏米面',
      '米粉（亨氏淮山薏米营养米',
    ]);
  });

  it('does not auto-import rows that require OCR review', () => {
    const plan = buildCfctGapSupplementPlan([
      row('鸭心', {
        volume: '第六版 第二册',
        page: 99,
        row: 24,
        foodCode: '092206',
        qualityFlags: ['LOW_OCR_CONFIDENCE'],
        reviewStatus: 'NEEDS_REVIEW',
      }),
    ]);

    const target = plan.targets.find((item) => item.ingredientName === '鸭心');

    expect(target?.autoImportRows).toEqual([]);
    expect(target?.needsReviewRows.map((item) => item.foodName)).toEqual([
      '鸭心',
    ]);
  });

  it('does not confuse malabar spinach with black fungus', () => {
    const plan = buildCfctGapSupplementPlan([
      row('落葵［木耳菜,软浆菜1'),
      row('木耳（水发）［黑木耳,云耳］', {
        row: 19,
        foodCode: '051014',
        qualityFlags: ['LOW_OCR_CONFIDENCE'],
        reviewStatus: 'NEEDS_REVIEW',
      }),
    ]);

    const target = plan.targets.find((item) => item.ingredientName === '黑木耳');

    expect(target?.autoImportRows).toEqual([]);
    expect(target?.needsReviewRows.map((item) => item.foodName)).toEqual([
      '木耳（水发）［黑木耳,云耳］',
    ]);
    expect(target?.rejectedRows.map((item) => item.foodName)).toEqual([]);
  });
});
