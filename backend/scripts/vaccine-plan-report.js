/**
 * 生产库验收脚本：把每只狗的计划打印成一张表（人工过一眼）。
 * 用法（在生产机上）：cd /opt/sevenkitchen/SevenKitchen/backend && node scripts/vaccine-plan-report.js [关键词]
 * 只读，不写任何数据。
 */
const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'));
const {
  buildPlanView,
} = require(path.resolve(__dirname, '../dist/src/domain/health/vaccine/engine'));

const filter = process.argv[2] || '';

(async () => {
  const prisma = new PrismaClient();
  const dogs = await prisma.dog.findMany({
    select: {
      id: true,
      name: true,
      birthday: true,
      vaccineRecords: true,
      vaccineDecisions: true,
      antibodyTests: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const today = new Date();
  const rows = [];
  for (const dog of dogs) {
    if (filter && !dog.name.includes(filter)) continue;
    const view = buildPlanView({
      dogId: dog.id,
      birthday: dog.birthday.toISOString().slice(0, 10),
      records: dog.vaccineRecords.map((r) => ({
        id: r.id,
        vaccineName: r.vaccineName,
        vaccinationDate: r.vaccinationDate.toISOString().slice(0, 10),
        components: r.components ?? [],
        productVerified: r.productVerified,
      })),
      tests: dog.antibodyTests.map((t) => ({
        id: t.id,
        testedAt: t.testedAt.toISOString().slice(0, 10),
        targets: t.targets ?? [],
        result: t.result,
        nextReviewAt: t.nextReviewAt ? t.nextReviewAt.toISOString().slice(0, 10) : null,
      })),
      decisions: Object.fromEntries(
        dog.vaccineDecisions.map((d) => [d.stepKey, { decision: d.decision, reason: d.reason }]),
      ),
      today,
    });

    const ageWeeks = Math.floor(
      (today.getTime() - dog.birthday.getTime()) / (7 * 24 * 3600 * 1000),
    );
    rows.push(
      `${dog.name.padEnd(10)} ${String(ageWeeks).padStart(3)}周 记录${String(dog.vaccineRecords.length).padStart(2)}条 ` +
        `下一针：${view.next ? `${view.next.kindLabel.slice(0, 6)}·${view.next.label}·${view.next.statusLabel} [${view.next.windowStart}~${view.next.windowEnd}]` : '（无）'}` +
        ` | 计划${view.plan.length}行 忽略${view.ignored.count}`,
    );
  }

  console.log(`共 ${rows.length} 只狗（参考日 ${today.toISOString().slice(0, 10)}）\n`);
  console.log(rows.join('\n'));
  await prisma.$disconnect();
})().catch((e) => {
  console.error('失败：', e.message.split('\n')[0]);
  process.exit(1);
});
