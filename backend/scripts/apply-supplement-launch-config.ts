/**
 * 把补剂配置对齐到首发目标值（默认 dry-run）。
 * 只更新配置表；不碰订单/价格快照。
 *
 *   npx ts-node -r tsconfig-paths/register scripts/apply-supplement-launch-config.ts
 *   npx ts-node -r tsconfig-paths/register scripts/apply-supplement-launch-config.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import {
  SUPPLEMENT_SHOP_LAUNCH_TARGETS,
  diffSupplementLaunchTargets,
} from '../src/application/supplement-shop/supplement-shop-config.constants';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const config = await prisma.supplementShopConfig.findUnique({
    where: { id: 'singleton' },
  });
  if (!config) {
    throw new Error('补剂配置行不存在，请先打开一次后台补剂商城设置');
  }
  const diffs = diffSupplementLaunchTargets(
    config as unknown as Record<string, unknown>,
  );
  console.log(
    `[apply-supplement-launch-config] mode=${apply ? 'APPLY' : 'DRY-RUN'} diffs=${diffs.length}`,
  );
  for (const diff of diffs) {
    console.log(
      `  ${diff.label}(${diff.field}): ${JSON.stringify(diff.current)} -> ${JSON.stringify(diff.target)}`,
    );
  }
  if (!apply || diffs.length === 0) return;

  const data: Record<string, unknown> = {};
  for (const diff of diffs) {
    data[diff.field] = SUPPLEMENT_SHOP_LAUNCH_TARGETS[diff.field];
  }
  await prisma.supplementShopConfig.update({
    where: { id: 'singleton' },
    data: data as any,
  });
  console.log('[apply-supplement-launch-config] applied');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
