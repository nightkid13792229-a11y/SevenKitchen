export type FoodStateMismatch =
  | 'DRY_DESCRIPTION_WITHOUT_DRY_NAME'
  | 'POWDER_DESCRIPTION_WITHOUT_POWDER_NAME';

const DRY_NAME_MARKERS = [
  '干',
  '乾',
  '干制',
  '干燥',
  '脱水',
  '冻干',
  '风干',
  '風干',
  '晒干',
  '烘干',
  'dry',
  'dried',
  'dehydrated',
] as const;

const POWDER_NAME_MARKERS = [
  '粉',
  '粉末',
  '末',
  'ground',
  'powder',
  'powdered',
  'flour',
  'meal',
] as const;

const DRY_DESCRIPTION_TOKENS = ['dried', 'dehydrated'] as const;
const POWDER_DESCRIPTION_TOKENS = [
  'ground',
  'powder',
  'powdered',
  'flour',
  'meal',
] as const;

export function getFoodStateMismatches(params: {
  ingredientName: string;
  foodDescription: string;
  foodCategory?: string | null;
}): FoodStateMismatch[] {
  const name = normalizeIngredientName(params.ingredientName);
  const descriptionTokens = tokenizeEnglish(params.foodDescription);
  const categoryTokens = tokenizeEnglish(params.foodCategory ?? '');
  const mismatches: FoodStateMismatch[] = [];

  if (
    hasAnyToken(descriptionTokens, DRY_DESCRIPTION_TOKENS) &&
    !isDefaultDryNutOrSeed({ descriptionTokens, categoryTokens }) &&
    !hasAnyMarker(name, DRY_NAME_MARKERS)
  ) {
    mismatches.push('DRY_DESCRIPTION_WITHOUT_DRY_NAME');
  }

  if (
    hasAnyToken(descriptionTokens, POWDER_DESCRIPTION_TOKENS) &&
    !hasAnyMarker(name, POWDER_NAME_MARKERS)
  ) {
    mismatches.push('POWDER_DESCRIPTION_WITHOUT_POWDER_NAME');
  }

  return mismatches;
}

function isDefaultDryNutOrSeed(params: {
  descriptionTokens: readonly string[];
  categoryTokens: readonly string[];
}): boolean {
  const defaultDryTokens = [
    'nut',
    'nuts',
    'seed',
    'seeds',
    'kernel',
    'kernels',
  ];
  return (
    hasAnyToken(params.categoryTokens, defaultDryTokens) ||
    hasAnyToken(params.descriptionTokens, defaultDryTokens)
  );
}

function normalizeIngredientName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, '');
}

function tokenizeEnglish(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
}

function hasAnyMarker(value: string, markers: readonly string[]): boolean {
  return markers.some((marker) => value.includes(marker));
}

function hasAnyToken(
  tokens: readonly string[],
  expectedTokens: readonly string[],
): boolean {
  return expectedTokens.some((token) => tokens.includes(token));
}
