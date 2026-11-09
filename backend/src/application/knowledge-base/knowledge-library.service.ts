import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';
import { getKnowledgeSource } from '../../domain/recipe-designer/knowledge-base/source-registry';
import { normalizeTopic, TOPIC_ALIASES } from '../../domain/knowledge/topic-aliases';
import { domainRoutingBoost } from '../../domain/knowledge/domain-routing';
import {
  SectionCatalogService,
  type CatalogSection,
} from './section-catalog.service';
import {
  extractQueryFocus,
  expandQuery,
  isBackgroundTerm,
  matchesNeedle,
  normalizeForMatch,
  type QueryFocus,
} from './query-expansion';
import {
  deriveDisplayTitle,
  detectStageHints,
  extractSubheading,
} from './section-display';

/**
 * 知识库原文检索（只读）。
 *
 * 这一层只做“按问题找节”：返回原文段落 + 来源/章节/页码，不返回结论。
 * 模型自己读原文、自己判断、自己引用；知识库不替它下结论。
 *
 * 2026-11-09 最小图书馆版（spec v1.1 §7）：
 * - 宽召回：扩展词 OR，同时匹配段落正文与节标题，`take` 只做全库保护，不按 ID 截断；
 * - 门禁只做相关性，不做物种/分期/主题硬过滤：topicPhrases 非空必须命中；
 *   否则 focusTerms OR stagePhrases；三组都空才不门禁；
 * - 物种/分期/主题/结构性提示只影响排序；
 * - `searchSections` 按节分组：≤5 节、每节 ≤2 段、同一文档 ≤2 节。
 */

export interface LibraryPassage {
  id: string;
  text: string;
  truncated: boolean;
  sourceId: string | null;
  sourceName: string | null;
  sourceVersion?: string | null;
  sourceRole?: string | null;
  documentId: string;
  documentTitle: string | null;
  sectionId: string;
  sectionTitle: string;
  pageStart: number | null;
  pageEnd?: number | null;
  score: number;
  /** CKD 章节目录元数据；全库检索时不返回。 */
  documentType?: string;
  authority?: string;
  sectionType?: string;
  species?: string;
  stages?: number[];
  topics?: string[];
}

export interface SectionHit {
  sectionId: string;
  sectionTitle: string;
  /** 展示用标题：页眉型标题降级成「来源名 · 第37章 · p787」。 */
  displayTitle: string;
  /** 命中段落里的第一条结构行（`Stage 3 Canine patients:` / `Table 37-9`…）。 */
  subheading: string | null;
  documentId: string;
  documentTitle: string | null;
  sourceId: string | null;
  sourceName: string | null;
  sourceVersion: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  score: number;
  /** ≤2 段。 */
  passages: LibraryPassage[];
}

export interface LibrarySearchOptions {
  /** 只在这些来源里找；不传则全库。 */
  sourceIds?: string[];
  /** 只在这些文档里找；用于试点/专题收窄。 */
  documentIds?: string[];
  /** 只在这些章节里找。 */
  sectionIds?: string[];
  /** 物种提示：只影响排序，不会排除。 */
  species?: 'dog' | 'cat';
  /** 分期提示：召回扩展 + 排序提示，不会排除其他分期。 */
  stage?: 1 | 2 | 3 | 4;
  /** 主题提示：只影响排序，不会排除。 */
  topics?: string[];
  /** 返回条数，默认 8，最多 200（工具层另有自己的上限）。 */
  limit?: number;
}

function detectSpecies(text: string): 'dog' | 'cat' | 'both' | 'unknown' {
  const lower = text.toLowerCase();
  const dog = /\b(dog|dogs|canine)\b/.test(lower) || text.includes('犬');
  const cat = /\b(cat|cats|feline)\b/.test(lower) || text.includes('猫');
  if (dog && cat) return 'both';
  if (dog) return 'dog';
  if (cat) return 'cat';
  return 'unknown';
}

function detectStages(text: string): number[] {
  return detectStageHints(text);
}

/** 主题提示：受控 key 或别名命中即可。 */
function matchesTopic(text: string, topic: string): boolean {
  const hay = String(text ?? '').toLowerCase();
  if (!hay) return false;
  const key = normalizeTopic(topic);
  const aliases = key ? TOPIC_ALIASES[key] : undefined;
  if (aliases?.length) {
    return aliases.some((alias) => alias && hay.includes(alias.toLowerCase()));
  }
  const needle = String(topic ?? '').trim().toLowerCase();
  return needle.length > 0 && hay.includes(needle);
}

