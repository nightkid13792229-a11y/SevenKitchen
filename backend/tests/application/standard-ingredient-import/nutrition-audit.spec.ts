import {
  auditNutritionProfileForImport,
  mergeSupplementalNutritionFields,
} from 'src/application/standard-ingredient-import/nutrition-audit';

describe('auditNutritionProfileForImport', () => {
  it('treats null, blank, non-numeric, and unmeasured zero values as missing while allowing measured zero', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Incomplete chicken sample',
      nutrients: {
        proteinG: { value: null, unit: 'g' },
        fatG: { value: '', unit: 'g' },
        linoleicAcidG: { value: 'not reported', unit: 'g' },
        calciumMg: { value: 0, unit: 'mg' },
        phosphorusMg: { value: 0, unit: 'mg', measuredZero: true },
        vitaminAIu: { value: 750, unit: 'IU' },
      },
      sourceForms: {
        vitaminAIu: { vitaminAForm: 'SOURCE_DECLARED_IU' },
      },
    });

    expect(result.missingEssentialNutrients).toEqual(
      expect.arrayContaining([
        'crudeProtein',
        'crudeFat',
        'linoleicAcid',
        'calcium',
      ]),
    );
    expect(result.presentEssentialNutrients).toEqual(
      expect.arrayContaining(['phosphorus', 'vitaminA']),
    );
    expect(result.missingEssentialNutrients).not.toContain('phosphorus');
    expect(result.essentialCoveragePercent).toBeCloseTo(
      (result.presentEssentialNutrients.length /
        (result.presentEssentialNutrients.length +
          result.missingEssentialNutrients.length)) *
        100,
      6,
    );
  });

  it('blocks linoleic acid values that exceed total fat', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Chicken fat sample',
      nutrients: {
        fatG: { value: 10, unit: 'g' },
        linoleicAcidG: { value: 11, unit: 'g' },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'linoleicAcidG',
        parentField: 'fatG',
      }),
    );
  });

  it('blocks bare canonical fatty acids that exceed unitless total fat aliases', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Unitless chicken fat sample',
      nutrients: {
        fat: { value: 10 },
        linoleicAcid: { value: 11 },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'linoleicAcid',
        parentField: 'fat',
      }),
    );
  });

  it('blocks combined EPA, DHA, and DPA values that exceed total fat', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Fish oil sample',
      nutrients: {
        fatG: { value: 10, unit: 'g' },
        epaG: { value: 4, unit: 'g' },
        dhaG: { value: 4, unit: 'g' },
        dpaG: { value: 3, unit: 'g' },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'epaG+dhaG+dpaG',
        parentField: 'fatG',
      }),
    );
  });

  it('blocks amino acid gram values that exceed protein grams', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Impossible amino acid sample',
      nutrients: {
        proteinG: { value: 30, unit: 'g' },
        lysineG: { value: 31, unit: 'g' },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'lysineG',
        parentField: 'proteinG',
      }),
    );
  });

  it('blocks bare canonical amino acids that exceed unitless protein aliases', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Unitless amino acid sample',
      nutrients: {
        crudeProtein: { value: 30 },
        lysine: { value: 31 },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'lysine',
        parentField: 'crudeProtein',
      }),
    );
  });

  it('blocks ash mineral totals that exceed ash grams', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Impossible ash sample',
      nutrients: {
        ashG: { value: 1, unit: 'g' },
        calciumMg: { value: 800, unit: 'mg' },
        phosphorusMg: { value: 400, unit: 'mg' },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'ashMinerals',
        parentField: 'ashG',
      }),
    );
  });

  it('treats unitless canonical iodine as micrograms for ash checks', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Trace iodine sample',
      nutrients: {
        ashG: { value: 1, unit: 'g' },
        iodine: { value: 900 },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).not.toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'ashMinerals',
      }),
    );
    expect(result.normalizedNutrients.iodine).toMatchObject({
      value: 900,
      unit: 'ug',
    });
  });

  it('treats unitless canonical selenium as micrograms for ash checks', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Trace selenium sample',
      nutrients: {
        ashG: { value: 1, unit: 'g' },
        selenium: { value: 500 },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).not.toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'ashMinerals',
      }),
    );
    expect(result.normalizedNutrients.selenium).toMatchObject({
      value: 500,
      unit: 'ug',
    });
  });

  it('keeps unitless canonical milligram minerals in ash checks', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Unitless ash mineral sample',
      nutrients: {
        ashG: { value: 1, unit: 'g' },
        calcium: { value: 800 },
        phosphorus: { value: 400 },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
        field: 'ashMinerals',
        parentField: 'ashG',
      }),
    );
  });

  it('emits review issues for macro energy values outside tolerance without blocking', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Energy mismatch sample',
      nutrients: {
        proteinG: { value: 10, unit: 'g' },
        carbohydrateG: { value: 10, unit: 'g' },
        fatG: { value: 10, unit: 'g' },
        energyKcal: { value: 250, unit: 'kcal' },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).not.toContainEqual(
      expect.objectContaining({ code: 'MACRO_ENERGY_MISMATCH' }),
    );
    expect(result.reviewIssues).toContainEqual(
      expect.objectContaining({
        code: 'MACRO_ENERGY_MISMATCH',
        field: 'energyKcal',
      }),
    );
  });

  it('emits energy review issues for bare canonical macro fields without explicit units', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Unitless energy mismatch sample',
      nutrients: {
        crudeProtein: { value: 10 },
        carbohydrate: { value: 10 },
        crudeFat: { value: 10 },
        energyKcal: { value: 250 },
      },
      sourceForms: {},
    });

    expect(result.reviewIssues).toContainEqual(
      expect.objectContaining({
        code: 'MACRO_ENERGY_MISMATCH',
        field: 'energyKcal',
      }),
    );
  });

  it('blocks impossible negative nutrient values', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Negative macro sample',
      nutrients: {
        fatG: { value: -1, unit: 'g' },
        energyKcal: { value: 10, unit: 'kcal' },
      },
      sourceForms: {},
    });

    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'NEGATIVE_NUTRIENT_VALUE',
        field: 'fatG',
      }),
    );
  });

  it('normalizes vitamin A with the existing canine conversion metadata', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Vitamin A acetate label',
      nutrients: {
        vitaminAIu: { value: 344, unit: 'ug' },
      },
      sourceForms: {
        vitaminAIu: {
          vitaminAForm: 'VITAMIN_A_ACETATE',
          sourceNutrientName: 'Vitamin A acetate',
        },
      },
    });

    expect(result.normalizedNutrients.vitaminAIu).toMatchObject({
      value: 1000,
      unit: 'IU',
      sourceForm: {
        vitaminAForm: 'VITAMIN_A_ACETATE',
        sourceNutrientName: 'Vitamin A acetate',
        sourceCompound: 'vitamin A acetate',
        conversionStatus: 'DIRECT_FORM_ACTIVITY',
        conversionFactorSource: 'FEDIAF_2025_TABLE_VII_14',
      },
    });
  });

  it('normalizes vitamin E with the existing canine conversion metadata', () => {
    const result = auditNutritionProfileForImport({
      profileName: 'Vitamin E label',
      nutrients: {
        vitaminEIu: { value: 2, unit: 'mg' },
      },
      sourceForms: {
        vitaminEIu: {
          vitaminEForm: 'D_ALPHA_TOCOPHEROL',
          sourceNutrientId: 1109,
        },
      },
    });

    expect(result.normalizedNutrients.vitaminEIu).toMatchObject({
      value: 2.98,
      unit: 'IU',
      sourceForm: {
        vitaminEForm: 'D_ALPHA_TOCOPHEROL',
        sourceNutrientId: 1109,
        conversionStatus: 'ALPHA_ONLY_LOWER_BOUND',
        conversionFactorSource: 'FEDIAF_2025',
      },
    });
  });

  it('uses 40 IU per microgram for ordinary vitamin D forms and leaves unclear forms for review', () => {
    const ordinary = auditNutritionProfileForImport({
      profileName: 'Vitamin D3 label',
      nutrients: {
        vitaminDIu: { value: 2.5, unit: 'ug' },
      },
      sourceForms: {
        vitaminDIu: {
          vitaminDForm: 'vitamin_d3_cholecalciferol',
          sourceNutrientName: 'Cholecalciferol',
        },
      },
    });
    const unclear = auditNutritionProfileForImport({
      profileName: 'Vitamin D special form label',
      nutrients: {
        vitaminDIu: { value: 2, unit: 'ug' },
      },
      sourceForms: {
        vitaminDIu: {
          vitaminDForm: 'calcifediol_25_oh_d3',
        },
      },
    });

    expect(ordinary.normalizedNutrients.vitaminDIu).toMatchObject({
      value: 100,
      unit: 'IU',
      sourceForm: {
        vitaminDForm: 'vitamin_d3_cholecalciferol',
        sourceNutrientName: 'Cholecalciferol',
        conversionFactor: 40,
        conversionFactorUnit: 'IU_PER_UG',
      },
    });
    expect(ordinary.reviewIssues).not.toContainEqual(
      expect.objectContaining({ code: 'VITAMIN_D_FORM_REVIEW_REQUIRED' }),
    );
    expect(unclear.normalizedNutrients).not.toHaveProperty('vitaminDIu');
    expect(unclear.reviewIssues).toContainEqual(
      expect.objectContaining({
        code: 'VITAMIN_D_FORM_REVIEW_REQUIRED',
        field: 'vitaminDIu',
      }),
    );
  });
});

