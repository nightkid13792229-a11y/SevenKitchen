/**
 * 全库检索基准（全库计划 Task 8）。
 *
 * 用法：
 * - `npm run kb:bench -- --scope all`         → 全库：26 题 + 每 60 节抽 1 节自测
 * - `npm run kb:bench -- --scope ckd`         → CKD 范围
 * - `npm run kb:bench -- --scope all --json`  → 机器可读
 *
 * 输出：p50/p95/max、平均命中、首中率（题集）、节自中率（标题查自己）。
 * `--assert` 时 p95 > 1500ms 退出 1。
 */
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeLibraryService } from '../../src/application/knowledge-base/knowledge-library.service';
import { isUsableSection } from '../../src/application/knowledge-base/section-quality';
import {
  allDocumentsScope,
  resolveKnowledgeScope,
  type KnowledgeScope,
} from '../../src/domain/knowledge/knowledge-scope';

const REPO_ROOT = resolve(__dirname, '../../..');
const QUESTIONS_PATH = resolve(
  REPO_ROOT,
  'docs/knowledge-base/eval/ckd/questions.json',
);

interface QuestionSpec {
  id: string;
  query: string;
  category: string;
  expectedSections?: string[];
  expectNoSource?: boolean;
}

interface CaseResult {
  kind: 'question' | 'section';
  id: string;
  query: string;
  ms: number;
  hits: number;
  top1?: string;
  expected?: string[];
  hit: boolean | null;
}

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const assertP95 = argv.includes('--assert');
const scopeArg = valueOf('--scope') ?? 'ckd';
const limit = Number(valueOf('--limit') ?? 5);

function valueOf(flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = String(argv[index + 1] ?? '').trim();
  return value || undefined;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return Math.round(sorted[index] * 10) / 10;
}

/** 节标题常带引用串（`（Anfinsen et al., 2011; …）`），直接当 query 会匹配到参考文献。
 *  取括号前的主题部分；太短就退回原标题。 */
function cleanTitleQuery(title: string): string {
  const cut = String(title ?? '').split(/[（(]/)[0].trim();
  const base = cut.length >= 6 ? cut : String(title ?? '').trim();
  return base.slice(0, 80);
}

function loadQuestions(): QuestionSpec[] {
  const raw = JSON.parse(readFileSync(QUESTIONS_PATH, 'utf8')) as {
    questions: QuestionSpec[];
  };
  return raw.questions.filter((item) => item.query);
}

async function main(): Promise<void> {
  const scope: KnowledgeScope =
    scopeArg === 'all' ? allDocumentsScope() : resolveKnowledgeScope([scopeArg]);
  const documentIds = scope.allDocuments ? undefined : [...scope.documentIds];

  const prisma = new PrismaClient();
  try {
    const library = new KnowledgeLibraryService(prisma as any);

    const questions = loadQuestions();
    const sectionRows = await prisma.sourceSection.findMany({
      where:
        documentIds === undefined ? {} : { documentId: { in: documentIds } },
      select: { id: true, title: true },
      orderBy: { id: 'asc' },
    });
    // 固定间隔抽样，保证可复现；全库 6,090 节约取 100 条。
    const step = Math.max(1, Math.floor(sectionRows.length / 100));
    const usableSections = sectionRows.filter((section) =>
      isUsableSection(section),
    );
    const usableStep = Math.max(1, Math.floor(usableSections.length / 100));
    const sampled = usableSections
      .filter((_, index) => index % usableStep === 0)
      .slice(0, 100);

    const results: CaseResult[] = [];
    for (const question of questions) {
      const expected = question.expectedSections ?? [];
      const started = performance.now();
      const hits = await library.searchSections(question.query, {
        documentIds,
        limit,
      });
      const ms = performance.now() - started;
      const top3 = hits.slice(0, 3).map((hit) => hit.sectionId);
      results.push({
        kind: 'question',
        id: question.id,
        query: question.query,
        ms,
        hits: hits.length,
        top1: hits[0]?.sectionId,
        expected,
        hit:
          expected.length === 0
            ? null
            : top3.some((id) => expected.includes(id)),
      });
    }

    for (const section of sampled) {
      const started = performance.now();
      const query = cleanTitleQuery(section.title);
      const hits = await library.searchSections(query, {
        documentIds,
        limit,
      });
      const ms = performance.now() - started;
      const top3 = hits.slice(0, 3).map((hit) => hit.sectionId);
      results.push({
        kind: 'section',
        id: section.id,
        query,
        ms,
        hits: hits.length,
        top1: hits[0]?.sectionId,
        expected: [section.id],
        hit: top3.includes(section.id),
      });
    }

    const timings = results.map((item) => item.ms).sort((a, b) => a - b);
    const questionResults = results.filter((item) => item.kind === 'question');
    const sectionResults = results.filter((item) => item.kind === 'section');
    const judgedQuestions = questionResults.filter((item) => item.hit !== null);
    const summary = {
      scope: scope.id,
      queries: results.length,
      p50: percentile(timings, 50),
      p95: percentile(timings, 95),
      max: Math.round(Math.max(...timings) * 10) / 10,
      avgHits: Math.round((results.reduce((sum, item) => sum + item.hits, 0) / results.length) * 10) / 10,
      top3HitRate:
        judgedQuestions.length === 0
          ? null
          : Math.round(
              (judgedQuestions.filter((item) => item.hit).length /
                judgedQuestions.length) *
                1000,
            ) / 1000,
      sectionSelfTop3Rate:
        sectionResults.length === 0
          ? null
          : Math.round(
              (sectionResults.filter((item) => item.hit).length /
                sectionResults.length) *
                1000,
            ) / 1000,
      slowest: [...results].sort((a, b) => b.ms - a.ms).slice(0, 5),
    };

    if (asJson) {
      process.stdout.write(`${JSON.stringify({ summary, results }, null, 2)}\n`);
    } else {
      console.log(
        `范围 ${scope.id}：${summary.queries} 条查询；p50 ${summary.p50}ms、p95 ${summary.p95}ms、max ${summary.max}ms`,
      );
      console.log(
        `平均命中 ${summary.avgHits} 节；题集 top3 命中率 ${summary.top3HitRate ?? '—'}；节标题 top3 自中率 ${summary.sectionSelfTop3Rate ?? '—'}`,
      );
      console.log(
        `最慢：${summary.slowest
          .map((item) => `${item.id} ${Math.round(item.ms)}ms`)
          .join('；')}`,
      );
    }

    if (assertP95 && summary.p95 > 1500) {
      console.error(`p95 ${summary.p95}ms 超过 1500ms 门槛`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
