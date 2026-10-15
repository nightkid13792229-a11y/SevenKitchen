/**
 * 零记录狗狗 · 各年龄段的计划现状（离线推演）
 * 用法：cd backend && npx ts-node -T scripts/vaccine-zero-record-sweep.ts
 */
import { buildPlanView } from '../src/domain/health/vaccine/engine';

const REF = '2026-10-11';
const minus = (w: number) =>
  new Date(new Date(`${REF}T00:00:00Z`).getTime() - w * 7 * 86400000).toISOString().slice(0, 10);

const AGES = [2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 24, 30, 40, 52, 78, 104, 208];

for (const w of AGES) {
  const plan = buildPlanView({
    dogId: `zero-${w}`,
    birthday: minus(w),
    records: [],
    today: new Date(`${REF}T00:00:00`),
  });
  const pending = plan.plan.filter((s) => s.status !== 'DONE');
  console.log(`\n【${w} 周龄】零记录 → 未完成 ${pending.length} 步`);
  for (const s of pending) {
    console.log(`   ${s.statusLabel}｜${s.label}｜窗口 ${s.windowStart} ~ ${s.windowEnd}`);
  }
}
