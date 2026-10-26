/**
 * DIY 制作单 · 补剂候选（2026-10-26）
 *
 * 候选和用量都由后端算好；这里只做“展示行”和“购买行”的映射，
 * 不再根据 nutritionProfile 自己算浓度/克数。
 */

export interface ServerSupplementTarget {
  fieldPath: string;
  label: string;
  unit: string;
  targetValuePerKg: number;
}

export interface ServerDosage {
  status: 'OK' | 'NO_TARGETS' | 'MISSING_CONCENTRATION' | 'UNIT_MISMATCH';
  amount: number | null;
  unit: string;
  targets: ServerSupplementTarget[];
  concentrations: Array<{ fieldPath: string; value: number; unit: string }>;
  missingFieldPaths: string[];
}

export interface ServerCandidate {
  ingredientId: string;
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  purchaseLink?: any;
  imageUrl?: string | null;
  physicalForm?: string | null;
  displayUnit: string;
  isDefault: boolean;
  selectable: boolean;
  unavailableReason?: string | null;
  dosage: ServerDosage;
}

export interface ServerCandidateItem {
  recipeItemId: string;
  sourceIngredientId: string;
  source: 'EQUIVALENCE_GROUP' | 'DEFAULT_ONLY';
  group: { id: string; code: string; name: string; status: string } | null;
  defaultIngredient: {
    ingredientId: string;
    name: string;
    displayUnit: string;
    physicalForm?: string | null;
    diyEnabled: boolean;
    supplementRetailEnabled: boolean;
    selectable: boolean;
    unavailableReason?: string | null;
    dosage: ServerDosage;
  };
  candidates: ServerCandidate[];
  fallbackAmount: number | null;
  unavailableReason: string | null;
  preparationMethod?: string | null;
  addTimingLabel?: string | null;
  sortOrder?: number;
}

export interface SupplementRow {
  recipeItemId: string;
  sourceIngredientId: string;
  selectionKey: string;
  ingredientId: string;
  name: string;
  brand: string;
  productModel?: string;
  purchaseChannel?: string;
  imageUrl?: string;
  purchaseLink?: any;
  physicalForm: string | null;
  displayUnit: string;
  amount: number;
  unit: string;
  purchasable: boolean;
  productionOnly: boolean;
  preparationMethod: string;
  supplementTargets: ServerSupplementTarget[];
  candidates: ServerCandidate[];
  selectedCandidateIndex: number;
  selectedProductDisplayText: string;
  choiceLabel: string;
  hasSpecDetail: boolean;
  canSwitch: boolean;
  unavailableReason: string | null;
  group: ServerCandidateItem['group'];
  groupName: string | null;
  selectionSource: 'DEFAULT' | 'EQUIVALENCE_GROUP' | 'RATIO';
  isDefaultCandidate: boolean;
}

export interface SupplementPurchaseLine {
  recipeItemId: string;
  ingredientId: string;
  name: string;
  unit: string;
  specText: string;
}

function productText(candidate: {
  name: string;
  brand?: string | null;
  productModel?: string | null;
}): string {
  const spec = [candidate.brand, candidate.productModel]
    .filter(Boolean)
    .join(' · ');
  return spec || candidate.name;
}

/**
 * 选中哪个候选：
 *   1. 顾客上次的选择（同 recipeItemId + ingredientId）；
 *   2. 食谱原原料（如果它本身就是可售候选）；
 *   3. 第一个可售候选；
 *   4. 都没有 → 原原料（仅生产，不可购买）。
 */
export function resolveSelectedCandidate(
  item: ServerCandidateItem,
  selections: Record<string, string | undefined> = {},
): { candidate: ServerCandidate | null; index: number } {
  const candidates = item.candidates || [];
  const wanted = selections[item.recipeItemId];
  let index = wanted
    ? candidates.findIndex((candidate) => candidate.ingredientId === wanted)
    : -1;
  if (index < 0) {
    index = candidates.findIndex(
      (candidate) => candidate.ingredientId === item.sourceIngredientId,
    );
  }
  if (index < 0 && candidates.length > 0) index = 0;
  return {
    candidate: index >= 0 ? candidates[index] : null,
    index: index >= 0 ? index : -1,
  };
}

