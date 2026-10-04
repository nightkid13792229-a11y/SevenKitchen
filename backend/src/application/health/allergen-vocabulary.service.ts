import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { splitAllergyKeywords } from '../../domain/dog/allergy-keywords';
import {
  buildAllergenVocabulary,
  findIngredientAllergenHits,
  listAllergensByCommonRank,
  normalizeTerm as normalizeAllergenTerm,
  type AllergenHit,
  type AllergenVocabulary,
  type AllergenVocabularyEntry,
} from '../../domain/dog/allergen-vocabulary';

/** 一只狗的过敏档案（小程序首页筛选、健康页结论区、后台营养师面板共用） */
export interface DogAllergenProfile {
  allergens: Array<{
    /** 标准名（词表收录时）或顾客原文 */
    allergen: string;
    certainty: string;
    source: string;
    standardName: string | null;
    inVocabulary: boolean;
  }>;
  /** 原料库里会被这些过敏原命中的食材名（确诊 + 可疑/待排查） */
  avoidedIngredientNames: string[];
  /** 其中属于"确诊"的食材名 */
  confirmedIngredientNames: string[];
  hasAnyAllergen: boolean;
}

/** 同一个过敏原可能被多条记录写出来，展示时去重（保留首次出现的可信度） */
function dedupeAllergens(
  items: DogAllergenProfile['allergens'],
): DogAllergenProfile['allergens'] {
  const seen = new Set<string>();
  const result: DogAllergenProfile['allergens'] = [];
  for (const item of items) {
    const key = `${item.allergen}::${item.certainty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * 过敏原词表的加载与缓存（2026-10-04，过敏重构第一期）。
 *
 * 词表是**读多写极少**的数据：改一次要人工维护，读的时候每一份推荐、
 * 每一次配方生成都要用。所以这里做一层内存缓存，避免每次推荐都查两张表。
 *
 * 缓存策略：进程内缓存 + TTL。营养师在后台改完词表后，
 * 下一次 TTL 到期就会生效；需要立刻生效时调用 invalidate()。
 * 多实例部署时各实例各自缓存，最长延迟一个 TTL ——
 * 对"过敏原词表"这种分钟级都不变的配置数据，这个代价可以接受。
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class AllergenVocabularyService {
  private cached: AllergenVocabulary | null = null;
  private cachedAt = 0;
  private loading: Promise<AllergenVocabulary> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** 取词表（带缓存） */
  async getVocabulary(): Promise<AllergenVocabulary> {
    const now = Date.now();
    if (this.cached && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }

    // 并发请求只查一次库
    if (!this.loading) {
      this.loading = this.load()
        .then((vocabulary) => {
          this.cached = vocabulary;
          this.cachedAt = Date.now();
          return vocabulary;
        })
        .finally(() => {
          this.loading = null;
        });
    }

    return this.loading;
  }

  /** 词表更新后调用，让下一次读取重新加载 */
  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }

  /**
   * 检查一组食材会碰到这只狗的哪些过敏原。
   *
   * 这是推荐、配方、后台共用的一道闸门 —— 三个地方读同一份词表、
   * 走同一段逻辑，避免"推荐挡住了、配方没挡住"这种不一致。
   */
  async matchIngredients(params: {
    dogAllergens: readonly string[];
    ingredientNames: readonly string[];
  }): Promise<AllergenHit[]> {
    if (params.dogAllergens.length === 0 || params.ingredientNames.length === 0) {
      return [];
    }
    const vocabulary = await this.getVocabulary();
    return findIngredientAllergenHits({
      dogAllergens: params.dogAllergens,
      ingredientNames: params.ingredientNames,
      vocabulary,
    });
  }

  /** 按常见度排序的词条（小程序「一点即选」用） */
  async listCommonAllergens(limit?: number): Promise<AllergenVocabularyEntry[]> {
    const vocabulary = await this.getVocabulary();
    return listAllergensByCommonRank(vocabulary, limit);
  }

  /**
   * 这只狗的过敏档案（2026-10-04 第一期）。
   *
   * 给三个地方共用：小程序首页的「挑食/过敏」筛选、健康管理页的
   * 「不能吃的」清单、后台的营养师面板 —— 三处读同一份口径，
   * 避免"推荐挡住了、首页筛选没挡住"这种不一致。
   *
   * 返回两样东西：
   *   · allergens               —— 档案里的过敏原（带可信度），界面直接展示
   *   · avoidedIngredientNames  —— **原料库里**含这些过敏原的食材名，
   *     界面拿它去做筛选 / 高亮。已排除（RULED_OUT）的不算。
   */
  async getDogAllergenProfile(dogId: string): Promise<DogAllergenProfile> {
    const vocab = await this.getVocabulary();

    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      select: {
        allergyFoods: true,
        allergyRecords: {
          select: { allergen: true, certainty: true, source: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const empty: DogAllergenProfile = {
      allergens: [],
      avoidedIngredientNames: [],
      confirmedIngredientNames: [],
      hasAnyAllergen: false,
    };
    if (!dog) return empty;

    const allergens: DogAllergenProfile['allergens'] = [];
    const blockingTerms: string[] = [];
    const warningTerms: string[] = [];

    for (const record of dog.allergyRecords ?? []) {
      const certainty = String(record.certainty || 'SUSPECTED').toUpperCase();
      const terms = splitAllergyKeywords(record.allergen);
      if (terms.length === 0) continue;

      for (const term of terms) {
        const entry = this.resolveEntry(vocab, term);
        allergens.push({
          allergen: entry?.name ?? term,
          certainty,
          source: record.source ?? 'OWNER',
          standardName: entry?.name ?? null,
          inVocabulary: Boolean(entry),
        });
      }

      // 已排除的不再避开
      if (certainty === 'RULED_OUT') continue;
      if (certainty === 'CONFIRMED') {
        blockingTerms.push(...terms);
      } else {
        warningTerms.push(...terms);
      }
    }

    // 旧文本字段（员工在设计备注里维护）：没有可信度信息，按"可疑"处理
    for (const term of splitAllergyKeywords(dog.allergyFoods)) {
      const entry = this.resolveEntry(vocab, term);
      allergens.push({
        allergen: entry?.name ?? term,
        certainty: 'SUSPECTED',
        source: 'STAFF',
        standardName: entry?.name ?? null,
        inVocabulary: Boolean(entry),
      });
      warningTerms.push(term);
    }

    const allTerms = Array.from(new Set([...blockingTerms, ...warningTerms]));
    if (allTerms.length === 0) {
      return { ...empty, allergens: dedupeAllergens(allergens) };
    }

    // 原料库里有哪些食材会被这些过敏原命中。
    // ingredientIndex 的键是归一化过的，这里还原成原始食材名给界面用。
    const ingredientNames = Array.from(vocab.ingredientIndex.keys());
    const originalNames = await this.loadIngredientNamesByNormalizedKey();
    const toOriginal = (key: string) => originalNames.get(key) ?? key;

    const allHits = findIngredientAllergenHits({
      dogAllergens: allTerms,
      ingredientNames,
      vocabulary: vocab,
    });
    const confirmedHits = findIngredientAllergenHits({
      dogAllergens: Array.from(new Set(blockingTerms)),
      ingredientNames,
      vocabulary: vocab,
    });

    return {
      allergens: dedupeAllergens(allergens),
      avoidedIngredientNames: Array.from(
        new Set(allHits.map((hit) => toOriginal(hit.ingredientName))),
      ).sort(),
      confirmedIngredientNames: Array.from(
        new Set(confirmedHits.map((hit) => toOriginal(hit.ingredientName))),
      ).sort(),
      hasAnyAllergen: true,
    };
  }

  private resolveEntry(vocabulary: AllergenVocabulary, term: string) {
    const code = vocabulary.termToCode.get(normalizeAllergenTerm(term));
    return code ? vocabulary.entryByCode.get(code) : undefined;
  }

  /** 归一化食材名 → 原始食材名（把匹配结果还原成界面上显示的名字） */
  private async loadIngredientNamesByNormalizedKey(): Promise<Map<string, string>> {
    const ingredients = await this.prisma.ingredient.findMany({
      select: { name: true },
    });
    const map = new Map<string, string>();
    for (const ingredient of ingredients) {
      const key = normalizeAllergenTerm(ingredient.name);
      if (key && !map.has(key)) {
        map.set(key, ingredient.name);
      }
    }
    return map;
  }

  private async load(): Promise<AllergenVocabulary> {
    const [tags, links] = await Promise.all([
      this.prisma.allergenTag.findMany({
        where: { enabled: true },
        select: { code: true, name: true, aliases: true, commonRank: true },
        orderBy: [{ commonRank: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.ingredientAllergenTag.findMany({
        select: {
          allergenTag: { select: { code: true } },
          ingredient: { select: { name: true } },
        },
      }),
    ]);

    return buildAllergenVocabulary({
      entries: tags.map((tag) => ({
        code: tag.code,
        name: tag.name,
        aliases: tag.aliases ?? [],
        commonRank: tag.commonRank,
      })),
      links: links
        .filter((link) => link.allergenTag && link.ingredient)
        .map((link) => ({
          ingredientName: link.ingredient.name,
          allergenCode: link.allergenTag.code,
        })),
    });
  }
}
