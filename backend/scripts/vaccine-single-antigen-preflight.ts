/**
 * #3 只读预检：有多少条“名字像单苗/病种、但没有成分、现在被算成 core”的记录？
 *
 * 目的：在把“只认成分”上线之前，先知道会影响多少条记录、多少只狗。
 * **只读**：不写数据库、不改任何记录。
 *
 * 跑法（在 backend 目录；DATABASE_URL 换成目标库，只读账号即可）：
 *   DATABASE_URL='postgresql://...' npx ts-node -r tsconfig-paths/register scripts/vaccine-single-antigen-preflight.ts
 *
 * 本机默认库可省略 DATABASE_URL（用 npm 脚本里的本地默认值）。
 */

import { PrismaClient } from '@prisma/client';

const PATTERNS = ['单苗', '犬瘟', '细小', '腺病毒'];

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.vaccineRecord.findMany({
      where: {
        OR: PATTERNS.map((pattern) => ({
          vaccineName: { contains: pattern },
        })),
      },
      select: {
        id: true,
        dogId: true,
        vaccineName: true,
        vaccinationDate: true,
        components: true,
        kinds: true,
        productVerified: true,
      },
      orderBy: { vaccinationDate: 'asc' },
    });

    const suspects = rows.filter(
      (row) =>
        (row.components?.length ?? 0) === 0 &&
        (row.kinds ?? []).includes('core'),
    );
    const dogs = new Set(suspects.map((row) => row.dogId));
    const byName = new Map<string, number>();
    for (const row of suspects) {
      const name = String(row.vaccineName || '').trim();
      byName.set(name, (byName.get(name) || 0) + 1);
    }

    console.log('');
    console.log('=== #3 只读预检：单病种/病种名、无成分、现在算 core ===');
    console.log(`候选记录（名字命中）：${rows.length} 条`);
    console.log(`其中“无成分且 kinds 含 core”：${suspects.length} 条`);
    console.log(`涉及狗狗：${dogs.size} 只`);
    console.log('');
    if (byName.size) {
      console.log('按名字分布（前 20）：');
      [...byName.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([name, count]) => console.log(`- ${name}: ${count} 条`));
      console.log('');
      console.log('示例（前 10 条）：');
      suspects.slice(0, 10).forEach((row) => {
        console.log(
          `- ${row.vaccinationDate.toISOString().slice(0, 10)} ${row.vaccineName} ` +
            `(dog=${row.dogId.slice(0, 8)}…, kinds=${(row.kinds || []).join('/')}, ` +
            `verified=${row.productVerified})`,
        );
      });
    } else {
      console.log('没有命中“无成分且算 core”的记录。');
    }
    console.log('');
    console.log(
      '说明：这是只读统计。上线前建议在生产只读账号上再跑一次；' +
        '如果数量大，先准备一句给家长的解释（“我们补上了以前漏掉的一针”）。',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[preflight] 预检失败：', error?.message || error);
  process.exitCode = 1;
});
