/**
 * Production ingredient writer for the semi-automatic ingredient workflow.
 *
 * Writes a confirmed draft into the production database through the same
 * admin API the admin web uses (https://api.sevenkitchen.cloud/api/v1).
 * Defaults to a dry-run plan; pass --confirm to actually write.
 *
 * Usage (from backend/):
 *   node -r ts-node/register -r tsconfig-paths/register \
 *     ../skills/adding-standard-ingredients/scripts/apply-production-ingredient.ts \
 *     --draft ../.standard-ingredient-import/amaranth.draft.json \
 *     [--credentials-env .env.ingredient-agent.local] [--confirm]
 */

interface ApplyCliArgs {
  draft?: string;
  credentialsEnv?: string;
  confirm?: boolean;
  baseUrl?: string;
  help?: boolean;
}

interface DraftV1 {
  version: 1;
  summary: {
    name: string;
    nameEn?: string | null;
    type: 'FOOD' | 'SUPPLEMENT';
    state?: string | null;
    coveragePercent?: number | null;
    missingNutrients?: string[];
    evidenceNotes?: string | null;
    notesForUser?: string | null;
  };
  ingredient: Record<string, unknown>;
  nutritionFood?: Record<string, unknown> | null;
  mapping?: { isPrimary?: boolean; yieldRate?: number; notes?: string | null } | null;
  procurementSku?: Record<string, unknown> | null;
  tags?: { id?: string; name?: string }[] | null;
}

const USAGE = `
Usage:
  node -r ts-node/register -r tsconfig-paths/register ../skills/adding-standard-ingredients/scripts/apply-production-ingredient.ts \
    --draft <draft.json> [--credentials-env .env.ingredient-agent.local] [--confirm] [--base-url https://api.sevenkitchen.cloud/api/v1]
`;

const DEFAULT_BASE_URL = 'https://api.sevenkitchen.cloud/api/v1';
const PRODUCTION_HOST = 'api.sevenkitchen.cloud';

interface ApiClient {
  get(path: string): Promise<{ status: number; body: any }>;
  post(path: string, payload: unknown): Promise<{ status: number; body: any }>;
  patch(path: string, payload: unknown): Promise<{ status: number; body: any }>;
}

function parseArgs(): ApplyCliArgs {
  const args: ApplyCliArgs = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i += 1) {
    const flag = raw[i];
    if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else if (flag === '--confirm') {
      args.confirm = true;
    } else if (flag.startsWith('--')) {
      const key = flag
        .slice(2)
        .replace(/-([a-z])/g, (_m, c) => c.toUpperCase()) as keyof ApplyCliArgs;
      (args as Record<string, string | boolean | undefined>)[key] = raw[i + 1];
      i += 1;
    }
  }
  return args;
}

async function readJsonFile<T>(path: string): Promise<T> {
  const fs = require('fs') as typeof import('fs');
  const content = await fs.promises.readFile(path, 'utf8');
  return JSON.parse(content) as T;
}

async function loadCredentials(credentialsEnv: string): Promise<{
  username: string;
  password: string;
}> {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const file = path.isAbsolute(credentialsEnv)
    ? credentialsEnv
    : path.join(process.cwd(), credentialsEnv);
  const content = await fs.promises.readFile(file, 'utf8');
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    values[trimmed.slice(0, separatorIndex).trim()] = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  const username = values.ADMIN_USERNAME ?? values.USERNAME;
  const password = values.ADMIN_PASSWORD ?? values.PASSWORD;
  if (!username || !password) {
    throw new Error(
      `凭据文件 ${file} 缺少 ADMIN_USERNAME / ADMIN_PASSWORD（或 USERNAME / PASSWORD）。`,
    );
  }
  return { username, password };
}

function createApiClient(baseUrl: string, token: string | null): ApiClient {
  async function request(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    payload?: unknown,
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  }

  return {
    get: (path) => request('GET', path),
    post: (path, payload) => request('POST', path, payload),
    patch: (path, payload) => request('PATCH', path, payload),
  };
}

function assertDraftShape(draft: unknown): DraftV1 {
  if (
    typeof draft !== 'object' ||
    draft === null ||
    (draft as any).version !== 1 ||
    typeof (draft as any).ingredient !== 'object' ||
    typeof (draft as any).summary !== 'object'
  ) {
    throw new Error(
      '草稿格式错误：需要 version=1、summary、ingredient 字段。请按资产模板生成草稿。',
    );
  }
  return draft as DraftV1;
}