/** 表格/图表 caption（`Table 37-9. …`）—— 表格没 section_id，只能在段落文本里找。 */
const TABLE_CAPTION = /\b(?:Table|Box|Figure)\s+\d+[.-]\d+[^\n]{0,140}/i;

function extractTableCaption(text: string): string | null {
  const match = String(text ?? '').match(TABLE_CAPTION);
  return match ? match[0] : null;
}

const DEFAULT_LIMIT = 8;
/** 内部上限：`searchSections` 要 200 段候选；工具层仍自己限 10。 */
const MAX_LIMIT = 200;
/** 全库保护：常见 CKD 查询 11,973 段命中时也不至于把库拖死。 */
const MAX_CANDIDATES = 20000;
/** 目录缓存时间：10 分钟内同一文档不重复构建。 */
const CATALOG_TTL_MS = 10 * 60 * 1000;
/** searchSections 的候选段数（避免单节段落太多把别的节挤掉）。 */
const MAX_SECTION_CANDIDATES = 200;
const MAX_SECTION_PASSAGES = 2;
const MAX_SECTIONS_PER_DOCUMENT = 2;
const MAX_SECTIONS = 5;
const MAX_QUERY_TERMS = 16;
const MAX_TEXT_CHARS = 900;
/**
 * 背景词在打分里的权重（已登记，见 `knowledge-library.service.spec.ts`
 * 「背景词不得压过焦点词」用例）。
 *
 * 背景词（ckd / dog / canine / staging / treatment / target …）只参与排序，
 * 权重压到 0.25：否则「一段反复说 CKD、犬、管理」的长段落能靠堆背景词
 * 盖过真正讲 phosphorus / UPC 的段落 —— 这正是 spec 说的
 * 「中文查询返回任意结果」的成因。
 */
const BACKGROUND_TERM_WEIGHT = 0.25;

/**
 * 组级「标题点名查询主题」加成（spec §7.3 第 4 步的「标题/子标题命中加成」，
 * spec 未规定数值，这里正式登记）：
 * - 节标题/子标题点名了查询主题（`2a. Substaging by Proteinuria`）→ ×2；
 * - 只命中分期号（`Stage 2 Canine patients:`）→ ×1.3。
 *
 * 为什么比段级 ×1.3 重：一节的名字就叫这个主题，比正文里提一次强得多；
 * 这是「找节」最强的信号，但仍然只影响排序、不排除任何节。
 */
const HEADING_TOPIC_BOOST = 2;
const HEADING_STAGE_BOOST = 1.3;

/**
 * 通用 nutrition-section 加成（spec §7.3 的 Task 6 授权，2026-11-09 校准）。
 *
 * 问题：`犬慢性肾病 膳食磷 范围` / `CKD dog dietary phosphate target` 这类
 * 「要范围/推荐」的问法，命中最多的是顺手提到磷的正文节（肾性甲状旁腺功能亢进、
 * 尿蛋白检测），而真正列「Key nutritional factors / feeding plan」的营养节
 * （例如 37-9 所在节）反被挤到第 3–4 位，再被「同一文档 ≤2 节」裁掉。
 *
 * 处理：查询带「膳食/范围/推荐/dietary/% DM/range/recommendation」时，给
 * 「首段出现 `Key nutritional factors` / `feeding plan`」或「候选段的表格 caption
 * 是这类营养因素表」的节 ×1.15。
 * **不硬编码任何 sectionId**，也不排除任何节，只在 `searchSections` 的组分数上加分。
 */
const NUTRITION_INTENT = /dietary|%\s*dm|range|recommendation|膳食|范围|推荐/i;
const NUTRITION_SECTION_PHRASE = /key nutritional factors|feeding plan/i;
const NUTRITION_SECTION_BOOST = 1.15;

const STOP = new Set(
  'a an the and or of to in on for with by is are was were be been being this that these those as at from it its their there can may should could would not no than then when where which who whom whose what how why'.split(
    ' ',
  ),
);

@Injectable()
export class KnowledgeLibraryService {
  private readonly catalog: SectionCatalogService;
  /** 按文档缓存目录；只建"这次候选里出现过的文档"，不再一次性建全库。 */
  private readonly catalogSections = new Map<string, CatalogSection>();
  private readonly catalogDocuments = new Map<string, any>();
  private readonly catalogBuiltAt = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {
    this.catalog = new SectionCatalogService(prisma);
  }

