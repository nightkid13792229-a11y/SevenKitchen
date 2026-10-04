#!/usr/bin/env node
/**
 * 清理健康档案里"没人引用"的附件（2026-10-02）。
 *
 * ── 为什么需要 ──────────────────────────────────────────────
 *
 *   顾客在小程序里传的每一张报告，都是**先传到 COS、再交给 AI 识别**：
 *     · 识别失败 / 根本不是宠物医疗资料 → 图已经传上去了
 *     · 识别成功但顾客没点保存就退出 → 图还在
 *     · 记录后来被删掉 → 数据库那一行没了，图还在
 *   前端的"没用上就立刻删"（HealthDocumentScan 里的 dropUploadedFile）只能盖住
 *   前两种情况里"顾客还在页面上"的那部分；App 被杀、断网、直接退出都盖不住。
 *   2026-10-02 实测：133 个文件里 82 个没人引用（46.6 MB，占七成）。
 *
 * ── 这个脚本做什么 ──────────────────────────────────────────
 *
 *   1. 从数据库取出四张健康记录表里**所有被引用的附件地址**
 *   2. 列出 COS 上医疗相关的目录（默认 medical-reports/、allergy-records/）
 *   3. 删掉"没被引用 **且** 上传超过 N 天"的对象（默认 7 天）
 *
 * ── 安全阀 ─────────────────────────────────────────────────
 *
 *   · **默认只预览不删除**，必须显式加 `--delete` 才真删
 *   · 只碰 `--prefix` 指定的目录，别的目录（头像、食谱图…）一律不碰
 *   · 只删 N 天前的：正在填表还没保存的图不会被误删
 *   · 被任何一条记录引用的地址一律保留
 *
 * 用法（在生产服务器上跑，那里才有 COS 凭据与数据库）：
 *   node scripts/cleanup-orphan-health-attachments.js              # 预览
 *   node scripts/cleanup-orphan-health-attachments.js --delete     # 真删
 *   node scripts/cleanup-orphan-health-attachments.js --days=3 --delete
 */

const path = require('path');
const BACKEND_ROOT = path.resolve(__dirname, '..');

require(path.join(BACKEND_ROOT, 'node_modules/dotenv')).config({
  path: path.join(BACKEND_ROOT, '.env'),
});

const COS = require(path.join(BACKEND_ROOT, 'node_modules/cos-nodejs-sdk-v5'));
const { PrismaClient } = require(path.join(
  BACKEND_ROOT,
  'node_modules/@prisma/client',
));

const args = process.argv.slice(2);
const shouldDelete = args.includes('--delete');
const daysArg = args.find((item) => item.startsWith('--days='));
const OLDER_THAN_DAYS = daysArg ? Number(daysArg.split('=')[1]) : 7;
const prefixArg = args.find((item) => item.startsWith('--prefix='));
/**
 * 只碰这些目录 —— 全都是"顾客上传的健康资料"。
 *
 * 2026-10-02 实测桶里的顶层目录后确认：健康资料分散在这四个前缀下
 * （checkup-reports/ 是体检报告上传口用的，容易漏）。
 * 其余目录（头像、食谱图、订单凭证…）一律不碰。
 */
const HEALTH_PREFIXES = [
  'medical-reports/',
  'checkup-reports/',
  'allergy-records/',
  'vaccine-books/',
];
const PREFIXES = prefixArg
  ? prefixArg.split('=')[1].split(',')
  : HEALTH_PREFIXES;

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
});
const Bucket = process.env.COS_BUCKET;
const Region = process.env.COS_REGION;

const prisma = new PrismaClient();

/**
 * 数据库里被引用到的所有附件 key（去掉域名与查询串）。
 *
 * 除了四张记录表，**必须**把「分享给医生的快照」也算进来（2026-10-02 修）：
 * 快照是永久的、里面存着图片地址，顾客可能几个月后还在把那个链接发给医生；
 * 只按记录表判断的话，这些图会在 7 天后被当成"没人引用"删掉、链接变裂图。
 * 已撤销（revoked_at 非空）的分享不再算引用 —— 那些图可以正常回收。
 */
async function collectReferencedKeys() {
  const rows = await prisma.$queryRaw`
    select attachments from medical_record
    union all select attachments from checkup_record
    union all select attachments from allergy_record
    union all select attachments from vaccine_record
    union all
    select array_agg(item->>'sourceUrl')
    from dog_health_share_token t,
         jsonb_array_elements(t.snapshot->'attachments') as item
    where t.revoked_at is null
      and jsonb_array_length(coalesce(t.snapshot->'attachments', '[]'::jsonb)) > 0
  `;

  const keys = new Set();
  for (const row of rows) {
    for (const url of row.attachments || []) {
      if (url) {
        keys.add(toObjectKey(String(url)));
      }
    }
  }

  return keys;
}

function toObjectKey(url) {
  const withoutQuery = url.split('?')[0];
  const withoutHost = withoutQuery.replace(/^https?:\/\/[^/]+\//, '');

  try {
    return decodeURIComponent(withoutHost);
  } catch {
    return withoutHost;
  }
}

function listAll(prefix) {
  return new Promise((resolve, reject) => {
    let all = [];
    let marker;

    const next = () =>
      cos.getBucket(
        { Bucket, Region, Prefix: prefix, Marker: marker, MaxKeys: 1000 },
        (err, data) => {
          if (err) {
            reject(err);
            return;
          }

          all = all.concat(data.Contents || []);

          if (data.IsTruncated === 'true') {
            marker = data.NextMarker;
            next();
          } else {
            resolve(all);
          }
        },
      );

    next();
  });
}

async function main() {
  const referenced = await collectReferencedKeys();

  const objects = [];
  for (const prefix of PREFIXES) {
    objects.push(...(await listAll(prefix)));
  }

  const cutoff = Date.now() - OLDER_THAN_DAYS * 24 * 60 * 60 * 1000;
  const targets = objects.filter(
    (item) =>
      !referenced.has(item.Key) &&
      new Date(item.LastModified).getTime() < cutoff,
  );

  const bytes = targets.reduce((sum, item) => sum + Number(item.Size || 0), 0);

  console.log(`目录: ${PREFIXES.join(', ')}`);
  console.log(`COS 对象: ${objects.length} 个`);
  console.log(`数据库引用: ${referenced.size} 个`);
  console.log(
    `可清理（没被引用且超过 ${OLDER_THAN_DAYS} 天）: ${targets.length} 个, ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB`,
  );

  if (targets.length > 0) {
    console.log('\n前 10 个：');
    for (const item of targets.slice(0, 10)) {
      console.log(
        `  ${item.Key}  ${(Number(item.Size || 0) / 1024).toFixed(0)} KB  ${item.LastModified}`,
      );
    }
  }

  if (!shouldDelete) {
    console.log('\n（预览模式，什么都没删。要真删加 --delete）');
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const item of targets) {
    try {
      await new Promise((resolve, reject) =>
        cos.deleteObject(
          { Bucket, Region, Key: item.Key },
          (err) => (err ? reject(err) : resolve()),
        ),
      );
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error(`删除失败 ${item.Key}: ${error.message || error}`);
    }
  }

  console.log(`\n已删除 ${deleted} 个，失败 ${failed} 个`);
}

main()
  .catch((error) => {
    console.error('清理失败:', error.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
