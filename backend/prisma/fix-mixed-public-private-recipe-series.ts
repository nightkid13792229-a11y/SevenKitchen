/**
 * 修复「公开版本与私密定制版本混在同一个系列里」的历史数据（一次性脚本）
 *
 * 背景
 * ────
 * 业务规则（见 docs/plans/2026-09-30-recipe-domain-business-definition.md）：
 *   「公开」与「私密定制」都是**系列级**属性，互相独立、互不影响。
 *   一个系列里**不能混用**——公开系列里已发布的版本都是公开，
 *   私密定制系列里已发布的版本都是私密定制。
 *
 * 但旧实现是"系列里只要有任意一个历史版本是私密定制，就把整个系列标记为私密定制"，
 * 于是出现了两类脏数据：
 *   · 系列里同时存在「公开版本」和「私密定制版本」
 *   · 系列状态被那个私密版本拖成 PRIVATE_CUSTOM，导致公开橱窗要求
 *     series.businessStatus = PUBLIC → **已发布的公开食谱凭空消失**
 *
 * 实测（2026-09-30 生产库）：5 个系列受影响，共 11 个公开版本不可见。
 * 那 5 个私密版本经逐条核对**没有一条是真实的客户定制**：
 *   · is_custom_recipe = false      （没标客户定制）
 *   · customer_owner_id IS NULL     （没有客户归属）
 *   · design_source = Setar / Animal Diet Formulator（外部工具导入/手工建）
 * 看起来是运营把「私密定制」当成了"这一版先不公开"的开关在用。
 *
 * 处置（已获业务确认 2026-10-01）
 * ────────────────────
 *   ⚠️ **只处理白名单里点名的系列**（老板只确认了这两个食谱要恢复）：
 *        · 大米燕麦三文鱼兔里脊
 *        · 土豆大米鳕鱼火鸡胸
 *      其它同样是"公开私密混用"的系列**一律跳过并报告**，等业务另行确认。
 *
 *   1. 这些"不是客户定制"的私密版本 → 改为 `DRAFT`（草稿归档，不删除，需要时可再发布）
 *   2. 所在系列 → 恢复为 `PUBLIC`（因为它确实是公开系列）
 *   3. 被隐藏的公开版本随之恢复可见
 *
 * 安全边界
 * ────────
 *   · **只处理"非客户定制"的私密版本**。凡是命中 `is_custom_recipe = true`
 *     或 `customer_owner_id IS NOT NULL` 的私密版本，一律**跳过并报告**，
 *     交给业务人工确认——脚本不会动任何真实的客户定制数据。
 *   · 幂等：可重复执行。已经修好的系列会被识别为"无需处理"。
 *   · 默认预演，加 `--apply` 才落库。
 *
 * 用法
 * ────
 *   npx ts-node -r tsconfig-paths/register prisma/fix-mixed-public-private-recipe-series.ts           # 预演
 *   npx ts-node -r tsconfig-paths/register prisma/fix-mixed-public-private-recipe-series.ts --apply   # 落库
 */