async function findExactDuplicates(
  api: ApiClient,
  draft: DraftV1,
): Promise<any[]> {
  const response = await api.get('/admin/ingredients');
  if (response.status !== 200 || !Array.isArray(response.body?.data)) {
    throw new Error(
      `查询已有原料失败（HTTP ${response.status}）：${JSON.stringify(response.body)?.slice(0, 200)}`,
    );
  }
  const list = response.body.data as any[];
  const target = draft.ingredient as {
    name?: string;
    brand?: string | null;
    productModel?: string | null;
  };
  const exactName = (target.name ?? '').trim().toLowerCase();
  return list.filter((item: any) => {
    const sameName = (item.name ?? '').trim().toLowerCase() === exactName;
    if (!sameName) {
      return false;
    }
    if (target.brand) {
      return (item.brand ?? '').toLowerCase() === target.brand!.toLowerCase();
    }
    if (item.brand) {
      return false;
    }
    const sameModel =
      (item.productModel ?? '').toLowerCase() ===
      (target.productModel ?? '').toLowerCase();
    return sameModel;
  });
}

const CATEGORY_ENUM: Record<string, string> = {
  肉: 'MEAT',
  肉类: 'MEAT',
  猪肉: 'MEAT',
  牛肉: 'MEAT',
  羊肉: 'MEAT',
  鸡肉: 'MEAT',
  鸭肉: 'MEAT',
  禽肉: 'MEAT',
  内脏: 'ORGAN',
  器官: 'ORGAN',
  海鲜: 'SEAFOOD',
  水产: 'SEAFOOD',
  鱼: 'SEAFOOD',
  虾: 'SEAFOOD',
  贝类: 'SEAFOOD',
  蔬菜: 'VEGETABLE',
  水果: 'FRUIT',
  谷物: 'GRAIN',
  谷类: 'GRAIN',
  粮食: 'GRAIN',
  乳制品: 'DAIRY',
  奶制品: 'DAIRY',
  蛋: 'EGG',
  蛋类: 'EGG',
  油: 'OIL',
  油脂: 'OIL',
  补剂: 'SUPPLEMENT',
  补充剂: 'SUPPLEMENT',
  其他: 'OTHER',
  其它: 'OTHER',
};

const CATEGORY_ENUM_VALUES = new Set([
  'MEAT',
  'ORGAN',
  'SEAFOOD',
  'VEGETABLE',
  'FRUIT',
  'GRAIN',
  'DAIRY',
  'EGG',
  'OIL',
  'SUPPLEMENT',
  'OTHER',
]);

function normalizeCategory(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const text = value.trim();
  const upper = text.toUpperCase();
  if (CATEGORY_ENUM_VALUES.has(upper)) {
    return upper;
  }
  return CATEGORY_ENUM[text] ?? CATEGORY_ENUM[upper] ?? null;
}

