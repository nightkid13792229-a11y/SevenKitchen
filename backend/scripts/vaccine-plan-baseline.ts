/**
 * B0 · 疫苗排期现状基线（2026-10-28）
 *
 * 作用：把一批固定场景的排期结果存成"改前照片"，供 B1–B4 每批改完后逐条对比。
 * **只读**：不写数据库、不改业务代码。
 *
 * 跑法（在 backend 目录）：
 *   npx ts-node -r tsconfig-paths/register scripts/vaccine-plan-baseline.ts
 *
 * 产出：
 *   docs/plans/2026-10-28-vaccine-baseline/snapshot.json  ← 机器对比用
 *   docs/plans/2026-10-28-vaccine-baseline/snapshot.md    ← 人看的版本
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  buildPlanView,
  type VaccinePlanView,
} from '../src/domain/health/vaccine/engine';

const DEFAULT_TODAY = '2026-10-28';

type Scenario = {
  id: string;
  title: string;
  note: string;
  birthday: string;
  today?: string;
  records?: Array<Record<string, unknown>>;
  tests?: Array<Record<string, unknown>>;
  decisions?: Record<string, { decision: string; reason?: string }>;
};

const rec = (
  id: string,
  vaccineName: string,
  vaccinationDate: string,
  extra: Record<string, unknown> = {},
) => ({ id, vaccineName, vaccinationDate, ...extra });

const SCENARIOS: Scenario[] = [
  /* ── 原型三屏（对齐 prototype-scenarios.spec.ts）──────────────────── */
  {
    id: 'P-A',
    title: '6 周幼犬，没打过',
    note: '原型 A：4 针首免 + 钩端 + 狂犬 + 26 周补强。',
    birthday: '2026-08-30',
    today: '2026-10-15',
  },
  {
    id: 'P-B',
    title: '6 岁，一条记录都没有',
    note: '原型 B：核心“补一针”，绝不出现“第 1 针”。',
    birthday: '2020-08-30',
    today: '2026-10-15',
  },
  {
    id: 'P-C',
    title: '3 岁，记录齐全',
    note: '原型 C：狂犬年度、核心 3 年、钩端年度。',
    birthday: '2023-08-30',
    today: '2026-10-15',
    records: [
      rec('r1', '狂犬疫苗', '2025-11-20'),
      rec('r2', '卫佳伍', '2024-01-15'),
      rec('r3', '钩端螺旋体', '2023-11-20'),
      rec('r4', '钩端螺旋体', '2023-12-10'),
      rec('r5', '钩端螺旋体', '2026-03-10'),
      rec('r6', '卫佳伍', '2023-10-20'),
    ],
  },

  /* ── 7 个待修案例 ─────────────────────────────────────────────── */
  {
    id: 'V1',
    title: '抗体合格过期后，核心永远不再提醒',
    note: '复查日 2025-05-01 已过，核心仍是“已完成/评估”。',
    birthday: '2023-01-01',
    records: [rec('a', '卫佳伍', '2023-04-01')],
    tests: [
      { id: 't', testedAt: '2024-05-01', targets: ['CORE'], result: 'PASS' },
    ],
  },
  {
    id: 'V2',
    title: '26 周补强满 1 岁后消失',
    note: '8/12/16 周打完，没打 26 周补强；下一次核心是 2028-12。',
    birthday: '2025-09-01',
    records: [
      rec('a', '卫佳伍', '2025-11-01'),
      rec('b', '卫佳伍', '2025-12-01'),
      rec('c', '卫佳伍', '2025-12-22'),
    ],
  },
  {
    id: 'V3',
    title: '抗体不合格被静默忽略',
    note: '2026-09-01 不合格；核心仍显示 2027-05 才到期。',
    birthday: '2024-01-01',
    records: [
      rec('a', '卫佳伍', '2024-03-20'),
      rec('b', '卫佳伍', '2024-04-20'),
      rec('c', '卫佳伍', '2024-05-10'),
      rec('d', '卫佳伍', '2024-05-24'),
    ],
    tests: [
      { id: 't', testedAt: '2026-09-01', targets: ['CORE'], result: 'FAIL' },
    ],
  },
  {
    id: 'V4',
    title: '单病种疫苗被当成完整核心一针',
    note: '“细小单苗”被算成核心第 1 针，计划从第 2 针开始。',
    birthday: '2026-05-01',
    today: '2026-06-27',
    records: [rec('a', '细小单苗', '2026-06-26')],
  },
  {
    id: 'V5',
    title: '钩端旧的第 2 针盖住真正该打的针',
    note: '2023/09 第 1 针；2025/06 又打一针；下一针应是重启第 2 针。',
    birthday: '2020-01-01',
    records: [
      rec('a', '卫佳捌', '2023-09-01'),
      rec('b', '宠必威乐必妥', '2025-06-01'),
    ],
  },
  {
    id: 'V10',
    title: '太早的记录静默不算，没有解释',
    note: '5 周核心、10 周狂犬；都不算数，但 conflicts 为空。',
    birthday: '2026-08-01',
    records: [
      rec('a', '卫佳伍', '2026-09-05'),
      rec('b', '狂犬疫苗', '2026-10-10'),
    ],
  },
  {
    id: 'V11',
    title: '抗体替代后出现两行一样的“评估”',
    note: '25 周幼犬、无核心记录、抗体合格；2 个核心步骤都被换成“评估”。',
    birthday: '2026-05-01',
    records: [],
    tests: [
      { id: 't', testedAt: '2026-10-01', targets: ['CORE'], result: 'PASS' },
    ],
  },

  /* ── 对照/边界（用来保证修复不把正常案例改坏）──────────────────── */
  {
    id: 'C-TITER-PASS-1Y',
    title: '抗体合格刚好 1 年（复查日昨天）',
    note: '对照 V1：只差一天，仍是“已完成/下次评估”。',
    birthday: '2023-01-01',
    records: [rec('a', '卫佳伍', '2023-04-01')],
    tests: [
      { id: 't', testedAt: '2025-10-27', targets: ['CORE'], result: 'PASS' },
    ],
  },
  {
    id: 'C-TITER-EARLY',
    title: '抗体在 20 周龄前做',
    note: '对照：20 周前不替代，应继续按疫苗排。',
    birthday: '2026-06-15',
    tests: [
      { id: 't', testedAt: '2026-10-20', targets: ['CORE'], result: 'PASS' },
    ],
  },
  {
    id: 'C-TITER-4W',
    title: '抗体在最后一针 4 周内做',
    note: '对照：最后一针后不满 28 天，不替代。',
    birthday: '2024-01-01',
    records: [rec('a', '卫佳伍', '2026-09-01')],
    tests: [
      { id: 't', testedAt: '2026-09-20', targets: ['CORE'], result: 'PASS' },
    ],
  },
  {
    id: 'C-CATCHUP-2Y',
    title: '8/12/15 周，2 岁才补一针',
    note: '对照：系列未在 16 周完成，成年后补一针。',
    birthday: '2024-09-01',
    records: [
      rec('a', '卫佳伍', '2024-10-27'),
      rec('b', '卫佳伍', '2024-11-24'),
      rec('c', '卫佳伍', '2024-12-15'),
    ],
  },
  {
    id: 'C-16W-2Y',
    title: '16 周完成 + 2 岁补一针',
    note: '对照：成年加强锚在最后一针。',
    birthday: '2024-09-01',
    records: [
      rec('a', '卫佳伍', '2024-10-27'),
      rec('b', '卫佳伍', '2024-11-24'),
      rec('c', '卫佳伍', '2024-12-22'),
      rec('d', '卫佳伍', '2026-09-01'),
    ],
  },
  {
    id: 'C-LEPTO-RESTART-2W',
    title: '钩端重启第 2 针（2.8 个月内）',
    note: '对照：上一针是重启第 1 针，且不到 3 个月 → 现在会显示重启第 2 针。',
    birthday: '2020-01-01',
    records: [
      rec('a', '卫佳捌', '2023-09-01'),
      rec('b', '宠必威乐必妥', '2026-08-01'),
    ],
  },
  {
    id: 'C-LEPTO-17M',
    title: '钩端上一针 17.9 个月',
    note: '对照：不满 18 个月 → 年度逾期，不是重启。',
    birthday: '2020-01-01',
    records: [rec('a', '宠必威乐必妥', '2025-05-01')],
  },
  {
    id: 'C-LEPTO-19M',
    title: '钩端上一针 19.9 个月',
    note: '对照：超过 18 个月 → 重启第 1/2 针。',
    birthday: '2020-01-01',
    records: [rec('a', '宠必威乐必妥', '2025-03-01')],
  },
  {
    id: 'C-NOT-NOW',
    title: '“这次先不打”',
    note: '对照：NOT_NOW 会跳过这一针，下一年再提醒。',
    birthday: '2020-01-01',
    records: [rec('a', '狂犬疫苗', '2025-10-01')],
    decisions: { 'rabies-2': { decision: 'SKIP', reason: 'NOT_NOW' } },
  },
  {
    id: 'C-STOPPED',
    title: '“不再接种了”',
    note: '对照：STOPPED 会停掉整类提醒。',
    birthday: '2020-01-01',
    records: [rec('a', '狂犬疫苗', '2025-10-01')],
    decisions: { 'rabies-2': { decision: 'SKIP', reason: 'STOPPED' } },
  },
  {
    id: 'C-UNVERIFIED',
    title: '识别出来还没核对',
    note: '对照：productVerified=false 不参与计划，pendingReview=1。',
    birthday: '2024-01-01',
    records: [rec('a', '卫佳伍', '2024-03-01', { productVerified: false })],
  },
  {
    id: 'C-FUTURE',
    title: '接种日期在未来',
    note: '对照：未来日期不参与计划，conflicts 有提示。',
    birthday: '2024-01-01',
    records: [rec('a', '卫佳伍', '2027-03-01')],
  },
  {
    id: 'C-RABIES-6M',
    title: '狂犬两针间隔 6 个月',
    note: '对照：间隔不足一年，conflicts 有提示。',
    birthday: '2024-01-01',
    records: [
      rec('a', '狂犬疫苗', '2025-01-01'),
      rec('b', '狂犬疫苗', '2025-07-01'),
    ],
  },
  {
    id: 'C-NO-BIRTHDAY',
    title: '没有生日',
    note: '对照：算不出计划，返回空计划。',
    birthday: '',
    records: [rec('a', '卫佳伍', '2025-01-01')],
  },
  {
    id: 'C-CAT',
    title: '猫三联（不是犬苗）',
    note: '对照：猫苗不归类，不参与犬的计划。',
    birthday: '2024-01-01',
    records: [rec('a', '猫三联', '2025-01-01')],
  },
  {
    id: 'C-COMBO',
    title: '卫佳捌（核心 + 钩端）',
    note: '对照：一支组合苗同时顶两类。',
    birthday: '2024-01-01',
    records: [rec('a', '卫佳捌', '2026-01-01')],
  },
  {
    id: 'C-SINGLE',
    title: '卫佳细（只防细小）',
    note: '对照：产品库单苗不当核心，记成 other。',
    birthday: '2024-01-01',
    records: [rec('a', '卫佳细', '2026-01-01')],
  },
  {
    id: 'C-NO-RECORD-ADULT',
    title: '3 岁，一条记录都没有',
    note: '对照：成年犬补一针（与 P-B 同日不同生日）。',
    birthday: '2023-10-28',
  },
  {
    id: 'C-NO-RECORD-25W',
    title: '25 周，一条记录都没有（V17）',
    note: 'B0.5 新发现：25 周无记录被套 6~8 周首免，还排了 2 天后的 26 周补强。',
    birthday: '2026-05-01',
  },
  {
    id: 'C-NO-RECORD-17W',
    title: '17 周，一条记录都没有',
    note: '对照 V17：17 周无记录，同样被套“第 1 针”（原建议 8 月）。',
    birthday: '2026-07-01',
  },
  {
    id: 'C-16W-25W',
    title: '25 周，16 周一针已打（26 周补强仍在）',
    note: '对照 V17：16 周完成首免的狗，26 周补强必须保留（给那一小部分兜底）。',
    birthday: '2026-05-01',
    records: [rec('a', '卫佳伍', '2026-08-21')],
  },
];