import {
  PrismaClient,
  RecipeStatus,
  RecipeSeriesBusinessStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

/**
 * 业务点名的白名单（按系列名匹配）。
 * 不在这里的系列即使同样"公开私密混用"也不会被动到。
 */
const APPROVED_SERIES_NAMES = new Set([
  '大米燕麦三文鱼兔里脊',
  '土豆大米鳕鱼火鸡胸',
]);

interface MixedSeriesPlan {
  seriesId: string;
  seriesName: string;
  seriesBusinessStatus: string;
  /** 可安全归档的私密版本（非客户定制） */
  archiveable: Array<{
    id: string;
    version: number;
    name: string;
    lifeStage: string | null;
  }>;
  /** 需要人工确认的私密版本（疑似真实客户定制） */
  needsHumanReview: Array<{
    id: string;
    version: number;
    name: string;
    reason: string;
  }>;
  publicVersionCount: number;
}

async function buildPlan(): Promise<{
  plans: MixedSeriesPlan[];
  skippedNotApproved: string[];
}> {
  // 活跃且同时含公开版本与私密定制版本的系列
  const series = await prisma.recipeSeries.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      recipes: { some: { status: RecipeStatus.PUBLIC } },
    },
    select: {
      id: true,
      name: true,
      businessStatus: true,
      recipes: {
        select: {
          id: true,
          version: true,
          name: true,
          status: true,
          seriesLifeStage: true,
          isCustomRecipe: true,
          customerOwnerId: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const plans: MixedSeriesPlan[] = [];
  const skippedNotApproved: string[] = [];

  for (const s of series) {
    const publicVersions = s.recipes.filter(
      (r) => r.status === RecipeStatus.PUBLIC,
    );
    const privateVersions = s.recipes.filter(
      (r) => r.status === RecipeStatus.PRIVATE_CUSTOM,
    );

    // 幂等：已经不再混用的系列跳过
    if (publicVersions.length === 0 || privateVersions.length === 0) {
      continue;
    }

    const archiveable: MixedSeriesPlan['archiveable'] = [];
    const needsHumanReview: MixedSeriesPlan['needsHumanReview'] = [];

    for (const r of privateVersions) {
      if (r.isCustomRecipe) {
        needsHumanReview.push({
          id: r.id,
          version: r.version,
          name: r.name,
          reason: 'is_custom_recipe = true（标记为客户定制）',
        });
      } else if (r.customerOwnerId) {
        needsHumanReview.push({
          id: r.id,
          version: r.version,
          name: r.name,
          reason: 'customer_owner_id 非空（有客户归属）',
        });
      } else {
        archiveable.push({
          id: r.id,
          version: r.version,
          name: r.name,
          lifeStage: r.seriesLifeStage,
        });
      }
    }

    if (!APPROVED_SERIES_NAMES.has(s.name)) {
      skippedNotApproved.push(s.name);
      continue;
    }

    plans.push({
      seriesId: s.id,
      seriesName: s.name,
      seriesBusinessStatus: s.businessStatus,
      archiveable,
      needsHumanReview,
      publicVersionCount: publicVersions.length,
    });
  }

  return { plans, skippedNotApproved };
}

async function main() {
  const { plans, skippedNotApproved } = await buildPlan();

  console.log('='.repeat(72));
  console.log('修复「公开 / 私密定制 混用系列」');
  console.log(`模式：${shouldApply ? '★ 落库（--apply）' : '预演（不落库）'}`);
  console.log('='.repeat(72));

  if (plans.length === 0) {
    console.log('\n✅ 没有需要处理的系列（已全部一致）。');
    return;
  }

  let willArchive = 0;
  let willPublishSeries = 0;
  const blocked: MixedSeriesPlan[] = [];

  for (const p of plans) {
    console.log(`\n【系列】${p.seriesName}`);
    console.log(
      `  系列状态：${p.seriesBusinessStatus} → ${RecipeSeriesBusinessStatus.PUBLIC}`,
    );
    console.log(`  公开版本：${p.publicVersionCount} 个`);

    if (p.archiveable.length > 0) {
      console.log(
        `  ✓ 将归档的私密版本（非客户定制）${p.archiveable.length} 个：`,
      );
      for (const r of p.archiveable) {
        console.log(
          `      v${r.version}  ${r.name}  [${r.lifeStage ?? '无阶段'}]  → 草稿`,
        );
      }
      willArchive += p.archiveable.length;
      willPublishSeries += 1;
    }

    if (p.needsHumanReview.length > 0) {
      console.log(
        `  ⚠️ 需人工确认的私密版本 ${p.needsHumanReview.length} 个（脚本不会动）：`,
      );
      for (const r of p.needsHumanReview) {
        console.log(`      v${r.version}  ${r.name}  ← ${r.reason}`);
      }
      blocked.push(p);
    }
  }

  if (skippedNotApproved.length > 0) {
    console.log(
      `\nℹ️ 以下 ${skippedNotApproved.length} 个系列同样是"公开 / 私密混用"，但不在本次确认范围内，已跳过：`,
    );
    for (const name of skippedNotApproved) {
      console.log(`    · ${name}`);
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log(`合计：${plans.length} 个系列（仅白名单）`);
  console.log(`  · 归档私密版本：${willArchive} 个`);
  console.log(`  · 系列恢复公开：${willPublishSeries} 个`);
  if (blocked.length > 0) {
    console.log(`  ⚠️ 含真实客户定制、需人工处理的系列：${blocked.length} 个`);
  }
  console.log('='.repeat(72));

  if (!shouldApply) {
    console.log('\n这是预演。确认无误后加 --apply 落库。');
    return;
  }

  // ── 落库 ──
  // 逐系列放在一个事务里，保证"归档版本"与"系列状态"要么都成功要么都不做
  let archived = 0;
  let seriesUpdated = 0;

  for (const p of plans) {
    if (p.archiveable.length === 0) {
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.recipe.updateMany({
        where: { id: { in: p.archiveable.map((r) => r.id) } },
        data: { status: RecipeStatus.DRAFT },
      });
      await tx.recipeSeries.update({
        where: { id: p.seriesId },
        data: { businessStatus: RecipeSeriesBusinessStatus.PUBLIC },
      });
    });
    archived += p.archiveable.length;
    seriesUpdated += 1;
    console.log(
      `  ✓ ${p.seriesName}：归档 ${p.archiveable.length} 个版本，系列恢复公开`,
    );
  }

  console.log(
    `\n✅ 完成：归档 ${archived} 个版本，${seriesUpdated} 个系列恢复公开。`,
  );
}

main()
  .catch((error) => {
    console.error('执行失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
