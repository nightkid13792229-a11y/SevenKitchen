import type { TfdaFoodInput, TfdaNutrientRow } from './tfda-normalize';

/**
 * TFDA「食品營養成分資料集」官方 CSV 的解析。
 *
 * 文件是 UTF-8 **带 BOM**、字段普遍带引号（内容里有逗号）的长表；本模块用
 * 一个最小的 RFC4180 读取器把行拆出来，再按 `整合編號` 聚成每食品一条。
 * 不引入 `csv-parse` / `papaparse`（项目里没有这两个依赖），也不碰数据库。
 *
 * 缺失口径：`每100克含量` 只接受有限数；空白、`Tr`、`-`、`1.00/1.69/3.20`
 * 这类非数字一律跳过，**绝不补 0**（见 plan 2026-10-27-tfda-nutrition-import）。
 */

/** 官方文件是 UTF-8 with BOM；BOM 会粘在第一个表头名上，必须先剥掉。 */
const BOM = '\uFEFF';

/** 没有这些列就无法按食品/营养素聚合，宁可直接报错。 */
const REQUIRED_COLUMNS = [
  '整合編號',
  '樣品名稱',
  '分析項',
  '含量單位',
  '每100克含量',
] as const;

export interface TfdaCsvFood extends TfdaFoodInput {
  /** `內容物描述`（第一个非空值）；Task 1 的 `TfdaFoodInput` 没有这个字段。 */
  description: string | null;
}

/**
 * 逐行丢弃统计，用来解释 `totalRows` 与源文件行数的差异。
 *
 * `dataRows = numericRows + blankRows + traceRows + dashRows +
 * nonNumericRows + emptyNutrientNameRows`；空白 `整合編號` 的行单独记在
 * `invalidFoodRows`，不进入上述等式。
 */
export interface TfdaCsvParseStats {
  /** 整合編號有效、进入按食品处理的数据行数。 */
  dataRows: number;
  /** `每100克含量` 是有限数、最终保留的营养素行数。 */
  numericRows: number;
  /** `每100克含量` 为空/纯空白。 */
  blankRows: number;
  /** `每100克含量` 为 `Tr`（trace）。 */
  traceRows: number;
  /** `每100克含量` 为 `-`。 */
  dashRows: number;
  /** 有值但不是单个有限数，例如 `1.00/1.69/3.20`（P/M/S 比值）。 */
  nonNumericRows: number;
  /** 数值有效但 `分析項` 为空。 */
  emptyNutrientNameRows: number;
  /** `整合編號` 为空/纯空白的行。 */
  invalidFoodRows: number;
}

export interface TfdaCsvParseResult {
  foods: TfdaCsvFood[];
  stats: TfdaCsvParseStats;
}

interface MutableFood extends TfdaCsvFood {
  rows: TfdaNutrientRow[];
}

/**
 * 最小 RFC4180 读取器：逗号分隔、双引号包裹、`""` 转义、引号内允许换行。
 *
 * 逐字符扫描并用 generator 逐行产出，避免 63MB 文件先全部拆成二维数组。
 * 文件是 LF 换行；`\r` 在引号外被忽略以兼容 CRLF。
 */