function buildOne(scenario: Scenario): VaccinePlanView {
  return buildPlanView({
    dogId: 'baseline',
    birthday: scenario.birthday,
    records: (scenario.records || []) as never,
    antibodyTests: (scenario.tests || []) as never,
    decisions: (scenario.decisions || {}) as never,
    today: new Date(`${scenario.today || DEFAULT_TODAY}T00:00:00`),
  });
}

function windowText(step: VaccinePlanView['plan'][number]): string {
  if (step.titer) return `${step.titer.nextReviewAt}（下次评估）`;
  const original =
    step.missedWindowStart && step.missedWindowStart !== step.windowStart
      ? `（原建议 ${step.missedWindowStart}）`
      : '';
  return `${step.windowStart} ~ ${step.windowEnd}${original}`;
}

function renderMarkdown(
  rows: Array<{ scenario: Scenario; view: VaccinePlanView }>,
): string {
  const lines: string[] = [];
  lines.push('# 疫苗排期 · 现状基线（B0）');
  lines.push('');
  lines.push(
    '> **这是“改前照片”，不是期望行为。** 每批修复后重新生成，逐条对比；' +
      '只允许该变的变，正常案例必须一字不差。',
  );
  lines.push('');
  lines.push('生成方式：`cd backend && npx ts-node -r tsconfig-paths/register scripts/vaccine-plan-baseline.ts`');
  lines.push('');
  lines.push('## 场景清单');
  lines.push('');
  lines.push('| # | 编号 | 说明 | 生日 | 今天 |');
  lines.push('|---|---|---|---|---|');
  rows.forEach(({ scenario }, index) => {
    lines.push(
      `| ${index + 1} | ${scenario.id} | ${scenario.title} | ${scenario.birthday || '（空）'} | ${scenario.today || DEFAULT_TODAY} |`,
    );
  });
  lines.push('');
  lines.push('## 逐场景结果');
  lines.push('');

  for (const { scenario, view } of rows) {
    lines.push(`### ${scenario.id} · ${scenario.title}`);
    lines.push('');
    lines.push(`- 说明：${scenario.note}`);
    lines.push(`- 生日：${scenario.birthday || '（空）'}`);
    lines.push(`- 今天：${scenario.today || DEFAULT_TODAY}`);
    if (scenario.records?.length) {
      lines.push(
        `- 记录：${scenario.records
          .map(
            (item) =>
              `${item.vaccinationDate} ${item.vaccineName}${
                item.productVerified === false ? '（未核对）' : ''
              }`,
          )
          .join('；')}`,
      );
    }
    if (scenario.tests?.length) {
      lines.push(
        `- 抗体：${scenario.tests
          .map((item) => `${item.testedAt} ${item.result}`)
          .join('；')}`,
      );
    }
    if (scenario.decisions && Object.keys(scenario.decisions).length) {
      lines.push(
        `- 忽略：${Object.entries(scenario.decisions)
          .map(([key, value]) => `${key}=${value.decision}/${value.reason || ''}`)
          .join('；')}`,
      );
    }
    const next = view.next;
    lines.push(
      `- **下一针**：${
        next
          ? `${next.kindLabel} · ${next.label} / ${next.statusLabel} / ${windowText(next)}`
          : '无'
      }`,
    );
    lines.push('');
    if (view.plan.length) {
      lines.push('| 类别 | 步骤 | 状态 | 窗口 | 备注 |');
      lines.push('|---|---|---|---|---|');
      for (const step of view.plan) {
        const note = step.titer
          ? `抗体替代，下次复查 ${step.titer.nextReviewAt}`
          : step.label.includes('评估')
            ? '抗体替代'
            : '';
        lines.push(
          `| ${step.kindLabel} | ${step.label} | ${step.statusLabel} | ${windowText(step)} | ${note} |`,
        );
      }
    } else {
      lines.push('（计划为空）');
    }
    lines.push('');
    lines.push(`- 节奏：${view.rhythm || '（空）'}`);
    lines.push(`- 待核对：${view.pendingReview} 条；忽略：${view.ignored.count} 项`);
    lines.push(
      `- 冲突：${
        view.conflicts.length
          ? view.conflicts
              .map((item) => `${item.reason}（${item.suggestion}）`)
              .join('；')
          : '无'
      }`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

function main(): void {
  const rows = SCENARIOS.map((scenario) => ({
    scenario,
    view: buildOne(scenario),
  }));

  const outDir = path.resolve(
    __dirname,
    '../../docs/plans/2026-10-28-vaccine-baseline',
  );
  fs.mkdirSync(outDir, { recursive: true });

  const snapshot = {
    baselineDate: '2026-10-28',
    note: 'B0 改前照片；由现有排期引擎生成，不是期望行为。',
    scenarios: rows.map(({ scenario, view }) => ({
      id: scenario.id,
      title: scenario.title,
      note: scenario.note,
      input: {
        birthday: scenario.birthday,
        today: scenario.today || DEFAULT_TODAY,
        records: scenario.records || [],
        tests: scenario.tests || [],
        decisions: scenario.decisions || {},
      },
      output: view,
    })),
  };

  fs.writeFileSync(
    path.join(outDir, 'snapshot.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(outDir, 'snapshot.md'),
    `${renderMarkdown(rows)}\n`,
    'utf8',
  );

  console.log(
    `baseline written: ${rows.length} scenarios -> ${path.relative(
      process.cwd(),
      outDir,
    )}`,
  );
}

main();
