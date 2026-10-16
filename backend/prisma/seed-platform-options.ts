/**
 * 平台选项字典 · 初始内容灌入（一次性脚本，2026-10-16 食谱定制重构 批次 1.3）
 *
 * ## 这个脚本干什么
 *
 * 两件事，都**幂等**：
 *
 *   ① `ENUM` 类选项集（定制订单状态、定制目标）：
 *      把代码里 Prisma 枚举的**全部取值**补齐进字典，已有行不动。
 *      —— 只补缺失，不覆盖运营改过的文案（重启或重跑都不会冲掉人工编辑）。
 *
 *   ② `DATA` 类选项集（售后类型、交付物、活动量、餐数）：
 *      **只在某个集一行都没有时**灌入登记表里的初始内容。
 *      已有内容不动 —— 运营改过的以数据库为准。
 *
 * ## 为什么要单独一个脚本，而不是服务启动时自动做
 *
 * `ENUM` 的补齐确实在服务启动时也会做一遍（防"加了枚举忘了加文案"）。
 * 但 `DATA` 的初始内容**不能**放启动逻辑：运营故意清空某个选项集时，
 * 重启一次就被塞回来，他会以为系统在跟他作对。
 * 所以 DATA 的初始内容走部署时的 seed —— 与本项目其它初始数据一致。
 *
 * ## 用法
 *
 *   # 预演（默认，只读，不写库）
 *   npx ts-node -r tsconfig-paths/register prisma/seed-platform-options.ts
 *
 *   # 落库
 *   npx ts-node -r tsconfig-paths/register prisma/seed-platform-options.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { PlatformOptionsService } from '../src/application/platform-options/platform-options.service';
import {
  ENUM_SOURCES,
  OPTION_SET_DEFINITIONS,
} from '../src/application/platform-options/option-sets.registry';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

/** 只读地看看现在缺什么（预演用，不写库） */
async function preview(): Promise<{
  missingEnum: string[];
  emptyDataSets: string[];
  unlabeled: string[];
}> {
  const missingEnum: string[] = [];
  const emptyDataSets: string[] = [];
  const unlabeled: string[] = [];

  for (const definition of OPTION_SET_DEFINITIONS) {
    const existing = await prisma.platformOptionItem.findMany({
      where: { setId: definition.code },
      select: { code: true, label: true },
    });
    const existingCodes = new Set(existing.map((row) => row.code));

    for (const row of existing) {
      if (row.label === row.code) {
        unlabeled.push(`${definition.code}/${row.code}`);
      }
    }

    if (definition.sourceType === 'ENUM') {
      const enumValues = definition.enumName
        ? Object.values(ENUM_SOURCES[definition.enumName] ?? {})
        : [];
      for (const code of enumValues) {
        if (!existingCodes.has(code)) {
          missingEnum.push(`${definition.code}/${code}`);
        }
      }
    } else if (existing.length === 0 && definition.seed?.length) {
      emptyDataSets.push(
        `${definition.code}（将灌入 ${definition.seed.length} 项）`,
      );
    }
  }

  return { missingEnum, emptyDataSets, unlabeled };
}

async function main(): Promise<void> {
  console.log('平台选项字典 · 初始内容\n');

  if (!shouldApply) {
    const { missingEnum, emptyDataSets, unlabeled } = await preview();

    console.log('【预演】以下内容会被写入（加 --apply 才真的执行）：\n');
    console.log(
      `  ENUM 类待补齐：${missingEnum.length} 项` +
        (missingEnum.length ? `\n    ${missingEnum.join('\n    ')}` : ''),
    );
    console.log(
      `\n  DATA 类待灌入：${emptyDataSets.length} 个集` +
        (emptyDataSets.length ? `\n    ${emptyDataSets.join('\n    ')}` : ''),
    );
    console.log(
      `\n  尚未配中文（界面会显示英文码）：${unlabeled.length} 项` +
        (unlabeled.length ? `\n    ${unlabeled.join('\n    ')}` : ''),
    );
    console.log('\n（预演结束，未改动任何数据）');
    return;
  }

  /**
   * 直接复用服务里的逻辑（`PrismaService` 继承自 `PrismaClient`），
   * 免得 seed 与运行时两套实现漂移。
   */
  const service = new PlatformOptionsService(prisma as never);

  const enumResult = await service.syncEnumBackedSets();
  console.log(`✓ ENUM 类补齐 ${enumResult.inserted} 项`);
  if (enumResult.unlabeled.length > 0) {
    console.log(
      `⚠ 还有 ${enumResult.unlabeled.length} 项没配中文：${enumResult.unlabeled.join('、')}`,
    );
  }

  const dataResult = await service.seedDataSetsIfEmpty();
  console.log(
    dataResult.seededSets.length > 0
      ? `✓ DATA 类灌入 ${dataResult.seededSets.length} 个集：${dataResult.seededSets.join('、')}`
      : '· DATA 类已有内容，未改动',
  );

  console.log('\n完成。');
}

main()
  .catch((error) => {
    console.error('执行失败：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
