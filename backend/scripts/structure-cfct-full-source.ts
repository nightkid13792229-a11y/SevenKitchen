import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

import type { StructuredCfctRow } from './import-cfct-ocr-source';

const DEFAULT_OUTPUT_DIR = 'reports/cfct-full';
const DEFAULT_CHUNK_SIZE = 30;
const DEFAULT_GENERATED_AT = new Date().toISOString();
const DEFAULT_ORIENTATION = 'right' as const;
const MIN_AUTO_READY_NUTRIENT_COUNT = 12;

const DEFAULT_VOLUMES: CfctFullStructureVolume[] = [
  {
    id: 'v1',
    volume: '第六版 第一册',
    pdf:
      '/Users/zhaochen/Documents/Seven/宠物学习资料/书籍/杨月欣 - 中国食物成分表 标准版 第6版 第1册 (2018, 北京大学医学出版社) - libgen.li.pdf',
    orientation: DEFAULT_ORIENTATION,
    startPage: 1,
    endPage: 387,
  },
  {
    id: 'v2',
    volume: '第六版 第二册',
    pdf:
      '/Users/zhaochen/Documents/Seven/宠物学习资料/书籍/杨月欣 - 中国食物成分表 标准版 第6版 第2册 (2019, 北京大学医学出版社) - libgen.li.pdf',
    orientation: DEFAULT_ORIENTATION,
    startPage: 1,
    endPage: 454,
  },
];

export interface CfctFullStructureVolume {
  id: string;
  volume: string;
  pdf: string;
  orientation?: 'up' | 'right' | 'left' | 'down';
  startPage: number;
  endPage: number;
}

export interface CfctFullStructureBatch extends CfctFullStructureVolume {
  orientation: 'up' | 'right' | 'left' | 'down';
  startPage: number;
  endPage: number;
  ocrOutput: string;
  structuredOutput: string;
  reportOutput: string;
}

export interface CfctStructuredPayload {
  generatedAt?: string;
  rows: StructuredCfctRow[];
}

export interface CfctReviewSummary {
  generatedAt: string;
  totalRows: number;
  autoReadyRows: number;
  needsReviewRows: number;
  byVolume: Record<string, {
    totalRows: number;
    autoReadyRows: number;
    needsReviewRows: number;
  }>;
  qualityFlagCounts: Record<string, number>;
}

export interface CfctReviewArtifacts {
  full: CfctStructuredPayload;
  autoReady: CfctStructuredPayload;
  needsReview: CfctStructuredPayload;
  summary: CfctReviewSummary;
}

interface BuildBatchInput {
  volumes: CfctFullStructureVolume[];
  chunkSize: number;
  outputDir: string;
}

interface CliArgs {
  chunkSize: number;
  outputDir: string;
  onlyPlan: boolean;
  skipExisting: boolean;
  force: boolean;
  mergeOnly: boolean;
  batchFrom: number | null;
  batchTo: number | null;
}

export function buildCfctFullStructureBatches({
  volumes,
  chunkSize,
  outputDir,
}: BuildBatchInput): CfctFullStructureBatch[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error('chunkSize must be a positive integer');
  }

  const batches: CfctFullStructureBatch[] = [];
  for (const volume of volumes) {
    for (
      let page = volume.startPage;
      page <= volume.endPage;
      page += chunkSize
    ) {
      const endPage = Math.min(page + chunkSize - 1, volume.endPage);
      const id = `${volume.id}-p${padPage(page)}-p${padPage(endPage)}`;
      batches.push({
        ...volume,
        id,
        orientation: volume.orientation ?? DEFAULT_ORIENTATION,
        startPage: page,
        endPage,
        ocrOutput: join(outputDir, 'batches', `${id}.jsonl`),
        structuredOutput: join(outputDir, 'batches', `${id}-structured.json`),
        reportOutput: join(outputDir, 'batches', `${id}-report.csv`),
      });
    }
  }

  return batches;
}

