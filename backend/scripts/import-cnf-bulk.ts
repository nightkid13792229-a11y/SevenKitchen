/**
 * CNF (Canadian Nutrient File) 2026 bulk importer.
 *
 * CNF 营养素编码沿用 USDA SR 数值体系（203=protein、501=Tryptophan、601=cholesterol…），
 * 因此直接复用 mapUsdaNutrientsToNutritionProfile 完成字段映射与犬用维生素换算。
 * 许可（OGL-C）：可商用、须注明来源且不修改数值；本导入原值入库并在 sourceDetail 保留署名。
 *
 * 输入：CNF 2026 ZIP 解压出的 CSV 目录（food_name.csv / nutrient_name.csv / nutrient_amount.csv）。
 * 输出：nutrition_source_record（sourceType=CNF，sourceKey=CNF:{Food_Code}）。
 *
 * Usage:
 *   node -r ts-node/register -r tsconfig-paths/register scripts/import-cnf-bulk.ts \
 *     --csv-dir <解压目录> [--limit N] [--apply] [--report report.json]
 */
import { PrismaClient } from '@prisma/client';
import { readdir, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import {
  attachUsdaFdcProfileMetadata,
  buildNutritionSourceKey,
  mapUsdaNutrientsToNutritionProfile,
} from '../src/domain/nutrition-governance/nutrition-governance.utils';

interface CliArgs {
  csvDir?: string;
  limit?: number | null;
  apply?: boolean;
  report?: string;
  help?: boolean;
}

const USAGE = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register scripts/import-cnf-bulk.ts \
    --csv-dir <extracted cnf dir> [--limit N] [--apply] [--report report.json]
`;

const CNF_SOURCE_TITLE = 'Canadian Nutrient File (CNF) 2026';
const CNF_SOURCE_PROVIDER = 'Health Canada';

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
        (args as Record<string, unknown>).limit = value ? Number(value) : null;
      } else {
        (args as Record<string, unknown>)[key] = value;
      }
      i += 1;
    }
  }
  return args;
}

function parseCsv(content: string): string[][] {
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
      // skip
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

function safeNumber(value: string): number | null {
  if (!value || value.trim() === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sampleStateFromName(name: string): string | null {
  const text = name.toLowerCase();
  if (/\braw\b|\buncooked\b/.test(text)) return 'RAW';
  if (
    /\bdried\b|\bdehydrated\b/.test(text) ||
    /\bflour\b/.test(text) ||
    /\bpowder\b/.test(text)
  ) {
    return 'DRIED';
  }
  if (
    /\bcooked\b|\bboiled\b|\bbaked\b|\broasted\b|\bfried\b|\bgrilled\b|\bstewed\b|\bbraised\b|\bsteamed\b|\bsimmered\b|\bpoached\b/.test(
      text,
    )
  ) {
    return 'COOKED';
  }
  return null;
}

interface CnfFoodRow {
  foodCode: string;
  description: string;
  descriptionF: string;
  aliases: string;
  usdaNdbCode: string | null;
  foodGroupCode: string | null;
  foodSourceCode: string | null;
  scientificName: string | null;
}

interface CnfNutrientRow {
  nutrientCode: string;
  description: string;
  tagname: string | null;
  unit: string | null;
}

interface CnfAmountRow {
  foodCode: string;
  nutrientCode: string;
  value: number;
  standardError: number | null;
  numberOfSamples: number | null;
  sourceCode: string | null;
  lastUpdated: string | null;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help || !args.csvDir) {
    console.error(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  // CNF 营养素编码沿用 USDA SR 三位编号（203/418…），而项目映射表使用 FDC 四位 id（1003/1178…）。
  // 用 USDA 官方 nutrient 表生成的对照文件做翻译。
  const codeMap = JSON.parse(
    await readFile(
      resolve(process.cwd(), 'scripts', 'data', 'usda-nutrient-nbr-to-fdc-id.json'),
      'utf8',
    ),
  ) as Record<string, { fdcId: number; name: string }>;
  const translateCode = (code: string): number | null => codeMap[code]?.fdcId ?? null;

  console.log(`加载 CNF CSV：${args.csvDir}`);
  const foodRows = await loadCsv(args.csvDir, 'food_name.csv');
  const nutrientRows = await loadCsv(args.csvDir, 'nutrient_name.csv');
  const amountRows = await loadCsv(args.csvDir, 'nutrient_amount.csv');
  if (foodRows.length === 0 || nutrientRows.length === 0 || amountRows.length === 0) {
    throw new Error(
      '目录缺少 food_name.csv / nutrient_name.csv / nutrient_amount.csv，请确认解压完整。',
    );
  }
  console.log(
    `food_name ${foodRows.length} 行；nutrient_name ${nutrientRows.length} 行；nutrient_amount ${amountRows.length} 行。`,
  );

  const foods: CnfFoodRow[] = foodRows.map((row) => ({
    foodCode: (row['Food_Code'] ?? row['Food Code'] ?? row['FoodID'] ?? '').trim(),
    description:
      row['Food_Description_EN'] ??
      row['Food_Description'] ??
      row['Food Description'] ??
      row['FoodName'] ??
      '',
    descriptionF:
      row['Food_Description_FR'] ?? row['Food Description F'] ?? '',
    aliases:
      row['Alternate_Description_EN'] ??
      row['Alternate_Description'] ??
      row['Alternate Description'] ??
      '',
    usdaNdbCode: (row['USDA_NDB_Code'] ?? row['USDA NDB Code'] ?? '').trim() || null,
    foodGroupCode:
      (row['CNF_Food_Group_Code'] ?? row['Food_Group_Code'] ?? row['Food Group Code'] ?? '')
        .trim() || null,
    foodSourceCode: (row['Food_Source_Code'] ?? row['Food Source Code'] ?? '').trim() || null,
    scientificName: (row['ScientificName'] ?? row['Scientific Name'] ?? '').trim() || null,
  })).filter((food) => food.foodCode && food.description);

  const nutrients = new Map<string, CnfNutrientRow>();
  nutrientRows.forEach((row) => {
    const code = (row['Nutrient_Code'] ?? row['Nutrient Code'] ?? '').trim();
    if (code) {
      nutrients.set(code, {
        nutrientCode: code,
        description:
          row['Nutrient_Name_EN'] ??
          row['Nutrient_Description'] ??
          row['Nutrient Description'] ??
          '',
        tagname: (row['Tagname'] ?? row['INFOODS Tagname'] ?? '').trim() || null,
        unit: (row['Nutrient_Unit'] ?? row['Unit'] ?? '').trim() || null,
      });
    }
  });
  console.log(`nutrient_name：${nutrients.size} 个营养素。`);

  const amountsByFood = new Map<string, CnfAmountRow[]>();
  amountRows.forEach((row) => {
    const foodCode = (row['Food_Code'] ?? row['Food Code'] ?? '').trim();
    const nutrientCode = (row['Nutrient_Code'] ?? row['Nutrient Code'] ?? '').trim();
    const value = safeNumber(row['Nutrient_Amount'] ?? row['Nutrient Amount'] ?? '');
    if (!foodCode || !nutrientCode || value === null) {
      return;
    }
    const list = amountsByFood.get(foodCode) ?? [];
    list.push({
      foodCode,
      nutrientCode,
      value,
      standardError: safeNumber(row['STD_Error'] ?? row['Standard_Error'] ?? row['Standard Error'] ?? ''),
      numberOfSamples: safeNumber(row['Observations'] ?? row['Number_of_Samples'] ?? row['Number of Samples'] ?? ''),
      sourceCode: (row['Nutrient_Source_Code'] ?? row['Nutrient Source Code'] ?? '').trim() || null,
      lastUpdated:
        (row['Nutrient_Last_Updated_Date'] ?? row['Last_Update_Date'] ?? row['Last Update Date'] ?? '')
          .trim() || null,
    });
    amountsByFood.set(foodCode, list);
  });
  console.log(`nutrient_amount：${amountsByFood.size} 个食品有营养数据。`);

  const prisma = new PrismaClient();
  const counters = { scanned: 0, upserted: 0, failed: 0 };
  const failed: Array<{ foodCode: string; error: string }> = [];
  const limit = args.limit ?? null;

  try {
    for (const food of foods) {
      if (limit !== null && counters.scanned >= limit) {
        break;
      }
      counters.scanned += 1;
      const amountRowsForFood = amountsByFood.get(food.foodCode) ?? [];
      if (amountRowsForFood.length === 0) {
        continue;
      }
      try {
        const profile = mapUsdaNutrientsToNutritionProfile(
          (amountRowsForFood
            .map((amount) => ({
              amount: amount.value,
              nutrient: {
                id: translateCode(amount.nutrientCode),
                name:
                  nutrients.get(amount.nutrientCode)?.description ??
                  `CNF ${amount.nutrientCode}`,
                unitName: nutrients.get(amount.nutrientCode)?.unit ?? '',
              },
            }))
            .filter(
              (row) =>
                row.nutrient.id !== null &&
                row.nutrient.id !== undefined &&
                Number.isFinite(row.nutrient.id),
            ) as Array<{
            amount: number;
            nutrient: { id: number; name: string; unitName: string };
          }>),
        );
        profile.meta.sourceType = 'CNF';
        profile.meta.sourceCode = 'CNF';
        profile.meta.sourceProvider = CNF_SOURCE_PROVIDER;
        profile.meta.sourceTitle = CNF_SOURCE_TITLE;
        profile.meta.externalId = `CNF:${food.foodCode}`;
        profile.meta.sourceVersion = 'CNF_2026_14TH';
        profile.meta.confidenceLevel = 'MEDIUM';
        const sampleState = sampleStateFromName(food.description);
        if (sampleState) {
          profile.meta.sampleState = sampleState as any;
        }

        const sourceKey = buildNutritionSourceKey('CNF', food.foodCode);
        const sourceDetail = {
          foodCode: food.foodCode,
          descriptionF: food.descriptionF,
          aliases: food.aliases,
          usdaNdbCode: food.usdaNdbCode,
          foodGroupCode: food.foodGroupCode,
          foodSourceCode: food.foodSourceCode,
          scientificName: food.scientificName,
          provider: CNF_SOURCE_PROVIDER,
          sourceVersion: 'CNF_2026_14TH',
          importMode: 'bulk-cnf-2026',
          licenseNote:
            'Open Government Licence - Canada: used with acknowledgment; nutrient values unmodified.',
        };

        if (args.apply) {
          await prisma.nutritionSourceRecord.upsert({
            where: {
              sourceType_sourceKey: { sourceType: 'CNF', sourceKey },
            },
            create: {
              sourceType: 'CNF',
              sourceKey,
              sourceTitle: CNF_SOURCE_TITLE,
              sourceDetail: sourceDetail as any,
              foodName: food.description,
              foodNameEn: food.description,
              dataType: 'cnf_2026',
              category: food.foodGroupCode ?? null,
              rawData: {
                food,
                amounts: amountRowsForFood,
              } as any,
              normalizedNutrition: profile as any,
              status: 'ACTIVE',
            },
            update: {
              sourceTitle: CNF_SOURCE_TITLE,
              sourceDetail: sourceDetail as any,
              foodName: food.description,
              foodNameEn: food.description,
              dataType: 'cnf_2026',
              category: food.foodGroupCode ?? null,
              rawData: {
                food,
                amounts: amountRowsForFood,
              } as any,
              normalizedNutrition: profile as any,
            },
          });
          counters.upserted += 1;
        } else {
          counters.upserted += 1;
        }
      } catch (error) {
        counters.failed += 1;
        failed.push({
          foodCode: food.foodCode,
          error: error instanceof Error ? error.message : String(error),
        });
        if (failed.length <= 5) {
          console.error(
            `  失败 ${food.foodCode}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      if (counters.scanned % 1000 === 0) {
        console.log(
          `  进度 ${counters.scanned}/${foods.length}（成功 ${counters.upserted}，失败 ${counters.failed}）`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const report = {
    mode: args.apply ? 'apply' : 'dry-run',
    scanned: counters.scanned,
    upserted: counters.upserted,
    failed: counters.failed,
    failures: failed.slice(0, 30),
  };
  console.log(
    `完成（${report.mode}）：扫描 ${counters.scanned}，成功 ${counters.upserted}，失败 ${counters.failed}。`,
  );
  if (args.report) {
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
