import {
  AMINO_ACID_NUTRIENT_KEYS,
  FATTY_ACID_NUTRIENT_KEYS,
  MACRO_NUTRIENT_KEYS,
  MINERAL_NUTRIENT_KEYS,
  VITAMIN_NUTRIENT_KEYS,
} from './nutrition-profile.constants';
import type {
  AminoAcidNutritionProfileTab,
  FattyAcidNutritionProfileTab,
  LegacyNutritionProfile,
  MacroNutritionProfileTab,
  MineralNutritionProfileTab,
  NutritionItem,
  NutritionProfile,
  NutritionProfileV2,
  NutritionRawBasisType,
  VitaminNutritionProfileTab,
} from './types';

const MACRO_ALIASES: Record<string, keyof NutritionProfileV2['macros']> = {
  energykcal: 'energyKcal',
  moisture: 'moisture',
  protein: 'crudeProtein',
  crudeprotein: 'crudeProtein',
  '粗蛋白': 'crudeProtein',
  crudefat: 'crudeFat',
  ash: 'ash',
  carbohydrate: 'carbohydrate',
  fiber: 'fiber',
  solublefiber: 'solubleFiber',
  insolublefiber: 'insolubleFiber',
};

const MINERAL_ALIASES: Record<string, keyof NutritionProfileV2['minerals']> = {
  calcium: 'calcium',
  ca: 'calcium',
  '钙': 'calcium',
  phosphorus: 'phosphorus',
  p: 'phosphorus',
  '磷': 'phosphorus',
  potassium: 'potassium',
  sodium: 'sodium',
  magnesium: 'magnesium',
  chloride: 'chloride',
  iron: 'iron',
  zinc: 'zinc',
  copper: 'copper',
  manganese: 'manganese',
  selenium: 'selenium',
  iodine: 'iodine',
  i: 'iodine',
  '碘': 'iodine',
};

function createRecord<TKey extends readonly string[]>(
  keys: TKey,
): { [K in TKey[number]]: number | null } {
  return Object.fromEntries(
    keys.map((key) => [key, null]),
  ) as { [K in TKey[number]]: number | null };
}

export function createEmptyNutritionProfile(): NutritionProfileV2 {
  return {
    meta: { rawBasisType: 'PER_100_G' },
    macros: createRecord(MACRO_NUTRIENT_KEYS),
    minerals: createRecord(MINERAL_NUTRIENT_KEYS),
    vitamins: createRecord(VITAMIN_NUTRIENT_KEYS),
    fattyAcids: createRecord(FATTY_ACID_NUTRIENT_KEYS),
    aminoAcids: createRecord(AMINO_ACID_NUTRIENT_KEYS),
    customItems: [],
  };
}

function isRawBasisType(value: unknown): value is NutritionRawBasisType {
  return (
    value === 'PER_100_G' ||
    value === 'PER_100_ML' ||
    value === 'PER_1_G' ||
    value === 'PER_1_ML' ||
    value === 'PER_SERVING'
  );
}

function mapLegacyBasisType(
  basisType: NutritionItem['basisType'] | undefined,
): NutritionRawBasisType {
  if (basisType === 'PER_1_PCS') {
    return 'PER_SERVING';
  }

  return isRawBasisType(basisType) ? basisType : 'PER_100_G';
}

function normalizeAlias(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[_\s-]+/g, '');
}

function assignLegacyItem(
  profile: NutritionProfileV2,
  item: NutritionItem,
): void {
  const nutrientCode = normalizeAlias(item.nutrientCode);
  const nutrientName = normalizeAlias(item.nutrientName);
  const macroKey = MACRO_ALIASES[nutrientCode] ?? MACRO_ALIASES[nutrientName];
  if (macroKey) {
    profile.macros[macroKey] = item.value;
    return;
  }

  const mineralKey =
    MINERAL_ALIASES[nutrientCode] ?? MINERAL_ALIASES[nutrientName];
  if (mineralKey) {
    profile.minerals[mineralKey] = item.value;
    return;
  }

  profile.customItems.push({
    name: item.nutrientName,
    value: item.value,
    unit: item.unit,
    rawBasisType: mapLegacyBasisType(item.basisType),
    note: item.notes ?? null,
  });
}

export function isLegacyNutritionProfile(
  input: unknown,
): input is LegacyNutritionProfile {
  return !!input && typeof input === 'object' && Array.isArray((input as any).items);
}

export function ensureProfileDefaults(
  input: NutritionProfileV2,
): NutritionProfileV2 {
  const empty = createEmptyNutritionProfile();

  return {
    meta: {
      ...empty.meta,
      ...(input.meta ?? {}),
      rawBasisType: isRawBasisType(input.meta?.rawBasisType)
        ? input.meta.rawBasisType
        : 'PER_100_G',
    },
    macros: {
      ...empty.macros,
      ...(input.macros ?? {}),
    } as MacroNutritionProfileTab,
    minerals: {
      ...empty.minerals,
      ...(input.minerals ?? {}),
    } as MineralNutritionProfileTab,
    vitamins: {
      ...empty.vitamins,
      ...(input.vitamins ?? {}),
    } as VitaminNutritionProfileTab,
    fattyAcids: {
      ...empty.fattyAcids,
      ...(input.fattyAcids ?? {}),
    } as FattyAcidNutritionProfileTab,
    aminoAcids: {
      ...empty.aminoAcids,
      ...(input.aminoAcids ?? {}),
    } as AminoAcidNutritionProfileTab,
    customItems: Array.isArray(input.customItems) ? input.customItems : [],
  };
}

/**
 * Explicit migration helper that upgrades legacy items[] into grouped v2 data.
 * Do not use on default runtime read/write paths while legacy admin compatibility is required.
 */
export function normalizeNutritionProfile(
  input: NutritionProfile | null | undefined,
): NutritionProfileV2 | null {
  if (!input) return null;
  if (!isLegacyNutritionProfile(input)) return ensureProfileDefaults(input);

  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = mapLegacyBasisType(input.items[0]?.basisType);

  for (const item of input.items) {
    assignLegacyItem(profile, item);
  }

  return profile;
}

export const upgradeNutritionProfileToV2 = normalizeNutritionProfile;

/**
 * Safe runtime read helper while the legacy admin editor still expects items[].
 * Legacy payloads stay legacy; structured v2 payloads get defaults filled in.
 */
export function normalizeNutritionProfileForRead(
  input: NutritionProfile | null | undefined,
): NutritionProfile | null {
  if (!input) return null;
  if (isLegacyNutritionProfile(input)) return input;

  return ensureProfileDefaults(input);
}

/**
 * Safe runtime write helper while default admin writes still submit legacy items[].
 * Use this on create/update paths that must not silently upgrade legacy payloads.
 */
export function normalizeNutritionProfileForWrite(
  input: NutritionProfile | null | undefined,
): NutritionProfile | null {
  if (!input) return null;
  if (isLegacyNutritionProfile(input)) return input;

  return ensureProfileDefaults(input);
}

/**
 * Persistence helper for current runtime write paths.
 * Legacy payloads stay legacy; structured v2 payloads stay v2 with defaults filled in.
 */
export function denormalizeNutritionProfileForPersistence(
  input: NutritionProfile | null | undefined,
): NutritionProfile | null {
  return normalizeNutritionProfileForWrite(input);
}
