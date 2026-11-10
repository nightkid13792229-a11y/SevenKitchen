/**
 * 期初盘点导入（A4）
 *
 * 用法：
 *   ts-node -r tsconfig-paths/register scripts/opening-stocktake.ts \
 *     --csv opening.csv [--scope all|material|packaging] \
 *     [--apply] [--allow-partial --reason "缺 3 个停用原料"] [--created-by ops]
 *
 * 设计：
 *   - 默认 dry-run，只打印计划，不写库；--apply 才写。
 *   - 覆盖率默认必须 100%：在用原料（有余额 / 近 180 天有流水 / 采购启用）缺一项就拒绝。
 *   - 期初单独一种流水来源 OPENING_BALANCE，报表统计"盘亏"时排除。
 */

import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

loadEnv();

export type OpeningScope = 'all' | 'material' | 'packaging';

export interface OpeningCsvRow {
  line: number;
  ingredientId?: string;
  ingredientName: string;
  countedQuantity: number;
  unit: string;
  note?: string;
}

export interface OpeningIngredient {
  id: string;
  name: string;
  type: string;
  baseUnit: string;
  unitDisplayLabel?: string | null;
  procurementEnabled?: boolean;
}

export interface OpeningLine {
  ingredientId: string;
  ingredientName: string;
  expectedQuantityG: number;
  countedQuantityG: number;
  deltaG: number;
  unit: string;
}

export interface OpeningPlan {
  lines: OpeningLine[];
  missing: Array<{ id: string; name: string }>;
  errors: string[];
}

export interface OpeningArgs {
  csvPath: string;
  apply: boolean;
  scope: OpeningScope;
  allowPartial: boolean;
  reason?: string;
  createdBy?: string;
}

export interface OpeningResult {
  ok: boolean;
  dryRun: boolean;
  stocktakeId?: string;
  lines: OpeningLine[];
  missing: Array<{ id: string; name: string }>;
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function parseOpeningCsv(text: string): {
  rows: OpeningCsvRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const rows: OpeningCsvRow[] = [];
  let header: string[] | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw.trim()) continue;

    const cells = splitCsvLine(raw).map((cell) => cell.trim());
    if (!header) {
      header = cells.map((cell) => cell.toLowerCase());
      for (const required of [
        'ingredient_name',
        'counted_quantity',
        'unit',
      ]) {
        if (!header.includes(required)) {
          errors.push(`表头缺少 ${required}`);
        }
      }
      if (errors.length > 0) return { rows, errors };
      continue;
    }

    const lineNo = i + 1;
    const get = (name: string) => {
      const index = header!.indexOf(name);
      return index >= 0 ? cells[index] ?? '' : '';
    };

    const ingredientName = get('ingredient_name');
    if (!ingredientName) {
      errors.push(`第 ${lineNo} 行：ingredient_name 为空`);
      continue;
    }

    const countedRaw = get('counted_quantity');
    const countedQuantity = Number(countedRaw);
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      errors.push(
        `第 ${lineNo} 行：counted_quantity 必须是非负数字（收到 "${countedRaw}"）`,
      );
      continue;
    }

    const unit = get('unit');
    if (!unit) {
      errors.push(`第 ${lineNo} 行：unit 为空`);
      continue;
    }

    rows.push({
      line: lineNo,
      ingredientId: get('ingredient_id') || undefined,
      ingredientName,
      countedQuantity,
      unit,
      note: get('note') || undefined,
    });
  }

  if (!header) errors.push('CSV 为空');
  return { rows, errors };
}

function normalizeUnit(unit: string): 'G' | 'ML' | 'PCS' | null {
  const value = unit.trim().toUpperCase();
  if (['G', '克', 'GRAM', 'GRAMS'].includes(value)) return 'G';
  if (['ML', '毫升', 'MILLILITER'].includes(value)) return 'ML';
  if (['PCS', '粒', '片', '个', '只', 'PC'].includes(value)) return 'PCS';
  return null;
}

