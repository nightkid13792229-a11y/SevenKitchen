import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';
import { getKnowledgeSource } from '../../domain/recipe-designer/knowledge-base/source-registry';

/**
 * 知识库原文检索（只读）。
 *
 * 这一层只做“按问题找段落”：返回原文段落 + 来源/章节/页码，不返回结论。
 * 模型自己读原文、自己判断、自己引用；知识库不替它下结论。
 *
 * 2026-11-03 最小版本：
 * - 先用关键词候选（source_paragraph.text contains），再在应用层打分；
 * - 表格/数字段落单独加权（CKD 试点发现的关键问题）；
 * - 不做向量检索、不做 rerank、不做结论卡。
 */

export interface LibraryPassage {
  id: string;
  text: string;
  truncated: boolean;
  sourceId: string | null;
  sourceName: string | null;
  documentId: string;
  documentTitle: string | null;
  sectionId: string;
  sectionTitle: string;
  pageStart: number | null;
  score: number;
}

export interface LibrarySearchOptions {
  /** 只在这些来源里找；不传则全库。 */
  sourceIds?: string[];
  /** 只在这些文档里找；用于试点/专题收窄。 */
  documentIds?: string[];
  /** 只在这些章节里找。 */
  sectionIds?: string[];
  /** 物种过滤：dog / cat；同时提到两者的段落保留。 */
  species?: 'dog' | 'cat';
  /** 分期过滤：只保留提到该期的章节；没提分期的章节保留。 */
  stage?: 1 | 2 | 3 | 4;
  /** 主题过滤：任一同义词命中即可。 */
  topics?: string[];
  /** 返回条数，默认 8，最多 10。 */
  limit?: number;
}

const TOPIC_ALIASES: Record<string, string[]> = {
  phosphorus: ['phosph', '磷'],
  protein: ['protein', '蛋白'],
  sodium: ['sodium', '钠'],
  potassium: ['potassium', '钾'],
  omega3: ['omega', 'fish oil', '鱼油'],
  proteinuria: ['proteinuria', 'upc', '蛋白尿'],
  bloodpressure: ['blood pressure', 'hypertension', '血压', '高血压'],
  staging: ['stage', 'iris', '分期'],
  calcium: ['calcium', '钙'],
  vitaminD: ['vitamin d', 'calcitriol', '维生素 d'],
  energy: ['energy', 'kcal', '能量'],
  water: ['water', 'moisture', '水'],
  phosphatebinder: ['binder', 'binders', '结合剂'],
};

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
  const stages = new Set<number>();
  for (const match of text.matchAll(/\bstage\s*([1-4])\b/gi)) {
    stages.add(Number(match[1]));
  }
  for (const match of text.matchAll(/([1-4])\s*期/g)) {
    stages.add(Number(match[1]));
  }
  return [...stages];
}

function matchesTopic(text: string, topic: string): boolean {
  const key = topic.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = TOPIC_ALIASES[key] ?? [topic.trim().toLowerCase()];
  const lower = text.toLowerCase();
  return aliases.some((alias) => lower.includes(alias.toLowerCase()));
}

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 10;
const MAX_CANDIDATES = 1000;
const MAX_TEXT_CHARS = 900;

const STOP = new Set(
  'a an the and or of to in on for with by is are was were be been being this that these those as at from it its their there can may should could would not no than then when where which who whom whose what how why'.split(
    ' ',
  ),
);

@Injectable()
export class KnowledgeLibraryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: string,
    options: LibrarySearchOptions = {},
  ): Promise<LibraryPassage[]> {
    const raw = String(query ?? '').trim();
    if (!raw) return [];

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

    const rows = await this.prisma.sourceParagraph.findMany({
      where: {
        OR: terms.slice(0, 8).map((term) => ({
          text: { contains: term, mode: 'insensitive' as const },
        })),
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

    const filteredRows = rows.filter((row) => {
      const text = `${row.section?.title ?? ''}\n${row.text ?? ''}`;
      if (options.species) {
        const species = detectSpecies(text);
        if (species === 'dog' && options.species === 'cat') return false;
        if (species === 'cat' && options.species === 'dog') return false;
      }
      if (options.stage) {
        const stages = detectStages(text);
        if (stages.length > 0 && !stages.includes(options.stage)) return false;
      }
      const topics = (options.topics ?? []).filter(Boolean);
      if (topics.length > 0 && !topics.some((topic) => matchesTopic(text, topic))) {
        return false;
      }
      return true;
    });

    const numericIntent =
      /(多少|范围|上限|推荐|剂量|百分比|percent|range|how much|mg\/|%)/i.test(raw) ||
      (raw.match(/\d+(?:\.\d+)?%?/g) ?? []).length >= 2;

    // 稀有词加权：候选里到处都有的词（dog/ckd）权重低，
    // 只有少数段落有的词（phosphorus/UPC）权重高。
    const df = new Map<string, number>();
    for (const row of filteredRows) {
      const lower = row.text.toLowerCase();
      for (const term of terms) {
        if (lower.includes(term.toLowerCase())) {
          df.set(term, (df.get(term) ?? 0) + 1);
        }
      }
    }
    const weights = new Map(
      terms.map((term) => [
        term,
        1 + Math.log((filteredRows.length + 1) / (1 + (df.get(term) ?? 0))),
      ]),
    );
    const scored = filteredRows.map((row) => ({
      row,
      score: this.score(
        row.text,
        terms,
        raw,
        numericIntent,
        row.document?.sourceId,
        weights,
      ),
    }));
    scored.sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));

    return scored.slice(0, limit).map(({ row, score }) => {
      const sourceId = row.document?.sourceId ?? null;
      const source = sourceId ? getKnowledgeSource(sourceId) : undefined;
      const text = row.text ?? '';
      const truncated = text.length > MAX_TEXT_CHARS;
      return {
        id: row.id,
        text: truncated ? `${text.slice(0, MAX_TEXT_CHARS)}…` : text,
        truncated,
        sourceId,
        sourceName: source?.name ?? sourceId,
        documentId: row.documentId,
        documentTitle: row.document?.title ?? null,
        sectionId: row.sectionId,
        sectionTitle: row.section?.title ?? '',
        pageStart: row.pageStart ?? row.section?.pageNo ?? null,
        score: Math.round(score * 100) / 100,
      };
    });
  }

  private queryTerms(query: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (value: string) => {
      const key = value.toLowerCase();
      if (key.length < 2 || STOP.has(key) || seen.has(key)) return;
      seen.add(key);
      out.push(value);
    };

    for (const match of query.toLowerCase().matchAll(/[a-z][a-z0-9-]{2,}/g)) {
      push(match[0]);
    }
    for (const match of query.matchAll(/\d+(?:\.\d+)?%?/g)) {
      push(match[0]);
    }
    // 中文：整段 + 2 字切片；中文查询主要用来命中中文文档/术语
    for (const match of query.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
      const text = match[0];
      push(text);
      if (text.length > 2) {
        for (let i = 0; i < text.length - 1 && out.length < 16; i += 1) {
          push(text.slice(i, i + 2));
        }
      }
    }
    return out.slice(0, 16);
  }

  private score(
    text: string,
    terms: string[],
    rawQuery: string,
    numericIntent: boolean,
    sourceId?: string | null,
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

    // CKD 核心来源轻微加权（试点发现 SACN5/IRIS 更直接）
    if (sourceId === 'SACN5') score *= 1.05;
    else if (sourceId?.startsWith('IRIS')) score *= 1.03;

    return score;
  }
}
