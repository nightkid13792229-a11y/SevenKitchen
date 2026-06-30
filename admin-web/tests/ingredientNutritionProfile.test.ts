import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIngredientNutritionPayload,
  normalizeIngredientNutritionProfileToForm,
} from "../src/utils/ingredientNutrition.ts";
import { INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS } from "../src/constants/ingredientNutrition.ts";

test("nutrition profile editing preserves source metadata and source forms", () => {
  const profile = {
    meta: {
      rawBasisType: "PER_100_G",
      sourceType: "USDA",
      sourceKind: "FOOD_DATABASE",
      sourceCode: "USDA_FDC",
      sourceVersion: "USDA_FDC_2026_04",
      externalId: "173904",
      sourceProvider: "USDA FoodData Central",
      confidenceLevel: "HIGH",
      sourceForms: {
        "vitamins.vitaminD": {
          sourceNutrientId: 1114,
          originalValue: 2.5,
          originalUnit: "µg",
          canonicalValue: 100,
          canonicalUnit: "IU",
        },
      },
      conversionNotes: {
        "vitamins.vitaminD": "1 µg vitamin D = 40 IU",
      },
    },
    macros: {},
    minerals: {},
    vitamins: { vitaminD: 100 },
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  };

  const form = normalizeIngredientNutritionProfileToForm(profile as any);
  const payload = buildIngredientNutritionPayload(form);

  assert.equal(payload?.meta.sourceCode, "USDA_FDC");
  assert.equal(
    payload?.meta.sourceForms?.["vitamins.vitaminD"]?.canonicalUnit,
    "IU",
  );
  assert.equal(
    payload?.meta.conversionNotes?.["vitamins.vitaminD"],
    "1 µg vitamin D = 40 IU",
  );
});

test("nutrition profile editing preserves field-level source metadata", () => {
  const profile = {
    meta: {
      rawBasisType: "PER_100_G",
      sourceType: "NZFCD",
      sourceCode: "NZFCD_FOODFILES",
      externalId: "T1024",
      fieldSources: {
        "vitamins.vitaminB5": {
          sourceRole: "FIELD_SUPPLEMENT",
          sourceType: "USDA",
          sourceCode: "USDA_FDC",
          externalId: "174216",
          sourceTitle: "Mollusks, mussel, blue, raw",
          compatibility: "APPROXIMATE_SPECIES",
          canonicalValue: 0.5,
          canonicalUnit: "mg",
          basisType: "PER_100_G",
          confidenceLevel: "MEDIUM",
          noteZh:
            "NZFCD 未提供青口贝维生素 B5 原始值，本字段采用 USDA blue mussel 生品近似物种数据补充。",
        },
      },
    },
    macros: {},
    minerals: {},
    vitamins: { vitaminB5: 0.5 },
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  };

  const payload = buildIngredientNutritionPayload(
    normalizeIngredientNutritionProfileToForm(profile as any),
  );

  assert.equal(payload?.meta.sourceType, "NZFCD");
  assert.equal(
    payload?.meta.fieldSources?.["vitamins.vitaminB5"]?.sourceRole,
    "FIELD_SUPPLEMENT",
  );
  assert.equal(
    payload?.meta.fieldSources?.["vitamins.vitaminB5"]?.compatibility,
    "APPROXIMATE_SPECIES",
  );
  assert.equal(
    payload?.meta.fieldSources?.["vitamins.vitaminB5"]?.canonicalValue,
    0.5,
  );
  assert.match(
    payload?.meta.fieldSources?.["vitamins.vitaminB5"]?.noteZh ?? "",
    /近似物种/,
  );
});

test("nutrition profile editing preserves all source metadata fields", () => {
  const profile = {
    meta: {
      rawBasisType: "PER_100_G",
      sourceType: "SUPPLIER",
      sourceKind: "SUPPLIER_SPEC",
      sourceCode: "SUPPLIER_SPEC",
      sourceVersion: "2026-Q2",
      externalId: "supplier-food-42",
      sourceRecordId: "record-99",
      sourceTitle: "Supplier nutrition specification",
      sourceProvider: "Example Supplier",
      confidenceLevel: "MEDIUM",
      sourceForms: {
        "minerals.calcium": {
          sourceNutrientName: "Calcium",
          originalValue: 0,
          originalUnit: "mg",
          canonicalValue: 0,
          canonicalUnit: "mg",
          notes: "reported zero",
        },
      },
      conversionNotes: {
        "minerals.calcium": "No conversion needed",
      },
    },
    macros: {},
    minerals: { calcium: 0 },
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  };

  const payload = buildIngredientNutritionPayload(
    normalizeIngredientNutritionProfileToForm(profile as any),
  );

  assert.equal(payload?.meta.sourceType, "SUPPLIER");
  assert.equal(payload?.meta.sourceKind, "SUPPLIER_SPEC");
  assert.equal(payload?.meta.sourceCode, "SUPPLIER_SPEC");
  assert.equal(payload?.meta.sourceVersion, "2026-Q2");
  assert.equal(payload?.meta.externalId, "supplier-food-42");
  assert.equal(payload?.meta.sourceRecordId, "record-99");
  assert.equal(payload?.meta.sourceTitle, "Supplier nutrition specification");
  assert.equal(payload?.meta.sourceProvider, "Example Supplier");
  assert.equal(payload?.meta.confidenceLevel, "MEDIUM");
  assert.equal(
    payload?.meta.sourceForms?.["minerals.calcium"]?.originalValue,
    0,
  );
  assert.equal(
    payload?.meta.sourceForms?.["minerals.calcium"]?.canonicalValue,
    0,
  );
});