export function buildOpeningPlan(params: {
  rows: OpeningCsvRow[];
  ingredients: OpeningIngredient[];
  balances: Map<string, number>;
  recentIngredientIds: Set<string>;
  scope: OpeningScope;
}): OpeningPlan {
  const errors: string[] = [];
  const { rows, ingredients, balances, recentIngredientIds, scope } = params;

  const inScope = ingredients.filter((ingredient) => {
    if (scope === 'material') return ingredient.type !== 'PACKAGING';
    if (scope === 'packaging') return ingredient.type === 'PACKAGING';
    return true;
  });

  const active = inScope.filter(
    (ingredient) =>
      ingredient.procurementEnabled === true ||
      (balances.get(ingredient.id) ?? 0) !== 0 ||
      recentIngredientIds.has(ingredient.id),
  );

  const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const byName = new Map<string, OpeningIngredient[]>();
  for (const ingredient of ingredients) {
    const list = byName.get(ingredient.name) ?? [];
    list.push(ingredient);
    byName.set(ingredient.name, list);
  }

  const seen = new Set<string>();
  const lines: OpeningLine[] = [];

  for (const row of rows) {
    let ingredient: OpeningIngredient | undefined;
    if (row.ingredientId) {
      ingredient = byId.get(row.ingredientId);
      if (!ingredient) {
        errors.push(`第 ${row.line} 行：ingredient_id ${row.ingredientId} 不存在`);
        continue;
      }
    } else {
      const candidates = byName.get(row.ingredientName) ?? [];
      if (candidates.length === 0) {
        errors.push(`第 ${row.line} 行：找不到原料「${row.ingredientName}」`);
        continue;
      }
      if (candidates.length > 1) {
        errors.push(
          `第 ${row.line} 行：「${row.ingredientName}」名称重复，请填 ingredient_id`,
        );
        continue;
      }
      ingredient = candidates[0];
    }

    if (seen.has(ingredient.id)) {
      errors.push(`第 ${row.line} 行：原料「${ingredient.name}」重复`);
      continue;
    }

    const unit = normalizeUnit(row.unit);
    if (!unit || unit !== ingredient.baseUnit) {
      errors.push(
        `第 ${row.line} 行：单位「${row.unit}」与「${ingredient.name}」的基准单位 ${ingredient.baseUnit} 不一致`,
      );
      continue;
    }

    const expected = balances.get(ingredient.id) ?? 0;
    lines.push({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      expectedQuantityG: expected,
      countedQuantityG: row.countedQuantity,
      deltaG: Number((row.countedQuantity - expected).toFixed(3)),
      unit: ingredient.unitDisplayLabel || ingredient.baseUnit,
    });
    seen.add(ingredient.id);
  }

  lines.sort((left, right) =>
    left.ingredientName.localeCompare(right.ingredientName, 'zh-CN'),
  );

  const missing = active
    .filter((ingredient) => !seen.has(ingredient.id))
    .map((ingredient) => ({ id: ingredient.id, name: ingredient.name }));

  return { lines, missing, errors };
}

