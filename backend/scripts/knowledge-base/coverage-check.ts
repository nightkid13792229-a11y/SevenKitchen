/**
 * 全库覆盖率与可达性（全库计划 Task 9）。
 *
 * 用法：
 * - `npm run kb:coverage`                 → 完整性 + 每文档抽 1 节 + 50 张表
 * - `npm run kb:coverage -- --json`       → 机器可读
 * - `npm run kb:coverage -- --sections 2` → 每文档抽 2 节
 *
 * 完整性（硬门禁）：计数与快照一致、孤儿段落 0、空节 0、空表 0、节排序无重复。
 * 可达性（软门禁）：用节内一段正文去查，文档命中率 ≥95%、表命中率 ≥95%；
 * 精确到"同一节"的命中率只记录，不设门（大量节标题是目录行/参考文献片段）。
 */
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { KnowledgeLibraryService } from '../../src/application/knowledge-base/knowledge-library.service';
import { SourceLayerService } from '../../src/application/knowledge-base/source-layer.service';
import { isUsableSection } from '../../src/application/knowledge-base/section-quality';
import type { ExpectedCounts } from '../../src/application/knowledge-base/data-integrity';

const REPO_ROOT = resolve(__dirname, '../../..');
const SNAPSHOT = resolve(
  REPO_ROOT,
  'docs/knowledge-base/source-layer/_expected-counts.json',
);

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const assertGate = !argv.includes('--no-assert');
function argValue(flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return String(argv[index + 1] ?? '').trim() || undefined;
}
const sectionsPerDoc = Math.max(1, Number(argValue('--sections') ?? 1));
const tableSample = Math.max(1, Number(argValue('--tables') ?? 50));
const CONCURRENCY = 5;