  /**
   * 只构建缺失/过期的文档目录；任何文档都能建，不再受 CKD 白名单限制。
   * 传空数组是 no-op；没有 sourceDocument 表的单测环境直接跳过。
   */
  async ensureCatalogs(documentIds: readonly string[]): Promise<void> {
    if (!(this.prisma as any).sourceDocument?.findMany) return;
    const now = Date.now();
    const missing = [
      ...new Set(
        documentIds.map((id) => String(id ?? '').trim()).filter(Boolean),
      ),
    ].filter((id) => {
      const at = this.catalogBuiltAt.get(id);
      return at === undefined || now - at > CATALOG_TTL_MS;
    });
    if (missing.length === 0) return;
    const built = await this.catalog.build(missing);
    for (const section of built.sections) {
      this.catalogSections.set(section.id, section);
    }
    for (const document of built.documents) {
      this.catalogDocuments.set(document.id, document);
    }
    for (const id of missing) this.catalogBuiltAt.set(id, now);
  }

  async search(
    query: string,
    options: LibrarySearchOptions = {},
  ): Promise<LibraryPassage[]> {
    const raw = String(query ?? '').trim();
    if (!raw) return [];

    const focus = extractQueryFocus(raw);
    const terms = this.queryTerms(raw);
    if (terms.length === 0) return [];

    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Math.floor(options.limit ?? DEFAULT_LIMIT)),
    );
    const sourceIds = (options.sourceIds ?? [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
    const documentIds = (options.documentIds ?? [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
    const sectionIds = (options.sectionIds ?? [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);

    // 宽召回：扩展词 OR；正文与节标题都进 OR（标题写 blood pressure、正文只写 BP 的段也要召到）。
    const rows = await this.prisma.sourceParagraph.findMany({
      where: {
        OR: [
          ...terms.map((term) => ({
            text: { contains: term, mode: 'insensitive' as const },
          })),
          ...terms.map((term) => ({
            section: { title: { contains: term, mode: 'insensitive' as const } },
          })),
        ],
        ...(sourceIds.length > 0
          ? { document: { sourceId: { in: sourceIds } } }
          : {}),
        ...(documentIds.length > 0 ? { documentId: { in: documentIds } } : {}),
        ...(sectionIds.length > 0 ? { sectionId: { in: sectionIds } } : {}),
      },
      include: {
        document: { select: { id: true, title: true, sourceId: true } },
        section: { select: { id: true, title: true, pageNo: true } },
      },
      orderBy: { id: 'asc' },
      take: MAX_CANDIDATES,
    });

    // 相关性门禁（不做分期/物种/主题排除）
    const candidates = rows.filter((row) => this.passesGate(row, focus));

    // 目录只为候选里出现的文档构建；全库检索也不会一次拉起 159 份。
    await this.ensureCatalogs(candidates.map((row) => row.documentId));

    const numericIntent =
      /(多少|范围|上限|推荐|剂量|百分比|percent|range|how much|mg\/|%)/i.test(raw) ||
      (raw.match(/\d+(?:\.\d+)?%?/g) ?? []).length >= 2;

    // 稀有词加权：候选里到处都有的词（dog/ckd）权重低，
    // 只有少数段落有的词（phosphorus/UPC）权重高。
    const df = new Map<string, number>();
    for (const row of candidates) {
      const lower = (row.text ?? '').toLowerCase();
      for (const term of terms) {
        if (lower.includes(term.toLowerCase())) {
          df.set(term, (df.get(term) ?? 0) + 1);
        }
      }
    }
    const weights = new Map(
      terms.map((term) => [
        term,
        (isBackgroundTerm(term) ? BACKGROUND_TERM_WEIGHT : 1) *
          (1 + Math.log((candidates.length + 1) / (1 + (df.get(term) ?? 0)))),
      ]),
    );
    const scored = candidates.map((row) => {
      const meta = this.catalogSections.get(row.sectionId);
      return {
        row,
        meta,
        score:
          this.score(row.text ?? '', terms, raw, numericIntent, weights) *
          this.softBoost(row, meta, options, raw, focus),
      };
    });
    scored.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));

    return scored.slice(0, limit).map(({ row, score, meta }) => {
      const sourceId = row.document?.sourceId ?? null;
      const source = sourceId ? getKnowledgeSource(sourceId) : undefined;
      const documentMeta = this.catalogDocuments.get(row.documentId);
      const text = row.text ?? '';
      const truncated = text.length > MAX_TEXT_CHARS;
      return {
        id: row.id,
        text: truncated ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text,
        truncated,
        sourceId,
        sourceName: source?.name ?? sourceId,
        sourceVersion: source?.version ?? null,
        sourceRole: source?.role ?? null,
        documentId: row.documentId,
        documentTitle: row.document?.title ?? null,
        sectionId: row.sectionId,
        sectionTitle: row.section?.title ?? '',
        pageStart: row.pageStart ?? row.section?.pageNo ?? null,
        pageEnd: row.pageEnd ?? null,
        score: Math.round(score * 100) / 100,
        ...(meta
          ? {
              documentType: documentMeta?.documentType,
              authority: documentMeta?.authority,
              sectionType: meta.sectionType,
              species: meta.species,
              stages: meta.stages,
              topics: meta.topics,
            }
          : {}),
      };
    });
  }

  /**
   * 按节分组的检索：
   * 1. 取最多 200 段候选；2. 按 sectionId 分组；3. 每组取最高分 2 段；
   * 4. 组分数 = 最高段分 ×（标题/子标题命中加成）×（营养节加成）；
   * 5. 同一文档最多 2 节；6. 取前 5 节。
   */
  async searchSections(
    query: string,
    options: LibrarySearchOptions = {},
  ): Promise<SectionHit[]> {
    const limit = Math.min(
      MAX_SECTIONS,
      Math.max(1, Math.floor(options.limit ?? MAX_SECTIONS)),
    );
    const passages = await this.search(query, {
      ...options,
      limit: MAX_SECTION_CANDIDATES,
    });
    if (passages.length === 0) return [];

    const focus = extractQueryFocus(query);
    const contentNeedles = [...focus.topicPhrases, ...focus.focusTerms]
      .map((needle) => normalizeForMatch(needle))
      .filter(Boolean);
    const stageNeedles = focus.stagePhrases
      .map((needle) => normalizeForMatch(needle))
      .filter(Boolean);

    // passages 已按分数降序，所以每组前 2 段就是该节最高分的 2 段。
    const groups = new Map<string, LibraryPassage[]>();
    for (const passage of passages) {
      const list = groups.get(passage.sectionId);
      if (!list) {
        groups.set(passage.sectionId, [passage]);
      } else if (list.length < MAX_SECTION_PASSAGES) {
        list.push(passage);
      }
    }

    const hits: Array<SectionHit & { groupScore: number }> = [];
    const nutritionSections = new Set<string>();
    if (NUTRITION_INTENT.test(query)) {
      for (const sectionId of await this.findNutritionSections([
        ...groups.keys(),
      ])) {
        nutritionSections.add(sectionId);
      }
      // 第二个信号：候选段的表格 caption 就是营养因素表（`Table 37-9. Key nutritional factors…`）。
      for (const [sectionId, list] of groups) {
        if (
          list.some((passage) => {
            const caption = extractTableCaption(passage.text);
            return caption ? NUTRITION_SECTION_PHRASE.test(caption) : false;
          })
        ) {
          nutritionSections.add(sectionId);
        }
      }
    }
    for (const [sectionId, list] of groups) {
      const top = list[0];
      const subheading = extractSubheading(top.text);
      const headingHay = normalizeForMatch(
        `${top.sectionTitle}\n${subheading ?? ''}`,
      );
      // 节标题点名了查询主题（`2a. Substaging by Proteinuria`）是最强的“找节”信号；
      // 只命中分期号（`Stage 2 Canine patients:`）弱一些，但仍然算加成。
      const contentHit = contentNeedles.some((needle) =>
        matchesNeedle(headingHay, needle),
      );
      const stageHit = stageNeedles.some((needle) =>
        matchesNeedle(headingHay, needle),
      );
      const headingBoost = contentHit
        ? HEADING_TOPIC_BOOST
        : stageHit
          ? HEADING_STAGE_BOOST
          : 1;
      const nutritionBoost = nutritionSections.has(sectionId)
        ? NUTRITION_SECTION_BOOST
        : 1;
      const pageStarts = list
        .map((passage) => passage.pageStart)
        .filter((value): value is number => typeof value === 'number');
      const pageEnds = list
        .map((passage) => passage.pageEnd)
        .filter((value): value is number => typeof value === 'number');
      hits.push({
        sectionId,
        sectionTitle: top.sectionTitle,
        displayTitle: deriveDisplayTitle({
          title: top.sectionTitle,
          sourceName: top.sourceName,
          pageNo: pageStarts.length > 0 ? Math.min(...pageStarts) : null,
        }),
        subheading,
        documentId: top.documentId,
        documentTitle: top.documentTitle,
        sourceId: top.sourceId,
        sourceName: top.sourceName,
        sourceVersion: top.sourceVersion ?? null,
        pageStart: pageStarts.length > 0 ? Math.min(...pageStarts) : null,
        pageEnd:
          pageEnds.length > 0
            ? Math.max(...pageEnds)
            : pageStarts.length > 0
              ? Math.max(...pageStarts)
              : null,
        score: Math.round(top.score * headingBoost * nutritionBoost * 100) / 100,
        passages: list,
        groupScore: top.score * headingBoost * nutritionBoost,
      });
    }

    hits.sort(
      (a, b) => b.groupScore - a.groupScore || a.sectionId.localeCompare(b.sectionId),
    );

    const perDocument = new Map<string, number>();
    const selected: SectionHit[] = [];
    for (const hit of hits) {
      const used = perDocument.get(hit.documentId) ?? 0;
      if (used >= MAX_SECTIONS_PER_DOCUMENT) continue;
      perDocument.set(hit.documentId, used + 1);
      const { groupScore: _groupScore, ...section } = hit;
      selected.push(section);
      if (selected.length >= limit) break;
    }
    return selected;
  }

  /**
   * 哪些候选节是「营养节」：首段或表格 caption 出现 `Key nutritional factors` / `feeding plan`。
   *
   * 只看候选节（`searchSections` 已分组），两次查询都走 `section_id` 索引：
   * 1. 捞含短语的段 → 候选节；
   * 2. 捞这些节的段（按 id 升序，每节第一条就是首段）→ 判断首段是否含短语。
   *
   * 不硬编码 sectionId；查不到就返回空集（不加分，也不影响检索本身）。
   */
  private async findNutritionSections(
    sectionIds: string[],
  ): Promise<Set<string>> {
    const out = new Set<string>();
    if (sectionIds.length === 0) return out;
    if (!(this.prisma as any).sourceParagraph?.findMany) return out;

    const phraseMatches = await this.prisma.sourceParagraph.findMany({
      where: {
        sectionId: { in: sectionIds },
        OR: [
          {
            text: {
              contains: 'Key nutritional factors',
              mode: 'insensitive' as const,
            },
          },
          {
            text: { contains: 'feeding plan', mode: 'insensitive' as const },
          },
        ],
      },
      select: { sectionId: true },
    });
    const candidates = [
      ...new Set(phraseMatches.map((row) => String(row.sectionId ?? ''))),
    ].filter(Boolean);
    if (candidates.length === 0) return out;

    const firstParagraphs = await this.prisma.sourceParagraph.findMany({
      where: { sectionId: { in: candidates } },
      select: { id: true, sectionId: true, text: true },
      orderBy: { id: 'asc' },
    });
    const seen = new Set<string>();
    for (const row of firstParagraphs) {
      if (seen.has(row.sectionId)) continue;
      seen.add(row.sectionId);
      if (NUTRITION_SECTION_PHRASE.test(row.text ?? '')) {
        out.add(row.sectionId);
      }
    }
    return out;
  }

  private queryTerms(query: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const term of expandQuery(query)) {
      const value = String(term ?? '').trim();
      const key = value.toLowerCase();
      if (!key || key.length < 2 || STOP.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= MAX_QUERY_TERMS) break;
    }
    return out;
  }

  /**
   * 相关性门禁（用 节标题 + 段落正文 校验）：
   * 1. `topicPhrases` 非空 → 必须命中任一 topicPhrase（vitamin k 不能靠 vitamin 过）；
   * 2. 否则 → 命中任一 `focusTerms` 或任一 `stagePhrases`；
   * 3. 三组都空（只问 `CKD dog` 这类泛问题）→ 不门禁，退回背景词召回。
   */
  private passesGate(
    row: { text?: string | null; section?: { title?: string | null } | null },
    focus: QueryFocus,
  ): boolean {
    const haystack = normalizeForMatch(
      `${row.section?.title ?? ''}\n${row.text ?? ''}`,
    );
    if (focus.topicPhrases.length > 0) {
      return focus.topicPhrases.some((phrase) => matchesNeedle(haystack, phrase));
    }
    if (focus.focusTerms.length === 0 && focus.stagePhrases.length === 0) {
      return true;
    }
    return (
      focus.focusTerms.some((term) => matchesNeedle(haystack, term)) ||
      focus.stagePhrases.some((phrase) => matchesNeedle(haystack, phrase))
    );
  }

  /**
   * 软排序（只影响顺序，不排除）：
   * 标题/子标题 ×1.3、表格 caption ×1.2、物种 ×1.15/相反 ×0.85、主题 ×1.15、
   * staging 意图 ×1.25、stage+treatment ×1.15、分期提示 ×1.25 / 明确其他期 ×0.95。
   */
  private softBoost(
    row: {
      documentId?: string | null;
      text?: string | null;
      section?: { title?: string | null } | null;
    },
    meta: CatalogSection | undefined,
    options: LibrarySearchOptions,
    raw: string,
    focus: QueryFocus,
  ): number {
    const title = row.section?.title ?? '';
    const text = row.text ?? '';
    let boost = domainRoutingBoost(raw, row.documentId);

    const needles = [
      ...focus.topicPhrases,
      ...focus.stagePhrases,
      ...focus.focusTerms,
    ].filter(Boolean);
    const matches = (hay: string) =>
      Boolean(hay) && needles.some((needle) => matchesNeedle(hay, needle));

    const subheading = extractSubheading(text);
    const titleOrSubheading = normalizeForMatch(
      `${title}\n${subheading ?? ''}`,
    );
    const titleOrSubheadingHit = matches(titleOrSubheading);
    if (titleOrSubheadingHit) boost *= 1.3;

    const caption = extractTableCaption(text);
    if (caption && matches(normalizeForMatch(caption))) boost *= 1.2;

    if (options.species) {
      const species = meta?.species ?? detectSpecies(`${title}\n${text}`);
      if (species === options.species || species === 'both') boost *= 1.15;
      else if (species !== 'unknown') boost *= 0.85;
    }

    const topics = (options.topics ?? []).filter(Boolean);
    if (topics.length > 0) {
      const hay = `${title}\n${text}`;
      const sectionTopics = meta?.topics ?? [];
      const hit = topics.some(
        (topic) =>
          sectionTopics.some((item) => matchesTopic(item, topic)) ||
          matchesTopic(hay, topic),
      );
      if (hit) boost *= 1.15;
    }

    // 结构性软加权：补回去掉旧 ×3 后的路由能力，但只影响排序（spec §7.2 的 ×1.25）。
    if (/staging|substaging|分期|亚分期/i.test(raw)) {
      if (meta?.sectionType === 'staging' || meta?.documentType === 'staging_guideline') {
        boost *= 1.25;
      }
    }
    if (focus.stagePhrases.length > 0 && meta?.sectionType === 'treatment') {
      boost *= 1.15;
    }

    // 分期提示：先看命中段正文/子标题（s005 的 Stage 3 原文靠这个排前），
    // 正文没提分期时才看目录 meta.stages；明确其他期只降权，不排除。
    if (options.stage) {
      const hinted = detectStages(`${subheading ?? ''}\n${text}`);
      const stages = hinted.length > 0 ? hinted : (meta?.stages ?? []);
      if (stages.includes(options.stage)) boost *= 1.25;
      else if (stages.length > 0) boost *= 0.95;
    }

    return boost;
  }

  private score(
    text: string,
    terms: string[],
    rawQuery: string,
    numericIntent: boolean,
    weights?: Map<string, number>,
  ): number {
    const lower = text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const needle = term.toLowerCase();
      let count = 0;
      let from = 0;
      while (count < 8) {
        const idx = lower.indexOf(needle, from);
        if (idx < 0) break;
        count += 1;
        from = idx + needle.length;
      }
      if (count > 0) {
        score += (1 + Math.log1p(count)) * (weights?.get(term) ?? 1);
      }
    }
    if (lower.includes(rawQuery.toLowerCase())) {
      score += 3;
    }

    // 表格/数字段落：问题在问“多少/范围/上限/推荐”时加权
    const numeric = (text.match(/\d+(?:\.\d+)?%?/g) ?? []).length;
    const ratio = numeric / Math.max(1, text.length / 100);
    if (numericIntent && ratio >= 0.6) {
      score *= 1.9;
    }

    return score;
  }
}
