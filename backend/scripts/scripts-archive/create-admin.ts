/**
 * 创建管理员账号的脚本
 * 用法: npx ts-node scripts/create-admin.ts <用户名> <密码>
 * 示例: npx ts-node scripts/create-admin.ts admin admin123
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin(username: string, password: string) {
  try {
    // 检查用户是否已存在
    const existingUser = await prisma.user.findFirst({
      where: {
        nickname: username,
        role: { in: ['STAFF', 'ADMIN'] },
      },
    });

    if (existingUser) {
      console.log(`❌ 用户 "${username}" 已存在`);
      process.exit(1);
    }

    // 生成密码hash
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 创建管理员用户
    const adminUser = await prisma.user.create({
      data: {
        phone: `admin_${Date.now()}`, // 临时唯一手机号
        nickname: username,
        password: passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        lastLoginAt: new Date(),
      },
    });

    console.log(`✅ 管理员账号创建成功！`);
    console.log(`用户名: ${username}`);
    console.log(`密码: ${password}`);
    console.log(`角色: ADMIN`);
    console.log(`用户ID: ${adminUser.id}`);
  } catch (error: any) {
    console.error(`❌ 创建失败:`, error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 获取命令行参数
const args = process.argv.slice(2);
const username = args[0];
const password = args[1];

if (!username || !password) {
  console.log('用法: npx ts-node scripts/create-admin.ts <用户名> <密码>');
  console.log('示例: npx ts-node scripts/create-admin.ts admin admin123');
  process.exit(1);
}

createAdmin(username, password);
