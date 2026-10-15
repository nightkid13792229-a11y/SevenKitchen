/**
 * 把生产库的营养档案从「待验证」转「已验证」。
 * 默认预演（只读状态）；加 --confirm 才真正调用 PATCH /nutrition-foods/:id/verify。
 *
 * 用法（在 backend/ 下执行）：
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     ../.standard-ingredient-import/youmaicai/verify-nutrition-food.ts \
 *     --id <nutritionFoodId> [--credentials-env .env.ingredient-agent.local] [--confirm]
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
  if (!username || !password) throw new Error(`${envFile} 缺少 ADMIN_USERNAME / ADMIN_PASSWORD`);
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
  if (!login.ok) throw new Error(`登录失败 HTTP ${login.status}`);
  const loginBody: any = await login.json();
  const token = loginBody?.data?.token ?? loginBody?.token ?? loginBody?.accessToken;
  if (!token) throw new Error('登录成功但未返回 token');
  console.log('✅ 已登录正式后台');

  const before = await fetch(`${BASE_URL}/nutrition-foods/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const beforeBody: any = await before.json();
  const b = beforeBody?.data ?? {};
  console.log(`当前状态: ${b.name} → status=${b.status}`);

  if (!CONFIRM) {
    console.log('预演结束：未做任何修改。确认无误后加 --confirm。');
    return;
  }
  if (b.status === 'VERIFIED') {
    console.log('已经是 VERIFIED，无需重复操作。');
    return;
  }

  const res = await fetch(`${BASE_URL}/nutrition-foods/${id}/verify`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  const body: any = await res.json();
  console.log(`HTTP ${res.status}  code=${body?.code}  msg=${body?.message}`);
  const d = body?.data ?? {};
  console.log(`结果: name=${d.name}  status=${d.status}  verifiedAt=${d.verifiedAt}  verifiedBy=${d.verifiedBy}`);
  if (d.status !== 'VERIFIED') process.exit(1);
}

main().catch((e) => {
  console.error('❌', e instanceof Error ? e.message : e);
  process.exit(1);
});