export async function runOpeningStocktake(
  prisma: any,
  args: OpeningArgs,
): Promise<OpeningResult> {
  const text = readFileSync(args.csvPath, 'utf8');
  const parsed = parseOpeningCsv(text);
  if (parsed.errors.length > 0) {
    return {
      ok: false,
      dryRun: !args.apply,
      lines: [],
      missing: [],
      errors: parsed.errors,
    };
  }

  const ingredients: OpeningIngredient[] = await prisma.ingredient.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      baseUnit: true,
      unitDisplayLabel: true,
      procurementEnabled: true,
    },
  });

  const grouped = await prisma.inventoryLedgerEntry.groupBy({
    by: ['ingredientId'],
    _sum: { deltaG: true },
  });
  const balances = new Map<string, number>(
    grouped.map((row: any) => [
      row.ingredientId,
      Number(row._sum?.deltaG ?? 0),
    ]),
  );

  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const recent = await prisma.inventoryLedgerEntry.findMany({
    where: { createdAt: { gte: since } },
    select: { ingredientId: true },
    distinct: ['ingredientId'],
  });
  const recentIngredientIds = new Set<string>(
    recent.map((row: any) => row.ingredientId),
  );

  const plan = buildOpeningPlan({
    rows: parsed.rows,
    ingredients,
    balances,
    recentIngredientIds,
    scope: args.scope,
  });

  if (plan.errors.length > 0) {
    return { ok: false, dryRun: !args.apply, ...plan };
  }

  if (plan.missing.length > 0 && !args.allowPartial) {
    return {
      ok: false,
      dryRun: !args.apply,
      ...plan,
      errors: [
        `还有 ${plan.missing.length} 个在用原料没有出现在 CSV 里；补全后再跑，或加 --allow-partial --reason 说明`,
      ],
    };
  }

  if (!args.apply) {
    return { ok: true, dryRun: true, ...plan };
  }

  const stocktakeId = randomUUID();
  const now = new Date();
  const note = ['期初盘点', args.reason].filter(Boolean).join(' / ');

  try {
    await prisma.$transaction(async (tx: any) => {
      // 同一时间只允许一个期初任务执行；已执行过则拒绝，避免重复写差额。
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext('opening-stocktake'))",
      );
      const existing = await tx.inventoryStocktake.findFirst({
        where: { type: 'OPENING', status: 'APPLIED' },
        select: { id: true, appliedAt: true },
      });
      if (existing) {
        throw new Error(
          `已经执行过期初盘点（${existing.id} / ${existing.appliedAt?.toISOString?.() ?? existing.appliedAt}），不能重复执行`,
        );
      }

      await tx.inventoryStocktake.create({
      data: {
        id: stocktakeId,
        type: 'OPENING',
        status: 'APPLIED',
        note,
        createdBy: args.createdBy ?? null,
        createdAt: now,
        appliedAt: now,
      },
    });

    await tx.inventoryStocktakeLine.createMany({
      data: plan.lines.map((line) => ({
        id: randomUUID(),
        stocktakeId,
        ingredientId: line.ingredientId,
        procurementSkuId: null,
        expectedQuantityG: line.expectedQuantityG,
        countedQuantityG: line.countedQuantityG,
        deltaG: line.deltaG,
      })),
    });

    const ledgerRows = plan.lines
      .filter((line) => Math.abs(line.deltaG) > 0.0001)
      .map((line) => ({
        id: randomUUID(),
        ingredientId: line.ingredientId,
        deltaG: line.deltaG,
        procurementSkuId: null,
        sourceType: 'OPENING_BALANCE',
        sourceId: stocktakeId,
        sourceVersion: 1,
        costAmount: null,
        createdAt: now,
      }));

    if (ledgerRows.length > 0) {
      await tx.inventoryLedgerEntry.createMany({
        data: ledgerRows,
        skipDuplicates: true,
      });
    }
    });
  } catch (error: any) {
    return {
      ...plan,
      ok: false,
      dryRun: false,
      errors: [String(error?.message || error)],
    };
  }

  return { ok: true, dryRun: false, stocktakeId, ...plan };
}

function printResult(result: OpeningResult) {
  const title = result.dryRun ? '期初盘点 · dry-run' : '期初盘点 · 已写入';
  console.log(`\n${title}`);
  console.log(`计划行数：${result.lines.length}`);
  console.log(
    `差额合计：${result.lines
      .reduce((sum, line) => sum + line.deltaG, 0)
      .toFixed(3)}`,
  );
  console.log(
    `缺项：${result.missing.length === 0 ? '无' : result.missing.map((item) => item.name).join('、')}`,
  );

  if (result.lines.length > 0) {
    console.log('\n原料\t账面\t实盘\t差额\t单位');
    for (const line of result.lines.slice(0, 30)) {
      console.log(
        `${line.ingredientName}\t${line.expectedQuantityG}\t${line.countedQuantityG}\t${line.deltaG}\t${line.unit}`,
      );
    }
    if (result.lines.length > 30) {
      console.log(`... 其余 ${result.lines.length - 30} 行省略`);
    }
  }

  if (result.errors.length > 0) {
    console.error('\n错误：');
    for (const error of result.errors) console.error(`- ${error}`);
  }

  if (result.stocktakeId) {
    console.log(`\n期初单号：${result.stocktakeId}`);
  }
}

function parseArgs(argv: string[]): OpeningArgs {
  const args: OpeningArgs = {
    csvPath: '',
    apply: false,
    scope: 'all',
    allowPartial: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--csv') args.csvPath = argv[++i] ?? '';
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--scope') args.scope = (argv[++i] as OpeningScope) ?? 'all';
    else if (arg === '--allow-partial') args.allowPartial = true;
    else if (arg === '--reason') args.reason = argv[++i];
    else if (arg === '--created-by') args.createdBy = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log(
        '用法：opening-stocktake --csv <path> [--apply] [--scope all|material|packaging] [--allow-partial --reason "说明"] [--created-by 人]',
      );
      process.exit(0);
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.csvPath) {
    console.error('缺少 --csv <path>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const result = await runOpeningStocktake(prisma, args);
    printResult(result);
    if (!result.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
