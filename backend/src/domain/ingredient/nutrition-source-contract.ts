export type NutritionSourceKind =
  | 'FOOD_DATABASE'
  | 'PRODUCT_LABEL'
  | 'LAB_REPORT'
  | 'SUPPLIER_SPEC'
  | 'LITERATURE'
  | 'MANUAL_ESTIMATE';

export type NutritionSourceCode =
  | 'USDA_FDC'
  | 'NZFCD_FOODFILES'
  | 'CFCT'
  | 'CNF'
  | 'AUSNUT'
  | 'NEVO'
  | 'JP_FOOD_TABLE'
  | 'SUPPLEMENT_LABEL'
  | 'LAB_REPORT'
  | 'SUPPLIER_SPEC'
  | 'LITERATURE'
  | 'MANUAL_ESTIMATE';

export interface NutritionSourceDefinition {
  sourceKind: NutritionSourceKind;
  sourceCode: NutritionSourceCode;
  sourceProvider: string;
}

export const NUTRITION_SOURCE_DEFINITIONS = [
  {
    sourceKind: 'FOOD_DATABASE',
    sourceCode: 'USDA_FDC',
    sourceProvider: 'USDA FoodData Central',
  },
  {
    sourceKind: 'FOOD_DATABASE',
    sourceCode: 'NZFCD_FOODFILES',
    sourceProvider: 'New Zealand Food Composition Database',
  },
  {
    sourceKind: 'FOOD_DATABASE',
    sourceCode: 'CFCT',
    sourceProvider: 'China Food Composition Tables',
  },
  {
    sourceKind: 'FOOD_DATABASE',
    sourceCode: 'CNF',
    sourceProvider: 'Canadian Nutrient File',
  },
  {
    sourceKind: 'FOOD_DATABASE',
    sourceCode: 'AUSNUT',
    sourceProvider: 'AUSNUT',
  },
  {
    sourceKind: 'FOOD_DATABASE',
    sourceCode: 'NEVO',
    sourceProvider: 'NEVO',
  },
  {
    sourceKind: 'FOOD_DATABASE',
    sourceCode: 'JP_FOOD_TABLE',
    sourceProvider: 'Standard Tables of Food Composition in Japan',
  },
  {
    sourceKind: 'PRODUCT_LABEL',
    sourceCode: 'SUPPLEMENT_LABEL',
    sourceProvider: 'Product label',
  },
  {
    sourceKind: 'LAB_REPORT',
    sourceCode: 'LAB_REPORT',
    sourceProvider: 'Laboratory report',
  },
  {
    sourceKind: 'SUPPLIER_SPEC',
    sourceCode: 'SUPPLIER_SPEC',
    sourceProvider: 'Supplier specification',
  },
  {
    sourceKind: 'LITERATURE',
    sourceCode: 'LITERATURE',
    sourceProvider: 'Literature',
  },
  {
    sourceKind: 'MANUAL_ESTIMATE',
    sourceCode: 'MANUAL_ESTIMATE',
    sourceProvider: 'Manual estimate',
  },
] as const satisfies readonly NutritionSourceDefinition[];

const cloneNutritionSourceDefinition = (
  definition: NutritionSourceDefinition,
): NutritionSourceDefinition => ({ ...definition });

export function getNutritionSourceDefinition(
  sourceCode: string | null | undefined,
): NutritionSourceDefinition | undefined {
  if (!sourceCode) {
    return undefined;
  }

  const definition = NUTRITION_SOURCE_DEFINITIONS.find(
    (definition) => definition.sourceCode === sourceCode,
  );
  return definition ? cloneNutritionSourceDefinition(definition) : undefined;
}

export function normalizeLegacyNutritionSourceType(
  sourceType: string | null | undefined,
): NutritionSourceDefinition | undefined {
  if (!sourceType) {
    return undefined;
  }

  const normalizedSourceType = sourceType.trim().toUpperCase();
  if (!normalizedSourceType) {
    return undefined;
  }

  const sourceCodeByLegacyType: Record<string, NutritionSourceCode> = {
    USDA: 'USDA_FDC',
    NZFCD: 'NZFCD_FOODFILES',
    CFCT: 'CFCT',
    SUPPLEMENT_LABEL: 'SUPPLEMENT_LABEL',
    LABEL: 'SUPPLEMENT_LABEL',
    LAB_REPORT: 'LAB_REPORT',
    SUPPLIER: 'SUPPLIER_SPEC',
    LITERATURE: 'LITERATURE',
    MANUAL: 'MANUAL_ESTIMATE',
    MANUAL_ESTIMATE: 'MANUAL_ESTIMATE',
  };

  return getNutritionSourceDefinition(
    sourceCodeByLegacyType[normalizedSourceType] ?? normalizedSourceType,
  );
}