export function buildSupplementRows(
  items: ServerCandidateItem[],
  selections: Record<string, string | undefined> = {},
): SupplementRow[] {
  return [...(items || [])]
    .sort(
      (left, right) =>
        Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0),
    )
    .map((item) => {
      const { candidate, index } = resolveSelectedCandidate(item, selections);
      const dosage = candidate?.dosage ?? item.defaultIngredient.dosage;
      const fallback =
        dosage.status === 'NO_TARGETS'
          ? (item.fallbackAmount ?? 0)
          : null;
      const amount =
        candidate?.dosage.amount ??
        (fallback !== null ? fallback : (dosage.amount ?? 0));
      const purchasable = candidate
        ? candidate.selectable !== false
        : item.defaultIngredient.supplementRetailEnabled === true;
      const selectionSource: SupplementRow['selectionSource'] = candidate
        ? candidate.ingredientId === item.sourceIngredientId
          ? 'DEFAULT'
          : 'EQUIVALENCE_GROUP'
        : fallback !== null
          ? 'RATIO'
          : 'DEFAULT';

      return {
        recipeItemId: item.recipeItemId,
        sourceIngredientId: item.sourceIngredientId,
        selectionKey: item.recipeItemId,
        ingredientId: candidate?.ingredientId ?? item.defaultIngredient.ingredientId,
        name: candidate?.name ?? item.defaultIngredient.name,
        brand: candidate?.brand || '-',
        productModel: candidate?.productModel || undefined,
        purchaseChannel: candidate?.purchaseChannel || undefined,
        imageUrl: candidate?.imageUrl || undefined,
        purchaseLink: candidate?.purchaseLink || undefined,
        physicalForm: candidate?.physicalForm ?? item.defaultIngredient.physicalForm ?? null,
        displayUnit: candidate?.displayUnit ?? item.defaultIngredient.displayUnit,
        amount,
        unit: dosage.unit || item.defaultIngredient.displayUnit,
        purchasable,
        productionOnly: !purchasable,
        preparationMethod:
          item.preparationMethod || item.addTimingLabel || '',
        supplementTargets: dosage.targets || [],
        candidates: item.candidates || [],
        selectedCandidateIndex: index,
        selectedProductDisplayText: candidate
          ? productText(candidate)
          : productText({ name: item.defaultIngredient.name }),
        choiceLabel:
          (item.candidates || []).length > 1 ? '换一个' : '',
        hasSpecDetail: candidate
          ? Boolean(
              candidate.brand ||
                candidate.productModel ||
                candidate.purchaseLink ||
                candidate.imageUrl,
            )
          : false,
        canSwitch: (item.candidates || []).length > 1,
        unavailableReason: item.unavailableReason,
        group: item.group,
        groupName: item.group?.name ?? null,
        selectionSource,
        isDefaultCandidate: candidate?.isDefault ?? true,
      };
    });
}

/** 保存到 DIYSheet.supplementSelections：只存选择结果，不存整份候选 */
export function buildSupplementSelections(rows: SupplementRow[]) {
  return rows.map((row) => ({
    recipeItemId: row.recipeItemId,
    ingredientId: row.ingredientId,
    amount: row.amount,
    unit: row.displayUnit,
    source: row.selectionSource,
    groupCode: row.group?.code ?? null,
    concentrations:
      row.candidates.find(
        (candidate) => candidate.ingredientId === row.ingredientId,
      )?.dosage.concentrations ?? [],
  }));
}

/**
 * 购买行：只带“哪一行 + 选了哪个原料”，不带 amount。
 * 用量由后端按配方重新算（2026-10-26 起不再信任手机算的数）。
 */
export function buildSupplementPurchaseLines(
  rows: SupplementRow[],
): SupplementPurchaseLine[] {
  return rows
    .filter((row) => row.purchasable && row.amount > 0)
    .map((row) => ({
      recipeItemId: row.recipeItemId,
      ingredientId: row.ingredientId,
      name: row.name,
      unit: row.displayUnit,
      specText:
        row.selectedProductDisplayText &&
        row.selectedProductDisplayText !== row.name
          ? row.selectedProductDisplayText
          : '',
    }));
}

/** 从制作单存档恢复“每行选了哪个原料” */
export function selectionsFromSaved(
  saved: unknown,
): Record<string, string> {
  if (!Array.isArray(saved)) return {};
  const result: Record<string, string> = {};
  for (const item of saved) {
    const recipeItemId = String((item as any)?.recipeItemId ?? '').trim();
    const ingredientId = String((item as any)?.ingredientId ?? '').trim();
    if (recipeItemId && ingredientId) {
      result[recipeItemId] = ingredientId;
    }
  }
  return result;
}
