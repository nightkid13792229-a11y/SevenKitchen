/**
 * 食谱定制 · 顾客端接口走查（HTTP 层，2026-10-16）
 *
 * ## 与 `acceptance-custom-recipe.ts` 的区别
 *
 * 那个走的是**服务层**（直接调 Service），证明的是"业务逻辑通"。
 * 这个走的是**HTTP 接口层**，用的是小程序真实调的那几个地址 ——
 * 证明的是"顾客在手机上点，拿到的东西是对的"。
 *
 * 两者都要有，因为它们会漏不同的东西：
 *   · 服务层过了、接口层挂了：控制器装配错（比如渲染契约没拼上）
 *   · 接口层过了、页面还是错：前端读错字段（这要另验）
 *
 * ## 它重点验什么
 *
 * **渲染契约**。顾客端页面（订单列表 / 详情 / 交付 / 售后）都不该自己判断
 * "这单能不能确认收货""售后能不能撤回" —— 这些必须由后端算好下发。
 * 所以这里把每个接口返回的 `renderable` 打出来看。
 *
 * ## 怎么跑
 *
 * ```bash
 * # 需要本地后端已在 3011 跑着，且 ALLOW_DEV_AUTH=true
 * npx ts-node -r tsconfig-paths/register --transpile-only scripts/acceptance-customer-api.ts
 * ```
 */
import { execFileSync } from 'child_process';

const BASE = process.env.ACCEPTANCE_BASE_URL ?? 'http://127.0.0.1:3011/api/v1';
/** 开发态身份头（只在 ALLOW_DEV_AUTH=true 时生效） */
const CUSTOMER_ID = process.env.ACCEPTANCE_CUSTOMER_ID ?? 'u-d';

let stepNo = 0;
function step(title: string) {
  stepNo += 1;
  console.log('');
  console.log('─'.repeat(64));
  console.log(`第 ${stepNo} 步 · ${title}`);
  console.log('─'.repeat(64));
}

function say(label: string, value: unknown) {
  console.log(`  ${label}：${typeof value === 'string' ? value : JSON.stringify(value)}`);
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<any> {
  const args = [
    '-s',
    '-m',
    '25',
    '-X',
    method,
    '-H',
    'Content-Type: application/json',
    '-H',
    `X-Customer-Id: ${CUSTOMER_ID}`,
    `${BASE}${path}`,
  ];
  if (body !== undefined) {
    args.push('-d', JSON.stringify(body));
  }

  const raw = execFileSync('curl', args, { encoding: 'utf8' });
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`接口返回的不是 JSON：${raw.slice(0, 200)}`);
  }
}

function unwrap(res: any, label: string) {
  if (res?.code !== 0) {
    console.log(`  ✗ ${label} 返回错误：${res?.code} ${res?.message}`);
    return null;
  }
  return res.data;
}

/** 把渲染契约打成人看得懂的样子 */
function showRenderable(renderable: any, indent = '  ') {
  if (!renderable) {
    console.log(`${indent}（没有渲染契约 —— 页面得自己判断，这是不对的）`);
    return;
  }
  if (renderable.status) {
    console.log(
      `${indent}状态：${renderable.status.label}（色调 ${renderable.status.tone ?? '无'}）`,
    );
  }
  if (Array.isArray(renderable.progress)) {
    console.log(
      `${indent}进度：${renderable.progress.map((p: any) => `${p.label}${p.reached ? '✓' : '·'}`).join(' → ')}`,
    );
  }
  if (Array.isArray(renderable.actions)) {
    if (renderable.actions.length === 0) {
      console.log(`${indent}可点的按钮：无`);
    } else {
      for (const a of renderable.actions) {
        console.log(
          `${indent}按钮「${a.label}」${a.enabled ? '' : `（灰的：${a.disabledReason ?? '未说明'}）`}${a.isPrimary ? ' [主按钮]' : ''}`,
        );
      }
    }
  }
}

