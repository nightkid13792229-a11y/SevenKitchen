/**
 * 把 13 个测试案例打成"建档明细"（老板要看：生日 / 每条记录的日期与产品）
 * 用法：cd backend && npx ts-node -T scripts/vaccine-test-cases-spec.ts
 */
import { CASES } from './vaccine-test-cases';

const REF = '2026-10-11';
const minus = (w: number) =>
  new Date(new Date(`${REF}T00:00:00Z`).getTime() - w * 7 * 86400000).toISOString().slice(0, 10);
const plus = (b: string, w: number) =>
  new Date(new Date(`${b}T00:00:00Z`).getTime() + w * 7 * 86400000).toISOString().slice(0, 10);

for (const c of CASES) {
  const b = minus(c.ageWeeks);
  console.log(`| ${c.no} | 测${String(c.no).padStart(2, '0')} | ${b} | ${c.ageWeeks} 周 | ${c.records.length === 0 ? '（无）' : c.records.map((r) => `${plus(b, r.weeks)} ${r.product}`).join('<br>')} |`);
}
