/**
 * B0.7 初版 · 疫苗不变量审计（2026-10-29）
 *
 * 做法：用固定种子生成一批随机历史（生日/记录/抗体），跑现有排期引擎，
 * 断言 6 条“模型层面的不变量”。违反的不是“某个日期算错”，而是规则被破坏。
 *
 * 只读：不写数据库、不改业务代码。
 * 跑法：cd backend && npx ts-node -r tsconfig-paths/register scripts/vaccine-invariant-audit.ts
 * 产出：docs/plans/2026-10-29-vaccine-invariant-audit.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildPlanView } from '../src/domain/health/vaccine/engine';
import {
  classifyRecordKinds,
  kindsOfComponents,
} from '../src/domain/health/vaccine/products';

const TODAY = new Date('2026-10-29T00:00:00');
const DAY = 86400000;
const CASES = 500;
const SEED = 20261029;

const CORE_NAMES = [
  '卫佳伍', '卫佳捌', '宠必威优免康', '犬四联', '犬五联', '六联',
  '犬二联', '卫佳细', '细小单苗', '犬瘟单苗',
];
const RABIES_NAMES = ['瑞比克', '狂犬疫苗', '维克狂犬'];
const LEPTO_NAMES = ['宠必威乐必妥', '钩端螺旋体', '卫佳捌'];
const OTHER_NAMES = ['猫三联', '犬窝咳', '犬冠状病毒'];
const COMPONENTS = ['cdv', 'cpv', 'cav', 'cpi', 'lepto', 'rabies', 'ccov'];

type Rec = {
  id: string;
  vaccineName: string;
  vaccinationDate: string;
  components?: string[];
  kinds?: string[];
  productVerified?: boolean;
};
type Test = {
  id: string;
  testedAt: string;
  targets: string[];
  result: 'PASS' | 'FAIL' | 'UNKNOWN';
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(SEED);
const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const int = (min: number, max: number) =>
  Math.floor(rnd() * (max - min + 1)) + min;
const dateText = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const addDays = (base: Date, days: number) =>
  new Date(base.getTime() + days * DAY);
const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / DAY);

function randomComponents(): string[] {
  const count = int(1, 4);
  const pool = [...COMPONENTS];
  const out: string[] = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    const at = Math.floor(rnd() * pool.length);
    out.push(pool.splice(at, 1)[0]);
  }
  return out;
}

function generate(index: number) {
  const ageDays = int(30, 7000);
  const birthday = addDays(TODAY, -ageDays);
  const records: Rec[] = [];
  const recordCount = int(0, 8);
  for (let i = 0; i < recordCount; i += 1) {
    const namePool = rnd() < 0.6
      ? CORE_NAMES
      : rnd() < 0.5
        ? LEPTO_NAMES
        : rnd() < 0.5
          ? RABIES_NAMES
          : OTHER_NAMES;
    const name = pick(namePool);
    const offset = int(0, Math.min(ageDays, 2500));
    let date = addDays(birthday, offset);
    // ~12% 未来日期（会被引擎过滤，用来测“未来不算”）
    if (rnd() < 0.12) date = addDays(TODAY, int(1, 60));
    const hasComponents = rnd() < 0.4;
    const components = hasComponents ? randomComponents() : undefined;
    records.push({
      id: `r${index}-${i}`,
      vaccineName: name,
      vaccinationDate: dateText(date),
      ...(components
        ? {
            components,
            kinds: kindsOfComponents({ components: components as never }),
          }
        : {}),
      ...(rnd() < 0.1 ? { productVerified: false } : {}),
    });
  }

  const tests: Test[] = [];
  const testCount = int(0, 3);
  for (let i = 0; i < testCount; i += 1) {
    const offset = int(0, Math.max(0, ageDays - 100));
    const date = addDays(birthday, 100 + offset);
    tests.push({
      id: `t${index}-${i}`,
      testedAt: dateText(date),
      targets: [rnd() < 0.8 ? 'CORE' : 'RABIES'],
      result: pick(['PASS', 'FAIL', 'UNKNOWN'] as const),
    });
  }

  return { birthday: dateText(birthday), records, tests, ageDays };
}

type Violation = {
  rule: string;
  title: string;
  detail: string;
  input: string;
  rows: string;
};

const violations: Violation[] = [];
const counts: Record<string, number> = {};

function addViolation(v: Violation) {
  counts[v.rule] = (counts[v.rule] ?? 0) + 1;
  if (violations.filter((x) => x.rule === v.rule).length < 3) {
    violations.push(v);
  }
}

const rowsText = (plan: any[]) =>
  plan
    .map(
      (s) =>
        `${s.kind}/${s.label} | ${s.statusLabel} | ${s.windowStart}~${s.windowEnd}${
          s.missedWindowStart ? ` (原${s.missedWindowStart})` : ''
        }${s.titer ? ' [TITER]' : ''}`,
    )
    .join('；');

for (let i = 0; i < CASES; i += 1) {
  const data = generate(i);
  const view = buildPlanView({
    dogId: `dog-${i}`,
    birthday: data.birthday,
    records: data.records as never,
    antibodyTests: data.tests as never,
    today: TODAY,
  });
  const plan = view.plan;
  const recText = (r: Rec) => {
    const tag = r.components?.length
      ? `[${r.components.join(',')}]`
      : r.kinds?.length
        ? `[kinds:${r.kinds.join(',')}]`
        : '[按名字]';
    return `${r.vaccinationDate} ${r.vaccineName}${tag}${
      r.productVerified === false ? '(未核对)' : ''
    }`;
  };
  const input = `生日 ${data.birthday}（${Math.floor(data.ageDays / 7)} 周）；记录 ${
    data.records.map(recText).join('、') || '无'
  }；抗体 ${
    data.tests.map((t) => `${t.testedAt} ${t.targets.join('/')} ${t.result}`).join('、') || '无'
  }`;

  const effectiveRecords = data.records.filter(
    (r) =>
      r.productVerified !== false &&
      new Date(`${r.vaccinationDate}T00:00:00`).getTime() <= TODAY.getTime() &&
      classifyRecordKinds(r).length > 0,
  );
  const coreDoses = effectiveRecords
    .filter((r) => classifyRecordKinds(r).includes('core'))
    .map((r) => new Date(`${r.vaccinationDate}T00:00:00`))
    .sort((a, b) => a.getTime() - b.getTime());
  const leptoDoses = effectiveRecords
    .filter((r) => classifyRecordKinds(r).includes('lepto'))
    .map((r) => new Date(`${r.vaccinationDate}T00:00:00`))
    .sort((a, b) => a.getTime() - b.getTime());

  const birthday = new Date(`${data.birthday}T00:00:00`);
  const ageWeeks = Math.floor(data.ageDays / 7);
  const lastCore = coreDoses.length ? coreDoses[coreDoses.length - 1] : null;
  const eligibleTiter = data.tests.some((t) => {
    if (!t.targets.includes('CORE') || t.result !== 'PASS') return false;
    const at = new Date(`${t.testedAt}T00:00:00`);
    if (at.getTime() < addDays(birthday, 140).getTime()) return false;
    if (lastCore && at.getTime() < lastCore.getTime() + 28 * DAY) return false;
    return true;
  });

  // I1: 计划里不出现完全相同的两行
  const seen = new Map<string, number>();
  for (const row of plan) {
    const key = `${row.kind}|${row.label}|${row.windowStart}|${row.windowEnd}|${row.status}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  if (duplicates.length) {
    addViolation({
      rule: 'I1',
      title: '计划里出现完全相同的两行',
      detail: duplicates.map(([key]) => key).join(' / '),
      input,
      rows: rowsText(plan),
    });
  }

  // I5: next 必须在 plan 里（或为空）
  if (view.next && !plan.some((row) => row.key === view.next?.key)) {
    addViolation({
      rule: 'I5',
      title: '下一针不在计划列表里',
      detail: view.next.key,
      input,
      rows: rowsText(plan),
    });
  }

  // I6: 抗体合格只该有一个核心行（一个“复查”），不能多行
  const titerRows = plan.filter((row) => row.kind === 'core' && row.titer);
  if (titerRows.length > 1) {
    addViolation({
      rule: 'I6',
      title: '抗体替代后核心出现多行',
      detail: `${titerRows.length} 行`,
      input,
      rows: rowsText(plan),
    });
  }

  // I2: 16 周完成首免、没打 26 周、没合格抗体、已满 26 周 → 必须有 26 周补强/补一针
  const hasDose16 = coreDoses.some(
    (d) => d.getTime() >= addDays(birthday, 112).getTime(),
  );
  const hasDose26 = coreDoses.some(
    (d) => d.getTime() >= addDays(birthday, 182).getTime(),
  );
  if (ageWeeks >= 26 && hasDose16 && !hasDose26 && !eligibleTiter) {
    const covered = plan.some(
      (row) =>
        row.kind === 'core' &&
        (row.key === 'core-26w' ||
          /26 周|补一针/.test(row.label)),
    );
    if (!covered) {
      addViolation({
        rule: 'I2',
        title: '16 周完成首免、没打 26 周补强、已满 26 周 → 计划里没有补强/补一针',
        detail: '1% 兜底被漏掉',
        input,
        rows: rowsText(plan),
      });
    }
  }

  // I3: ≥16 周、没有 ≥16 周一针、没有合格抗体 → 不应出现“第 N 针”首免
  if (ageWeeks >= 16 && !hasDose16 && !eligibleTiter) {
    const puppyStep = plan.find(
      (row) => row.kind === 'core' && /^第 \d+ 针$/.test(row.label),
    );
    const catchUp = plan.some(
      (row) => row.kind === 'core' && /补一针/.test(row.label),
    );
    if (puppyStep && !catchUp) {
      addViolation({
        rule: 'I3',
        title: '≥16 周晚起步仍套“第 N 针”首免',
        detail: `${puppyStep.label} / ${puppyStep.windowStart}${puppyStep.missedWindowStart ? ` (原${puppyStep.missedWindowStart})` : ''}`,
        input,
        rows: rowsText(plan),
      });
    }
  }

  // I4: 钩端最后一针发生在 ≥18 个月的空档之后 → 必须有“重启”
  if (leptoDoses.length >= 2) {
    const last = leptoDoses[leptoDoses.length - 1];
    const prev = leptoDoses[leptoDoses.length - 2];
    if (daysBetween(prev, last) >= 548) {
      const restart = plan.some(
        (row) =>
          row.kind === 'lepto' &&
          (row.key.startsWith('lepto-restart') || /重启/.test(row.label)),
      );
      if (!restart) {
        addViolation({
          rule: 'I4',
          title: '钩端上一针在 ≥18 个月空档之后 → 计划里没有重启',
          detail: `上一针 ${dateText(prev)}，最后一针 ${dateText(last)}`,
          input,
          rows: rowsText(plan),
        });
      }
    }
  }
}

const lines: string[] = [];
lines.push('# 疫苗不变量审计（B0.7 初版 · 2026-10-29）');
lines.push('');
lines.push(
  `> 随机历史 **${CASES}** 个（seed ${SEED}），跑现有排期引擎，断言 6 条不变量。`,
);
lines.push('> 这不是“找某个日期错”，而是“规则被破坏”。只读，不改代码。');
lines.push('');
lines.push('## 违反统计');
lines.push('');
lines.push('| 不变量 | 违反数 | 说明 |');
lines.push('|---|---|---|');
const titles: Record<string, string> = {
  I1: '计划里不出现完全相同的两行',
  I2: '16 周完成首免 → 26 周补强/补一针不能被漏',
  I3: '≥16 周晚起步 → 不能套 6~8 周第 N 针',
  I4: '钩端 ≥18 个月空档 → 必须重启',
  I5: '下一针必须在计划里',
  I6: '抗体替代只该有一个核心行',
};
for (const rule of ['I1', 'I2', 'I3', 'I4', 'I5', 'I6']) {
  lines.push(`| ${rule} | ${counts[rule] ?? 0} | ${titles[rule]} |`);
}
lines.push('');

if (violations.length === 0) {
  lines.push('首轮没有发现违反（不代表没有问题，只代表这 500 个随机历史没撞到）。');
} else {
  lines.push('## 示例（每条最多 3 个）');
  lines.push('');
  for (const v of violations) {
    lines.push(`### ${v.rule} · ${v.title}`);
    lines.push('');
    lines.push(`- 输入：${v.input}`);
    lines.push(`- 违反：${v.detail}`);
    lines.push(`- 计划：${v.rows}`);
    lines.push('');
  }
}

lines.push('---');
lines.push('');
lines.push(
  '> 这 6 条只是第一版；B0.7 还会补“决定不漂移、字段唯一真相、同日多份抗体”等不变量。' +
    '违反数不是“bug 数”，而是“规则被破坏的次数”；同一个根因会在很多随机历史里重复出现。',
);

const out = path.resolve(
  __dirname,
  '../../docs/plans/2026-10-29-vaccine-invariant-audit.md',
);
fs.writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
console.log(`invariant audit written: ${CASES} cases -> ${out}`);
console.log(JSON.stringify(counts, null, 2));
