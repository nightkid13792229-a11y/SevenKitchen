import type {
  NutritionConfidenceLevel,
  NutritionProfileSourceType,
  NutritionRawBasisType,
  NutritionSampleState,
  NutritionTabRecord,
} from "@/types/ingredient";

export type IngredientNutritionTabKey =
  | "macros"
  | "minerals"
  | "vitamins"
  | "fattyAcids"
  | "aminoAcids";

export interface IngredientNutritionOption<TValue extends string> {
  label: string;
  value: TValue;
}

export interface IngredientNutritionMetaFieldDefinition {
  key:
    | "rawBasisType"
    | "sampleState"
    | "densityGPerMl"
    | "servingWeightG"
    | "sourceType"
    | "attachments"
    | "versionNote";
  label: string;
}

export interface IngredientNutritionFieldDefinition<
  TKey extends string = string,
> {
  key: TKey;
  label: string;
  englishLabel?: string;
  unit: string;
  defaultDisplayUnit?: string;
  unitOptions?: string[];
  placeholder?: string;
}

export interface IngredientNutritionTabDefinition<
  TKey extends string = string,
> {
  key: IngredientNutritionTabKey;
  label: string;
  fields: Array<IngredientNutritionFieldDefinition<TKey>>;
}

export interface SupplementTargetFieldOption {
  group: string;
  fieldPath: `${IngredientNutritionTabKey}.${string}`;
  label: string;
  unit: string;
}

export const INGREDIENT_NUTRITION_TAB_KEYS: readonly IngredientNutritionTabKey[] =
  ["macros", "minerals", "vitamins", "fattyAcids", "aminoAcids"] as const;

export const INGREDIENT_NUTRITION_META_FIELDS: readonly IngredientNutritionMetaFieldDefinition[] =
  [
    { key: "rawBasisType", label: "原始基准" },
    { key: "sampleState", label: "样品状态" },
    { key: "densityGPerMl", label: "密度 (g/ml)" },
    { key: "servingWeightG", label: "单份重量 (g)" },
    { key: "sourceType", label: "来源类型" },
    { key: "attachments", label: "附件" },
    { key: "versionNote", label: "版本备注" },
  ] as const;

export const INGREDIENT_NUTRITION_RAW_BASIS_OPTIONS: readonly IngredientNutritionOption<NutritionRawBasisType>[] =
  [
    { label: "每100g", value: "PER_100_G" },
    { label: "每100ml", value: "PER_100_ML" },
    { label: "每1g", value: "PER_1_G" },
    { label: "每1ml", value: "PER_1_ML" },
    { label: "每份", value: "PER_SERVING" },
  ] as const;

export const INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS: readonly IngredientNutritionOption<NutritionSampleState>[] =
  [
    { label: "生", value: "RAW" },
    { label: "熟", value: "COOKED" },
    { label: "冻干", value: "FREEZE_DRIED" },
    { label: "风干", value: "AIR_DRIED" },
    { label: "粉末", value: "POWDER" },
    { label: "油脂", value: "OIL" },
    { label: "浓缩物", value: "CONCENTRATE" },
  ] as const;

export const INGREDIENT_NUTRITION_SOURCE_TYPE_OPTIONS: readonly IngredientNutritionOption<NutritionProfileSourceType>[] =
  [
    { label: "USDA", value: "USDA" },
    { label: "NZFCD", value: "NZFCD" },
    { label: "MEXT", value: "MEXT" },
    { label: "CFCT", value: "CFCT" },
    { label: "补剂标签", value: "SUPPLEMENT_LABEL" },
    { label: "商品标签", value: "LABEL" },
    { label: "第三方检测", value: "LAB_REPORT" },
    { label: "供应商规格", value: "SUPPLIER" },
    { label: "文献资料", value: "LITERATURE" },
    { label: "人工录入", value: "MANUAL" },
    { label: "人工估算", value: "MANUAL_ESTIMATE" },
  ] as const;

