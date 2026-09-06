/**
 * USDA FoodData Central bulk library importer.
 *
 * One-time engineering: downloads are expected to be pre-extracted into a
 * local directory. This script parses the relational CSVs (food.csv,
 * food_nutrient.csv, nutrient.csv, optional food_category.csv) and bulk
 * upserts every SR Legacy + Foundation food into `nutrition_source_record`
 * with the same rawData/normalizedNutrition shape used by the existing
 * per-ingredient import flow.
 *
 * Usage:
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     scripts/import-usda-fdc-bulk.ts \
 *     --csv-dir ../tmp/nutrition-db-import/sr_legacy_csv \
 *     [--supporting-dir ../tmp/nutrition-db-import/supporting_csv] \
 *     [--limit 100] [--apply] [--report ../tmp/nutrition-db-import/import-report.json]
 */
import { PrismaClient } from '@prisma/client';
import { readdir, readFile } from 'fs/promises';
import { resolve } from 'path';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import {
  attachUsdaFdcProfileMetadata,
  buildNutritionSourceKey,
  buildUsdaFdcSourceVersion,
  mapUsdaNutrientsToNutritionProfile,
} from '../src/domain/nutrition-governance/nutrition-governance.utils';

interface CliArgs {
  csvDir?: string;
  supportingDir?: string;
  limit?: number | null;
  apply?: boolean;
  report?: string;
  help?: boolean;
}

const USAGE = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register scripts/import-usda-fdc-bulk.ts \
    --csv-dir <extracted csv dir> [--supporting-dir <supporting csv dir>] \
    [--limit N] [--apply] [--report report.json]
