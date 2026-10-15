/**
 * 只读调用正式后台接口，便于排查问题。
 *
 * 用法（在 backend/ 下执行）：
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     ../.standard-ingredient-import/youmaicai/prod-api-get.ts \
 *     --path /recipe-designer/drafts/<id>/assessment-inputs \
 *     [--credentials-env .env.ingredient-agent.local] [--out /tmp/out.json]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';

function arg(key: string): string | undefined {
  const i = process.argv.indexOf(`--${key}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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
  const path = arg('path');
  if (!path) throw new Error('缺少 --path');
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

  const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  const out = arg('out');
  if (out) {
    await writeFile(out, text, 'utf8');
    console.log(`已写入 ${out} (${text.length} 字节)`);
  }
  try {
    const parsed = JSON.parse(text);
    const data = parsed?.data ?? parsed;
    console.log(`顶层键: ${Object.keys(data ?? {}).join(', ')}`);
    if (Array.isArray(data?.targets)) console.log(`targets 数量: ${data.targets.length}`);
    if (Array.isArray(data?.items)) console.log(`items 数量: ${data.items.length}`);
    if (!out) console.log(JSON.stringify(parsed, null, 2).slice(0, 3000));
  } catch {
    console.log(text.slice(0, 1000));
  }
}

main().catch((e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