export function mergeCfctStructuredPayloads(
  payloads: CfctStructuredPayload[],
  volumeOrder: string[],
  generatedAt = DEFAULT_GENERATED_AT,
): CfctStructuredPayload {
  const volumeRank = new Map(
    volumeOrder.map((volume, index) => [volume, index]),
  );
  const rows = mergeCfctRowsAcrossBatches(
    payloads.flatMap((payload) => payload.rows ?? []),
  )
    .map(applyCfctFinalCoverageGate)
    .sort((left, right) => compareCfctRows(left, right, volumeRank));

  return {
    generatedAt,
    rows,
  };
}

export function buildCfctReviewArtifacts(
  rows: StructuredCfctRow[],
  generatedAt = DEFAULT_GENERATED_AT,
): CfctReviewArtifacts {
  const autoReadyRows = rows.filter(isAutoReadyRow);
  const needsReviewRows = rows.filter((row) => !isAutoReadyRow(row));
  const summary: CfctReviewSummary = {
    generatedAt,
    totalRows: rows.length,
    autoReadyRows: autoReadyRows.length,
    needsReviewRows: needsReviewRows.length,
    byVolume: {},
    qualityFlagCounts: {},
  };

  for (const row of rows) {
    const volumeSummary = summary.byVolume[row.volume] ?? {
      totalRows: 0,
      autoReadyRows: 0,
      needsReviewRows: 0,
    };
    volumeSummary.totalRows += 1;
    if (isAutoReadyRow(row)) {
      volumeSummary.autoReadyRows += 1;
    } else {
      volumeSummary.needsReviewRows += 1;
    }
    summary.byVolume[row.volume] = volumeSummary;

    for (const flag of row.qualityFlags ?? []) {
      summary.qualityFlagCounts[flag] =
        (summary.qualityFlagCounts[flag] ?? 0) + 1;
    }
  }

  return {
    full: { generatedAt, rows },
    autoReady: { generatedAt, rows: autoReadyRows },
    needsReview: { generatedAt, rows: needsReviewRows },
    summary,
  };
}

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  const batches = buildCfctFullStructureBatches({
    volumes: DEFAULT_VOLUMES,
    chunkSize: args.chunkSize,
    outputDir: args.outputDir,
  });
  const selectedBatches = batches.filter((_, index) => {
    const oneBasedIndex = index + 1;
    if (args.batchFrom !== null && oneBasedIndex < args.batchFrom) return false;
    if (args.batchTo !== null && oneBasedIndex > args.batchTo) return false;
    return true;
  });

  console.log('CFCT full structure plan');
  console.log(`- outputDir: ${args.outputDir}`);
  console.log(`- chunkSize: ${args.chunkSize}`);
  console.log(`- totalBatches: ${batches.length}`);
  console.log(`- selectedBatches: ${selectedBatches.length}`);
  selectedBatches.forEach((batch, index) => {
    console.log(
      `  ${index + 1}. ${batch.id} ${batch.volume} p${batch.startPage}-p${batch.endPage}`,
    );
  });

  if (args.onlyPlan) {
    return;
  }

  if (!args.mergeOnly) {
    for (const batch of selectedBatches) {
      const shouldSkip =
        args.skipExisting &&
        !args.force &&
        existsSync(batch.ocrOutput) &&
        existsSync(batch.structuredOutput) &&
        existsSync(batch.reportOutput);
      if (shouldSkip) {
        console.log(`skip existing ${batch.id}`);
        continue;
      }
      runStructureBatch(batch);
    }
  }

  await mergeFullOutputs({
    batches,
    outputDir: args.outputDir,
    volumeOrder: DEFAULT_VOLUMES.map((volume) => volume.volume),
  });
}

