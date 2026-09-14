/**
 * 修复「食谱设计器发布正式食谱时丢失营养档案」造成的历史数据问题。
 *
 * 背景：
 *   设计器发布正式食谱时，原料项原本只写入用量/占比/制备方法，没有写入营养档案
 *   （决定生/熟状态）。后台食谱详情编辑页一旦保存，缺失的营养档案会被替换成
 *   该原料的「主档案」，于是设计器里选的「水煮沥干（熟）」被改成了「生」。
 *
 * 本脚本：
 *   以发布快照（design_recipe_publish_snapshot.snapshot_data.ingredientItems）
 *   为「设计时的真实意图」，与正式食谱当前原料项逐项比对：
 *     - 当前为空（发布后从未保存过）           → 可按设计意图修复
 *     - 当前等于该原料的主档案且与设计意图不同 → 可按设计意图修复（典型被顶替）
 *     - 其它不一致（疑似后台人工有意改动）     → 只报告，不自动改，需人工确认
 *
 * 用法（默认 dry-run，只读、不写库）：
 *   npx ts-node -r tsconfig-paths/register scripts/repair-published-recipe-nutrition-profiles.ts \
 *     --env-file=.env.production.readonly --out=docs/reports
 *   加 --apply 才会真正写库；加 --all-versions 才会连历史版本一起处理（默认只处理每个食谱的最新版本）。
 */
import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

export type NutritionProfileRepairAction =
  | 'noop'
  | 'auto-fix'
  | 'manual-review';

/**
 * 判定单个原料项应如何处理。
 * - 设计意图缺失（快照里没有这一项）→ 不动
 * - 当前值已等于设计意图 → 不动
 * - 当前为空，或当前正好是主档案 → 按设计意图修复
 * - 其余情况 → 人工确认（可能是后台有意修改）
 */
export function classifyNutritionProfileRepair(params: {
  currentNutritionFoodId: string | null;
  designNutritionFoodId: string | null;
  primaryNutritionFoodId: string | null;
}): NutritionProfileRepairAction {
  const {
    currentNutritionFoodId,
    designNutritionFoodId,
    primaryNutritionFoodId,
  } = params;

  if (!designNutritionFoodId) {
    return 'noop';
  }

  if (currentNutritionFoodId === designNutritionFoodId) {
    return 'noop';
  }

  if (!currentNutritionFoodId) {
    return 'auto-fix';
  }

  if (
    primaryNutritionFoodId &&
    currentNutritionFoodId === primaryNutritionFoodId
  ) {
    return 'auto-fix';
  }

  return 'manual-review';
}

/** 从发布快照里取出「原料 ID → 设计时选定的营养档案 ID」 */
export function parseSnapshotNutritionFoodIds(
  snapshotData: unknown,
): Map<string, string | null> {
  const result = new Map<string, string | null>();
  const entries = (snapshotData as { ingredientItems?: unknown } | null)
    ?.ingredientItems;

  if (!Array.isArray(entries)) {
    return result;
  }

  for (const entry of entries) {
    const record = entry as {
      item?: { nutritionFoodId?: string | null; ingredientId?: string | null };
      ingredientId?: string | null;
      nutritionFoodId?: string | null;
    } | null;
    const item = record?.item ?? record;
    const ingredientId = record?.ingredientId ?? item?.ingredientId ?? null;

    if (!ingredientId) {
      continue;
    }

    result.set(ingredientId, item?.nutritionFoodId ?? null);
  }

  return result;
}