function normalizeDraftForWrite(draft: DraftV1): DraftV1 {
  const ingredient = { ...draft.ingredient };
  if (typeof ingredient.baseUnit === 'string') {
    ingredient.baseUnit = (ingredient.baseUnit as string).toUpperCase();
  }
  if (typeof ingredient.type === 'string') {
    ingredient.type = (ingredient.type as string).toUpperCase() as any;
  }
  if (
    ingredient.type === 'SUPPLEMENT' &&
    typeof (ingredient as any).procurementSkus === 'object'
  ) {
    delete (ingredient as any).procurementSkus;
  }
  const nutritionFood = draft.nutritionFood
    ? {
        ...draft.nutritionFood,
        category:
          normalizeCategory((draft.nutritionFood as any).category) ??
          (draft.nutritionFood as any).category,
      }
    : draft.nutritionFood;
  return { ...draft, ingredient, nutritionFood };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help || !args.draft) {
    console.error(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const baseUrl = (args.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const isProduction = baseUrl.includes(PRODUCTION_HOST);
  if (isProduction && !args.confirm) {
    console.log('⚠️  目标为正式环境。当前为预演模式（不会写入）。确认无误后加 --confirm 再执行。');
  }

  const credentialsEnv = args.credentialsEnv ?? '.env.ingredient-agent.local';
  const credentials = await loadCredentials(credentialsEnv);
  const draft = normalizeDraftForWrite(
    assertDraftShape(await readJsonFile<unknown>(args.draft!)),
  );

  const anonymousApi = createApiClient(baseUrl, null);
  // 后台登录路由在历史版本间有差异：admin web 使用 /auth/login，
  // 部分后端版本使用 /auth/admin-login。先试前者，失败再回退。
  let login = await anonymousApi.post('/auth/login', credentials);
  if (login.status !== 200 && login.status !== 201) {
    login = await anonymousApi.post('/auth/admin-login', credentials);
  }
  if (login.status !== 200 && login.status !== 201) {
    throw new Error(
      `正式后台登录失败（HTTP ${login.status}）：${JSON.stringify(login.body)?.slice(0, 200)}`,
    );
  }
  const token =
    login.body?.data?.token ?? login.body?.token ?? login.body?.accessToken;
  if (!token) {
    throw new Error('登录成功但未返回 token，请检查账号权限。');
  }
  console.log(`✅ 已登录正式后台（${baseUrl}）`);

  const api = createApiClient(baseUrl, token);

  const duplicates = await findExactDuplicates(api, draft);
  if (duplicates.length > 0) {
    const names = duplicates
      .map((d: any) => `${d.name}${d.brand ? `（${d.brand}）` : ''} id=${d.id}`)
      .join('；');
    throw new Error(`查重未通过：正式库已存在同款原料：${names}。已停止，未写入任何数据。`);
  }
  console.log('✅ 查重通过：正式库无同名/同品牌/同规格原料。');

  const plan = [
    `1) 新增原料：${draft.summary.name}（${draft.summary.type}）`,
    draft.nutritionFood
      ? `2) 新增营养档案并设为主档案（状态=待验证）`
      : '2) 不创建营养档案（营养待补，后续补充）',
    draft.procurementSku
      ? `3) 新增采购 SKU：${(draft.procurementSku as any).name ?? ''}`
      : '3) 不创建采购 SKU',
  ];
  console.log('');
  console.log('—— 写入计划 ——');
  plan.forEach((line) => console.log(line));
  console.log('');

  if (!args.confirm) {
    console.log('预演结束：未写入任何数据。');
    return;
  }

  const created: Record<string, string> = {};
  try {
    const ingredientResponse = await api.post('/admin/ingredients', draft.ingredient);
    if (ingredientResponse.status !== 200 && ingredientResponse.status !== 201) {
      throw new Error(
        `创建原料失败（HTTP ${ingredientResponse.status}）：${JSON.stringify(ingredientResponse.body)?.slice(0, 300)}`,
      );
    }
    const ingredientId =
      ingredientResponse.body?.data?.id ??
      (ingredientResponse.body?.data?.ingredient?.id as string | undefined);
    if (!ingredientId) {
      throw new Error('创建原料成功但未返回 ID，请人工检查正式后台。');
    }
    created.ingredientId = ingredientId;
    console.log(`✅ 已创建原料：${draft.summary.name}（id=${ingredientId}）`);

    if (draft.nutritionFood) {
      const nutritionFoodResponse = await api.post('/nutrition-foods', draft.nutritionFood);
      if (
        nutritionFoodResponse.status !== 200 &&
        nutritionFoodResponse.status !== 201
      ) {
        throw new Error(
          `创建营养档案失败（HTTP ${nutritionFoodResponse.status}）：${JSON.stringify(nutritionFoodResponse.body)?.slice(0, 300)}`,
        );
      }
      const nutritionFoodId =
        nutritionFoodResponse.body?.data?.id ??
        (nutritionFoodResponse.body?.data?.nutritionFood?.id as string | undefined);
      if (!nutritionFoodId) {
        throw new Error('创建营养档案成功但未返回 ID，请人工检查正式后台。');
      }
      created.nutritionFoodId = nutritionFoodId;
      console.log(`✅ 已创建营养档案（id=${nutritionFoodId}，状态=待验证）`);

      if (draft.mapping) {
        const mappingResponse = await api.post(
          `/nutrition-foods/${nutritionFoodId}/mappings`,
          {
            ingredientId,
            isPrimary: draft.mapping.isPrimary ?? true,
            yieldRate: draft.mapping.yieldRate ?? 1,
            notes: draft.mapping.notes ?? null,
          },
        );
        if (mappingResponse.status !== 200 && mappingResponse.status !== 201) {
          throw new Error(
            `营养档案映射失败（HTTP ${mappingResponse.status}）：${JSON.stringify(mappingResponse.body)?.slice(0, 300)}`,
          );
        }
        created.mapping = 'ok';
        console.log('✅ 营养档案已设为主档案');
      }
    }

    if (draft.procurementSku) {
      const skuResponse = await api.post(
        `/admin/ingredients/${ingredientId}/procurement-skus`,
        draft.procurementSku,
      );
      if (skuResponse.status !== 200 && skuResponse.status !== 201) {
        throw new Error(
          `采购 SKU 创建失败（HTTP ${skuResponse.status}）：${JSON.stringify(skuResponse.body)?.slice(0, 300)}`,
        );
      }
      created.procurementSku = 'ok';
      console.log('✅ 已创建采购 SKU');
    }

    const verify = await api.get(`/admin/ingredients/${ingredientId}`);
    if (verify.status !== 200) {
      console.warn(
        `⚠️ 写入完成但回读失败（HTTP ${verify.status}），请到后台原料页人工确认。`,
      );
    } else {
      const detail = verify.body?.data ?? {};
      console.log('✅ 回读验证通过。');
      console.log('');
      console.log('—— 完成 ——');
      console.log(`原料名称：${detail.name ?? draft.summary.name}`);
      console.log(`原料 ID：${ingredientId}`);
      console.log(`后台查看：https://admin.sevenkitchen.cloud（原料管理 → 搜索“${draft.summary.name}”）`);
    }
  } catch (error) {
    console.error('');
    console.error(`❌ 写入中断：${error instanceof Error ? error.message : error}`);
    if (created.ingredientId) {
      console.error(`已回滚说明：如需清理本次创建的原料（id=${created.ingredientId}），请在后台删除，或联系我执行清理。`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
