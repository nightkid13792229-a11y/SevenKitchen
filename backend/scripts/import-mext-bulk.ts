/**
 * MEXT 日本食品標準成分表2020年版（八訂）主表 bulk importer.
 *
 * 输入：backend/scripts/mext-xlsx-to-json.py 转换出的 JSON（每食品一行的组件表）。
 * 输出：nutrition_source_record（sourceType=MEXT，sourceKey=MEXT:{食品番号}），
 * normalizedNutrition 为项目 NutritionProfileV2 结构，犬用维生素 A/E 经项目换算器重算。
 *
 * Usage:
 *   node -r ts-node/register -r tsconfig-paths/register scripts/import-mext-bulk.ts \
 *     --json ../tmp/nutrition-db-import/mext/mext8_table1.json \
 *     [--limit N] [--apply] [--report ../tmp/nutrition-db-import/mext/mext-import-report.json]
 */
import { PrismaClient } from '@prisma/client';
import { readFile, writeFile } from 'fs/promises';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import { createEmptyNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';
import {
  calculateVitaminAActivityIu,
  buildVitaminASourceFormMetadata,
} from '../src/domain/ingredient/vitamin-a-conversion';
import {
  calculateVitaminEActivityIu,
  buildVitaminESourceFormMetadata,
} from '../src/domain/ingredient/vitamin-e-conversion';
import { buildNutritionSourceKey } from '../src/domain/nutrition-governance/nutrition-governance.utils';

interface CliArgs {
  json?: string;
  aminoJson?: string;
  fattyJson?: string;
  limit?: number | null;
  apply?: boolean;
  report?: string;
  help?: boolean;
}

interface MextFoodRow {
  foodGroup: string | null;
  foodNumber: string;
  indexNumber: number | string | null;
  foodName: string;
  refuse: string | number | null;
  components: Record<string, string | number>;
}

const USAGE = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register scripts/import-mext-bulk.ts \
    --json <mext8_table1.json> [--amino-json mext8_amino.json] [--fatty-json mext8_fatty.json] \
    [--limit N] [--apply] [--report report.json]
`;

const MEXT_SOURCE_TITLE = '日本食品標準成分表2020年版（八訂）';
const MEXT_SOURCE_PROVIDER = '文部科学省 日本食品標準成分表2020年版（八訂）';

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

interface ParsedComponent {
  value: number;
  estimated: boolean;
}

function parseComponent(raw: string | number | null | undefined): ParsedComponent | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, estimated: false } : null;
  }
  const text = String(raw).trim();
  const estimatedMatch = /^\((.+)\)$/.exec(text);
  const value = Number(estimatedMatch ? estimatedMatch[1] : text);
  if (!Number.isFinite(value)) {
    return null;
  }
  return { value, estimated: estimatedMatch !== null };
}

function setField(
  profile: NutritionProfileV2,
  fieldPath: string,
  component: ParsedComponent | null,
  unit: string,
  sourceNutrientName: string | null,
): void {
  if (!component) {
    return;
  }
  const [tabKey, fieldKey] = fieldPath.split('.');
  if (tabKey !== 'macros' && tabKey !== 'minerals' && tabKey !== 'vitamins') {
    return;
  }
  const tab = (profile as unknown as Record<string, Record<string, number | null>>)[tabKey];
  if (!tab || !(fieldKey in tab)) {
    return;
  }
  tab[fieldKey] = component.value;
  profile.meta.sourceForms ??= {};
  profile.meta.sourceForms[fieldPath] = {
    sourceNutrientId: null,
    sourceNutrientName: sourceNutrientName ?? null,
    originalValue: component.value,
    originalUnit: unit,
    canonicalValue: component.value,
    canonicalUnit: unit,
    basisType: profile.meta.rawBasisType,
    estimated: component.estimated,
    dataSource: 'MEXT_2020_8TH',
  };
}

function addCustomItem(
  profile: NutritionProfileV2,
  name: string,
  component: ParsedComponent,
  unit: string,
): void {
  profile.customItems.push({
    name,
    value: component.value,
    unit,
    rawBasisType: profile.meta.rawBasisType ?? 'PER_100_G',
    sourceNutrientName: name,
    note: component.estimated ? '推定値（括弧値）' : undefined,
  });
}

/** 氨基酸表 mg/100g → profile.aminoAcids (g)。 */
const AMINO_FIELD_BY_CODE: Record<string, string> = {
  ILE: 'isoleucine',
  LEU: 'leucine',
  LYS: 'lysine',
  MET: 'methionine',
  CYS: 'cystine',
  PHE: 'phenylalanine',
  TYR: 'tyrosine',
  THR: 'threonine',
  TRP: 'tryptophan',
  VAL: 'valine',
  HIS: 'histidine',
  ARG: 'arginine',
  GLU: 'glutamicAcid',
  GLY: 'glycine',
  PRO: 'proline',
};

const AMINO_CUSTOM_LABELS: Record<string, string> = {
  ALA: 'アラニン',
  ASP: 'アスパラギン酸',
  SER: 'セリン',
  HYP: 'ヒドロキシプロリン',
  METCYS: '含硫アミノ酸合計',
  PHETYR: '芳香族アミノ酸合計',
  AATOTAL: 'アミノ酸組成計',
};

function mergeAminoAcids(profile: NutritionProfileV2, row: MextFoodRow): void {
  for (const [code, fieldKey] of Object.entries(AMINO_FIELD_BY_CODE)) {
    const component = parseComponent(row.components[code] ?? null);
    if (!component) {
      continue;
    }
    const valueG = component.value / 1000;
    (profile.aminoAcids as Record<string, number | null>)[fieldKey] = valueG;
    profile.meta.sourceForms ??= {};
    profile.meta.sourceForms[`aminoAcids.${fieldKey}`] = {
      sourceNutrientId: null,
      sourceNutrientName: AMINO_CUSTOM_LABELS[code] ?? code,
      originalValue: component.value,
      originalUnit: 'mg',
      canonicalValue: valueG,
      canonicalUnit: 'g',
      basisType: profile.meta.rawBasisType,
      estimated: component.estimated,
      dataSource: 'MEXT_2020_8TH_AMINO',
      conversionFactor: 0.001,
      conversionFactorUnit: 'G_PER_MG',
    };
  }
  for (const [code, label] of Object.entries(AMINO_CUSTOM_LABELS)) {
    const component = parseComponent(row.components[code] ?? null);
    if (!component || AMINO_FIELD_BY_CODE[code]) {
      continue;
    }
    addCustomItem(profile, label, { ...component, value: component.value / 1000 }, 'g');
  }
}

/** 脂肪酸表 mg/100g → profile.fattyAcids（g；epa/dpa/dha 保持 mg）。 */
const FATTY_FIELD_BY_CODE: Record<string, { fieldKey: string; unit: 'g' | 'mg' }> = {
  FASAT: { fieldKey: 'saturatedFattyAcids', unit: 'g' },
  FAMS: { fieldKey: 'monounsaturatedFattyAcids', unit: 'g' },
  FAPU: { fieldKey: 'polyunsaturatedFattyAcids', unit: 'g' },
  F18D2N6: { fieldKey: 'linoleicAcid', unit: 'g' },
  F18D3N3: { fieldKey: 'alphaLinolenicAcid', unit: 'g' },
  F20D4N6: { fieldKey: 'arachidonicAcid', unit: 'g' },
  F20D5N3: { fieldKey: 'epa', unit: 'mg' },
  F22D5N3: { fieldKey: 'dpa', unit: 'mg' },
  F22D6N3: { fieldKey: 'dha', unit: 'mg' },
};

const FATTY_CUSTOM_LABELS: Record<string, string> = {
  FACID: '脂肪酸総量',
  F18D1CN9: 'オレイン酸(cis)',
  F16D0: 'パルミチン酸',
  F18D0: 'ステアリン酸',
  FAPUN3: 'n-3系多価不飽和脂肪酸',
  FAPUN6: 'n-6系多価不飽和脂肪酸',
};

function mergeFattyAcids(profile: NutritionProfileV2, row: MextFoodRow): void {
  for (const [code, mapping] of Object.entries(FATTY_FIELD_BY_CODE)) {
    const component = parseComponent(row.components[code] ?? null);
    if (!component) {
      continue;
    }
    const value = mapping.unit === 'g' ? component.value / 1000 : component.value;
    (profile.fattyAcids as Record<string, number | null>)[mapping.fieldKey] = value;
    profile.meta.sourceForms ??= {};
    profile.meta.sourceForms[`fattyAcids.${mapping.fieldKey}`] = {
      sourceNutrientId: null,
      sourceNutrientName: code,
      originalValue: component.value,
      originalUnit: 'mg',
      canonicalValue: value,
      canonicalUnit: mapping.unit,
      basisType: profile.meta.rawBasisType,
      estimated: component.estimated,
      dataSource: 'MEXT_2020_8TH_FATTY',
      conversionFactor: mapping.unit === 'g' ? 0.001 : 1,
      conversionFactorUnit: mapping.unit === 'g' ? 'G_PER_MG' : 'IDENTITY',
    };
  }
  for (const [code, label] of Object.entries(FATTY_CUSTOM_LABELS)) {
    const component = parseComponent(row.components[code] ?? null);
    if (!component) {
      continue;
    }
    addCustomItem(profile, label, { ...component, value: component.value / 1000 }, 'g');
  }
}

function buildProfile(
  row: MextFoodRow,
  aminoRow?: MextFoodRow,
  fattyRow?: MextFoodRow,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = 'MEXT';
  profile.meta.sourceKind = 'FOOD_DATABASE';
  profile.meta.sourceCode = 'JP_FOOD_TABLE';
  profile.meta.sourceProvider = MEXT_SOURCE_PROVIDER;
  profile.meta.sourceTitle = MEXT_SOURCE_TITLE;
  profile.meta.externalId = `MEXT:${row.foodNumber}`;
  profile.meta.sourceVersion = 'MEXT_2020_8TH_REV_2021-12-28';
  profile.meta.confidenceLevel = 'MEDIUM';
  profile.meta.sourceForms = {};

  const c = (identifier: string): ParsedComponent | null =>
    parseComponent(row.components[identifier] ?? null);

  // 宏量（每 100g 可食部）
  setField(profile, 'macros.energyKcal', c('ENERC_KCAL') ?? c('ENERC'), 'kcal', 'エネルギー');
  setField(profile, 'macros.moisture', c('WATER'), 'g', '水分');
  setField(profile, 'macros.crudeProtein', c('PROT-'), 'g', 'たんぱく質');
  setField(profile, 'macros.crudeFat', c('FAT-'), 'g', '脂質');
  setField(profile, 'macros.carbohydrate', c('CHOCDF-'), 'g', '炭水化物（差引き法）');
  setField(profile, 'macros.fiber', c('FIB-'), 'g', '食物繊維総量');
  setField(profile, 'macros.ash', c('ASH'), 'g', '灰分');

  // 矿物质
  setField(profile, 'minerals.sodium', c('NA'), 'mg', 'ナトリウム');
  setField(profile, 'minerals.potassium', c('K'), 'mg', 'カリウム');
  setField(profile, 'minerals.calcium', c('CA'), 'mg', 'カルシウム');
  setField(profile, 'minerals.magnesium', c('MG'), 'mg', 'マグネシウム');
  setField(profile, 'minerals.phosphorus', c('P'), 'mg', 'リン');
  setField(profile, 'minerals.iron', c('FE'), 'mg', '鉄');
  setField(profile, 'minerals.zinc', c('ZN'), 'mg', '亜鉛');
  setField(profile, 'minerals.copper', c('CU'), 'mg', '銅');
  setField(profile, 'minerals.manganese', c('MN'), 'mg', 'マンガン');
  setField(profile, 'minerals.iodine', c('ID'), 'µg', 'ヨウ素');
  setField(profile, 'minerals.selenium', c('SE'), 'µg', 'セレン');

  // 维生素 A：视黄醇 + β-胡萝卜素当量 → 犬用活性 IU
  const retinol = c('RETOL');
  const betaCarotene = c('CARTBEQ');
  if (retinol || betaCarotene) {
    const calculation = calculateVitaminAActivityIu({
      retinolUg: retinol?.value ?? null,
      betaCaroteneUg: betaCarotene?.value ?? null,
    });
    if (calculation) {
      profile.vitamins.vitaminA = calculation.valueIu;
      profile.meta.sourceForms['vitamins.vitaminA'] = {
        sourceNutrientId: null,
        sourceNutrientName: 'レチノール + βカロテン当量',
        originalValue: null,
        originalUnit: 'µg',
        canonicalValue: calculation.valueIu,
        canonicalUnit: 'IU',
        basisType: profile.meta.rawBasisType,
        estimated: Boolean(retinol?.estimated || betaCarotene?.estimated),
        dataSource: 'MEXT_2020_8TH',
        ...buildVitaminASourceFormMetadata(calculation),
      };
    }
  } else if (c('VITA_RAE')) {
    const rae = c('VITA_RAE')!;
    const fallbackIu = rae.value * 3.33;
    profile.vitamins.vitaminA = fallbackIu;
    profile.meta.sourceForms['vitamins.vitaminA'] = {
      sourceNutrientId: null,
      sourceNutrientName: 'レチノール活性当量（RAE）',
      originalValue: rae.value,
      originalUnit: 'µg',
      canonicalValue: fallbackIu,
      canonicalUnit: 'IU',
      basisType: profile.meta.rawBasisType,
      estimated: rae.estimated,
      dataSource: 'MEXT_2020_8TH',
      vitaminAForm: 'RAE_FALLBACK',
      conversionFactor: 3.33,
      conversionFactorUnit: 'IU_PER_UG_RAE',
    };
  }

  // 维生素 D：µg → IU（×40，普通 D2+D3 总量）
  const vitaminD = c('VITD');
  if (vitaminD) {
    const valueIu = vitaminD.value * 40;
    profile.vitamins.vitaminD = valueIu;
    profile.meta.sourceForms['vitamins.vitaminD'] = {
      sourceNutrientId: null,
      sourceNutrientName: 'ビタミンD（D2+D3 総量）',
      originalValue: vitaminD.value,
      originalUnit: 'µg',
      canonicalValue: valueIu,
      canonicalUnit: 'IU',
      basisType: profile.meta.rawBasisType,
      estimated: vitaminD.estimated,
      dataSource: 'MEXT_2020_8TH',
      vitaminDForm: 'total_vitamin_d_d2_d3',
      conversionFactor: 40,
      conversionFactorUnit: 'IU_PER_UG',
    };
  }

  // 维生素 E：生育酚组分 → 犬用活性 IU
  const alphaTocopherol = c('TOCPHA');
  if (alphaTocopherol) {
    const calculation = calculateVitaminEActivityIu({
      alphaTocopherolMg: alphaTocopherol.value,
      betaTocopherolMg: c('TOCPHB')?.value ?? null,
      gammaTocopherolMg: c('TOCPHG')?.value ?? null,
      deltaTocopherolMg: c('TOCPHD')?.value ?? null,
    });
    if (calculation) {
      profile.vitamins.vitaminE = calculation.valueIu;
      profile.meta.sourceForms['vitamins.vitaminE'] = {
        sourceNutrientId: null,
        sourceNutrientName: 'α-トコフェロール（+β/γ/δ）',
        originalValue: alphaTocopherol.value,
        originalUnit: 'mg',
        canonicalValue: calculation.valueIu,
        canonicalUnit: 'IU',
        basisType: profile.meta.rawBasisType,
        estimated: alphaTocopherol.estimated,
        dataSource: 'MEXT_2020_8TH',
        ...buildVitaminESourceFormMetadata(calculation),
      };
    }
  }

  setField(profile, 'vitamins.vitaminK', c('VITK'), 'µg', 'ビタミンK');
  setField(profile, 'vitamins.vitaminB1', c('THIA'), 'mg', 'ビタミンB1');
  setField(profile, 'vitamins.vitaminB2', c('RIBF'), 'mg', 'ビタミンB2');
  setField(profile, 'vitamins.vitaminB3', c('NIA'), 'mg', 'ナイアシン');
  setField(profile, 'vitamins.vitaminB5', c('PANTAC'), 'mg', 'パントテン酸');
  setField(profile, 'vitamins.vitaminB6', c('VITB6A'), 'mg', 'ビタミンB6');
  setField(profile, 'vitamins.vitaminB12', c('VITB12'), 'µg', 'ビタミンB12');
  setField(profile, 'vitamins.vitaminB9', c('FOL'), 'µg', '葉酸');
  setField(profile, 'vitamins.vitaminB7', c('BIOT'), 'µg', 'ビオチン');
  setField(profile, 'vitamins.vitaminC', c('VITC'), 'mg', 'ビタミンC');

  // 自定义保留项（不参与 FEDIAF 计算，供追溯）
  const custom: Array<[string, string | null, string]> = [
    ['ENERC', 'エネルギー(kJ)', 'kJ'],
    ['PROTCAA', 'アミノ酸組成によるたんぱく質', 'g'],
    ['FATNLEA', '脂肪酸のトリアシルグリセロール当量', 'g'],
    ['CHOLE', 'コレステロール', 'mg'],
    ['CHOAVL', '利用可能炭水化物（質量計）', 'g'],
    ['CHOAVLM', '利用可能炭水化物（単糖当量）', 'g'],
    ['CHOAVLDF-', '差引き法による利用可能炭水化物', 'g'],
    ['POLYL', '糖アルコール', 'g'],
    ['OA', '有機酸', 'g'],
    ['CR', 'クロム', 'µg'],
    ['MO', 'モリブデン', 'µg'],
    ['CARTA', 'α-カロテン', 'µg'],
    ['CARTB', 'β-カロテン', 'µg'],
    ['CRYPXB', 'β-クリプトキサンチン', 'µg'],
    ['VITA_RAE', 'レチノール活性当量', 'µg'],
    ['NE', 'ナイアシン当量', 'mg'],
    ['ALC', 'アルコール', 'g'],
    ['NACL_EQ', '食塩相当量', 'g'],
  ];
  for (const [identifier, name, unit] of custom) {
    const component = c(identifier);
    if (component) {
      addCustomItem(profile, name ?? identifier, component, unit);
    }
  }

  if (aminoRow) {
    mergeAminoAcids(profile, aminoRow);
  }
  if (fattyRow) {
    mergeFattyAcids(profile, fattyRow);
  }

  return profile;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help || !args.json) {
    console.error(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const rows = JSON.parse(await readFile(args.json, 'utf8')) as MextFoodRow[];
  console.log(`加载 MEXT 八訂 JSON：${rows.length} 条食品。`);

  const aminoRows = args.aminoJson
    ? ((JSON.parse(await readFile(args.aminoJson, 'utf8')) as MextFoodRow[]))
    : [];
  const fattyRows = args.fattyJson
    ? ((JSON.parse(await readFile(args.fattyJson, 'utf8')) as MextFoodRow[]))
    : [];
  const aminoByNumber = new Map(aminoRows.map((row) => [row.foodNumber, row]));
  const fattyByNumber = new Map(fattyRows.map((row) => [row.foodNumber, row]));
  if (aminoRows.length > 0) {
    console.log(`氨基酸别册：${aminoRows.length} 条。`);
  }
  if (fattyRows.length > 0) {
    console.log(`脂肪酸别册：${fattyRows.length} 条。`);
  }

  const prisma = new PrismaClient();
  const counters = { scanned: 0, upserted: 0, failed: 0 };
  const failed: Array<{ foodNumber: string; error: string }> = [];
  const limit = args.limit ?? null;

  try {
    for (const row of rows) {
      if (limit !== null && counters.scanned >= limit) {
        break;
      }
      counters.scanned += 1;
      if (!row.foodNumber) {
        continue;
      }
      try {
        const profile = buildProfile(
          row,
          aminoByNumber.get(row.foodNumber),
          fattyByNumber.get(row.foodNumber),
        );
        const sourceKey = buildNutritionSourceKey('MEXT', row.foodNumber);
        const sourceDetail = {
          foodGroup: row.foodGroup,
          foodNumber: row.foodNumber,
          indexNumber: row.indexNumber,
          refusePercent: row.refuse ?? null,
          provider: MEXT_SOURCE_PROVIDER,
          sourceVersion: 'MEXT_2020_8TH_REV_2021-12-28',
          importMode: 'bulk-mext-8th-main-table',
        };
        if (args.apply) {
          await prisma.nutritionSourceRecord.upsert({
            where: {
              sourceType_sourceKey: { sourceType: 'MEXT', sourceKey },
            },
            create: {
              sourceType: 'MEXT',
              sourceKey,
              sourceTitle: MEXT_SOURCE_TITLE,
              sourceDetail: sourceDetail as any,
              foodName: row.foodName,
              foodNameEn: null,
              dataType: 'japanese_standard_table_8th',
              category: row.foodGroup ?? null,
              rawData: row as any,
              normalizedNutrition: profile as any,
              status: 'ACTIVE',
            },
            update: {
              sourceTitle: MEXT_SOURCE_TITLE,
              sourceDetail: sourceDetail as any,
              foodName: row.foodName,
              dataType: 'japanese_standard_table_8th',
              category: row.foodGroup ?? null,
              rawData: row as any,
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
          foodNumber: row.foodNumber,
          error: error instanceof Error ? error.message : String(error),
        });
        if (failed.length <= 5) {
          console.error(
            `  失败 ${row.foodNumber}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      if (counters.scanned % 500 === 0) {
        console.log(
          `  进度 ${counters.scanned}/${rows.length}（成功 ${counters.upserted}，失败 ${counters.failed}）`,
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