export const INGREDIENT_NUTRITION_CONFIDENCE_OPTIONS: readonly IngredientNutritionOption<NutritionConfidenceLevel>[] =
  [
    { label: "高", value: "HIGH" },
    { label: "中", value: "MEDIUM" },
    { label: "低", value: "LOW" },
  ] as const;

export const INGREDIENT_NUTRITION_CUSTOM_ITEM_UNIT_OPTIONS: readonly string[] =
  ["kcal", "g", "mg", "μg", "IU", "%"] as const;

export const INGREDIENT_NUTRITION_TAB_DEFINITIONS: readonly IngredientNutritionTabDefinition[] =
  [
    {
      key: "macros",
      label: "宏量",
      fields: [
        {
          key: "energyKcal",
          label: "能量",
          englishLabel: "Energy",
          unit: "kcal",
          unitOptions: ["kcal", "kJ"],
        },
        {
          key: "moisture",
          label: "水分",
          englishLabel: "Moisture",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "crudeProtein",
          label: "粗蛋白",
          englishLabel: "Crude Protein",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "crudeFat",
          label: "粗脂肪",
          englishLabel: "Crude Fat",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "ash",
          label: "灰分",
          englishLabel: "Ash",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "carbohydrate",
          label: "碳水化合物",
          englishLabel: "Carbohydrate",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "fiber",
          label: "膳食纤维",
          englishLabel: "Dietary Fiber",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "solubleFiber",
          label: "可溶性纤维",
          englishLabel: "Soluble Fiber",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "insolubleFiber",
          label: "不可溶性纤维",
          englishLabel: "Insoluble Fiber",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
      ],
    },
    {
      key: "minerals",
      label: "矿物质",
      fields: [
        {
          key: "calcium",
          label: "钙",
          englishLabel: "Calcium",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "phosphorus",
          label: "磷",
          englishLabel: "Phosphorus",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "potassium",
          label: "钾",
          englishLabel: "Potassium",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "sodium",
          label: "钠",
          englishLabel: "Sodium",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "magnesium",
          label: "镁",
          englishLabel: "Magnesium",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "chloride",
          label: "氯",
          englishLabel: "Chloride",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "iron",
          label: "铁",
          englishLabel: "Iron",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "zinc",
          label: "锌",
          englishLabel: "Zinc",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "copper",
          label: "铜",
          englishLabel: "Copper",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "manganese",
          label: "锰",
          englishLabel: "Manganese",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "selenium",
          label: "硒",
          englishLabel: "Selenium",
          unit: "μg",
          unitOptions: ["μg", "mg"],
        },
        {
          key: "iodine",
          label: "碘",
          englishLabel: "Iodine",
          unit: "μg",
          unitOptions: ["μg", "mg"],
        },
      ],
    },
    {
      key: "vitamins",
      label: "维生素",
      fields: [
        {
          key: "vitaminA",
          label: "维生素 A",
          englishLabel: "Vitamin A",
          unit: "IU",
          defaultDisplayUnit: "IU",
          unitOptions: [
            "IU",
            "IU（视黄醇）",
            "mg（视黄醇）",
            "IU（乙酸酯）",
            "mg（乙酸酯）",
            "IU（丙酸酯）",
            "mg（丙酸酯）",
            "IU（棕榈酸酯）",
            "mg（棕榈酸酯）",
            "IU（β-胡萝卜素，犬）",
            "mg（β-胡萝卜素，犬）",
          ],
        },
        {
          key: "vitaminD",
          label: "维生素 D",
          englishLabel: "Vitamin D",
          unit: "IU",
          unitOptions: ["IU", "μg"],
        },
        {
          key: "vitaminE",
          label: "维生素 E",
          englishLabel: "Vitamin E",
          unit: "IU",
          defaultDisplayUnit: "IU（天然，d-α-tocopherol）",
          unitOptions: [
            "IU（天然，d-α-tocopherol）",
            "mg（天然，d-α-tocopherol）",
            "IU（天然，d-α-tocopheryl acetate）",
            "mg（天然，d-α-tocopheryl acetate）",
            "IU（合成，dl-α-tocopherol）",
            "mg（合成，dl-α-tocopherol）",
            "IU（合成，dl-α-tocopheryl acetate）",
            "mg（合成，dl-α-tocopheryl acetate）",
          ],
        },
        {
          key: "vitaminK",
          label: "维生素 K",
          englishLabel: "Vitamin K",
          unit: "μg",
          unitOptions: ["μg", "mg"],
        },
        {
          key: "vitaminB1",
          label: "维生素 B1",
          englishLabel: "Vitamin B1 (Thiamine)",
          unit: "mg",
          unitOptions: ["mg", "μg"],
        },
        {
          key: "vitaminB2",
          label: "维生素 B2",
          englishLabel: "Vitamin B2 (Riboflavin)",
          unit: "mg",
          unitOptions: ["mg", "μg"],
        },
        {
          key: "vitaminB3",
          label: "维生素 B3",
          englishLabel: "Vitamin B3 (Niacin)",
          unit: "mg",
          unitOptions: ["mg", "μg"],
        },
        {
          key: "vitaminB5",
          label: "维生素 B5",
          englishLabel: "Vitamin B5 (Pantothenic Acid)",
          unit: "mg",
          unitOptions: ["mg", "μg"],
        },
        {
          key: "vitaminB6",
          label: "维生素 B6",
          englishLabel: "Vitamin B6 (Pyridoxine)",
          unit: "mg",
          unitOptions: ["mg", "μg"],
        },
        {
          key: "vitaminB7",
          label: "维生素 B7",
          englishLabel: "Vitamin B7 (Biotin)",
          unit: "μg",
          unitOptions: ["μg", "mg"],
        },
        {
          key: "vitaminB9",
          label: "维生素 B9",
          englishLabel: "Vitamin B9 (Folate)",
          unit: "μg",
          unitOptions: ["μg", "mg"],
        },
        {
          key: "vitaminB12",
          label: "维生素 B12",
          englishLabel: "Vitamin B12 (Cobalamin)",
          unit: "μg",
          unitOptions: ["μg", "mg"],
        },
        {
          key: "choline",
          label: "胆碱",
          englishLabel: "Choline",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
        {
          key: "vitaminC",
          label: "维生素 C",
          englishLabel: "Vitamin C",
          unit: "mg",
          unitOptions: ["mg", "μg", "g"],
        },
      ],
    },
    {
      key: "fattyAcids",
      label: "脂肪酸",
      fields: [
        {
          key: "saturatedFattyAcids",
          label: "饱和脂肪酸",
          englishLabel: "Saturated Fatty Acids",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "monounsaturatedFattyAcids",
          label: "单不饱和脂肪酸",
          englishLabel: "Monounsaturated Fatty Acids",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "polyunsaturatedFattyAcids",
          label: "多不饱和脂肪酸",
          englishLabel: "Polyunsaturated Fatty Acids",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "linoleicAcid",
          label: "亚油酸",
          englishLabel: "Linoleic Acid",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "alphaLinolenicAcid",
          label: "α-亚麻酸",
          englishLabel: "Alpha-Linolenic Acid",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "arachidonicAcid",
          label: "花生四烯酸",
          englishLabel: "Arachidonic Acid",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "epa",
          label: "EPA",
          englishLabel: "Eicosapentaenoic Acid",
          unit: "mg",
          unitOptions: ["mg", "g"],
        },
        {
          key: "dpa",
          label: "DPA",
          englishLabel: "Docosapentaenoic Acid",
          unit: "mg",
          unitOptions: ["mg", "g"],
        },
        {
          key: "dha",
          label: "DHA",
          englishLabel: "Docosahexaenoic Acid",
          unit: "mg",
          unitOptions: ["mg", "g"],
        },
      ],
    },
    {
      key: "aminoAcids",
      label: "氨基酸",
      fields: [
        {
          key: "arginine",
          label: "精氨酸",
          englishLabel: "Arginine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "lysine",
          label: "赖氨酸",
          englishLabel: "Lysine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "methionine",
          label: "蛋氨酸",
          englishLabel: "Methionine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "cystine",
          label: "胱氨酸",
          englishLabel: "Cystine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "taurine",
          label: "牛磺酸",
          englishLabel: "Taurine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "tryptophan",
          label: "色氨酸",
          englishLabel: "Tryptophan",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "threonine",
          label: "苏氨酸",
          englishLabel: "Threonine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "leucine",
          label: "亮氨酸",
          englishLabel: "Leucine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "isoleucine",
          label: "异亮氨酸",
          englishLabel: "Isoleucine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "valine",
          label: "缬氨酸",
          englishLabel: "Valine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "phenylalanine",
          label: "苯丙氨酸",
          englishLabel: "Phenylalanine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "tyrosine",
          label: "酪氨酸",
          englishLabel: "Tyrosine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "histidine",
          label: "组氨酸",
          englishLabel: "Histidine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "glutamicAcid",
          label: "谷氨酸",
          englishLabel: "Glutamic Acid",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "glycine",
          label: "甘氨酸",
          englishLabel: "Glycine",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
        {
          key: "proline",
          label: "脯氨酸",
          englishLabel: "Proline",
          unit: "g",
          unitOptions: ["g", "mg"],
        },
      ],
    },
  ] as const;

export const SUPPLEMENT_TARGET_FIELD_OPTIONS: readonly SupplementTargetFieldOption[] =
  INGREDIENT_NUTRITION_TAB_DEFINITIONS.flatMap((tab) =>
    tab.fields.map((field) => ({
      group: tab.label,
      fieldPath:
        `${tab.key}.${field.key}` as `${IngredientNutritionTabKey}.${string}`,
      label: field.label,
      unit: field.unit,
    })),
  );

export const INGREDIENT_NUTRITION_TAB_LABELS: Readonly<
  Record<IngredientNutritionTabKey, string>
> = Object.fromEntries(
  INGREDIENT_NUTRITION_TAB_DEFINITIONS.map((tab) => [tab.key, tab.label]),
) as Record<IngredientNutritionTabKey, string>;

export const INGREDIENT_NUTRITION_FIELD_UNITS: Readonly<
  Record<string, string>
> = Object.fromEntries(
  INGREDIENT_NUTRITION_TAB_DEFINITIONS.flatMap((tab) =>
    tab.fields.map((field) => [field.key, field.unit]),
  ),
);

export const INGREDIENT_NUTRITION_FIELD_DEFINITION_MAP: Readonly<
  Record<string, IngredientNutritionFieldDefinition>
> = Object.fromEntries(
  INGREDIENT_NUTRITION_TAB_DEFINITIONS.flatMap((tab) =>
    tab.fields.map((field) => [field.key, field]),
  ),
) as Record<string, IngredientNutritionFieldDefinition>;

export function getIngredientNutritionResolvedDisplayUnit(
  fieldKey: string,
  persistedUnit?: string | null,
): string | undefined {
  const field = INGREDIENT_NUTRITION_FIELD_DEFINITION_MAP[fieldKey];
  if (!field) {
    return undefined;
  }

  const normalizedPersistedUnit = persistedUnit?.trim();
  const isAllowedPersistedUnit =
    !!normalizedPersistedUnit &&
    (field.unitOptions?.includes(normalizedPersistedUnit) ||
      normalizedPersistedUnit === field.unit);

  if (isAllowedPersistedUnit) {
    return normalizedPersistedUnit;
  }

  return field.defaultDisplayUnit || field.unit;
}

export const INGREDIENT_NUTRITION_TAB_EMPTY_RECORDS: Readonly<
  Record<IngredientNutritionTabKey, NutritionTabRecord>
> = Object.fromEntries(
  INGREDIENT_NUTRITION_TAB_DEFINITIONS.map((tab) => [
    tab.key,
    Object.fromEntries(tab.fields.map((field) => [field.key, null])),
  ]),
) as Record<IngredientNutritionTabKey, NutritionTabRecord>;