function runStructureBatch(batch: CfctFullStructureBatch): void {
  console.log(
    `run ${batch.id} ${batch.volume} p${batch.startPage}-p${batch.endPage}`,
  );
  const result = spawnSync(
    'npx',
    [
      'ts-node',
      '-r',
      'tsconfig-paths/register',
      'scripts/import-cfct-ocr-source.ts',
      '--pdf',
      batch.pdf,
      '--volume',
      batch.volume,
      '--orientation',
      batch.orientation,
      '--start-page',
      String(batch.startPage),
      '--end-page',
      String(batch.endPage),
      '--ocr-output',
      batch.ocrOutput,
      '--structured-output',
      batch.structuredOutput,
      '--report-output',
      batch.reportOutput,
    ],
    {
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error(`CFCT structure batch failed: ${batch.id}`);
  }
}

async function mergeFullOutputs({
  batches,
  outputDir,
  volumeOrder,
}: {
  batches: CfctFullStructureBatch[];
  outputDir: string;
  volumeOrder: string[];
}): Promise<void> {
  const payloads: CfctStructuredPayload[] = [];
  for (const batch of batches) {
    if (!existsSync(batch.structuredOutput)) continue;
    payloads.push(await readStructuredPayload(batch.structuredOutput));
  }

  const generatedAt = new Date().toISOString();
  const full = mergeCfctStructuredPayloads(payloads, volumeOrder, generatedAt);
  const artifacts = buildCfctReviewArtifacts(full.rows, generatedAt);

  await writeJson(join(outputDir, 'cfct-v6-full-structured.json'), artifacts.full);
  await writeJson(join(outputDir, 'cfct-v6-full-auto-ready.json'), artifacts.autoReady);
  await writeJson(join(outputDir, 'cfct-v6-full-needs-review.json'), artifacts.needsReview);
  await writeJson(join(outputDir, 'cfct-v6-full-review-summary.json'), artifacts.summary);
  await writeReport(join(outputDir, 'cfct-v6-full-report.csv'), artifacts.full.rows);

  console.log('');
  console.log('CFCT full structure summary');
  console.log(`- totalRows: ${artifacts.summary.totalRows}`);
  console.log(`- autoReadyRows: ${artifacts.summary.autoReadyRows}`);
  console.log(`- needsReviewRows: ${artifacts.summary.needsReviewRows}`);
  console.log(`- structured: ${join(outputDir, 'cfct-v6-full-structured.json')}`);
  console.log(`- autoReady: ${join(outputDir, 'cfct-v6-full-auto-ready.json')}`);
  console.log(`- needsReview: ${join(outputDir, 'cfct-v6-full-needs-review.json')}`);
}

async function readStructuredPayload(path: string): Promise<CfctStructuredPayload> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as CfctStructuredPayload;
  return {
    generatedAt: parsed.generatedAt,
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
  };
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function writeReport(path: string, rows: StructuredCfctRow[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const header = [
    'volume',
    'page',
    'row',
    'foodName',
    'reviewStatus',
    'ocrConfidence',
    'qualityFlags',
    'rawOcrText',
  ];
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.volume,
        String(row.page),
        String(row.row),
        row.foodName,
        row.reviewStatus,
        String(row.ocrConfidence),
        (row.qualityFlags ?? []).join('|'),
        row.rawOcrText,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8');
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    chunkSize: DEFAULT_CHUNK_SIZE,
    outputDir: DEFAULT_OUTPUT_DIR,
    onlyPlan: false,
    skipExisting: true,
    force: false,
    mergeOnly: false,
    batchFrom: null,
    batchTo: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--chunk-size' && next) {
      args.chunkSize = Number(next);
      index += 1;
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next;
      index += 1;
    } else if (arg === '--only-plan') {
      args.onlyPlan = true;
    } else if (arg === '--no-skip-existing') {
      args.skipExisting = false;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--merge-only') {
      args.mergeOnly = true;
    } else if (arg === '--batch-from' && next) {
      args.batchFrom = Number(next);
      index += 1;
    } else if (arg === '--batch-to' && next) {
      args.batchTo = Number(next);
      index += 1;
    }
  }

  if (!Number.isInteger(args.chunkSize) || args.chunkSize < 1) {
    throw new Error('--chunk-size must be a positive integer');
  }
  for (const key of ['batchFrom', 'batchTo'] as const) {
    const value = args[key];
    if (value !== null && (!Number.isInteger(value) || value < 1)) {
      throw new Error(`--${key === 'batchFrom' ? 'batch-from' : 'batch-to'} must be a positive integer`);
    }
  }
  if (
    args.batchFrom !== null &&
    args.batchTo !== null &&
    args.batchFrom > args.batchTo
  ) {
    throw new Error('--batch-from cannot be greater than --batch-to');
  }

  return args;
}

