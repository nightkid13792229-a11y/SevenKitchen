/**
 * 修复：给「油麦菜」营养档案补上 macros.fiber（膳食纤维）。
 *
 * 为什么必须补：配方的能量用「犬用 Atwater」公式算，强制要求 5 个字段
 *   （水分 / 粗蛋白 / 粗脂肪 / 灰分 / 膳食纤维）。
 * CFCT 第六版第一册没有测油麦菜的膳食纤维（书上印「—」），
 * 于是该原料能量 = null → 整份食谱能量 = null →
 * 所有「每1000千卡 / 每兆焦」口径的指标全部变「缺数据」。
 *
 * 取值：USDA FDC 169990（Celtuce, raw）Fiber, total dietary = 1.7 g/100g，
 * 与档案里其他氨基酸字段同一处理方式（同种莴苣借用 + 逐字段标注来源）。
 *
 * 默认预演；加 --confirm 才写入。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';

function arg(key: string): string | undefined {
  const i = process.argv.indexOf(`--${key}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const CONFIRM = process.argv.includes('--confirm');

async function loadCredentials(envFile: string) {
  const text = await readFile(join(process.cwd(), envFile), 'utf8');
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) values[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  const username = values.ADMIN_USERNAME ?? values.USERNAME;
  const password = values.ADMIN_PASSWORD ?? values.PASSWORD;
  if (!username || !password) throw new Error(`${envFile} 缺少凭据`);
  return { username, password };
}

async function main() {
  const id = arg('id');
  if (!id) throw new Error('缺少 --id <nutritionFoodId>');
  const credentials = await loadCredentials(arg('credentials-env') ?? '.env.ingredient-agent.local');

  let login = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!login.ok) {
    login = await fetch(`${BASE_URL}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  }
  const lb: any = await login.json();
  const token = lb?.data?.token ?? lb?.token ?? lb?.accessToken;
  if (!token) throw new Error('登录失败');
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  console.log('✅ 已登录正式后台');

  const res = await fetch(`${BASE_URL}/nutrition-foods/${id}`, { headers: auth });
  const body: any = await res.json();
  const food = body?.data;
  if (!food) throw new Error(`读取营养档案失败: ${JSON.stringify(body).slice(0, 200)}`);

  const profile = JSON.parse(JSON.stringify(food.nutritionData ?? {}));
  console.log(`档案: ${food.name}  status=${food.status}`);
  console.log(`当前 macros.fiber = ${JSON.stringify(profile?.macros?.fiber)}`);

  if (profile?.macros?.fiber != null) {
    console.log('已经有膳食纤维数据，无需修改。');
    return;
  }

  profile.macros.fiber = 1.7;
  profile.meta ??= {};
  profile.meta.sourceForms ??= {};
  profile.meta.sourceForms['macros.fiber'] = {
    basisType: 'PER_100_G',
    originalUnit: 'G',
    canonicalUnit: 'g',
    originalValue: 1.7,
    canonicalValue: 1.7,
    sourceNutrientId: 1079,
    sourceNutrientName: 'Fiber, total dietary',
    supplementalSource: true,
    supplementalFrom: 'USDA:169990 (Celtuce, raw)',
    supplementalReason:
      'CFCT 第六版第一册未检测油麦菜的膳食纤维；犬用 Atwater 能量计算强制要求该字段，缺则整份食谱能量算不出。',
  };
  profile.meta.conversionNotes ??= {};
  profile.meta.conversionNotes['macros.fiber'] =
    'CFCT 第六版第一册 p74 油麦菜「不溶性膳食纤维」列为「—」（未检测）。' +
    '该字段是犬用 Atwater 能量计算的必填项，缺失会导致整份食谱能量与所有「每1000千卡」口径指标无法计算。' +
    '取同种莴苣 USDA FDC 169990（Celtuce, raw）Fiber, total dietary = 1.7 g/100g 补齐，并在此标注来源。';

  const nextNotes = `${food.notes ? `${food.notes} ` : ''}【2026-10-16 补】膳食纤维 1.7 g/100g 取自 USDA FDC 169990（同种莴苣，CFCT 未检测），用于满足犬用 Atwater 能量计算的必填字段。`;

  console.log('');
  console.log('—— 修改计划 ——');
  console.log('  macros.fiber: null → 1.7');
  console.log('  meta.sourceForms["macros.fiber"] 标注来源 USDA 1079');
  console.log('  notes 追加补数说明');

  if (!CONFIRM) {
    console.log('');
    console.log('预演结束：未写入。确认无误后加 --confirm。');
    return;
  }

  const patch = await fetch(`${BASE_URL}/nutrition-foods/${id}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ nutritionData: profile, notes: nextNotes }),
  });
  const pb: any = await patch.json();
  console.log(`HTTP ${patch.status}  code=${pb?.code}  msg=${pb?.message}`);

  const verify = await fetch(`${BASE_URL}/nutrition-foods/${id}`, { headers: auth });
  const vb: any = await verify.json();
  const v = vb?.data ?? {};
  console.log(`复核: fiber=${JSON.stringify(v?.nutritionData?.macros?.fiber)}  status=${v.status}`);
  if (v?.nutritionData?.macros?.fiber !== 1.7) process.exit(1);
}

main().catch((e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
