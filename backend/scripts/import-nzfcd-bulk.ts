/**
 * NZFCD / FOODfiles 2024 bulk importer.
 *
 * 输入：FOODfiles 2024 MSI 解包后的 ASCII 文本文件（波浪号分隔，UTF-8）：
 *   NAME.FT（食品详情，含可食部%、State 列）
 *   Unabridged CODE.FT（组件标识符/描述/单位）
 *   Unabridged DATA.FT（FoodID×组件 列表式数据，含来源代码）
 * 输出：nutrition_source_record（sourceType=NZFCD，sourceKey=NZFCD:{FoodID}）。
 *
 * 许可注意（官网 Terms of Use）：数据免费可商用但要求原样呈现并在作品内致谢来源；
 * 本导入在 sourceTitle/sourceDetail 中保留版权署名与来源说明。
 *
 * Usage:
 *   node -r ts-node/register -r tsconfig-paths/register scripts/import-nzfcd-bulk.ts \
 *     --name-file "<path>/NAME.FT" --code-file "<path>/Unabridged CODE.FT" \
 *     --data-file "<path>/Unabridged DATA.FT" [--limit N] [--apply] [--report report.json]
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
  nameFile?: string;
  codeFile?: string;
  dataFile?: string;
  limit?: number | null;
  apply?: boolean;
  report?: string;
  help?: boolean;
}

const USAGE = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register scripts/import-nzfcd-bulk.ts \
    --name-file <NAME.FT> --code-file <Unabridged CODE.FT> --data-file <Unabridged DATA.FT> \
    [--limit N] [--apply] [--report report.json]
`;

const NZFCD_SOURCE_TITLE = 'New Zealand Food Composition Database 2024 (FOODfiles)';
const NZFCD_SOURCE_PROVIDER =
  'The New Zealand Institute for Plant and Food Research Limited and the Ministry of Health (New Zealand)';

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

function parseDelimited(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  const length = content.length;
  for (let i = 0; i < length; i += 1) {
    const char = content[i];
    if (char === delimiter) {
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

function toRecords(
  content: string,
  delimiter: string,
  headerLineIndex = 0,
): Record<string, string>[] {
  const rows = parseDelimited(content, delimiter);
  if (rows.length <= headerLineIndex) {
    return [];
  }
  const header = rows[headerLineIndex].map((value) => value.trim().replace(/^\uFEFF/, ''));
  return rows.slice(headerLineIndex + 1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = cells[index] ?? '';
    });
    return record;
  });
}

interface NzNameRow {
  foodId: string;
  foodName: string;
  shortName: string;
  alternativeNames: string;
  description: string;
  ediblePortion: number | null;
  generic: string;
  kind: string;
  part: string;
  state: string;
  grade: string;
  maturity: string;
  scientificName: string;
  sampling: string;
  componentMessage: string;
}

interface NzDataRow {
  foodId: string;
  component: string;
  value: number;
  unitCode: string;
  sourceCode: string;
  valueTypeCode: string;
}

function safeNumber(value: string): number | null {
  if (!value || value.trim() === '' || value.trim() === '-') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sampleStateFromState(stateText: string): string | null {
  const text = (stateText ?? '').toLowerCase();
  if (/raw/.test(text)) return 'RAW';
  if (/dried|dehydrated|dry/.test(text)) return 'DRIED';
  if (/cooked|boiled|baked|roasted|fried|grilled|steamed|simmered|poached/.test(text)) {
    return 'COOKED';
  }
  return null;
}

interface ParsedComponent {
  value: number;
  sourceCode: string | null;
}

function getComponent(
  byFood: Map<string, Map<string, ParsedComponent>>,
  foodId: string,
  identifiers: string[],
): ParsedComponent | null {
  const food = byFood.get(foodId);
  if (!food) {
    return null;
  }
  for (const identifier of identifiers) {
    const found = food.get(identifier);
    if (found) {
      return found;
    }
  }
  return null;
}

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
  TAU: 'taurine',
};

const AMINO_CUSTOM_CODES: Record<string, string> = {
  ALA: 'Alanine',
  ASP: 'Aspartic acid',
  SER: 'Serine',
  HYP: 'Hydroxyproline',
};

function setAminoAcid(
  profile: NutritionProfileV2,
  code: string,
  fieldKey: string,
  component: ParsedComponent,
): void {
  const valueG = component.value / 1000;
  (profile.aminoAcids as Record<string, number | null>)[fieldKey] = valueG;
  profile.meta.sourceForms ??= {};
  profile.meta.sourceForms[`aminoAcids.${fieldKey}`] = {
    sourceNutrientId: null,
    sourceNutrientName: code,
    originalValue: component.value,
    originalUnit: 'mg',
    canonicalValue: valueG,
    canonicalUnit: 'g',
    basisType: profile.meta.rawBasisType,
    estimated: false,
    dataSource: 'NZFCD_2024',
    conversionFactor: 0.001,
    conversionFactorUnit: 'G_PER_MG',
  };
}

function buildProfile(
  nameRow: NzNameRow,
  byFood: Map<string, Map<string, ParsedComponent>>,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = 'NZFCD';
  profile.meta.sourceKind = 'FOOD_DATABASE';
  profile.meta.sourceCode = 'NZFCD';
  profile.meta.sourceProvider = NZFCD_SOURCE_PROVIDER;
  profile.meta.sourceTitle = NZFCD_SOURCE_TITLE;
  profile.meta.externalId = `NZFCD:${nameRow.foodId}`;
  profile.meta.sourceVersion = 'NZFCD_2024_V01';
  profile.meta.confidenceLevel = 'MEDIUM';
  profile.meta.sourceForms = {};
  const sampleState = sampleStateFromState(nameRow.state);
  if (sampleState) {
    profile.meta.sampleState = sampleState as any;
  }

  const c = (...identifiers: string[]): ParsedComponent | null =>
    getComponent(byFood, nameRow.foodId, identifiers);

  const set = (
    tabKey: 'macros' | 'minerals' | 'vitamins',
    fieldKey: string,
    unit: string,
    component: ParsedComponent | null,
    sourceNutrientName: string,
  ): void => {
    if (!component) {
      return;
    }
    const tab = profile[tabKey] as Record<string, number | null>;
    if (!(fieldKey in tab)) {
      return;
    }
    tab[fieldKey] = component.value;
    profile.meta.sourceForms ??= {};
    profile.meta.sourceForms[`${tabKey}.${fieldKey}`] = {
      sourceNutrientId: null,
      sourceNutrientName,
      originalValue: component.value,
      originalUnit: unit,
      canonicalValue: component.value,
      canonicalUnit: unit,
      basisType: profile.meta.rawBasisType,
      estimated: false,
      dataSource: 'NZFCD_2024',
    };
  };

  const addCustom = (name: string, unit: string, component: ParsedComponent | null): void => {
    if (!component) {
      return;
    }
    profile.customItems.push({
      name,
      value: component.value,
      unit,
      rawBasisType: profile.meta.rawBasisType ?? 'PER_100_G',
      sourceNutrientName: name,
    });
  };

  set('macros', 'energyKcal', 'kcal', c('ENERC_KCAL') ?? c('ENERC1_KCAL'), 'Energy (kcal)');
  set('macros', 'moisture', 'g', c('WATER'), 'Water');
  set('macros', 'crudeProtein', 'g', c('PROT'), 'Protein, total');
  set('macros', 'crudeFat', 'g', c('FAT'), 'Fat, total');
  set('macros', 'carbohydrate', 'g', c('CHOAVLDF'), 'Available carbohydrate by difference');
  set('macros', 'fiber', 'g', c('FIBTG'), 'Fibre, total dietary');
  set('macros', 'ash', 'g', c('ASH'), 'Ash');

  set('minerals', 'sodium', 'mg', c('NA'), 'Sodium');
  set('minerals', 'potassium', 'mg', c('K'), 'Potassium');
  set('minerals', 'calcium', 'mg', c('CA'), 'Calcium');
  set('minerals', 'magnesium', 'mg', c('MG'), 'Magnesium');
  set('minerals', 'phosphorus', 'mg', c('P'), 'Phosphorus');
  set('minerals', 'iron', 'mg', c('FE'), 'Iron');
  set('minerals', 'zinc', 'mg', c('ZN'), 'Zinc');
  set('minerals', 'copper', 'mg', c('CU'), 'Copper');
  set('minerals', 'manganese', 'mg', c('MN'), 'Manganese');
  set('minerals', 'iodine', 'µg', c('ID'), 'Iodine');
  set('minerals', 'selenium', 'µg', c('SE'), 'Selenium');
  set('minerals', 'chloride', 'mg', c('CLD') ?? c('CL'), 'Chloride');

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
        sourceNutrientName: 'Retinol + beta-carotene equivalents',
        originalValue: null,
        originalUnit: 'µg',
        canonicalValue: calculation.valueIu,
        canonicalUnit: 'IU',
        basisType: profile.meta.rawBasisType,
        estimated: false,
        dataSource: 'NZFCD_2024',
        ...buildVitaminASourceFormMetadata(calculation),
      };
    }
  } else if (c('VITA_RAE')) {
    const rae = c('VITA_RAE')!;
    const fallbackIu = rae.value * 3.33;
    profile.vitamins.vitaminA = fallbackIu;
    profile.meta.sourceForms['vitamins.vitaminA'] = {
      sourceNutrientId: null,
      sourceNutrientName: 'Vitamin A (RAE)',
      originalValue: rae.value,
      originalUnit: 'µg',
      canonicalValue: fallbackIu,
      canonicalUnit: 'IU',
      basisType: profile.meta.rawBasisType,
      estimated: false,
      dataSource: 'NZFCD_2024',
      vitaminAForm: 'RAE_FALLBACK',
      conversionFactor: 3.33,
      conversionFactorUnit: 'IU_PER_UG_RAE',
    };
  }

  const vitaminD = c('VITD');
  if (vitaminD) {
    const valueIu = vitaminD.value * 40;
    profile.vitamins.vitaminD = valueIu;
    profile.meta.sourceForms['vitamins.vitaminD'] = {
      sourceNutrientId: null,
      sourceNutrientName: 'Vitamin D (D2+D3)',
      originalValue: vitaminD.value,
      originalUnit: 'µg',
      canonicalValue: valueIu,
      canonicalUnit: 'IU',
      basisType: profile.meta.rawBasisType,
      estimated: false,
      dataSource: 'NZFCD_2024',
      vitaminDForm: 'total_vitamin_d_d2_d3',
      conversionFactor: 40,
      conversionFactorUnit: 'IU_PER_UG',
    };
  }

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
        sourceNutrientName: 'Alpha-tocopherol (+beta/gamma/delta)',
        originalValue: alphaTocopherol.value,
        originalUnit: 'mg',
        canonicalValue: calculation.valueIu,
        canonicalUnit: 'IU',
        basisType: profile.meta.rawBasisType,
        estimated: false,
        dataSource: 'NZFCD_2024',
        ...buildVitaminESourceFormMetadata(calculation),
      };
    }
  } else if (c('VITE')) {
    const vite = c('VITE')!;
    const valueIu = vite.value * 1.49;
    profile.vitamins.vitaminE = valueIu;
    profile.meta.sourceForms['vitamins.vitaminE'] = {
      sourceNutrientId: null,
      sourceNutrientName: 'Vitamin E (alpha-tocopherol equivalents)',
      originalValue: vite.value,
      originalUnit: 'mg',
      canonicalValue: valueIu,
      canonicalUnit: 'IU',
      basisType: profile.meta.rawBasisType,
      estimated: false,
      dataSource: 'NZFCD_2024',
      vitaminEForm: 'ALPHA_TOCOPHEROL_MG',
      conversionFactor: 1.49,
      conversionFactorUnit: 'IU_PER_MG',
    };
  }

  set('vitamins', 'vitaminK', 'µg', c('VITK'), 'Vitamin K');
  set('vitamins', 'vitaminB1', 'mg', c('THIA'), 'Thiamin');
  set('vitamins', 'vitaminB2', 'mg', c('RIBF'), 'Riboflavin');
  set('vitamins', 'vitaminB3', 'mg', c('NIA'), 'Niacin, preformed');
  set('vitamins', 'vitaminB5', 'mg', c('PANTAC'), 'Pantothenic acid');
  set('vitamins', 'vitaminB6', 'mg', c('VITB6A'), 'Vitamin B6');
  set('vitamins', 'vitaminB12', 'µg', c('VITB12'), 'Vitamin B12');
  set('vitamins', 'vitaminB9', 'µg', c('FOL'), 'Folate, total');
  set('vitamins', 'vitaminB7', 'µg', c('BIOT'), 'Biotin');
  set('vitamins', 'vitaminC', 'mg', c('VITC'), 'Vitamin C');

  const fatty = (fieldKey: string, unit: 'g' | 'mg', identifiers: string[], label: string): void => {
    const component = c(...identifiers);
    if (!component) {
      return;
    }
    const value = unit === 'g' ? component.value : component.value;
    (profile.fattyAcids as Record<string, number | null>)[fieldKey] = value;
    profile.meta.sourceForms ??= {};
    profile.meta.sourceForms[`fattyAcids.${fieldKey}`] = {
      sourceNutrientId: null,
      sourceNutrientName: label,
      originalValue: component.value,
      originalUnit: unit,
      canonicalValue: value,
      canonicalUnit: unit,
      basisType: profile.meta.rawBasisType,
      estimated: false,
      dataSource: 'NZFCD_2024',
    };
  };
  fatty('saturatedFattyAcids', 'g', ['FASAT'], 'Saturated fatty acids');
  fatty('monounsaturatedFattyAcids', 'g', ['FAMS'], 'Monounsaturated fatty acids');
  fatty('polyunsaturatedFattyAcids', 'g', ['FAPU'], 'Polyunsaturated fatty acids');
  fatty('linoleicAcid', 'g', ['F18D2CN6', 'F18D2N6', 'F18D2'], 'Linoleic acid');
  fatty('alphaLinolenicAcid', 'g', ['F18D3CN3', 'F18D3N3', 'F18D3'], 'Alpha-linolenic acid');
  fatty('arachidonicAcid', 'g', ['F20D4CN6', 'F20D4N6', 'F20D4'], 'Arachidonic acid');
  fatty('epa', 'mg', ['F20D5CN3', 'F20D5N3', 'F20D5'], 'EPA');
  fatty('dpa', 'mg', ['F22D5CN3', 'F22D5N3', 'F22D5'], 'DPA');
  fatty('dha', 'mg', ['F22D6CN3', 'F22D6N3', 'F22D6'], 'DHA');

  for (const [code, fieldKey] of Object.entries(AMINO_FIELD_BY_CODE)) {
    const component = c(code);
    if (component) {
      setAminoAcid(profile, code, fieldKey, component);
    }
  }
  for (const [code, label] of Object.entries(AMINO_CUSTOM_CODES)) {
    const component = c(code);
    if (component) {
      addCustom(label, 'g', { ...component, value: component.value / 1000 });
    }
  }

  addCustom('Cholesterol', 'mg', c('CHOLE'));
  addCustom('Energy (kJ)', 'kJ', c('ENERC'));
  addCustom('Fatty acids, total', 'g', c('FACID'));
  addCustom('n-3 polyunsaturated fatty acids', 'g', c('FAPUN3'));
  addCustom('n-6 polyunsaturated fatty acids', 'g', c('FAPUN6'));
  addCustom('Oleic acid (cis)', 'g', c('F18D1CN9'));
  addCustom('Palmitic acid', 'g', c('F16D0'));
  addCustom('Stearic acid', 'g', c('F18D0'));
  addCustom('Edible portion (%)', '%', {
    value: nameRow.ediblePortion ?? 0,
    sourceCode: null,
  });
  addCustom('Starch', 'g', c('STARCH'));
  addCustom('Total sugars', 'g', c('SUGAR'));

  return profile;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help || !args.nameFile || !args.codeFile || !args.dataFile) {
    console.error(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  console.log(`加载 NAME.FT：${args.nameFile}`);
  const nameContent = await readFile(args.nameFile, 'utf8');
  const nameRows = toRecords(nameContent, '~', 1);
  const names = nameRows
    .filter((row) => row.FoodID)
    .map((row): NzNameRow => ({
      foodId: (row.FoodID ?? '').trim(),
      foodName: row['Food Name'] ?? '',
      shortName: row['Short Food Name'] ?? '',
      alternativeNames: row['AlternativeNames'] ?? '',
      description: row['Food Description'] ?? '',
      ediblePortion: safeNumber(row['Edible portion (%)'] ?? ''),
      generic: row['Generic Name'] ?? '',
      kind: row['Kind'] ?? '',
      part: row['Part'] ?? '',
      state: row['State'] ?? '',
      grade: row['Grade'] ?? '',
      maturity: row['Maturity'] ?? '',
      scientificName: row['Scientific Name'] ?? '',
      sampling: row['Sampling Details'] ?? '',
      componentMessage: row['Component Message'] ?? '',
    }));
  console.log(`NAME.FT：${names.length} 条食品。`);

  const codeContent = await readFile(args.codeFile, 'utf8');
  const codeRows = toRecords(codeContent, '~', 1);
  const componentMeta = new Map<string, { description: string; unit: string }>();
  codeRows.forEach((row) => {
    const code = (row.Code ?? '').trim();
    if (code) {
      componentMeta.set(code, {
        description: row.Description ?? '',
        unit: row['Unit Code'] ?? '',
      });
    }
  });
  console.log(`CODE.FT：${componentMeta.size} 个组件。`);

  console.log(`加载 Unabridged DATA.FT（约 57 万行）...`);
  const dataContent = await readFile(args.dataFile, 'utf8');
  const dataRows = toRecords(dataContent, '~', 1);
  const byFood = new Map<string, Map<string, ParsedComponent>>();
  let skipped = 0;
  dataRows.forEach((row) => {
    const foodId = (row.FoodID ?? '').trim();
    const componentId = (row['Component Identifier'] ?? '').trim();
    const value = safeNumber(row['Value'] ?? '');
    if (!foodId || !componentId || value === null) {
      skipped += 1;
      return;
    }
    const food = byFood.get(foodId) ?? new Map<string, ParsedComponent>();
    // 同组件多行（不同来源/方法）时保留第一条
    if (!food.has(componentId)) {
      food.set(componentId, {
        value,
        sourceCode: row['Source Code'] ?? null,
      });
    }
    byFood.set(foodId, food);
  });
  console.log(`DATA.FT：${dataRows.length} 行 → ${byFood.size} 个食品（跳过 ${skipped} 行）。`);

  const prisma = new PrismaClient();
  const counters = { scanned: 0, upserted: 0, failed: 0 };
  const failed: Array<{ foodId: string; error: string }> = [];
  const limit = args.limit ?? null;

  try {
    for (const nameRow of names) {
      if (limit !== null && counters.scanned >= limit) {
        break;
      }
      counters.scanned += 1;
      try {
        const profile = buildProfile(nameRow, byFood);
        const sourceKey = buildNutritionSourceKey('NZFCD', nameRow.foodId);
        const sourceDetail = {
          foodId: nameRow.foodId,
          shortName: nameRow.shortName,
          alternativeNames: nameRow.alternativeNames,
          description: nameRow.description,
          ediblePortionPercent: nameRow.ediblePortion,
          genericName: nameRow.generic,
          kind: nameRow.kind,
          part: nameRow.part,
          state: nameRow.state,
          scientificName: nameRow.scientificName,
          provider: NZFCD_SOURCE_PROVIDER,
          sourceVersion: 'NZFCD_2024_V01',
          importMode: 'bulk-nzfcd-foodfiles-2024',
          licenseNote:
            'Data used per foodcomposition.co.nz Terms of Use (unmodified values, attribution required).',
        };
        if (args.apply) {
          await prisma.nutritionSourceRecord.upsert({
            where: {
              sourceType_sourceKey: { sourceType: 'NZFCD', sourceKey },
            },
            create: {
              sourceType: 'NZFCD',
              sourceKey,
              sourceTitle: NZFCD_SOURCE_TITLE,
              sourceDetail: sourceDetail as any,
              foodName: nameRow.foodName,
              foodNameEn: nameRow.shortName || nameRow.foodName,
              dataType: 'nzfcd_foodfiles_2024',
              category: nameRow.generic || null,
              rawData: {
                ...nameRow,
                components: Object.fromEntries(
                  (byFood.get(nameRow.foodId) ?? new Map()).entries(),
                ),
              } as any,
              normalizedNutrition: profile as any,
              status: 'ACTIVE',
            },
            update: {
              sourceTitle: NZFCD_SOURCE_TITLE,
              sourceDetail: sourceDetail as any,
              foodName: nameRow.foodName,
              foodNameEn: nameRow.shortName || nameRow.foodName,
              dataType: 'nzfcd_foodfiles_2024',
              category: nameRow.generic || null,
              rawData: {
                ...nameRow,
                components: Object.fromEntries(
                  (byFood.get(nameRow.foodId) ?? new Map()).entries(),
                ),
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
          foodId: nameRow.foodId,
          error: error instanceof Error ? error.message : String(error),
        });
        if (failed.length <= 5) {
          console.error(
            `  失败 ${nameRow.foodId}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      if (counters.scanned % 500 === 0) {
        console.log(
          `  进度 ${counters.scanned}/${names.length}（成功 ${counters.upserted}，失败 ${counters.failed}）`,
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
