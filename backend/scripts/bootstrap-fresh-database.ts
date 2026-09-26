/**
 * 新环境建库（绕过无法重放的迁移链）
 *
 * 背景：本仓库的迁移链**无法在空库上重放**。
 * 历史迁移 `20260109000000_phase9_order_status_optimization` 在同一个事务里
 * 既 `ALTER TYPE "OrderStatus" ADD VALUE 'PURCHASING'`，又立刻
 * `UPDATE ... SET status = 'PURCHASING'` 使用这个新值。
 * PostgreSQL 规定新枚举值必须先提交才能被使用，所以 `prisma migrate deploy`
 * 在空库上必定失败：
 *
 *   ERROR: unsafe use of new value "PURCHASING" of enum type "OrderStatus"
 *
 * 直接改那个迁移也不行 —— 会改变它的校验和，让**已有环境**的 migrate deploy 报错。
 *
 * 因此新环境用官方推荐的「基线」做法建库：
 *   ① `prisma db push`：直接按 schema.prisma 建出全部表
 *   ② 把每个迁移标记为「已应用」，让迁移历史与 schema 对齐
 *   ③ 校验：表数量 + `migrate status`
 *
 * 注意：这只适用于**全新空库**。已有数据的库请照常 `prisma migrate deploy`。
 *
 * 用法：
 *   cd backend
 *   DATABASE_URL="postgresql://…/新库名" npx ts-node -r tsconfig-paths/register scripts/bootstrap-fresh-database.ts
 *   # 加 --yes 跳过确认
 */

import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
}

function listMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('缺少 DATABASE_URL。请显式指定要建的目标库。');
    process.exit(1);
  }

  const dbName = new URL(databaseUrl.replace(/^["']|["']$/g, '')).pathname.replace(
    /^\//,
    '',
  );
  const assumedYes = process.argv.includes('--yes');

  console.log(`目标库：${dbName}`);

  // ---------- 安全阀：只允许在空库上跑 ----------
  const prisma = new PrismaClient();
  let existingTables = 0;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      "SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema='public'",
    );
    existingTables = Number(rows[0]?.n ?? 0);
  } finally {
    await prisma.$disconnect();
  }

  if (existingTables > 0) {
    console.error(
      `这个库里已经有 ${existingTables} 张表，拒绝运行。\n` +
        '本脚本只用于全新空库；已有数据的库请用 `npx prisma migrate deploy`。',
    );
    process.exit(1);
  }

  if (!assumedYes) {
    console.log(
      '即将：按 schema.prisma 建表，并把所有迁移标记为已应用。\n' +
        '确认无误请加 --yes 重跑。',
    );
    process.exit(1);
  }

  // ---------- ① 按 schema 建表 ----------
  console.log('\n[1/3] prisma db push：按 schema.prisma 建表…');
  run('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss']);
  console.log('      完成');

  // ---------- ② 标记迁移为已应用 ----------
  const names = listMigrationNames();
  console.log(`\n[2/3] 标记 ${names.length} 个迁移为已应用…`);
  let failed = 0;
  for (const name of names) {
    try {
      run('npx', ['prisma', 'migrate', 'resolve', '--applied', name]);
    } catch (error) {
      failed += 1;
      console.error(`      失败：${name}`);
      console.error(String((error as Error).message).split('\n')[0]);
    }
  }
  console.log(`      完成（失败 ${failed} 个）`);

  // ---------- ③ 校验 ----------
  console.log('\n[3/3] 校验…');
  const verify = new PrismaClient();
  try {
    const rows = await verify.$queryRawUnsafe<Array<{ n: bigint }>>(
      "SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema='public'",
    );
    console.log(`      表数量：${Number(rows[0]?.n ?? 0)}`);
  } finally {
    await verify.$disconnect();
  }
  console.log(run('npx', ['prisma', 'migrate', 'status']).split('\n').slice(-3).join('\n'));

  console.log('\n建库完成。接着跑一次 `npx prisma generate` 让客户端跟上。');
}

main().catch((error) => {
  console.error('建库失败：', error);
  process.exit(1);
});
