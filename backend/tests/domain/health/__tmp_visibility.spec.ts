import {
  ALL_VACCINE_KINDS,
  buildImmunizationSchedule,
  buildVaccinePlan,
} from '../../../src/domain/health/immunization-schedule';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = new Date('2026-10-08T00:00:00');
const bornWeeksAgo = (w: number) => fmt(new Date(TODAY.getTime() - w * 7 * 86400000));

const show = (weeks: number) => {
  const birthday = bornWeeksAgo(weeks);
  const plan = buildVaccinePlan({ dogId: 'd', birthday, records: [], today: TODAY });
  const full = buildImmunizationSchedule(new Date(`${birthday}T00:00:00`), {
    kinds: ALL_VACCINE_KINDS,
  });
  // eslint-disable-next-line no-console
  console.log(
    `\n【今天 ${weeks} 周龄、零记录】程序表 ${full.length} 步 → 顾客看到 ${plan.steps.length} 步\n` +
      plan.steps
        .map(
          (s) =>
            `    [${s.status.padEnd(8)}] ${s.kind.padEnd(6)} ${s.label.padEnd(20)}｜${s.windowStart}~${s.windowEnd}`,
        )
        .join('\n'),
  );
};

describe('__tmp 显示过滤', () => {
  it('打印', () => {
    for (const weeks of [60, 66, 70, 72, 76, 82, 100, 150]) show(weeks);
    expect(true).toBe(true);
  });
});