function compareCfctRows(
  left: StructuredCfctRow,
  right: StructuredCfctRow,
  volumeRank: Map<string, number>,
): number {
  const leftVolumeRank = volumeRank.get(left.volume) ?? Number.MAX_SAFE_INTEGER;
  const rightVolumeRank = volumeRank.get(right.volume) ?? Number.MAX_SAFE_INTEGER;
  if (leftVolumeRank !== rightVolumeRank) return leftVolumeRank - rightVolumeRank;

  const pageDiff = Number(left.page) - Number(right.page);
  if (pageDiff !== 0) return pageDiff;

  const rowDiff = Number(left.row) - Number(right.row);
  if (rowDiff !== 0) return rowDiff;

  return left.foodName.localeCompare(right.foodName, 'zh-Hans-CN');
}

function mergeCfctRowsAcrossBatches(rows: StructuredCfctRow[]): StructuredCfctRow[] {
  const mergedRows: StructuredCfctRow[] = [];
  const primaryRowsByKey = new Map<string, StructuredCfctRow>();
  const pendingContinuationRowsByKey = new Map<string, StructuredCfctRow[]>();

  for (const row of rows) {
    const key = getCfctMergeKey(row);
    if (!key) {
      mergedRows.push(cloneStructuredCfctRow(row));
      continue;
    }

    const isContinuationOnly = isCfctContinuationOnlyRow(row);
    if (!isContinuationOnly) {
      let primaryRow = primaryRowsByKey.get(key);
      if (!primaryRow) {
        primaryRow = cloneStructuredCfctRow(row);
        primaryRowsByKey.set(key, primaryRow);
        mergedRows.push(primaryRow);
      } else {
        mergeCfctRowData(primaryRow, row);
      }

      const pendingContinuationRows = pendingContinuationRowsByKey.get(key) ?? [];
      pendingContinuationRows.forEach((continuationRow) => {
        mergeCfctRowData(primaryRow, continuationRow);
      });
      pendingContinuationRowsByKey.delete(key);
      continue;
    }

    const primaryRow = primaryRowsByKey.get(key);
    if (primaryRow) {
      mergeCfctRowData(primaryRow, row);
      continue;
    }

    const pendingRows = pendingContinuationRowsByKey.get(key) ?? [];
    pendingRows.push(cloneStructuredCfctRow(row));
    pendingContinuationRowsByKey.set(key, pendingRows);
  }

  for (const pendingRows of pendingContinuationRowsByKey.values()) {
    mergedRows.push(...pendingRows);
  }

  return mergedRows;
}

function getCfctMergeKey(row: StructuredCfctRow): string | null {
  if (!row.volume || !row.foodCode) return null;
  return `${row.volume}\u0000${row.foodCode}`;
}

function isCfctContinuationOnlyRow(row: StructuredCfctRow): boolean {
  const sourceSegments = row.sourceSegments ?? [];
  const hasPrimarySegment = sourceSegments.some(
    (segment) => segment.kind === 'PRIMARY',
  );
  const hasContinuationSegment = sourceSegments.some(
    (segment) => segment.kind === 'CONTINUATION',
  );

  return (
    !hasPrimarySegment &&
    (hasContinuationSegment ||
      (row.qualityFlags ?? []).includes('MISSING_PRIMARY_ROW'))
  );
}

