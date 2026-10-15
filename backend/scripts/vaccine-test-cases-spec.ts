/**
 * 生成 26 套测试档案的建档清单（人看的表格 + 机器用的 JSON）
 * 用法：cd backend && npx ts-node -T scripts/vaccine-test-cases-spec.ts [输出JSON路径]
 */
import { writeFileSync } from 'node:fs';
import { CASES } from './vaccine-test-cases';
import { findProductByText } from '../src/domain/health/vaccine/products';

const REF = '2026-10-11';
const minus = (w: number) =>
  new Date(new Date(`${REF}T00:00:00Z`).getTime() - w * 7 * 86400000).toISOString().slice(0, 10);
const plus = (b: string, w: number) =>
  new Date(new Date(`${b}T00:00:00Z`).getTime() + w * 7 * 86400000).toISOString().slice(0, 10);

const out: Record<string, unknown>[] = [];

for (const c of CASES) {
  // 案例 26（B13）：生日故意留空 ✓
  const birthday = c.ageWeeks < 0 ? '' : minus(c.ageWeeks);
  const records = c.records.map((r) => {
    const product = findProductByText(r.product);
    return {
      vaccineName: r.product,
      vaccinationDate: birthday ? plus(birthday, r.weeks) : '',
      kinds: r.kinds,
      components: product ? product.components : [],
      weeks: r.weeks,
    };
  });
  out.push({
    no: c.no,
    name: `测${String(c.no).padStart(2, '0')}·${c.name.replace(/^B\\d+ · /, '').slice(0, 12)}`,
    note: c.note,
    birthday,
    ageWeeks: c.ageWeeks,
    records,
  });

  console.log(
    `| ${c.no} | 测${String(c.no).padStart(2, '0')} | ${birthday || '（空）'} | ${c.ageWeeks < 0 ? '—' : `${c.ageWeeks} 周`} | ${
      records.length === 0
        ? '（无）'
        : records.map((r) => `${r.vaccinationDate || '（无日期）'} ${r.vaccineName}`).join('<br>')
    } |`,
  );
}

const target = process.argv[2] || '/tmp/vaccine-test-dogs.json';
writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`\n（机器用清单已写入 ${target}）`);
