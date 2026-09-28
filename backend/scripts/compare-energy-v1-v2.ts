/**
 * 新旧能量算法影子对比（只读）
 *
 * 用法：
 *   npx ts-node scripts/compare-energy-v1-v2.ts /path/to/dogs_prod.csv
 *
 * 说明：
 *   · v1 = 现有 calculateDogEnergy（线上当前口径）
 *   · v2 = 按 FEDIAF 官方英文 2025 原版重构的 calculateDailyEnergyV2
 *   · 只读，不写数据库、不改任何线上行为
 *
 * 规格书：docs/plans/2026-09-28-energy-algorithm-v2-spec.md
 */
import { readFileSync } from 'fs';
import { Dog } from '../src/domain/dog/dog.entity';
import { DogBreed } from '../src/domain/dog/dog-breed.entity';
import {
  ActivityLevel,
  DogGender,
  DogSizeCategory,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from '../src/domain/dog/enums';
import { calculateDogEnergy } from '../src/domain/dog/dog-calc.service';
import { calculateDailyEnergyV2ForDog } from '../src/domain/dog/energy-v2';

interface Row {
  id: string;
  name: string;
  breedId: string;
  birthday: Date;
  isNeutered: boolean;
  currentWeightKg: number;
  bcsScore: number;
  activityLevel: ActivityLevel;
  lifeStageOverride: LifeStageOverride;
  sizeClassOverride: DogSizeCategory | null;
  treatInputMode: TreatInputMode;
  treatLevel: TreatLevel;
  sizeCategory: DogSizeCategory | null;
  averageAdultWeightKg: number | null;
  manualTreatKcal: number | null;
}

function parseCsv(path: string): Row[] {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const get = (key: string) => (cells[idx[key]] ?? '').trim();
    const num = (key: string): number | null => {
      const v = get(key);
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const birthday = new Date(get('birthday'));
    if (Number.isNaN(birthday.getTime())) continue;

    const weight = num('current_weight_kg');
    const bcs = num('bcs_score');
    if (weight === null || weight <= 0 || bcs === null) continue;

    const sizeOverride = get('size_class_override');
    const sizeCategory = get('size_category');

    rows.push({
      id: get('id'),
      name: get('name'),
      breedId: get('breed_id'),
      birthday,
      isNeutered: get('is_neutered') === 't' || get('is_neutered') === 'true',
      currentWeightKg: weight,
      bcsScore: bcs,
      activityLevel: (get('activity_level') || 'LOW') as ActivityLevel,
      lifeStageOverride: (get('life_stage_override') ||
        'NONE') as LifeStageOverride,
      sizeClassOverride: sizeOverride
        ? (sizeOverride as DogSizeCategory)
        : null,
      treatInputMode: (get('treat_input_mode') ||
        'ESTIMATE_LEVEL') as TreatInputMode,
      treatLevel: (get('treat_level') || 'LOW') as TreatLevel,
      sizeCategory: sizeCategory
        ? (sizeCategory as DogSizeCategory)
        : null,
      averageAdultWeightKg: num('average_adult_weight_kg'),
      manualTreatKcal: num('manual_treat_kcal'),
    });
  }
  return rows;
}

/** 处理带引号的 CSV 字段 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function buildDog(row: Row): Dog {
  return new Dog(
    row.id,
    'owner',
    row.name,
    row.breedId,
    null,
    row.birthday,
    DogGender.MALE,
    row.isNeutered,
    row.currentWeightKg,
    row.bcsScore,
    row.activityLevel,
    row.lifeStageOverride,
    row.sizeClassOverride,
    2,
    row.treatInputMode,
    row.treatLevel,
    // 生产库有 9 只选了「精确输入千卡」却没填数值；实体要求非空，
    // 这里按 0 传入以便对比能跑完（该问题本身已在审计报告中记录）
    row.treatInputMode === TreatInputMode.EXACT_KCAL
      ? (row.manualTreatKcal ?? 0)
      : row.manualTreatKcal,
    null,
    null,
    null,
    0,
  );
}

function buildBreed(row: Row): DogBreed | null {
  if (!row.sizeCategory) return null;
  const breed = Object.create(DogBreed.prototype) as DogBreed;
  (breed as any).sizeCategory = row.sizeCategory;
  (breed as any).averageAdultWeightKg = row.averageAdultWeightKg;
  return breed;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(Math.max(Math.floor((p / 100) * (sorted.length - 1)), 0), sorted.length - 1);
  return sorted[i];
}

function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('用法: npx ts-node scripts/compare-energy-v1-v2.ts <dogs.csv>');
    process.exit(1);
  }

  const rows = parseCsv(csvPath);
  const results: Array<{
    row: Row;
    v1: number;
    v2: number;
    pct: number;
    stage: string;
    weightBasisV2: number;
    idealWeight: number;
    bcs: number;
  }> = [];

  for (const row of rows) {
    const dog = buildDog(row);
    const breed = buildBreed(row);
    try {
      const v1 = calculateDogEnergy(dog, undefined, breed).finalFoodKcal;
      const r2 = calculateDailyEnergyV2ForDog(dog, breed);
      const v2 = r2.dailyEnergyKcal;
      if (!Number.isFinite(v1) || !Number.isFinite(v2) || v1 <= 0) continue;
      results.push({
        row,
        v1,
        v2,
        pct: (v2 / v1 - 1) * 100,
        stage: r2.stage,
        weightBasisV2: r2.rerBasisWeightKg,
        idealWeight: r2.idealWeightKg,
        bcs: row.bcsScore,
      });
    } catch {
      // 跳过无法计算的（与线上行为一致：混血缺体型会抛错）
    }
  }

  const pcts = results.map((r) => r.pct).sort((a, b) => a - b);
  const buckets = [
    { label: '降 >30%', test: (p: number) => p < -30 },
    { label: '降 20~30%', test: (p: number) => p >= -30 && p < -20 },
    { label: '降 10~20%', test: (p: number) => p >= -20 && p < -10 },
    { label: '降 0~10%', test: (p: number) => p >= -10 && p < -0.5 },
    { label: '基本不变 (±0.5%)', test: (p: number) => Math.abs(p) <= 0.5 },
    { label: '升 0~10%', test: (p: number) => p > 0.5 && p <= 10 },
    { label: '升 10~20%', test: (p: number) => p > 10 && p <= 20 },
    { label: '升 >20%', test: (p: number) => p > 20 },
  ];

  console.log('===== 新旧能量算法影子对比 =====');
  console.log(`样本：${results.length} 只（原始 ${rows.length} 行）`);
  console.log(`变化幅度：中位数 ${percentile(pcts, 50).toFixed(1)}%  ` +
    `P10 ${percentile(pcts, 10).toFixed(1)}%  P90 ${percentile(pcts, 90).toFixed(1)}%`);
  console.log('');
  console.log('--- 变化分布 ---');
  for (const b of buckets) {
    const n = results.filter((r) => b.test(r.pct)).length;
    console.log(
      `  ${b.label.padEnd(18)} ${String(n).padStart(5)} 只  ${((n / results.length) * 100).toFixed(1)}%`,
    );
  }

  console.log('');
  console.log('--- 按生命阶段 ---');
  const byStage = new Map<string, number[]>();
  for (const r of results) {
    if (!byStage.has(r.stage)) byStage.set(r.stage, []);
    byStage.get(r.stage)!.push(r.pct);
  }
  for (const [stage, list] of [...byStage.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = [...list].sort((a, b) => a - b);
    console.log(
      `  ${stage.padEnd(22)} ${String(list.length).padStart(5)} 只  中位 ${percentile(s, 50).toFixed(1)}%`,
    );
  }

  console.log('');
  console.log('--- 按体况分 ---');
  for (let bcs = 1; bcs <= 9; bcs += 1) {
    const list = results.filter((r) => r.bcs === bcs).map((r) => r.pct);
    if (list.length === 0) continue;
    const s = [...list].sort((a, b) => a - b);
    console.log(
      `  BCS ${bcs}  ${String(list.length).padStart(5)} 只  中位 ${percentile(s, 50).toFixed(1)}%`,
    );
  }

  console.log('');
  console.log('--- 按活动量 ---');
  const byAct = new Map<string, number[]>();
  for (const r of results) {
    const k = r.row.activityLevel;
    if (!byAct.has(k)) byAct.set(k, []);
    byAct.get(k)!.push(r.pct);
  }
  for (const [act, list] of [...byAct.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const s = [...list].sort((a, b) => a - b);
    console.log(
      `  ${act.padEnd(10)} ${String(list.length).padStart(5)} 只  中位 ${percentile(s, 50).toFixed(1)}%`,
    );
  }

  console.log('');
  console.log('--- 变化最大的 15 只（升）---');
  for (const r of [...results].sort((a, b) => b.pct - a.pct).slice(0, 15)) {
    console.log(
      `  ${r.row.name.slice(0, 8).padEnd(9)} ${r.row.currentWeightKg}kg BCS${r.bcs} ${r.row.activityLevel.padEnd(8)} ` +
        `${r.v1.toFixed(0)} → ${r.v2.toFixed(0)} kcal (${r.pct.toFixed(1)}%)  ${r.stage}`,
    );
  }
  console.log('');
  console.log('--- 变化最大的 15 只（降）---');
  for (const r of [...results].sort((a, b) => a.pct - b.pct).slice(0, 15)) {
    console.log(
      `  ${r.row.name.slice(0, 8).padEnd(9)} ${r.row.currentWeightKg}kg BCS${r.bcs} ${r.row.activityLevel.padEnd(8)} ` +
        `${r.v1.toFixed(0)} → ${r.v2.toFixed(0)} kcal (${r.pct.toFixed(1)}%)  ${r.stage}`,
    );
  }
}

main();
