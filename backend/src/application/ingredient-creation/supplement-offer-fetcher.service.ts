import { Injectable, Logger } from '@nestjs/common';
import {
  extractProductModelFromTitle,
  SupplementLinkPreviewService,
} from './supplement-link-preview.service';
import {
  parseSupplementLabel,
  extractServingUnits,
} from '../../domain/ingredient/supplement-label-parser';
import {
  buildOfferFacts,
  parseUnitsPerBottle,
} from '../../domain/ingredient/supplement-offer-assembly';
import { dedupeCandidates } from '../../domain/ingredient/supplement-offer-candidates';
import {
  resolvePriceBasis,
  type LabelNutrient,
  type OfferFacts,
  type PriceBasisRule,
} from '../../domain/ingredient/supplement-offer-ranking';

/**
 * 一轮把 iHerb 上这一档形态的商品抓成比价表。
 *
 * 四条规矩：
 * 1. **单瓶失败不拖累整表**：失败进 failed，带一句人话原因；
 * 2. **整表有硬上限**：到点就回已抓到的，标 partial；
 * 3. **结果缓存 30 分钟**：重试不重复抓，也别把 iHerb 抓崩；
 * 4. 只走 `SupplementLinkPreviewService` 的抓取通道，不直连电商。
 */
const CONCURRENCY = 3;
const PER_OFFER_TIMEOUT_MS = 20_000;
const TOTAL_BUDGET_MS = 75_000;
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface FetchOffersInput {
  keyword: string;
  limit: number;
  nutrientKey: string;
  /** 本次选定的形态档位；只用于给每行打标记，不用于过滤 */
  formLevel?: string | null;
}

export interface FetchOffersResult {
  offers: OfferFacts[];
  failed: { url: string; name: string; reason: string }[];
  partial: boolean;
}

interface CandidateSnapshot {
  url: string;
  name: string;
  priceCny: number | null;
  unitsPerBottle: number | null;
  servingUnitsPerDose: number | null;
  nutrients: LabelNutrient[];
}

@Injectable()
export class SupplementOfferFetcherService {
  private readonly logger = new Logger(SupplementOfferFetcherService.name);
  private readonly cache = new Map<string, { at: number; value: CandidateSnapshot }>();

  constructor(private readonly preview: SupplementLinkPreviewService) {}

  async fetchOffers(input: FetchOffersInput): Promise<FetchOffersResult> {
    const rule = resolvePriceBasis(input.nutrientKey);
    // 搜索会把同一件商品以多个链接返回：多要一些，去重后再截到 limit，否则表里是同一瓶重复五次。
    const want = Math.min(input.limit * 3, 20);
    let rawCandidates = await this.preview.searchCandidates(input.keyword, want, 'cn.iherb.com');
    // 人民币站货少：不够就再搜一次全站，区域站的商品大概率抓不到价格，但至少让它出现在「没读出来」里
    if (dedupeCandidates(rawCandidates).length < 3) {
      rawCandidates = rawCandidates.concat(
        await this.preview.searchCandidates(input.keyword, want, 'iherb.com'),
      );
    }
    const candidates = dedupeCandidates(rawCandidates).slice(0, input.limit);

    const offers: OfferFacts[] = [];
    const failed: FetchOffersResult['failed'] = [];
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    let partial = false;

    await runWithConcurrency(candidates, CONCURRENCY, async (candidate) => {
      if (Date.now() > deadline) {
        partial = true;
        failed.push({ url: candidate.url, name: candidate.name, reason: '整表超时，这瓶没读完' });
        return;
      }

      try {
        const snapshot = await this.withTimeout(
          this.loadSnapshot(candidate.url, candidate.name, rule),
          PER_OFFER_TIMEOUT_MS,
        );
        const built = buildOfferFacts(
          { ...snapshot, formLevel: input.formLevel ?? null },
          rule,
        );
        if (built.ok) {
          offers.push(built.offer);
        } else {
          failed.push({ url: built.url, name: built.name, reason: built.reason });
        }
      } catch (error) {
        const reason =
          error instanceof Error && error.message === 'TIMEOUT'
            ? '单瓶读取超时'
            : this.humanize(error);
        failed.push({ url: candidate.url, name: candidate.name, reason });
      }
    });

    if (Date.now() > deadline) {
      partial = true;
    }

    this.logger.log(
      `[supplement-compare] keyword=${input.keyword} offers=${offers.length} failed=${failed.length} partial=${partial}`,
    );

    return { offers, failed, partial };
  }

  /**
   * 抓一瓶：先读商品页（价格 + 能抽出来的标签），
   * 抽不到营养素再按商品 slug 从搜索缓存里捞标签正文。
   *
   * 商品页的正文抽取经常漏掉成分表（标签是图），这一步的兜底就是为它准备的。
   */
  private async loadSnapshot(
    url: string,
    fallbackName: string,
    rule: PriceBasisRule,
  ): Promise<CandidateSnapshot> {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.value;
    }

    const page = await this.preview.preview(url);
    const name = page.productName?.trim() || fallbackName;

    let nutrients: LabelNutrient[] = page.nutrients.map((item) => ({
      fieldPath: item.fieldPath,
      value: item.value,
      unit: item.unit,
    }));
    let servingUnitsPerDose = page.servingUnitsPerDose;

    // 商品页正文经常只有一半：要么没有本次要比的营养素，要么没有 Serving Size。
    // 这两种都值得再从搜索缓存里把标签正文捞一次，否则明明有标签的商品会被判「算不出」。
    const hasBasisRow = rule.fieldPaths.some((path) =>
      nutrients.some((item) => item.fieldPath === path),
    );
    const needsLabel = nutrients.length === 0 || !hasBasisRow || servingUnitsPerDose === null;
    if (needsLabel) {
      const label = await this.preview.readLabelText(url);
      if (label.labelText) {
        const parsed = parseSupplementLabel(label.labelText);
        if (parsed.nutrients.length > nutrients.length) {
          nutrients = parsed.nutrients.map((item) => ({
            fieldPath: item.fieldPath,
            value: item.value,
            unit: item.unit,
          }));
        }
        servingUnitsPerDose = servingUnitsPerDose ?? extractServingUnits(label.labelText);
      }
    }

    const model = page.productModel ?? extractProductModelFromTitle(name);
    const snapshot: CandidateSnapshot = {
      url: page.productUrl || url,
      name,
      priceCny: page.pagePriceCny,
      unitsPerBottle: parseUnitsPerBottle(model),
      servingUnitsPerDose,
      nutrients,
    };

    this.cache.set(url, { at: Date.now(), value: snapshot });
    return snapshot;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('TIMEOUT')), ms);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /** 把抓取层的中文报错原样带出去；认不出就给一句不吓人的话。 */
  private humanize(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/标签|读不出|读取|超时|跳转/.test(message)) {
      return message;
    }
    return '这瓶没读出来（可能被挡或页面改版）';
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}
