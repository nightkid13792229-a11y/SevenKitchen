import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';

import {
  buildCfctIntermediateLibraryAudit,
  type CfctFoodCodeCoverageRow,
  type CfctIntermediateLibraryRow,
  type CfctNoFoodCodeCoverageRow,
} from '../src/domain/nutrition-governance/cfct-intermediate-library-audit';

const DEFAULT_INPUT = 'reports/cfct-full/cfct-v6-full-structured.json';
const DEFAULT_OUTPUT_DIR = 'reports/cfct-full';

interface CliArgs {
  input: string;
  outputDir: string;
}

interface CfctStructuredPayload {
  rows?: CfctIntermediateLibraryRow[];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolve(args.input);
  const outputDir = resolve(args.outputDir);
  const payload = JSON.parse(
    await readFile(inputPath, 'utf8'),
  ) as CfctStructuredPayload;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const audit = buildCfctIntermediateLibraryAudit(rows);

  await mkdir(outputDir, { recursive: true });
  await writeJson(
    join(outputDir, 'cfct-v6-full-coverage-summary.json'),
    audit.summary,
  );
  await writeCsv(
    join(outputDir, 'cfct-v6-full-coverage-food-codes.csv'),
    FOOD_CODE_COLUMNS,
    audit.foodCodeRows,
  );
  await writeCsv(
    join(outputDir, 'cfct-v6-full-coverage-no-food-code.csv'),
    NO_FOOD_CODE_COLUMNS,
    audit.noFoodCodeRows,
  );

  console.log('CFCT intermediate library audit');
  console.log(`- input: ${inputPath}`);
  console.log(`- totalRows: ${audit.summary.totalRows}`);
  console.log(`- rowsWithFoodCode: ${audit.summary.rowsWithFoodCode}`);
  console.log(`- rowsWithoutFoodCode: ${audit.summary.rowsWithoutFoodCode}`);
  console.log(`- uniqueFoodCodeCount: ${audit.summary.uniqueFoodCodeCount}`);
  console.log(
    `- coverageSummary: ${join(outputDir, 'cfct-v6-full-coverage-summary.json')}`,
  );
  console.log(
    `- foodCodeCsv: ${join(outputDir, 'cfct-v6-full-coverage-food-codes.csv')}`,
  );
  console.log(
    `- noFoodCodeCsv: ${join(outputDir, 'cfct-v6-full-coverage-no-food-code.csv')}`,
  );
}

const FOOD_CODE_COLUMNS: Array<[keyof CfctFoodCodeCoverageRow, string]> = [
  ['volume', 'volume'],
  ['foodCode', 'foodCode'],
  ['foodName', 'foodName'],
  ['firstPage', 'firstPage'],
  ['firstRow', 'firstRow'],
  ['rowCount', 'rowCount'],
  ['sourceSegmentCount', 'sourceSegmentCount'],
  ['nutrientFieldCount', 'nutrientFieldCount'],
  ['presentGroups', 'presentGroups'],
  ['missingCoreGroups', 'missingCoreGroups'],
  ['qualityFlags', 'qualityFlags'],
  ['reviewStatus', 'reviewStatus'],
];

const NO_FOOD_CODE_COLUMNS: Array<[keyof CfctNoFoodCodeCoverageRow, string]> = [
  ['volume', 'volume'],
  ['foodName', 'foodName'],
  ['page', 'page'],
  ['row', 'row'],
  ['nutrientFieldCount', 'nutrientFieldCount'],
  ['presentGroups', 'presentGroups'],
  ['qualityFlags', 'qualityFlags'],
  ['reviewStatus', 'reviewStatus'],
];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--input' && next) {
      args.input = next;
      index += 1;
    } else if (arg.startsWith('--input=')) {
      args.input = arg.slice('--input='.length);
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next;
      index += 1;
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    }
  }

  return args;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeCsv<Row extends object>(
  path: string,
  columns: Array<[keyof Row, string]>,
  rows: Row[],
) {
  await mkdir(dirname(path), { recursive: true });
  const lines = [
    columns.map(([, label]) => csvEscape(label)).join(','),
    ...rows.map((row) =>
      columns.map(([key]) => csvEscape(row[key] as unknown)).join(','),
    ),
  ];
  await writeFile(path, `${lines.join('\n')}\n`, 'utf8');
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Failed to audit CFCT intermediate library',
    );
    process.exitCode = 1;
  });
}
