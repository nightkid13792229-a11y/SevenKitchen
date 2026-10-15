/**
 * 一次性脚本：导出疫苗相关的现存测试数据（改 schema 之前存档）。
 * 用法：cd backend && node scripts/export-vaccine-data.js
 * 输出：/tmp/vaccine-backup-<日期>/*.json
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'));

const OUT = process.env.VACCINE_BACKUP_DIR || `/tmp/vaccine-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

(async () => {
  const prisma = new PrismaClient();
  fs.mkdirSync(OUT, { recursive: true });

  const records = await prisma.vaccineRecord.findMany({ orderBy: { createdAt: 'asc' } });
  fs.writeFileSync(path.join(OUT, 'vaccine_record.json'), JSON.stringify(records, null, 2));
  console.log(`vaccine_record：${records.length} 行 → ${OUT}/vaccine_record.json`);

  try {
    const plans = await prisma.$queryRawUnsafe('SELECT * FROM dog_vaccine_plan');
    fs.writeFileSync(path.join(OUT, 'dog_vaccine_plan.json'), JSON.stringify(plans, null, 2));
    console.log(`dog_vaccine_plan：${plans.length} 行 → ${OUT}/dog_vaccine_plan.json`);
  } catch (e) {
    console.log(`dog_vaccine_plan 读不到（可能已经删了）：${e.message.split('\n')[0]}`);
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error('导出失败：', e.message);
  process.exit(1);
});
