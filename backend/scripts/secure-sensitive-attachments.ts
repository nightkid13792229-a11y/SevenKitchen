/**
 * 一次性运维脚本（2026-10-19 P0）：
 * 把历史过敏报告/定制订单附件从公有读改成私有读。
 *
 * 新上传已经由 TencentCosService 对敏感目录设置 private；
 * 这里只补历史对象，不涉及健康记录（病历/体检）附件。
 *
 * 用法（生产机、已 source backend/.env）：
 *   pnpm ts-node -r tsconfig-paths/register scripts/secure-sensitive-attachments.ts
 */
import { PrismaClient } from '@prisma/client';
const COS = require('cos-nodejs-sdk-v5');

const prisma = new PrismaClient();
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID || '',
  SecretKey: process.env.COS_SECRET_KEY || '',
});
const bucket = process.env.COS_BUCKET || '';
const region = process.env.COS_REGION || 'ap-guangzhou';

const SENSITIVE_PREFIXES = [
  'allergy-records/',
  'custom-recipe-sensitive-attachments/',
  // 旧版备注附件也放在这个目录；只处理订单 attachments，不碰售后 photos
  'custom-recipe-attachments/',
];

function keyOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
}

function isSensitive(key: string): boolean {
  return SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

async function makePrivate(key: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    cos.putObjectAcl(
      { Bucket: bucket, Region: region, Key: key, ACL: 'private' },
      (error: any) => (error ? reject(error) : resolve()),
    );
  });
}

async function main(): Promise<void> {
  if (!bucket || !process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) {
    throw new Error('缺少 COS_BUCKET / COS_SECRET_ID / COS_SECRET_KEY');
  }

  const urls = new Set<string>();
  // 只处理从定制单同步来的报告（sourceKey 非空）；健康模块直传报告先保持原状
  const reports = await prisma.allergyReport.findMany({
    where: { sourceKey: { not: null } },
    select: { attachments: true },
  });
  for (const report of reports) {
    for (const url of report.attachments || []) urls.add(url);
  }

  const orders = await prisma.customRecipeOrder.findMany({
    select: { attachments: true, allergyReportDrafts: true },
  });
  for (const order of orders) {
    for (const url of (order.attachments as string[]) || []) {
      if (typeof url === 'string') urls.add(url);
    }
    const drafts = Array.isArray(order.allergyReportDrafts)
      ? (order.allergyReportDrafts as any[])
      : [];
    for (const draft of drafts) {
      const attachments = Array.isArray(draft?.attachments)
        ? draft.attachments
        : [];
      for (const url of attachments) {
        if (typeof url === 'string') urls.add(url);
      }
    }
  }

  let changed = 0;
  let skipped = 0;
  for (const url of urls) {
    const key = keyOf(url);
    if (!isSensitive(key)) {
      skipped += 1;
      continue;
    }
    try {
      await makePrivate(key);
      changed += 1;
      console.log(`✓ private: ${key}`);
    } catch (error: any) {
      console.error(`✗ failed: ${key}: ${error?.message || error}`);
    }
  }

  console.log(`完成：${changed} 个设为私有，跳过 ${skipped} 个非敏感文件`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