test("nutrition profile editing maps flat value-unit nutrient data into grouped form fields", () => {
  const form = normalizeIngredientNutritionProfileToForm({
    energyKcal: { value: 380, unit: "kcal" },
    moisture: { value: 8, unit: "g" },
    crudeProtein: { value: 12.5, unit: "g" },
    crudeFat: { value: 9.8, unit: "g" },
    calcium: { value: 37, unit: "mg" },
    iodine: { value: 74, unit: "ug" },
    arachidonicAcid: { value: 25, unit: "mg" },
    vitaminK: { value: 2, unit: "ug" },
    arginine: { value: 0.85, unit: "g" },
  } as any);

  assert.equal(form.macros.energyKcal, 380);
  assert.equal(form.macros.moisture, 8);
  assert.equal(form.macros.crudeProtein, 12.5);
  assert.equal(form.macros.crudeFat, 9.8);
  assert.equal(form.minerals.calcium, 37);
  assert.equal(form.minerals.iodine, 74);
  assert.equal(form.fattyAcids.arachidonicAcid, 0.025);
  assert.equal(form.vitamins.vitaminK, 2);
  assert.equal(form.aminoAcids.arginine, 0.85);
  assert.equal(form.meta.fieldDisplayUnits?.arachidonicAcid, "mg");
});

test("nutrition source forms and conversion notes drop empty or invalid entries", () => {
  const empty = normalizeIngredientNutritionProfileToForm(null);
  const payload = buildIngredientNutritionPayload({
    ...empty,
    meta: {
      ...empty.meta,
      sourceCode: "USDA_FDC",
      sourceForms: {
        "vitamins.vitaminD": {
          sourceNutrientId: 1114,
          originalValue: "0",
          originalUnit: " µg ",
          canonicalValue: 0,
          canonicalUnit: " IU ",
          notes: " converted ",
        },
        "minerals.calcium": {},
        "": {
          originalValue: 10,
        },
        "macros.energyKcal": {
          originalValue: Number.NaN,
          originalUnit: "   ",
        },
      },
      conversionNotes: {
        "vitamins.vitaminD": "  1 µg vitamin D = 40 IU  ",
        "minerals.calcium": "",
        "": "ignored",
      },
    },
    vitamins: {
      ...empty.vitamins,
      vitaminD: 0,
    },
  } as any);

  assert.deepEqual(Object.keys(payload?.meta.sourceForms ?? {}), [
    "vitamins.vitaminD",
  ]);
  assert.equal(
    payload?.meta.sourceForms?.["vitamins.vitaminD"]?.originalValue,
    0,
  );
  assert.equal(
    payload?.meta.sourceForms?.["vitamins.vitaminD"]?.canonicalValue,
    0,
  );
  assert.equal(
    payload?.meta.sourceForms?.["vitamins.vitaminD"]?.originalUnit,
    "µg",
  );
  assert.equal(
    payload?.meta.sourceForms?.["vitamins.vitaminD"]?.canonicalUnit,
    "IU",
  );
  assert.equal(
    payload?.meta.sourceForms?.["vitamins.vitaminD"]?.notes,
    "converted",
  );
  assert.deepEqual(payload?.meta.conversionNotes, {
    "vitamins.vitaminD": "1 µg vitamin D = 40 IU",
  });
});

test("nutrition source type options preserve legacy sources and source-code-backed labels", () => {
  const optionValues = INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS.map(
    (option) => option.value,
  );

  assert.deepEqual(
    new Set(optionValues),
    new Set([
      "USDA",
      "NZFCD",
      "MEXT",
      "CFCT",
      "SUPPLEMENT_LABEL",
      "LABEL",
      "LAB_REPORT",
      "SUPPLIER",
      "LITERATURE",
      "MANUAL",
      "MANUAL_ESTIMATE",
    ]),
  );
});