`;

const USDA_SOURCE_TITLE = 'USDA FoodData Central';
const USDA_PROVIDER = 'USDA FoodData Central';

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i += 1) {
    const flag = raw[i];
    if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else if (flag === '--apply') {
      args.apply = true;
    } else if (flag.startsWith('--')) {
      const key = flag
        .slice(2)
        .replace(/-([a-z])/g, (_m, c) => c.toUpperCase()) as keyof CliArgs;
      const value = raw[i + 1];
      if (key === 'limit') {
        (args as Record<string, unknown>).limit = value
          ? Number(value)
          : null;
      } else {
        (args as Record<string, unknown>)[key] = value;
      }
      i += 1;
    }
  }
  return args;
}

/**
 * Minimal RFC-4180 style CSV parser: handles quoted fields, embedded commas,
 * quotes and newlines. Returns rows as string arrays. Header row included.
 */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const length = content.length;

  for (let i = 0; i < length; i += 1) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (char === '\r') {
      // skip; \n handles the row end
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toRows(content: string): Record<string, string>[] {
  const rows = parseCsv(content);
  if (rows.length === 0) {
    return [];
  }
  const header = rows[0].map((value) => value.trim().replace(/^\uFEFF/, ''));
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = cells[index] ?? '';
    });
    return record;
  });
}

async function loadCsv(dir: string, fileName: string): Promise<Record<string, string>[]> {
  const entries = await readdir(dir);
  const match = entries.find(
    (entry) => entry.toLowerCase() === fileName.toLowerCase(),
  );
  if (!match) {
    return [];
  }
  const content = await readFile(resolve(dir, match), 'utf8');
  return toRows(content);
}

interface UsdaNutrientRow {
  amount: number;
  nutrient: { id: number; name: string; unitName: string };
}

function safeNumber(value: string): number | null {
  if (!value || value.trim() === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help || !args.csvDir) {
    console.error(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  console.log(`加载 USDA FDC CSV：${args.csvDir}`);
  const foods = await loadCsv(args.csvDir, 'food.csv');
  const foodNutrients = await loadCsv(args.csvDir, 'food_nutrient.csv');
  const nutrients = await loadCsv(args.csvDir, 'nutrient.csv');
  if (foods.length === 0 || foodNutrients.length === 0 || nutrients.length === 0) {
    throw new Error('目录缺少 food.csv / food_nutrient.csv / nutrient.csv，请确认解压完整。');
  }
  console.log(`food.csv ${foods.length} 行；food_nutrient.csv ${foodNutrients.length} 行；nutrient.csv ${nutrients.length} 行。`);

  const categoryById = new Map<string, string>();
  if (args.supportingDir) {
    const categories = await loadCsv(args.supportingDir, 'food_category.csv');
    categories.forEach((row) => {
      if (row.id && row.description) {
        categoryById.set(row.id, row.description);
      }
    });
    console.log(`food_category.csv ${categories.length} 行（来自 supporting 目录）。`);
  }

  const nutrientMeta = new Map<number, { name: string; unitName: string }>();
  nutrients.forEach((row) => {
    const id = safeNumber(row.id);
    if (id !== null) {
      nutrientMeta.set(id, {
        name: row.name ?? '',
        unitName: row.unit_name ?? '',
      });
    }
  });

  const targetDataTypes = new Set(['sr_legacy_food', 'foundation_food']);
  const selectedFoods = foods.filter((row) =>
    targetDataTypes.has(row.data_type ?? ''),
  );
  console.log(
    `筛选 sr_legacy_food + foundation_food：${selectedFoods.length} 条（${foods.length - selectedFoods.length} 条其他类型跳过）。`,
  );

  const nutrientsByFood = new Map<string, UsdaNutrientRow[]>();
  foodNutrients.forEach((row) => {
    if (!row.fdc_id) {
      return;
    }
    const amount = safeNumber(row.amount);
    const nutrientId = safeNumber(row.nutrient_id);
    if (amount === null || nutrientId === null) {
      return;
    }
    const meta = nutrientMeta.get(nutrientId);
    if (!meta) {
      return;
    }
    const list = nutrientsByFood.get(row.fdc_id) ?? [];
    list.push({ amount, nutrient: { id: nutrientId, ...meta } });
    nutrientsByFood.set(row.fdc_id, list);
  });

  const prisma = new PrismaClient();
  const counters = {
    scanned: 0,
    upserted: 0,
    created: 0,
    updated: 0,
    noNutrients: 0,
    errors: 0,
  };
  const failed: { fdcId: string; error: string }[] = [];
  const limit = args.limit ?? null;

  try {
    for (const food of selectedFoods) {
      if (limit !== null && counters.scanned >= limit) {
        break;
      }
      counters.scanned += 1;
      const fdcId = (food.fdc_id ?? '').trim();
      if (!fdcId) {
        counters.errors += 1;
        failed.push({ fdcId: '?', error: 'missing fdc_id' });
        continue;
      }
      const foodNutrientRows = nutrientsByFood.get(fdcId) ?? [];
      if (foodNutrientRows.length === 0) {
        counters.noNutrients += 1;
        continue;
      }

      const profile = mapUsdaNutrientsToNutritionProfile(foodNutrientRows);
      attachUsdaFdcProfileMetadata(profile, {
        externalId: fdcId,
        sourceVersion: buildUsdaFdcSourceVersion(food.publication_date),
        sourceTitle: USDA_SOURCE_TITLE,
        confidenceLevel: 'MEDIUM',
      });

      const rawData = {
        food: {
          fdcId,
          dataType: food.data_type ?? null,
          description: food.description ?? '',
          foodCategoryId: food.food_category_id ?? null,
          publicationDate: food.publication_date ?? null,
        },
        foodNutrients: foodNutrientRows,
      };
      const sourceDetail = {
        fdcId,
        provider: USDA_PROVIDER,
        sourceProvider: USDA_PROVIDER,
        publishedDate: food.publication_date ?? null,
        dataType: food.data_type ?? null,
        category: categoryById.get(food.food_category_id ?? '') ?? null,
        importMode: 'bulk-fdc-csv',
      };
      const sourceKey = buildNutritionSourceKey('USDA', fdcId);

      try {
        if (args.apply) {
          const result = await prisma.nutritionSourceRecord.upsert({
            where: { sourceType_sourceKey: { sourceType: 'USDA', sourceKey } },
            create: {
              sourceType: 'USDA',
              sourceKey,
              sourceTitle: USDA_SOURCE_TITLE,
              sourceDetail: sourceDetail as any,
              foodName: food.description ?? `USDA ${fdcId}`,
              foodNameEn: food.description ?? null,
              dataType: food.data_type ?? null,
              category: categoryById.get(food.food_category_id ?? '') ?? null,
              rawData: rawData as any,
              normalizedNutrition: profile as any,
              status: 'ACTIVE',
            },
            update: {
              sourceTitle: USDA_SOURCE_TITLE,
              sourceDetail: sourceDetail as any,
              foodName: food.description ?? `USDA ${fdcId}`,
              foodNameEn: food.description ?? null,
              dataType: food.data_type ?? null,
              category: categoryById.get(food.food_category_id ?? '') ?? null,
              rawData: rawData as any,
              normalizedNutrition: profile as any,
            },
          });
          counters.upserted += 1;
          if (result.createdAt.getTime() === result.updatedAt.getTime()) {
            counters.created += 1;
          } else {
            counters.updated += 1;
          }
        } else {
          counters.upserted += 1;
        }
      } catch (error) {
        counters.errors += 1;
        failed.push({
          fdcId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (failed.length <= 10) {
          console.error(`  失败 ${fdcId}: ${error instanceof Error ? error.message : error}`);
        }
      }

      if (counters.scanned % 500 === 0) {
        console.log(
          `  进度 ${counters.scanned}/${selectedFoods.length}（upsert ${counters.upserted}，无营养跳过 ${counters.noNutrients}，失败 ${counters.errors}）`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const report = {
    mode: args.apply ? 'apply' : 'dry-run',
    csvDir: args.csvDir,
    scanned: counters.scanned,
    upserted: counters.upserted,
    created: counters.created,
    updated: counters.updated,
    noNutrients: counters.noNutrients,
    errors: counters.errors,
    failed: failed.slice(0, 50),
  };
  console.log('');
  console.log(`完成（${report.mode}）：扫描 ${counters.scanned}，可入库 ${counters.upserted}，无营养跳过 ${counters.noNutrients}，失败 ${counters.errors}。`);
  if (args.report) {
    const { writeFile } = await import('fs/promises');
    await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`报告已写入：${args.report}`);
  }
  if (!args.apply) {
    console.log('未写入数据库（dry-run）。确认无异常后加 --apply 执行。');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
