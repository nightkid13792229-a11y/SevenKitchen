import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildOpeningPlan,
  parseOpeningCsv,
  runOpeningStocktake,
} from '../../scripts/opening-stocktake';

const ingredients = [
  {
    id: 'ing-salmon',
    name: '冷冻三文鱼',
    type: 'FOOD',
    baseUnit: 'G',
    unitDisplayLabel: '克',
    procurementEnabled: true,
  },
  {
    id: 'ing-pumpkin',
    name: '南瓜',
    type: 'FOOD',
    baseUnit: 'G',
    unitDisplayLabel: '克',
    procurementEnabled: true,
  },
  {
    id: 'ing-oil',
    name: '鱼油',
    type: 'SUPPLEMENT',
    baseUnit: 'PCS',
    unitDisplayLabel: '粒',
    procurementEnabled: true,
  },
  {
    id: 'ing-bag',
    name: '食品真空袋',
    type: 'PACKAGING',
    baseUnit: 'PCS',
    unitDisplayLabel: '个',
    procurementEnabled: true,
  },
];

const balances = new Map([
  ['ing-salmon', 1240],
  ['ing-pumpkin', 0],
  ['ing-oil', 30],
  ['ing-bag', 100],
]);

const csv = (rows: string) =>
  `ingredient_id,ingredient_name,counted_quantity,unit,note\n${rows}`;

function writeCsv(content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'opening-stocktake-'));
  const path = join(dir, 'opening.csv');
  writeFileSync(path, content, 'utf8');
  return path;
}

function planFrom(content: string, scope: 'all' | 'material' | 'packaging' = 'all') {
  const parsed = parseOpeningCsv(content);
  return buildOpeningPlan({
    rows: parsed.rows,
    ingredients: ingredients as any,
    balances,
    recentIngredientIds: new Set<string>(),
    scope,
  });
}

function createPrismaFake() {
  const created: any[] = [];
  const fake: any = {
    ingredient: { findMany: jest.fn().mockResolvedValue(ingredients) },
    inventoryLedgerEntry: {
      groupBy: jest.fn().mockResolvedValue(
        Array.from(balances.entries()).map(([ingredientId, quantity]) => ({
          ingredientId,
          _sum: { deltaG: quantity },
        })),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockImplementation(async ({ data }) => {
        created.push(...data);
        return { count: data.length };
      }),
    },
    inventoryStocktake: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    inventoryStocktakeLine: { createMany: jest.fn() },
    $executeRawUnsafe: jest.fn(),
    $transaction: jest.fn(async (callback: any) => callback(fake)),
  };
  return { fake, created };
}

describe('opening stocktake', () => {
  it('parses quoted CSV names and skips empty lines', () => {
    const parsed = parseOpeningCsv(
      csv('ing-salmon,"冷冻三文鱼, 切块",1180,克,\n\n'),
    );
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toEqual(
      expect.objectContaining({
        ingredientName: '冷冻三文鱼, 切块',
        countedQuantity: 1180,
        unit: '克',
      }),
    );
  });

  it('includes zero-balance ingredients and lists missing ones', () => {
    const plan = planFrom(csv('ing-salmon,冷冻三文鱼,1180,克,\n'));
    expect(plan.errors).toHaveLength(0);
    expect(plan.lines.map((line) => line.ingredientId)).toEqual(['ing-salmon']);
    expect(plan.missing.map((item) => item.id)).toEqual([
      'ing-pumpkin',
      'ing-oil',
      'ing-bag',
    ]);
  });

  it('rejects a unit that does not match the ingredient base unit', () => {
    const plan = planFrom(csv('ing-salmon,冷冻三文鱼,1180,袋,\n'));
    expect(plan.errors.join('\n')).toContain('单位');
  });

  it('rejects duplicate ingredient rows', () => {
    const plan = planFrom(
      csv(
        'ing-salmon,冷冻三文鱼,1180,克,\ning-salmon,冷冻三文鱼,1180,克,\n',
      ),
    );
    expect(plan.errors.join('\n')).toContain('重复');
  });

  it('dry-run does not write anything', async () => {
    const { fake } = createPrismaFake();
    const path = writeCsv(csv('ing-salmon,冷冻三文鱼,1180,克,\n'));
    const result = await runOpeningStocktake(fake, {
      csvPath: path,
      apply: false,
      scope: 'all',
      allowPartial: true,
      createdBy: 'tester',
    });
    expect(result.ok).toBe(true);
    expect(fake.$transaction).not.toHaveBeenCalled();
  });

  it('apply writes an OPENING stocktake and OPENING_BALANCE rows', async () => {
    const { fake, created } = createPrismaFake();
    const path = writeCsv(
      csv(
        'ing-salmon,冷冻三文鱼,1180,克,\ning-pumpkin,南瓜,8600,克,\ning-oil,鱼油,28,粒,\ning-bag,食品真空袋,100,个,\n',
      ),
    );
    const result = await runOpeningStocktake(fake, {
      csvPath: path,
      apply: true,
      scope: 'all',
      allowPartial: false,
      createdBy: 'tester',
    });

    expect(result.ok).toBe(true);
    expect(fake.inventoryStocktake.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'OPENING',
        status: 'APPLIED',
        createdBy: 'tester',
      }),
    });
    expect(created).toHaveLength(3);
    expect(created.every((row) => row.sourceType === 'OPENING_BALANCE')).toBe(
      true,
    );
    expect(
      created.find((row) => row.ingredientId === 'ing-salmon')?.deltaG,
    ).toBe(-60);
    expect(
      created.find((row) => row.ingredientId === 'ing-bag'),
    ).toBeUndefined();
  });

  it('已经执行过期初盘点时拒绝重复 apply', async () => {
    const { fake } = createPrismaFake();
    fake.inventoryStocktake.findFirst.mockResolvedValue({
      id: 'opening-old',
      appliedAt: new Date('2026-11-09T10:00:00.000Z'),
    });
    const path = writeCsv(
      csv(
        'ing-salmon,冷冻三文鱼,1180,克,\ning-pumpkin,南瓜,8600,克,\ning-oil,鱼油,28,粒,\ning-bag,食品真空袋,100,个,\n',
      ),
    );

    const result = await runOpeningStocktake(fake, {
      csvPath: path,
      apply: true,
      scope: 'all',
      allowPartial: false,
      createdBy: 'tester',
    });

    expect(result.ok).toBe(false);
    expect(String(result.errors)).toContain('不能重复执行');
    expect(fake.inventoryStocktake.create).not.toHaveBeenCalled();
  });

  it('refuses to apply while ingredients are missing unless allowPartial', async () => {
    const { fake } = createPrismaFake();
    const path = writeCsv(csv('ing-salmon,冷冻三文鱼,1180,克,\n'));
    const result = await runOpeningStocktake(fake, {
      csvPath: path,
      apply: true,
      scope: 'all',
      allowPartial: false,
      createdBy: 'tester',
    });
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(fake.$transaction).not.toHaveBeenCalled();
  });

  it('packaging scope does not require material ingredients', async () => {
    const plan = planFrom(csv('ing-bag,食品真空袋,100,个,\n'), 'packaging');
    expect(plan.missing).toHaveLength(0);
    expect(plan.lines).toHaveLength(1);
  });
});