async function main() {
  console.log('');
  console.log('食谱定制 · 顾客端接口走查（HTTP 层）');
  console.log(`地址：${BASE}`);
  console.log(`身份：${CUSTOMER_ID}（开发态）`);

  step('顾客打开「我的定制订单」');
  const list = unwrap(await call('GET', '/custom-recipe/my-orders'), '订单列表');
  if (!list) return;
  const orders = list.items ?? list.orders ?? list ?? [];
  say('订单数', Array.isArray(orders) ? orders.length : '（结构不符）');
  if (!Array.isArray(orders) || orders.length === 0) {
    console.log('');
    console.log('这个顾客名下没有定制订单。换一个 ACCEPTANCE_CUSTOMER_ID 再试。');
    return;
  }

  const first = orders[0];
  say('第一单', first.orderId ?? first.orderNo ?? '(无单号)');
  say('  顾客看到的状态', first.statusLabel ?? first.renderable?.status?.label ?? '(缺状态文案)');
  say('  渲染契约里的按钮', (first.renderable?.actions ?? []).map((a: any) => a.label));

  step('顾客点进订单详情');
  const orderNo = first.orderId ?? first.orderNo;
  const detail = unwrap(
    await call('GET', `/custom-recipe/orders/${orderNo}`),
    '订单详情',
  );
  if (detail) {
    showRenderable(detail.renderable);
    say('  目标', detail.targetGoal ?? '(未设)');
  }

  step('顾客点开「我的专属食谱」（交付物）');
  const delivery = unwrap(
    await call('GET', `/custom-recipe/orders/${orderNo}/delivery`),
    '交付物',
  );
  if (delivery) {
    say('交付版本', delivery.version ?? '(无)');
    if (delivery.content) {
      const c = delivery.content;
      console.log('  ── 页面上会显示 ──');
      if (c.feeding) {
        say('  每天怎么喂', `${c.feeding.dailyIntakeG}g，${c.feeding.mealsPerDay} 餐，每餐 ${c.feeding.perMealG}g`);
        say('  做几天', `${c.feeding.cycleDays} 天`);
      }
      if (c.recipe?.items) {
        say(
          '  食材配比',
          c.recipe.items
            .filter((i: any) => !i.isSupplement)
            .map((i: any) => `${i.name} ${i.ratioPercent}%`)
            .join('、') || '(无)',
        );
      }
      if (c.shopping?.lines) {
        say('  要买多少', c.shopping.lines.map((l: any) => `${l.name} ${l.purchaseG}g`).join('、'));
        say('  合计', `${c.shopping.totalPurchaseG}g（多备 ${Math.round(((c.shopping.lossRate ?? 1) - 1) * 100)}%）`);
      }
      if (c.supplements?.length) {
        say('  要加的补充剂', c.supplements.map((s: any) => `${s.name} 每 kg 加 ${s.perKgG}g`).join('；'));
      }
      /**
       * ★ 重点：交付物内容里**不该有**"前端算出来的东西"。
       * 页面上每一个数字都必须是后端给的。
       */
      const hasComputedField = JSON.stringify(c).includes('"computedAt"');
      say('  （内容里是否含前端计算标记）', hasComputedField ? '有（不对）' : '无 ✓');
    }
  }

  step('顾客看售后（能提什么、能撤回什么）');
  const aftersale = unwrap(
    await call('GET', `/custom-recipe/orders/${orderNo}/aftersale`),
    '售后列表',
  );
  if (aftersale) {
    const items = aftersale.items ?? aftersale.list ?? aftersale ?? [];
    say('售后记录数', Array.isArray(items) ? items.length : '（结构不符）');
    for (const item of Array.isArray(items) ? items : []) {
      console.log(
        `  · ${item.typeLabel ?? item.type}｜${item.statusLabel ?? item.status}｜可撤回：${item.canCancel ? '是' : '否'}`,
      );
      if (item.progressText) say('    进展', item.progressText);
    }
  }

  step('可选的售后类型（顾客能选哪些）');
  /**
   * ⚠️ 集码是 `custom_recipe_aftersale_type`。
   *
   * 第一版这里我写成了 `aftersale_type`，于是拿到 0 档、
   * 差点报成"顾客没有售后类型可选"的线上问题 ——
   * **是走查脚本自己错了，不是产品错了。**
   *
   * 教训：验证脚本也要先确认自己查的东西是对的（这里是核对集码）。
   * 好在小程序那边用的是对的（`api/custom-recipe.ts` 里写着），
   * 所以这个错只影响走查输出，没影响顾客。
   */
  const SET_CODE = 'custom_recipe_aftersale_type';
  const types = unwrap(
    await call('GET', `/options?sets=${SET_CODE}`),
    '售后类型',
  );
  const typeItems = types?.sets?.[SET_CODE] ?? [];
  say('类型数', typeItems.length);
  for (const t of typeItems) {
    console.log(`  · ${t.label}（${t.code}）`);
  }
  if (typeItems.length === 0) {
    console.log('');
    console.log('  ⚠️ 售后类型是空的 —— 顾客提售后时**没有东西可选**。');
    console.log('     这属于"选项字典没播种"，2026-10-16 修过一次（部署脚本里加了播种）。');
  }

  console.log('');
  console.log('─'.repeat(64));
  console.log('接口走查完成 ✓');
  console.log('─'.repeat(64));
}

main().catch((error) => {
  console.error('');
  console.error('走查中断：', error?.message ?? error);
  process.exitCode = 1;
});
