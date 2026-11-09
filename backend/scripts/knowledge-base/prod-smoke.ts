/**
 * 生产只读冒烟（全库计划 Task 14）。
 *
 * 在生产 backend 目录执行（只读：不写库、不调 Agent、不创建会话）：
 * - `npm run kb:prod-smoke -- --scope ckd`            → 对基线校验
 * - `npm run kb:prod-smoke -- --scope ckd --record-baseline` → 首跑记基线
 * - `npm run kb:prod-smoke -- --scope ckd --json`
 *
 * 检查：计数、核心表、抽 20 节可打开、Stage 3 锚点、负样本、3 条查询延迟。
 */
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeLibraryService } from '../../src/application/knowledge-base/knowledge-library.service';
import { SourceLayerService } from '../../src/application/knowledge-base/source-layer.service';
import { isUsableSection } from '../../src/application/knowledge-base/section-quality';
import {
  resolveKnowledgeScope,
  scopeFromEnv,
} from '../../src/domain/knowledge/knowledge-scope';

const REPO_ROOT = resolve(__dirname, '../../..');
const BASELINE_PATH = resolve(
  REPO_ROOT,
  'docs/knowledge-base/eval/prod-smoke-baseline.json',
);
const STAGE3_SECTION =
  'iris-IRIS-DOG-Treatment-Recommendations-may-2026-s005';
const STAGE3_PARAGRAPH =
  'iris-IRIS-DOG-Treatment-Recommendations-may-2026-p00089';

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const recordBaseline = argv.includes('--record-baseline');
const scopeArgIndex = argv.indexOf('--scope');
const scopeArg =
  scopeArgIndex >= 0 ? String(argv[scopeArgIndex + 1] ?? '').trim() : '';

interface Baseline {
  documents: number;
  paragraphs: number;
  tables: number;
  figures: number;
  capturedAt: string;
  commit: string;
}

function today(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function main(): Promise<void> {
  const scope = scopeArg
    ? resolveKnowledgeScope(
        scopeArg === 'all' ? ['ckd'] : [scopeArg],
        { allowUnaudited: true },
      )
    : scopeFromEnv();
  const documentIds = scope.allDocuments ? undefined : [...scope.documentIds];

  const prisma = new PrismaClient();
  try {
    const library = new KnowledgeLibraryService(prisma as any);
    const sourceLayer = new SourceLayerService(prisma as any);

    const counts = {
      documents: await prisma.sourceDocument.count(),
      paragraphs: await prisma.sourceParagraph.count(),
      tables: await prisma.sourceTable.count(),
      figures: await prisma.sourceFigure.count(),
      capturedAt: today(),
      commit: process.env.GIT_COMMIT ?? 'prod',
    };

    let baseline: Baseline | null = null;
    if (recordBaseline) {
      writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
    } else if (existsSync(BASELINE_PATH)) {
      baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
    }
    const countMismatch = baseline
      ? (['documents', 'paragraphs', 'tables', 'figures'] as const).filter(
          (key) => counts[key] !== baseline![key],
        )
      : [];

    const coreTableIds = scope.allDocuments ? [] : [...scope.coreTableIds];
    const tableChecks: Array<{ id: string; ok: boolean }> = [];
    for (const tableId of coreTableIds) {
      const view = await sourceLayer.openTable(tableId);
      tableChecks.push({ id: tableId, ok: Boolean(view) });
    }

    const sampleSections = await prisma.sourceSection.findMany({
      where: {
        ...(documentIds ? { documentId: { in: documentIds } } : {}),
        paragraphs: { some: {} },
      },
      select: { id: true, title: true },
      orderBy: { id: 'asc' },
      take: 200,
    });
    const usable = sampleSections.filter((section) => isUsableSection(section));
    const step = Math.max(1, Math.floor(usable.length / 20));
    const sampled = usable.filter((_, index) => index % step === 0).slice(0, 20);
    const sectionChecks: Array<{ id: string; ok: boolean }> = [];
    for (const section of sampled) {
      const view = await sourceLayer.openSection(section.id);
      sectionChecks.push({ id: section.id, ok: Boolean(view) });
    }

    let stage3: { ok: boolean; reason?: string } = { ok: false };
    if (!documentIds || documentIds.includes('iris-IRIS-DOG-Treatment-Recommendations-may-2026')) {
      const view = await sourceLayer.openSection(STAGE3_SECTION, {
        anchorParagraphId: STAGE3_PARAGRAPH,
      });
      stage3 = {
        ok: Boolean(view?.anchorFound),
        reason: view?.anchorFound ? undefined : 'Stage 3 锚点未找到',
      };
    } else {
      stage3 = { ok: true, reason: '本范围不含 Stage 3 文档，跳过' };
    }

    const negativeStart = performance.now();
    const negativeHits = await library.searchSections(
      'CKD dog vitamin K target',
      { documentIds, limit: 5 },
    );
    const negative = {
      ok: negativeHits.length === 0,
      ms: Math.round((performance.now() - negativeStart) * 10) / 10,
    };

    const latencyQueries = [
      'CKD dog dietary phosphorus 0.2 0.5 % DM',
      'stage 3 canine patients phosphate target',
      'CKD dog blood pressure substaging',
    ];
    const latencies: number[] = [];
    for (const query of latencyQueries) {
      const started = performance.now();
      await library.searchSections(query, { documentIds, limit: 5 });
      latencies.push(performance.now() - started);
    }
    latencies.sort((a, b) => a - b);
    const latency = {
      p50: Math.round(latencies[1] * 10) / 10,
      max: Math.round(latencies[latencies.length - 1] * 10) / 10,
    };

    const passed =
      countMismatch.length === 0 &&
      tableChecks.every((item) => item.ok) &&
      sectionChecks.every((item) => item.ok) &&
      stage3.ok &&
      negative.ok &&
      latency.p50 <= 1500;

    const summary = {
      scope: scope.id,
      counts,
      baseline,
      countMismatch,
      tables: tableChecks,
      sections: sectionChecks,
      stage3,
      negative,
      latency,
      passed,
    };

    if (asJson) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      console.log(`范围：${scope.id}`);
      console.log(
        `计数：${counts.documents}/${counts.paragraphs}/${counts.tables}/${counts.figures}` +
          (countMismatch.length ? `（与基线不一致：${countMismatch.join(',')}）` : '（与基线一致）'),
      );
      console.log(
        `核心表：${tableChecks.filter((item) => item.ok).length}/${tableChecks.length}`,
      );
      console.log(
        `抽节：${sectionChecks.filter((item) => item.ok).length}/${sectionChecks.length}`,
      );
      console.log(`Stage 3 锚点：${stage3.ok ? '可回源' : stage3.reason}`);
      console.log(`负样本：${negative.ok ? '0 节 0 表' : '有命中'}`);
      console.log(`延迟：p50 ${latency.p50}ms、max ${latency.max}ms`);
      console.log(passed ? '结论：通过' : '结论：未通过');
    }

    if (!passed && !recordBaseline) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