/** 取「不晚于该食谱版本」的最近一次发布快照（发布后保存会抬高版本号） */
export function pickSnapshotForVersion<T extends { version: number }>(
  snapshots: T[],
  recipeVersion: number,
): T | null {
  return (
    snapshots
      .filter((snapshot) => snapshot.version <= recipeVersion)
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
}

type Args = {
  apply: boolean;
  allVersions: boolean;
  envFile: string | null;
  outDir: string | null;
  recipeRowId: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    allVersions: false,
    envFile: null,
    outDir: null,
    recipeRowId: null,
  };

  for (const raw of argv) {
    if (raw === '--apply') args.apply = true;
    else if (raw === '--all-versions') args.allVersions = true;
    else if (raw.startsWith('--env-file=')) args.envFile = raw.slice(11);
    else if (raw.startsWith('--out=')) args.outDir = raw.slice(6);
    else if (raw.startsWith('--recipe-id=')) args.recipeRowId = raw.slice(12);
  }

  return args;
}

function resolveDatabaseUrl(args: Args): string | undefined {
  if (args.envFile) {
    const envPath = resolve(process.cwd(), args.envFile);
    if (!existsSync(envPath)) {
      throw new Error(`指定的 env 文件不存在：${envPath}`);
    }
    const parsed = loadEnv({ path: envPath }).parsed ?? {};
    return parsed.DATABASE_URL ?? process.env.DATABASE_URL;
  }

  return process.env.DATABASE_URL;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

type RepairCandidate = {
  recipeRowId: string;
  recipeId: string;
  recipeName: string;
  recipeStatus: string;
  recipeVersion: number;
  ingredientName: string;
  currentFoodLabel: string;
  currentStateLabel: string;
  designFoodLabel: string;
  designStateLabel: string;
  action: NutritionProfileRepairAction;
  recipeItemId: string;
  designNutritionFoodId: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = resolveDatabaseUrl(args);
  const prisma = new PrismaClient(
    databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
  );

  try {
    // 快照数据总量可达数十 MB，只取元信息，正文分批读取，避免小内存服务器 OOM
    const snapshotMetaRows = await prisma.designRecipePublishSnapshot.findMany({
      select: {
        id: true,
        recipeId: true,
        recipeVersion: true,
      },
      orderBy: { recipeVersion: 'asc' },
    });

    const snapshotMetaByRecipeId = new Map<
      string,
      Array<{ id: string; version: number }>
    >();
    for (const snapshot of snapshotMetaRows) {
      if (snapshot.recipeVersion == null) {
        continue;
      }

      const list = snapshotMetaByRecipeId.get(snapshot.recipeId) ?? [];
      list.push({ id: snapshot.id, version: snapshot.recipeVersion });
      snapshotMetaByRecipeId.set(snapshot.recipeId, list);
    }

    const recipeRows = await prisma.recipe.findMany({
      where: {
        recipeId: { in: [...snapshotMetaByRecipeId.keys()] },
        ...(args.recipeRowId ? { id: args.recipeRowId } : {}),
      },
      select: {
        id: true,
        recipeId: true,
        version: true,
        name: true,
        status: true,
      },
      orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
    });

    const selectedRows = args.allVersions
      ? recipeRows
      : recipeRows.filter(
          (row, index, list) =>
            list.findIndex(
              (candidate) => candidate.recipeId === row.recipeId,
            ) === index,
        );

    // 每个食谱行对应的「发布时的设计意图」快照（发布后保存会抬高版本号）
    const rowsBySnapshotId = new Map<string, typeof selectedRows>();
    for (const row of selectedRows) {
      const snapshot = pickSnapshotForVersion(
        snapshotMetaByRecipeId.get(row.recipeId) ?? [],
        row.version,
      );
      if (!snapshot) {
        continue;
      }

      const list = rowsBySnapshotId.get(snapshot.id) ?? [];
      list.push(row);
      rowsBySnapshotId.set(snapshot.id, list);
    }

    const scannedRows = [...rowsBySnapshotId.values()].flat();

    const recipeItemRows = await prisma.recipeItem.findMany({
      where: {
        OR: scannedRows.map((row) => ({
          recipeId: row.recipeId,
          recipeVersion: row.version,
        })),
      },
      select: {
        id: true,
        recipeId: true,
        recipeVersion: true,
        ingredientId: true,
        nutritionFoodId: true,
        ingredient: { select: { name: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const ingredientIds = [
      ...new Set(recipeItemRows.map((row) => row.ingredientId)),
    ];
    const mappings = ingredientIds.length
      ? await prisma.nutritionFoodMapping.findMany({
          where: { ingredientId: { in: ingredientIds } },
          select: {
            ingredientId: true,
            nutritionFoodId: true,
            isPrimary: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        })
      : [];
    const primaryByIngredientId = new Map<string, string>();
    for (const mapping of mappings) {
      if (!primaryByIngredientId.has(mapping.ingredientId)) {
        primaryByIngredientId.set(
          mapping.ingredientId,
          mapping.nutritionFoodId,
        );
      }
    }

    const itemsByRecipeRow = new Map<string, typeof recipeItemRows>();
    for (const item of recipeItemRows) {
      const key = `${item.recipeId}::${item.recipeVersion}`;
      const list = itemsByRecipeRow.get(key) ?? [];
      list.push(item);
      itemsByRecipeRow.set(key, list);
    }

    const SNAPSHOT_BATCH_SIZE = 5;
    const designFoodIds = new Set<string>();
    const candidateDrafts: Array<{
      row: (typeof recipeRows)[number];
      item: (typeof recipeItemRows)[number];
      designNutritionFoodId: string;
      action: 'auto-fix' | 'manual-review';
    }> = [];
    let scannedItems = 0;

    const snapshotIds = [...rowsBySnapshotId.keys()];
    for (
      let index = 0;
      index < snapshotIds.length;
      index += SNAPSHOT_BATCH_SIZE
    ) {
      const batchIds = snapshotIds.slice(index, index + SNAPSHOT_BATCH_SIZE);
      const batch = await prisma.designRecipePublishSnapshot.findMany({
        where: { id: { in: batchIds } },
        select: { id: true, snapshotData: true },
      });

      for (const snapshot of batch) {
        const designItems = parseSnapshotNutritionFoodIds(
          snapshot.snapshotData,
        );
        for (const foodId of designItems.values()) {
          if (foodId) {
            designFoodIds.add(foodId);
          }
        }

        for (const row of rowsBySnapshotId.get(snapshot.id) ?? []) {
          for (const item of itemsByRecipeRow.get(
            `${row.recipeId}::${row.version}`,
          ) ?? []) {
            scannedItems += 1;
            const designNutritionFoodId =
              designItems.get(item.ingredientId) ?? null;
            if (!designNutritionFoodId) {
              continue;
            }
            const primaryNutritionFoodId =
              primaryByIngredientId.get(item.ingredientId) ?? null;
            const action = classifyNutritionProfileRepair({
              currentNutritionFoodId: item.nutritionFoodId,
              designNutritionFoodId,
              primaryNutritionFoodId,
            });

            if (action === 'noop') {
              continue;
            }

            candidateDrafts.push({
              row,
              item,
              designNutritionFoodId,
              action,
            });
          }
        }
      }
    }

    const scannedRecipes = scannedRows.length;

    const foodIds = [
      ...new Set(
        [
          ...recipeItemRows.map((row) => row.nutritionFoodId),
          ...primaryByIngredientId.values(),
          ...designFoodIds,
        ].filter((value): value is string => Boolean(value)),
      ),
    ];
    const foods = foodIds.length
      ? await prisma.nutritionFood.findMany({
          where: { id: { in: foodIds } },
          select: {
            id: true,
            name: true,
            displayNameZh: true,
            preparationStateLabel: true,
          },
        })
      : [];
    const foodById = new Map(foods.map((food) => [food.id, food]));
    const foodLabel = (id: string | null) => {
      if (!id) return '（空）';
      const food = foodById.get(id);
      return food?.displayNameZh ?? food?.name ?? id;
    };
    const foodState = (id: string | null) => {
      if (!id) return '—';
      return foodById.get(id)?.preparationStateLabel ?? '—';
    };

    const candidates: RepairCandidate[] = candidateDrafts.map(
      ({ row, item, designNutritionFoodId, action }) => ({
        recipeRowId: row.id,
        recipeId: row.recipeId,
        recipeName: row.name,
        recipeStatus: String(row.status),
        recipeVersion: row.version,
        ingredientName: item.ingredient?.name ?? item.ingredientId,
        currentFoodLabel: foodLabel(item.nutritionFoodId),
        currentStateLabel: foodState(item.nutritionFoodId),
        designFoodLabel: foodLabel(designNutritionFoodId),
        designStateLabel: foodState(designNutritionFoodId),
        action,
        recipeItemId: item.id,
        designNutritionFoodId,
      }),
    );

    const autoFixable = candidates.filter((item) => item.action === 'auto-fix');
    const manualReview = candidates.filter(
      (item) => item.action === 'manual-review',
    );

    console.log('=== 营养档案（生/熟）历史数据修复计划 ===');
    console.log(
      `模式：${args.apply ? 'APPLY（会写库）' : 'DRY-RUN（只读）'}｜范围：${
        args.allVersions ? '全部版本' : '每个食谱最新版本'
      }`,
    );
    console.log(
      `扫描：${scannedRecipes} 个食谱版本 / ${scannedItems} 个原料项；不一致 ${candidates.length} 项`,
    );
    console.log(`  - 可按设计意图修复：${autoFixable.length} 项`);
    console.log(`  - 需人工确认：${manualReview.length} 项`);
    console.log('');

    const byRecipe = new Map<string, RepairCandidate[]>();
    for (const candidate of candidates) {
      const key = `${candidate.recipeName}｜v${candidate.recipeVersion}｜${candidate.recipeStatus}`;
      byRecipe.set(key, [...(byRecipe.get(key) ?? []), candidate]);
    }
    for (const [recipeLabel, list] of byRecipe) {
      console.log(
        `${recipeLabel}（${list.length} 项，可修复 ${
          list.filter((item) => item.action === 'auto-fix').length
        }）`,
      );
      for (const item of list) {
        console.log(
          `    ${item.action === 'auto-fix' ? '可修复' : '待确认'}｜${item.ingredientName}：${
            item.currentStateLabel
          } → ${item.designStateLabel}（${item.currentFoodLabel} → ${item.designFoodLabel}）`,
        );
      }
    }

    if (args.outDir) {
      const outDir = resolve(process.cwd(), args.outDir);
      if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
      }
      const csvPath = resolve(outDir, 'nutrition-profile-repair-plan.csv');
      const header = [
        '食谱名称',
        '食谱状态',
        '版本',
        '原料',
        '当前营养档案',
        '当前生熟',
        '设计器原选营养档案',
        '原选生熟',
        '处理建议',
        '食谱行ID',
      ];
      const lines = candidates.map((item) =>
        [
          item.recipeName,
          item.recipeStatus,
          item.recipeVersion,
          item.ingredientName,
          item.currentFoodLabel,
          item.currentStateLabel,
          item.designFoodLabel,
          item.designStateLabel,
          item.action === 'auto-fix' ? '可按设计意图修复' : '需人工确认',
          item.recipeRowId,
        ]
          .map(csvCell)
          .join(','),
      );
      writeFileSync(csvPath, [header.join(','), ...lines].join('\n'), 'utf8');
      console.log(`\n明细已写入：${csvPath}`);
    }

    if (!args.apply) {
      console.log(
        '\nDRY-RUN 结束，未写入任何数据。确认清单后再加 --apply 执行修复。',
      );
      return;
    }

    let applied = 0;
    for (const item of autoFixable) {
      await prisma.recipeItem.update({
        where: { id: item.recipeItemId },
        data: { nutritionFoodId: item.designNutritionFoodId },
      });
      applied += 1;
    }

    console.log(
      `\n已修复 ${applied} 个原料项，跳过 ${manualReview.length} 个待人工确认项。`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      '[repair-published-recipe-nutrition-profiles] failed:',
      error,
    );
    process.exitCode = 1;
  });
}

export { parseArgs };