function snippetOf(text: string, limit = 120): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const library = new KnowledgeLibraryService(prisma as any);
    const sourceLayer = new SourceLayerService(prisma as any);

    const expected = JSON.parse(
      readFileSync(SNAPSHOT, 'utf8'),
    ) as ExpectedCounts;
    const actual = {
      documents: await prisma.sourceDocument.count(),
      paragraphs: await prisma.sourceParagraph.count(),
      tables: await prisma.sourceTable.count(),
      figures: await prisma.sourceFigure.count(),
    };
    const countMismatch = (
      ['documents', 'paragraphs', 'tables', 'figures'] as const
    ).filter((key) => actual[key] !== expected[key]);

    const [orphans, emptySections, emptyTables, duplicateOrders] =
      await Promise.all([
        prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n
          FROM source_paragraph p
          LEFT JOIN source_section s ON s.id = p.section_id
          WHERE s.id IS NULL
        `,
        prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n
          FROM source_section s
          WHERE NOT EXISTS (
            SELECT 1 FROM source_paragraph p WHERE p.section_id = s.id
          )
        `,
        prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n FROM source_table WHERE row_count = 0
        `,
        prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n FROM (
            SELECT document_id, sort_order
            FROM source_section
            GROUP BY document_id, sort_order
            HAVING COUNT(*) > 1
          ) dup
        `,
      ]);
    const integrity = {
      orphanParagraphs: Number(orphans[0]?.n ?? 0),
      emptySections: Number(emptySections[0]?.n ?? 0),
      emptyTables: Number(emptyTables[0]?.n ?? 0),
      duplicateSectionOrders: Number(duplicateOrders[0]?.n ?? 0),
    };

    const documents = await prisma.sourceDocument.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    const targets: Array<{
      documentId: string;
      sectionId: string;
      query: string;
    }> = [];
    for (const document of documents) {
      const sections = await prisma.sourceSection.findMany({
        where: { documentId: document.id },
        select: { id: true, title: true },
        orderBy: { sortOrder: 'asc' },
        take: 50,
      });
      const usable = sections.filter((section) => isUsableSection(section));
      let picked = 0;
      for (const section of usable) {
        const paragraph =
          (await prisma.sourceParagraph.findFirst({
            where: { sectionId: section.id, charCount: { gte: 120 } },
            select: { text: true },
            orderBy: { id: 'asc' },
          })) ??
          (await prisma.sourceParagraph.findFirst({
            where: { sectionId: section.id },
            select: { text: true },
            orderBy: { id: 'asc' },
          }));
        if (!paragraph) continue;
        targets.push({
          documentId: document.id,
          sectionId: section.id,
          query: snippetOf(paragraph.text),
        });
        picked += 1;
        if (picked >= sectionsPerDoc) break;
      }
    }

    const sectionResults: Array<{
      documentId: string;
      sectionId: string;
      ms: number;
      sectionHit: boolean;
      documentHit: boolean;
    }> = [];
    for (let index = 0; index < targets.length; index += CONCURRENCY) {
      const batch = targets.slice(index, index + CONCURRENCY);
      const settled = await Promise.all(
        batch.map(async (target) => {
          const started = performance.now();
          const hits = await library.searchSections(target.query, { limit: 5 });
          const top3 = hits.slice(0, 3);
          return {
            ...target,
            ms: performance.now() - started,
            sectionHit: top3.some((hit) => hit.sectionId === target.sectionId),
            documentHit: top3.some(
              (hit) => hit.documentId === target.documentId,
            ),
          };
        }),
      );
      sectionResults.push(...settled);
    }

    // 只拿"标题有辨识度"的表做可达性：`TABLE 2 (Continued)` 这类没有检索信号，
    // 拿它当 query 测不出检索好坏，只会把指标拉低。
    const tableCandidates = await prisma.sourceTable.findMany({
      select: { id: true, caption: true, documentId: true },
      orderBy: { id: 'asc' },
      take: Math.max(tableSample * 6, 300),
    });
    const noSignalCaption = (caption: string): boolean => {
      const value = String(caption ?? '').trim();
      return (
        value.length < 25 ||
        /^table\s*\d+\s*(\(continued\)|continued)?$/i.test(value)
      );
    };
    const tables = tableCandidates
      .filter((table) => !noSignalCaption(table.caption))
      .slice(0, tableSample);
    const tableResults: Array<{ id: string; hit: boolean; ms: number }> = [];
    for (let index = 0; index < tables.length; index += CONCURRENCY) {
      const batch = tables.slice(index, index + CONCURRENCY);
      const settled = await Promise.all(
        batch.map(async (table) => {
          const started = performance.now();
          const query = snippetOf(table.caption);
          const views = await sourceLayer.searchTableViews(query, { limit: 5 });
          return {
            id: table.id,
            hit: views.slice(0, 3).some((view) => view.tableId === table.id),
            ms: performance.now() - started,
          };
        }),
      );
      tableResults.push(...settled);
    }

    const rate = (list: boolean[]): number =>
      list.length === 0
        ? 0
        : Math.round(
            (list.filter(Boolean).length / list.length) * 1000,
          ) / 1000;
    const probedDocuments = new Set(
      sectionResults.map((item) => item.documentId),
    );
    const unprobedDocuments = documents
      .filter((document) => !probedDocuments.has(document.id))
      .map((document) => document.id);
    const sectionHitRate = rate(sectionResults.map((item) => item.sectionHit));
    const documentHitRate = rate(
      sectionResults.map((item) => item.documentHit),
    );
    const tableHitRate = rate(tableResults.map((item) => item.hit));
    // 空节（封面/页眉/目录残片）只记录、不设门：它们没有正文，检索本来就不会返回。
    const integrityOk =
      countMismatch.length === 0 &&
      integrity.orphanParagraphs === 0 &&
      integrity.duplicateSectionOrders === 0;
    const passed =
      integrityOk && documentHitRate >= 0.95 && tableHitRate >= 0.9;

    const summary = {
      counts: { actual, expected: expected as unknown as Record<string, number>, mismatch: countMismatch },
      integrity,
      sections: {
        documents: documents.length,
        sampled: sectionResults.length,
        sectionHitRate,
        documentHitRate,
        unprobedDocuments,
      },
      tables: { sampled: tableResults.length, tableHitRate },
      passed,
    };

    if (asJson) {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
      console.log(
        `计数：${actual.documents}/${actual.paragraphs}/${actual.tables}/${actual.figures}（不一致字段：${countMismatch.join(',') || '无'}）`,
      );
      console.log(
        `完整性：孤儿段落 ${integrity.orphanParagraphs}、空节 ${integrity.emptySections}（仅记录）、空表 ${integrity.emptyTables}、重复排序 ${integrity.duplicateSectionOrders}`,
      );
      console.log(
        `节可达：${sectionResults.length} 条；同文档命中 ${documentHitRate}、同一节命中 ${sectionHitRate}；无正文文档 ${unprobedDocuments.length}`,
      );
      console.log(
        `表可达：${tableResults.length} 张（已排除无信号 caption）；命中 ${tableHitRate}；空表 ${integrity.emptyTables} 张（仅记录）`,
      );
      console.log(passed ? '门槛：通过' : '门槛：未通过');
    }

    if (assertGate && !passed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
