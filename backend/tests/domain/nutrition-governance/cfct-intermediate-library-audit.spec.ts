import {
  buildCfctIntermediateLibraryAudit,
  type CfctIntermediateLibraryRow,
} from '../../../src/domain/nutrition-governance/cfct-intermediate-library-audit';

describe('CFCT intermediate library audit', () => {
  it('summarizes nutrient group coverage by volume and food code', () => {
    const rows: CfctIntermediateLibraryRow[] = [
      cfctRow({
        foodCode: '019008',
        foodName: '薏米［薏仁米,苡米］',
        nutrients: {
          moisture: 11.2,
          energyKcal: 361,
          crudeProtein: 12.8,
          crudeFat: 3.3,
          ash: 1.6,
          carbohydrate: 71.1,
          insolubleFiber: 2,
          vitaminB1: 0.22,
          vitaminB2: 0.15,
        },
        sourceSegments: [{ kind: 'PRIMARY', page: 60, row: 25 }],
      }),
      cfctRow({
        foodCode: '019008',
        foodName: '薏米［薏仁米,苡米］',
        page: 160,
        row: 21,
        nutrients: {
          vitaminB3: 2.1,
          calcium: 42,
          phosphorus: 217,
          potassium: 238,
          sodium: 2,
          magnesium: 88,
          iron: 3.6,
          zinc: 1.68,
          selenium: 3.1,
        },
        qualityFlags: ['MISSING_PRIMARY_ROW'],
        reviewStatus: 'NEEDS_REVIEW',
        sourceSegments: [{ kind: 'CONTINUATION', page: 160, row: 21 }],
      }),
      cfctRow({
        foodCode: '019008',
        foodName: '薏米［薏仁米,苡米］',
        page: 161,
        row: 20,
        nutrients: {
          isoleucine: 0.505,
          leucine: 1.773,
          lysine: 0.233,
          methionine: 0.348,
          valine: 0.781,
        },
        sourceSegments: [{ kind: 'CONTINUATION', page: 161, row: 20 }],
      }),
    ];

    const audit = buildCfctIntermediateLibraryAudit(rows);

    expect(audit.summary).toMatchObject({
      totalRows: 3,
      rowsWithFoodCode: 3,
      rowsWithoutFoodCode: 0,
      uniqueFoodCodeCount: 1,
      qualityFlagCounts: {
        MISSING_PRIMARY_ROW: 1,
      },
    });
    expect(audit.foodCodeRows).toHaveLength(1);
    expect(audit.foodCodeRows[0]).toMatchObject({
      volume: '第六版 第一册',
      foodCode: '019008',
      foodName: '薏米［薏仁米,苡米］',
      sourceSegmentCount: 3,
      nutrientFieldCount: 23,
      missingCoreGroups: 'fattyAcids',
      coverage: {
        macros: { present: true, fieldCount: 7 },
        minerals: { present: true, fieldCount: 8 },
        vitamins: { present: true, fieldCount: 3 },
        aminoAcids: { present: true, fieldCount: 5 },
        fattyAcids: { present: false, fieldCount: 0 },
      },
    });
  });

  it('keeps no-food-code special table rows in a separate review queue', () => {
    const rows: CfctIntermediateLibraryRow[] = [
      cfctRow({
        foodCode: null,
        foodName: '巴基斯坦艾利鲶',
        volume: '第六版 第二册',
        page: 389,
        row: 8,
        nutrients: {
          dha: 1800,
          epa: 0,
        },
        qualityFlags: ['MISSING_FOOD_CODE'],
        reviewStatus: 'NEEDS_REVIEW',
        sourceSegments: [{ kind: 'CONTINUATION', page: 389, row: 8 }],
      }),
    ];

    const audit = buildCfctIntermediateLibraryAudit(rows);

    expect(audit.summary).toMatchObject({
      totalRows: 1,
      rowsWithFoodCode: 0,
      rowsWithoutFoodCode: 1,
      uniqueFoodCodeCount: 0,
    });
    expect(audit.foodCodeRows).toHaveLength(0);
    expect(audit.noFoodCodeRows).toEqual([
      expect.objectContaining({
        foodName: '巴基斯坦艾利鲶',
        volume: '第六版 第二册',
        nutrientFieldCount: 2,
        presentGroups: 'fattyAcids',
        qualityFlags: 'MISSING_FOOD_CODE',
      }),
    ]);
  });
});

function cfctRow(
  input: Partial<CfctIntermediateLibraryRow>,
): CfctIntermediateLibraryRow {
  return {
    volume: '第六版 第一册',
    page: 60,
    row: 25,
    foodName: '测试食物',
    foodCode: '000001',
    nutrients: {},
    qualityFlags: [],
    reviewStatus: 'AUTO_STRUCTURED',
    sourceSegments: [],
    ...input,
  };
}