describe('mergeSupplementalNutritionFields', () => {
  it('refuses supplemental fields that violate parent-child constraints', () => {
    const result = mergeSupplementalNutritionFields({
      profileName: 'Multi-source fish oil sample',
      nutrients: {
        fatG: { value: 10, unit: 'g' },
      },
      sourceForms: {},
      supplementalSources: [
        {
          sourceId: 'fatty-acid-lab-a',
          nutrients: {
            linoleicAcidG: { value: 11, unit: 'g' },
          },
          sourceForms: {
            linoleicAcidG: { sourceNutrientName: 'Linoleic acid' },
          },
        },
        {
          sourceId: 'fatty-acid-lab-b',
          nutrients: {
            dhaG: { value: 2, unit: 'g' },
          },
        },
      ],
    });

    expect(result.refusedFields).toContainEqual(
      expect.objectContaining({
        field: 'linoleicAcidG',
        sourceId: 'fatty-acid-lab-a',
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
      }),
    );
    expect(result.acceptedFields).toContain('dhaG');
    expect(result.nutrients).not.toHaveProperty('linoleicAcidG');
    expect(result.nutrients).toHaveProperty('dhaG');
  });

  it('refuses supplemental parent fields that make existing child nutrients invalid', () => {
    const result = mergeSupplementalNutritionFields({
      profileName: 'Multi-source parent conflict sample',
      nutrients: {
        linoleicAcidG: { value: 11, unit: 'g' },
      },
      sourceForms: {},
      supplementalSources: [
        {
          sourceId: 'fat-lab-a',
          nutrients: {
            fatG: { value: 10, unit: 'g' },
          },
        },
      ],
    });

    expect(result.refusedFields).toContainEqual(
      expect.objectContaining({
        field: 'fatG',
        sourceId: 'fat-lab-a',
        code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
      }),
    );
    expect(result.nutrients).not.toHaveProperty('fatG');
  });
});