function* iterateCsvRows(text: string): Generator<string[]> {
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }

    if (char === '\n') {
      row.push(field);
      yield row;
      row = [];
      field = '';
      index += 1;
      continue;
    }

    if (char === '\r') {
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // 文件末尾没有换行时，最后一行也要吐出来。
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    yield row;
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function buildColumnIndex(headerRow: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();

  headerRow.forEach((rawName, position) => {
    const name = rawName.replace(BOM, '').trim();
    if (name && !index.has(name)) {
      index.set(name, position);
    }
  });

  const missing = REQUIRED_COLUMNS.filter((name) => !index.has(name));
  if (missing.length > 0) {
    throw new Error(`TFDA CSV 缺少必需列：${missing.join('、')}`);
  }

  return index;
}

function readCell(
  row: readonly string[],
  index: Map<string, number>,
  column: string,
): string {
  const position = index.get(column);
  return position === undefined ? '' : (row[position] ?? '').trim();
}

function emptyStats(): TfdaCsvParseStats {
  return {
    dataRows: 0,
    numericRows: 0,
    blankRows: 0,
    traceRows: 0,
    dashRows: 0,
    nonNumericRows: 0,
    emptyNutrientNameRows: 0,
    invalidFoodRows: 0,
  };
}

/**
 * 解析并同时返回丢弃统计（导入脚本用它解释为什么有些行没进来）。
 *
 * `parseTfdaCsv` 只返回 foods；需要报告细节时用本函数。
 */
export function parseTfdaCsvWithStats(text: string): TfdaCsvParseResult {
  const stats = emptyStats();
  const foods = new Map<string, MutableFood>();
  const csvRows = iterateCsvRows(stripBom(text));
  const header = csvRows.next();

  if (header.done) {
    return { foods: [], stats };
  }

  const columnIndex = buildColumnIndex(header.value);

  for (const row of csvRows) {
    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) {
      continue;
    }

    const foodCode = readCell(row, columnIndex, '整合編號');
    if (!foodCode) {
      stats.invalidFoodRows += 1;
      continue;
    }

    stats.dataRows += 1;

    let food = foods.get(foodCode);
    if (!food) {
      food = {
        foodCode,
        // 按规格取第一条；后续行即使名字不同也不覆盖。
        name: readCell(row, columnIndex, '樣品名稱'),
        nameEn: null,
        category: null,
        refuseRate: null,
        description: null,
        rows: [],
      };
      foods.set(foodCode, food);
    }

    // 以下三个字段都取「第一个非空值」：官方文件每行都重复整份元数据，
    // 但局部导出/测试 fixture 可能把英文名、描述、分类留在后面的行。
    const nameEn = readCell(row, columnIndex, '樣品英文名稱');
    if (food.nameEn === null && nameEn) {
      food.nameEn = nameEn;
    }

    const category = readCell(row, columnIndex, '食品分類');
    if (food.category === null && category) {
      food.category = category;
    }

    const description = readCell(row, columnIndex, '內容物描述');
    if (food.description === null && description) {
      food.description = description;
    }

    if (food.refuseRate === null) {
      const rawRefuseRate = readCell(row, columnIndex, '廢棄率');
      if (rawRefuseRate) {
        const refuseRate = Number(rawRefuseRate);
        if (Number.isFinite(refuseRate)) {
          food.refuseRate = refuseRate;
        }
      }
    }

    const nutrientName = readCell(row, columnIndex, '分析項');
    if (!nutrientName) {
      stats.emptyNutrientNameRows += 1;
      continue;
    }

    const rawValue = readCell(row, columnIndex, '每100克含量');
    if (!rawValue) {
      stats.blankRows += 1;
      continue;
    }
    if (rawValue.toLowerCase() === 'tr') {
      stats.traceRows += 1;
      continue;
    }
    if (rawValue === '-') {
      stats.dashRows += 1;
      continue;
    }

    // 空格填充的数字（`               117`）trim 后可直接 Number；
    // `1.00/1.69/3.20` 这类比值得到 NaN，按非数字丢弃。
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      stats.nonNumericRows += 1;
      continue;
    }

    stats.numericRows += 1;
    food.rows.push({
      name: nutrientName,
      unit: readCell(row, columnIndex, '含量單位'),
      value,
      // `資料類別` 原样带上，归一化阶段靠它实现「平均值优先」。
      dataType: readCell(row, columnIndex, '資料類別'),
    });
  }

  return { foods: [...foods.values()], stats };
}

/**
 * 官方 CSV → 按 `整合編號` 聚合的食品数组（按首次出现顺序）。
 *
 * 返回类型是 `TfdaFoodInput` 的超集（多一个 `description`），可以直接传给
 * `buildTfdaNutritionProfile`。
 */
export function parseTfdaCsv(text: string): TfdaCsvFood[] {
  return parseTfdaCsvWithStats(text).foods;
}