function mergeCfctRowData(
  primaryRow: StructuredCfctRow,
  rowToMerge: StructuredCfctRow,
): void {
  primaryRow.nutrients = {
    ...primaryRow.nutrients,
    ...rowToMerge.nutrients,
  };
  primaryRow.unmappedNutrients = {
    ...(primaryRow.unmappedNutrients ?? {}),
    ...(rowToMerge.unmappedNutrients ?? {}),
  };
  if (Object.keys(primaryRow.unmappedNutrients).length === 0) {
    delete primaryRow.unmappedNutrients;
  }
  primaryRow.sourceSegments = [
    ...(primaryRow.sourceSegments ?? []),
    ...(rowToMerge.sourceSegments ?? []),
  ].sort(compareCfctSourceSegments);
  primaryRow.qualityFlags = Array.from(
    new Set([...(primaryRow.qualityFlags ?? []), ...(rowToMerge.qualityFlags ?? [])]),
  ).filter((flag) => flag !== 'MISSING_PRIMARY_ROW') as StructuredCfctRow['qualityFlags'];
  primaryRow.reviewStatus =
    primaryRow.qualityFlags.length === 0 ? 'AUTO_STRUCTURED' : 'NEEDS_REVIEW';

  if (!primaryRow.ediblePortionPercent && rowToMerge.ediblePortionPercent) {
    primaryRow.ediblePortionPercent = rowToMerge.ediblePortionPercent;
  }
  if (!primaryRow.energyKj && rowToMerge.energyKj) {
    primaryRow.energyKj = rowToMerge.energyKj;
  }
}

function cloneStructuredCfctRow(row: StructuredCfctRow): StructuredCfctRow {
  return {
    ...row,
    nutrients: { ...row.nutrients },
    sourceSegments: row.sourceSegments?.map((segment) => ({ ...segment })),
    unmappedNutrients: row.unmappedNutrients
      ? { ...row.unmappedNutrients }
      : undefined,
    qualityFlags: [...(row.qualityFlags ?? [])],
  };
}

function compareCfctSourceSegments(
  left: NonNullable<StructuredCfctRow['sourceSegments']>[number],
  right: NonNullable<StructuredCfctRow['sourceSegments']>[number],
): number {
  const pageDiff = Number(left.page) - Number(right.page);
  if (pageDiff !== 0) return pageDiff;

  const rowDiff = Number(left.row) - Number(right.row);
  if (rowDiff !== 0) return rowDiff;

  if (left.kind !== right.kind) return left.kind === 'PRIMARY' ? -1 : 1;
  return String(left.rawOcrText).localeCompare(String(right.rawOcrText), 'zh-Hans-CN');
}

function applyCfctFinalCoverageGate(row: StructuredCfctRow): StructuredCfctRow {
  const nutrientCount = Object.keys(row.nutrients ?? {}).length;
  const hasContinuationSegment = (row.sourceSegments ?? []).some(
    (segment) => segment.kind === 'CONTINUATION',
  );
  const qualityFlags = new Set(row.qualityFlags ?? []);

  if (
    row.foodCode &&
    !hasContinuationSegment &&
    nutrientCount < MIN_AUTO_READY_NUTRIENT_COUNT
  ) {
    qualityFlags.add('CONTINUATION_INCOMPLETE');
  }

  row.qualityFlags = Array.from(qualityFlags) as StructuredCfctRow['qualityFlags'];
  row.reviewStatus =
    row.qualityFlags.length === 0 ? 'AUTO_STRUCTURED' : 'NEEDS_REVIEW';

  return row;
}

function isAutoReadyRow(row: StructuredCfctRow): boolean {
  return row.reviewStatus === 'AUTO_STRUCTURED' && (row.qualityFlags ?? []).length === 0;
}

function padPage(page: number): string {
  return String(page).padStart(3, '0');
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
