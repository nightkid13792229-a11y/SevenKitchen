/**
 * 通用：给生产库的营养档案补字段，并把来源写进档案元数据。
 *
 * 产线背景：配方的能量用「犬用 Atwater」公式算，强制要求
 *   水分 / 粗蛋白 / 粗脂肪 / 灰分 / 膳食纤维
 * 任一食材缺任一项 → 该食材能量算不出 → 整份食谱能量为 null →
 * 所有「每1000千卡 / 每兆焦」口径的指标一起变「缺数据」。
 *
 * 用法（在 backend/ 下执行，默认预演）：
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     ../.standard-ingredient-import/youmaicai/patch-nutrition-field.ts \
 *     --patch ../.standard-ingredient-import/youmaicai/<patch>.json [--confirm]
 *
 * patch.json 结构见同目录 *.patch.json。
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

const BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';

interface FieldPatch {
  /** 字段路径，如 macros.fiber */
  path: string;
  value: number;
  /** 写入 meta.sourceForms[path] 的来源信息 */
  source: Record<string, unknown>;
  /** 写入 meta.conversionNotes[path] 的说明 */
  conversionNote: string;
}

interface NutritionPatch {
  nutritionFoodId: string;
  /** 人类可读的补数原因，追加到 notes */
  notesAppend: string;
  fields: FieldPatch[];
}

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

function setPath(target: Record<string, any>, path: string, value: unknown) {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]!] = value;
}

function getPath(target: Record<string, any>, path: string): unknown {
  return path.split('.').reduce<any>((acc, part) => (acc == null ? undefined : acc[part]), target);
}

async function main() {
  const patchArg = arg('patch');
  if (!patchArg) throw new Error('缺少 --patch <patch.json>');
  const patchPath = isAbsolute(patchArg) ? patchArg : join(process.cwd(), patchArg);
  const patch = JSON.parse(await readFile(patchPath, 'utf8')) as NutritionPatch;

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

  const res = await fetch(`${BASE_URL}/nutrition-foods/${patch.nutritionFoodId}`, { headers: auth });
  const body: any = await res.json();
  const food = body?.data;
  if (!food) throw new Error(`读取营养档案失败: ${JSON.stringify(body).slice(0, 200)}`);

  const profile = JSON.parse(JSON.stringify(food.nutritionData ?? {}));
  console.log(`档案: ${food.name}  status=${food.status}`);

  const pending = patch.fields.filter((f) => getPath(profile, f.path) == null);
  if (pending.length === 0) {
    console.log('所有目标字段都已有值，无需修改。');
    return;
  }

  const changes: string[] = [];
  for (const field of pending) {
    const before = getPath(profile, field.path);
    setPath(profile, field.path, field.value);
    setPath(profile, `meta.sourceForms.${field.path}`, field.source);
    setPath(profile, `meta.conversionNotes.${field.path}`, field.conversionNote);
    changes.push(`${field.path}: ${JSON.stringify(before)} → ${field.value}`);
  }

  const nextNotes = `${food.notes ? `${food.notes} ` : ''}${patch.notesAppend}`;

  console.log('');
  console.log('—— 修改计划 ——');
  changes.forEach((c) => console.log(`  ${c}`));

  if (!CONFIRM) {
    console.log('');
    console.log('预演结束：未写入。确认无误后加 --confirm。');
    return;
  }

  const p = await fetch(`${BASE_URL}/nutrition-foods/${patch.nutritionFoodId}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ nutritionData: profile, notes: nextNotes }),
  });
  const pb: any = await p.json();
  console.log(`HTTP ${p.status}  code=${pb?.code}  msg=${pb?.message}`);

  const v = await fetch(`${BASE_URL}/nutrition-foods/${patch.nutritionFoodId}`, { headers: auth });
  const vb: any = await v.json();
  const after = vb?.data?.nutritionData ?? {};
  let ok = true;
  for (const field of patch.fields) {
    const got = getPath(after, field.path);
    console.log(`复核 ${field.path} = ${JSON.stringify(got)}`);
    if (got !== field.value) ok = false;
  }
  console.log(`复核 status = ${vb?.data?.status}`);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
