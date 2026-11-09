/**
 * L0 数据完整性检查（全库计划 Task 4）。
 *
 * 用法：
 * - `npm run kb:data-check`            → 对快照校验，失败 exit 1
 * - `npm run kb:data-check -- --json`  → 机器可读输出
 * - `npm run kb:data-check -- --record`→ 重写计数快照（改了库/导入后才用）
 *
 * 只读：不写库。唯一会写的是 `_expected-counts.json`，且只在 --record 时。
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  checkAnchors,
  checkCounts,
  checkTableIds,
  findDuplicateSectionOrder,
  type ExpectedCounts,
} from '../../src/application/knowledge-base/data-integrity';

const REPO_ROOT = resolve(__dirname, '../../..');
const SNAPSHOT_PATH = resolve(
  REPO_ROOT,
  'docs/knowledge-base/source-layer/_expected-counts.json',
);

const CORE_TABLE_IDS = ['T0253', 'T0497', 'T0260', 'T0261', 'T0025', 'T0026'];
/** 这 5 张核心表在原文里没有页码，允许 pageNo=null。 */
const ALLOW_NULL_PAGE_NO = ['T0253', 'T0260', 'T0261', 'T0025', 'T0026'];
const ANCHOR_SAMPLE = 10;

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const record = argv.includes('--record');

function today(): string {
  // 项目时区是 Asia/Shanghai；用 UTC 会在凌晨记成前一天。
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function headCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

async function countAll(prisma: PrismaClient): Promise<ExpectedCounts> {
  const [documents, paragraphs, tables, figures] = await Promise.all([
    prisma.sourceDocument.count(),
    prisma.sourceParagraph.count(),
    prisma.sourceTable.count(),
    prisma.sourceFigure.count(),
  ]);
  return { documents, paragraphs, tables, figures, capturedAt: today(), commit: headCommit() };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const actual = await countAll(prisma);

    if (record) {
      writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`);
      console.log(`已记录计数快照：${SNAPSHOT_PATH}`);
    }

    if (!existsSync(SNAPSHOT_PATH)) {
      throw new Error(
        `缺少计数快照 ${SNAPSHOT_PATH}；先跑 npm run kb:data-check -- --record`,
      );
    }
    const expected = JSON.parse(
      readFileSync(SNAPSHOT_PATH, 'utf8'),
    ) as ExpectedCounts;

    const counts = checkCounts(actual, expected);

    const tableRows = await prisma.sourceTable.findMany({
      where: { id: { in: CORE_TABLE_IDS } },
      select: { id: true, pageNo: true },
    });
    const tables = checkTableIds(
      tableRows,
      CORE_TABLE_IDS,
      ALLOW_NULL_PAGE_NO,
    );

    const sections = await prisma.sourceSection.findMany({
      select: { documentId: true, sortOrder: true },
    });
    const duplicates = findDuplicateSectionOrder(sections);

    const anchors = await prisma.knowledgeCitationAnchor.findMany({
      where: { precision: 'paragraph' },
      orderBy: { id: 'asc' },
      take: ANCHOR_SAMPLE,
      select: { id: true, paragraphIds: true },
    });
    const paragraphIds = [
      ...new Set(anchors.flatMap((anchor) => anchor.paragraphIds)),
    ];
    const existing = await prisma.sourceParagraph.findMany({
      where: { id: { in: paragraphIds } },
      select: { id: true },
    });
    const anchorCheck = checkAnchors(
      anchors,
      new Set(existing.map((row) => row.id)),
    );

    const ok =
      counts.ok &&
      tables.ok &&
      duplicates.length === 0 &&
      anchorCheck.ok &&
      anchors.length === ANCHOR_SAMPLE;

    const result = {
      ok,
      actual,
      expected,
      counts,
      tables,
      duplicateSectionOrders: duplicates,
      anchors: {
        sampled: anchors.length,
        expected: ANCHOR_SAMPLE,
        ...anchorCheck,
      },
    };

    if (asJson) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      console.log(`全库：${actual.documents} 文档 / ${actual.paragraphs} 段 / ${actual.tables} 表 / ${actual.figures} 图`);
      console.log(counts.ok ? '计数：与快照一致' : `计数不一致：${counts.mismatches.join('；')}`);
      console.log(
        tables.ok
          ? `核心表：${CORE_TABLE_IDS.length}/${CORE_TABLE_IDS.length} 存在，页码白名单通过`
          : `核心表异常：缺 ${tables.missing.join(',') || '无'}；页码越界 ${tables.pageNoViolations.join(',') || '无'}`,
      );
      console.log(
        duplicates.length === 0
          ? '节顺序：无重复'
          : `节顺序重复：${duplicates.slice(0, 5).join(',')}（共 ${duplicates.length}）`,
      );
      console.log(
        anchorCheck.ok && anchors.length === ANCHOR_SAMPLE
          ? `锚点：${anchors.length}/${ANCHOR_SAMPLE} 可回源`
          : `锚点异常：样本 ${anchors.length}/${ANCHOR_SAMPLE}；坏锚点 ${anchorCheck.missingAnchors.join(',') || '无'}`,
      );
    }

    process.exitCode = ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
