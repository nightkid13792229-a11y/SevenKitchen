import type { FoodCandidate } from './draft-port';
import type { AgentSelection, AgentSelectionItem } from './propose-plan';

/**
 * 选材阶段不再给模型 find_food；提交后再由后端把名称匹配到原料库。
 * 这样模型可以按营养/忌口自由选食材，库里有没有不影响它的候选范围。
 */
export async function matchSelectionToLibrary(
  selection: AgentSelection,
  findFoods: (input: {
    search: string;
    limit: number;
  }) => Promise<FoodCandidate[]>,
): Promise<AgentSelection> {
  const cache = new Map<string, FoodCandidate[]>();
  const items: AgentSelectionItem[] = [];

  for (const item of selection.items) {
    if (item.ingredientId || item.nutritionFoodId) {
      items.push({ ...item, dataStatus: 'AVAILABLE' });
      continue;
    }
    const key = normalizeName(item.name);
    let candidates = cache.get(key);
    if (!candidates) {
      try {
        candidates = await findFoods({ search: key || item.name, limit: 8 });
      } catch {
        candidates = [];
      }
      cache.set(key, candidates);
    }
    const best = pickBestCandidate(item.name, candidates);
    if (best?.type === 'SUPPLEMENT') {
      // 鱼油/海带粉等是补剂，不属于选材阶段的食材。
      continue;
    }
    items.push(
      best
        ? {
            ...item,
            ingredientId: best.ingredientId,
            nutritionFoodId: best.nutritionFoodId,
            dataStatus: 'AVAILABLE',
          }
        : { ...item, dataStatus: 'MISSING' },
    );
  }

  // 补剂剔除后，某个 CFCT 类型可能只剩 1 个；不足 2 个就整类不列。
  const counts = new Map<string, number>();
  for (const item of items) {
    const category = item.foodCategory ?? '其他';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const filtered = items.filter(
    (item) => (counts.get(item.foodCategory ?? '其他') ?? 0) >= 2,
  );

  return { ...selection, items: filtered };
}

function pickBestCandidate(
  name: string,
  candidates: FoodCandidate[],
): FoodCandidate | null {
  const target = normalizeName(name);
  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: matchScore(target, normalizeName(candidate.name)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  const top = scored[0].score;
  const best = scored.filter((entry) => entry.score === top);
  if (best.length > 1) {
    const primary = best.find((entry) => entry.candidate.isPrimary);
    return primary?.candidate ?? null;
  }
  return best[0].candidate;
}

const NAME_ALIASES: Record<string, string[]> = {
  兔肉: ['兔里脊'],
  鳕鱼: ['鳕鱼颈背肉', '狭鳕鱼柳'],
  鱼肉: ['鳕鱼颈背肉', '狭鳕鱼柳'],
  燕麦: ['燕麦', '燕麦米'],
};

function matchScore(target: string, candidate: string): number {
  if (!target || !candidate) return 0;
  if (target === candidate) return 3;
  if (candidate.startsWith(target) || target.startsWith(candidate)) return 2;
  if (candidate.includes(target) || target.includes(candidate)) return 1;
  for (const alias of NAME_ALIASES[target] ?? []) {
    if (candidate === alias) return 3;
    if (candidate.startsWith(alias) || alias.startsWith(candidate)) return 2;
  }
  return 0;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, '')
    .replace(/[\s_\-—·,，。.]/g, '')
    .trim();
}
