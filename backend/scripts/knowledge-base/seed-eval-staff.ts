/**
 * 本地测试 staff 账号（全库计划 Task 3）。
 *
 * 用法：`KB_EVAL_ALLOW_SEED=1 npm run kb:seed-eval`
 *
 * 三重护栏（缺一不可）：
 * 1. NODE_ENV 不能是 production；
 * 2. 必须显式设置 KB_EVAL_ALLOW_SEED=1；
 * 3. DATABASE_URL 必须指向本地库。
 *
 * 账号 id 固定为 `kb-eval-staff`（不是 uuid），这样草稿/会话的 createdBy
 * 天然带 `kb-eval-` 前缀，usage 统计才能排除测试流量。
 */
import 'dotenv/config';
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  EVAL_STAFF_ID,
  EVAL_STAFF_NICKNAME,
} from '../../src/application/knowledge-base/eval-identity';

export function assertSeedAllowed(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('拒绝在生产环境创建测试账号（NODE_ENV=production）');
  }
  if (env.KB_EVAL_ALLOW_SEED !== '1') {
    throw new Error(
      '需要显式设置 KB_EVAL_ALLOW_SEED=1 才能创建测试账号（防止误跑）',
    );
  }
  const url = String(env.DATABASE_URL ?? '');
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('只允许对本地库创建测试账号（DATABASE_URL 不是本地地址）');
  }
}

export async function seedEvalStaff(
  prisma: PrismaClient,
  password: string,
): Promise<{ id: string }> {
  if (!password) throw new Error('缺少 KB_EVAL_ADMIN_PASSWORD');
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { id: EVAL_STAFF_ID },
    update: {
      nickname: EVAL_STAFF_NICKNAME,
      role: UserRole.STAFF,
      status: UserStatus.ACTIVE,
      password: hash,
    },
    create: {
      id: EVAL_STAFF_ID,
      nickname: EVAL_STAFF_NICKNAME,
      role: UserRole.STAFF,
      status: UserStatus.ACTIVE,
      password: hash,
    },
    select: { id: true },
  });
  return user;
}

if (require.main === module) {
  (async () => {
    assertSeedAllowed(process.env);
    const password = String(process.env.KB_EVAL_ADMIN_PASSWORD ?? '').trim();
    const prisma = new PrismaClient();
    try {
      const user = await seedEvalStaff(prisma, password);
      console.log(`测试账号就绪：${user.id}`);
    } finally {
      await prisma.$disconnect();
    }
  })().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
