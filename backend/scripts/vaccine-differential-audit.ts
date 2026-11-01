/**
 * B0.7 · 两套算法差异测试（#4 的“先测”）
 *
 * 背景：窗口由 materializeSteps 算，状态由 matchRecords 算；两套各用一遍认领。
 * 这里不重写引擎，只做“窗口一致性”检查：
 *   对每个“已完成”的步骤，命中的那一针应该落在它自己的窗口内；
 *   如果超出窗口，只允许两种合法情况：
 *     1) 这是该类的第一步（历史原因允许很晚的第一针）；
 *     2) 超出不超过 4 周（宽限期）。
 *   其余情况 → 两套算法对不上。
 *
 * 只读；跑法：cd backend && npx ts-node -r tsconfig-paths/register scripts/vaccine-differential-audit.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  matchRecords,
  materializeSteps,
} from '../src/domain/health/vaccine/engine';
import {
  classifyRecordKinds,
  kindsOfComponents,
} from '../src/domain/health/vaccine/products';

const TODAY = new Date('2026-10-30T00:00:00');
const DAY = 86400000;
const CASES = 1000;
const SEED = 20261030;

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

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
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

function generate(index: number): { birthday: string; records: Rec[] } {
  const ageDays = int(30, 7000);
  const birthdayDate = addDays(TODAY, -ageDays);
  const records: Rec[] = [];
  const count = int(0, 8);
  for (let i = 0; i < count; i += 1) {
    const name = pick(
      rnd() < 0.6
        ? CORE_NAMES
        : rnd() < 0.5
          ? LEPTO_NAMES
          : rnd() < 0.5
            ? RABIES_NAMES
            : OTHER_NAMES,
    );
    const offset = int(0, Math.min(ageDays, 2500));
    let date = addDays(birthdayDate, offset);
    if (rnd() < 0.12) date = addDays(TODAY, int(1, 60));
    const components = rnd() < 0.4 ? randomComponents() : undefined;
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
  return { birthday: dateText(birthdayDate), records };
}

const violations: Array<{
  kind: string;
  detail: string;
  input: string;
}> = [];
let doneCount = 0;

for (let i = 0; i < CASES; i += 1) {
  const data = generate(i);
  const birthday = new Date(`${data.birthday}T00:00:00`);
  const steps = materializeSteps({
    birthday,
    records: data.records as never,
    today: TODAY,
  });
  const matched = matchRecords(steps, data.records as never, { today: TODAY });
  const byKey = new Map(steps.map((step) => [step.key, step]));

  const firstByKind = new Map<string, string>();
  for (const kind of new Set(steps.map((step) => step.kind))) {
    const list = steps
      .filter((step) => step.kind === kind)
      .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());
    if (list[0]) firstByKind.set(kind, list[0].key);
  }

  for (const step of matched) {
    if (step.status !== 'DONE' || !step.matchedRecordDate) continue;
    doneCount += 1;
    const base = byKey.get(step.key);
    if (!base) {
      violations.push({
        kind: step.kind,
        detail: 'DONE 步骤在 materialize 里找不到',
        input: `${data.birthday} ${data.records.map((r) => `${r.vaccinationDate} ${r.vaccineName}`).join('、')}`,
      });
      continue;
    }
    const date = step.matchedRecordDate.getTime();
    const start = base.windowStart.getTime();
    const end = base.windowEnd.getTime();
    const isFirst = firstByKind.get(step.kind) === step.key;
    const allowed =
      (date >= start && date <= end) ||
      (date > end && (isFirst || date <= end + 28 * DAY));
    if (!allowed) {
      violations.push({
        kind: step.kind,
        detail: `${step.key} 窗口 ${dateText(base.windowStart)}~${dateText(base.windowEnd)}，命中 ${dateText(step.matchedRecordDate)}${isFirst ? '（第一步）' : ''}`,
        input: `${data.birthday} ${data.records.map((r) => `${r.vaccinationDate} ${r.vaccineName}${r.components ? `[${r.components.join(',')}]` : ''}`).join('、')}`,
      });
    }
  }
}

const lines: string[] = [];
lines.push('# 两套算法差异测试（#4 · 2026-10-30）');
lines.push('');
lines.push(`> 随机历史 **${CASES}** 个（seed ${SEED}）；其中“已完成”步骤 **${doneCount}** 个。`);
lines.push('> 检查：每个“已完成”的命中日，是否落在它自己的窗口内（允许第一步很晚 / 宽限 4 周）。');
lines.push('');
lines.push('## 结果');
lines.push('');
lines.push(`- 窗口不一致：**${violations.length}** 个`);
lines.push(`- 不一致比例：${doneCount ? ((violations.length / doneCount) * 100).toFixed(2) : '0'}%`);
lines.push('');
if (violations.length) {
  lines.push('## 示例（最多 5 个）');
  lines.push('');
  for (const v of violations.slice(0, 5)) {
    lines.push(`- **${v.kind}**：${v.detail}`);
    lines.push(`  - 输入：${v.input}`);
  }
} else {
  lines.push('首轮没有发现“窗口和命中日对不上”的情况。');
  lines.push('');
  lines.push('这不等于 #4 完全没问题，但至少说明：在这 1000 个随机历史里，两套算法给出的窗口/命中是一致的。下一步可把这条检查留作守门员。');
}

const out = path.resolve(
  __dirname,
  '../../docs/plans/2026-10-30-vaccine-differential-audit.md',
);
fs.writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
console.log(`differential audit written: ${CASES} cases, ${doneCount} done, ${violations.length} violations -> ${out}`);
