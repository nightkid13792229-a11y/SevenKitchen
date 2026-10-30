/**
 * 韩国农村振兴厅「국가표준식품성분 DB 10.4」JSONL 的解析。
 *
 * Excel 不直接进 Node：`scripts/data/prepare-korea-xlsx.py` 把主表与附录 2
 * 按 DB 索引 join 后写成 **每行一个食品** 的 JSONL；本模块只负责把这个中间
 * 格式读成类型安全的 `KoreaJsonlRecord[]`，不读文件、不碰数据库。
 *
 * 口径（见 plan 2026-10-27-korea-rda-nutrition-import）：
 * - 空行跳过；坏行必须带**行号**报错，不能静默丢弃；
 * - `index` / `code` / `nameKo` / `nutrients` 必填；
 * - 营养素只接受有限数值；`unit` 必须是非空字符串（单位校验在导入脚本里做）。
 */

import type { KoreaNutrientValue } from './korea-normalize';

export interface KoreaJsonlRecord {
  index: string;
  code: string;
  nameKo: string;
  nameEn: string | null;
  scientificName: string | null;
  foodGroup: string | null;
  source: string | null;
  refuseRate: number | null;
  nutrients: Record<string, KoreaNutrientValue>;
}

/** 所有解析错误都从这一处抛出，保证行号和字段名不会漏。 */
function fail(lineNumber: number, message: string): never {
  throw new Error(`Korea JSONL 第 ${lineNumber} 行${message}`);
}

function readRequiredText(
  value: unknown,
  field: string,
  lineNumber: number,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(lineNumber, `缺少必填字段或字段为空：${field}`);
  }
  return value.trim();
}

function readOptionalText(
  value: unknown,
  field: string,
  lineNumber: number,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    fail(lineNumber, `字段 ${field} 必须是字符串或 null`);
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function readRefuseRate(value: unknown, lineNumber: number): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(lineNumber, '字段 refuseRate 必须是有限数字或 null');
  }
  return value;
}

function readNutrients(
  value: unknown,
  lineNumber: number,
): Record<string, KoreaNutrientValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(lineNumber, '字段 nutrients 必须是对象');
  }

  const nutrients: Record<string, KoreaNutrientValue> = {};

  for (const [header, rawNutrient] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (header.trim() === '') {
      fail(lineNumber, '营养素名不能为空');
    }
    if (
      typeof rawNutrient !== 'object' ||
      rawNutrient === null ||
      Array.isArray(rawNutrient)
    ) {
      fail(lineNumber, `营养素 ${header} 必须是对象`);
    }

    const { value: nutrientValue, unit } = rawNutrient as {
      value?: unknown;
      unit?: unknown;
    };

    if (typeof nutrientValue !== 'number' || !Number.isFinite(nutrientValue)) {
      fail(lineNumber, `营养素 ${header} 缺少有限数值`);
    }
    if (typeof unit !== 'string' || unit.trim() === '') {
      fail(lineNumber, `营养素 ${header} 缺少单位`);
    }

    nutrients[header] = { value: nutrientValue, unit: unit.trim() };
  }

  return nutrients;
}

/**
 * 把 JSONL 文本解析成食品记录；空行忽略，格式错误按行号抛错。
 *
 * 返回顺序与文件一致（导入脚本的 `--limit` 依赖这一点）。
 */
export function parseKoreaJsonl(text: string): KoreaJsonlRecord[] {
  // 文件本身是 UTF-8 无 BOM；这里仍剥掉可能从编辑器带进来的 BOM。
  const body = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const lines = body.split(/\r?\n/u);
  const records: KoreaJsonlRecord[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];

    if (line.trim() === '') {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      fail(lineNumber, `不是合法 JSON：${reason}`);
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      fail(lineNumber, '必须是 JSON 对象');
    }

    const record = parsed as Record<string, unknown>;

    records.push({
      index: readRequiredText(record.index, 'index', lineNumber),
      code: readRequiredText(record.code, 'code', lineNumber),
      nameKo: readRequiredText(record.nameKo, 'nameKo', lineNumber),
      nameEn: readOptionalText(record.nameEn, 'nameEn', lineNumber),
      scientificName: readOptionalText(
        record.scientificName,
        'scientificName',
        lineNumber,
      ),
      foodGroup: readOptionalText(record.foodGroup, 'foodGroup', lineNumber),
      source: readOptionalText(record.source, 'source', lineNumber),
      refuseRate: readRefuseRate(record.refuseRate, lineNumber),
      nutrients: readNutrients(record.nutrients, lineNumber),
    });
  }

  return records;
}
