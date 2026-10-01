/**
 * 把正式食谱版本名对齐到系列名（一次性脚本）
 *
 * 背景
 * ────
 * 业务定义（docs/plans/2026-09-30-recipe-domain-business-definition.md §三）：
 *   **只有一个名字 —— 系列名。**各生命阶段的食谱名必须与系列名保持一致。
 *
 * 生产实测（2026-09-30）：120 个系列 / 209 个版本行名字全部一致（符合设计），
 * **11 个系列 / 14 个版本行不一致** —— 属于异常数据。
 *
 * 成因：设计器的「重命名系列」只改了 `recipe_series` 与 `design_recipe`，
 * 漏掉了正式食谱（`recipe` 表）。代码侧已在 W1 修复，本脚本处理存量。
 *
 * 处置（已获业务确认：**以系列名为准**）
 * ────────────────────────────────────
 *   把 `recipe.name` 改成它所属系列的 `recipe_series.name`。
 *
 * 其中 3 行是占位名「未命名食谱」，2 行挂在**已发布**版本上
 * （Lucky的最新兔肉食谱 v1、大米燕麦三文鱼兔里脊 v3）——
 * 对齐后这两条对顾客可见的名字会从「未命名食谱」变成正常菜名。
 *
 * 不影响
 * ──────
 *   · 历史订单 / 生产单里的名字是下单时刻的快照，本脚本不碰
 *   · 无系列（seriesId 为空）的独立食谱不在处理范围内
 *
 * 用法
 * ────
 *   npx ts-node -r tsconfig-paths/register prisma/align-recipe-names-to-series.ts           # 预演
 *   npx ts-node -r tsconfig-paths/register prisma/align-recipe-names-to-series.ts --apply   # 落库
 *
 * 幂等：可重复执行。已经一致的记录会被跳过。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

interface MismatchRow {
  id: string;
  seriesId: string;
  seriesName: string;
  version: number;
  name: string;
  status: string;
}

async function main() {
  const series: Array<{ id: string; name: string }> =
    await prisma.recipeSeries.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true, name: true },
    });
  const seriesNameById = new Map<string, string>();
  for (const s of series) {
    seriesNameById.set(s.id, s.name);
  }

  const rows = await prisma.recipe.findMany({
    where: { seriesId: { in: [...seriesNameById.keys()] } },
    select: {
      id: true,
      seriesId: true,
      version: true,
      name: true,
      status: true,
    },
    orderBy: [{ seriesId: 'asc' }, { version: 'asc' }],
  });

  const mismatched: MismatchRow[] = [];
  for (const r of rows) {
    if (!r.seriesId) continue;
    const seriesName = seriesNameById.get(r.seriesId);
    if (!seriesName || seriesName === r.name) continue;
    mismatched.push({
      id: r.id,
      seriesId: r.seriesId,
      seriesName,
      version: r.version,
      name: r.name,
      status: r.status,
    });
  }

  console.log('='.repeat(76));
  console.log('把正式食谱版本名对齐到系列名');
  console.log(`模式：${shouldApply ? '★ 落库（--apply）' : '预演（不落库）'}`);
  console.log('='.repeat(76));

  if (mismatched.length === 0) {
    console.log('\n✅ 没有需要对齐的记录（全部一致）。');
    return;
  }

  let currentSeriesId = '';
  for (const r of mismatched) {
    if (r.seriesId !== currentSeriesId) {
      currentSeriesId = r.seriesId;
      console.log(`\n【系列】${r.seriesName}`);
    }
    const marker = r.status === 'PUBLIC' ? ' ⚠️ 已发布，顾客可见' : '';
    console.log(`  v${r.version}  「${r.name}」→「${r.seriesName}」${marker}`);
  }

  const publicCount = mismatched.filter((r) => r.status === 'PUBLIC').length;
  console.log('\n' + '='.repeat(76));
  console.log(
    `合计：${mismatched.length} 行 / ${new Set(mismatched.map((r) => r.seriesId)).size} 个系列` +
      `（其中已发布 ${publicCount} 行）`,
  );
  console.log('='.repeat(76));

  if (!shouldApply) {
    console.log('\n这是预演。确认无误后加 --apply 落库。');
    return;
  }

  for (const r of mismatched) {
    await prisma.recipe.update({
      where: { id: r.id },
      data: { name: r.seriesName },
    });
  }
  console.log(`\n✅ 完成：对齐 ${mismatched.length} 行。`);
}

main()
  .catch((error) => {
    console.error('执行失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
