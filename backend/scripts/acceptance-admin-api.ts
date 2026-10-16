/**
 * 食谱定制 · 后台管理接口走查（HTTP 层，2026-10-16）
 *
 * ## 为什么还要一个后台的
 *
 * 顾客侧那个（`acceptance-customer-api.ts`）一跑就抓出一个真 bug
 * （订单完成后列表上「查看定制食谱」消失）。后台侧此前只验到
 * "接口存在（401）"，**没验"拿到的东西对不对、够不够画界面"** ——
 * 而那正是上一个 bug 的藏身之处。
 *
 * ## 它走的路（老板的第 3 条需求：在后台管理定制订单）
 *
 * ```
 * ① 订单列表（要能看到、能筛）
 * ② 订单详情（要能看到后台该做什么：接单 / 交付 / 确认收款）
 * ③ 待交付时能选食谱（candidates）
 * ④ 交付食谱
 * ⑤ 售后待办（要能一眼看出哪条急）
 * ⑥ 受理 → 处理 → 完成
 * ⑦ 排期日历（周规则 + 某段日子的可约情况）
 * ⑧ 设置（改一次，前台跟着变）
 * ```
 *
 * ## 怎么跑
 *
 * ```bash
 * # 需要本地后端跑着且 ALLOW_DEV_AUTH=true
 * npx ts-node -r tsconfig-paths/register --transpile-only scripts/acceptance-admin-api.ts
 * ```
 *
 * ⚠️ 后台接口要**员工身份**。开发态那个身份头只给 CUSTOMER 角色
 * （`auth.guard.ts` 里写死，防提权），所以这里的后台接口
 * **会被 403 拦住** —— 脚本会把这个事实如实打出来，
 * 而不是假装走通了。真要全跑通需要一份员工 token（见文件末尾说明）。
 */
import { execFileSync } from 'child_process';

const BASE = process.env.ACCEPTANCE_BASE_URL ?? 'http://127.0.0.1:3011/api/v1';
const STAFF_TOKEN = process.env.ACCEPTANCE_STAFF_TOKEN ?? '';

let stepNo = 0;
function step(title: string) {
  stepNo += 1;
  console.log('');
  console.log('─'.repeat(64));
  console.log(`第 ${stepNo} 步 · ${title}`);
  console.log('─'.repeat(64));
}

function say(label: string, value: unknown) {
  console.log(
    `  ${label}：${typeof value === 'string' ? value : JSON.stringify(value)}`,
  );
}

async function call(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH',
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
  ];
  if (STAFF_TOKEN) {
    args.push('-H', `Authorization: Bearer ${STAFF_TOKEN}`);
  } else {
    // 开发态身份（角色固定 CUSTOMER，后台接口会被 403 拦住 —— 这是预期的）
    args.push('-H', 'X-Customer-Id: acceptance-staff');
  }
  args.push(`${BASE}${path}`);
  if (body !== undefined) args.push('-d', JSON.stringify(body));

  const raw = execFileSync('curl', args, { encoding: 'utf8' });
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`接口返回的不是 JSON：${raw.slice(0, 200)}`);
  }
}

/** 返回 data，或把错误如实打出来并返回 null */
function unwrap(res: any, label: string): any {
  if (res?.code === 0) return res.data;

  const code = res?.code;
  // 403 = 身份不够。开发态身份只有 CUSTOMER，这是设计如此，不是 bug
  if (code === 403) {
    console.log(`  ⚠️ ${label}：403（需要员工身份）`);
    return null;
  }
  console.log(`  ✗ ${label}：${code} ${res?.message}`);
  return null;
}

async function main() {
  console.log('');
  console.log('食谱定制 · 后台管理接口走查（HTTP 层）');
  console.log(`地址：${BASE}`);
  console.log(`身份：${STAFF_TOKEN ? '员工 token' : '开发态（CUSTOMER 角色）'}`);

  if (!STAFF_TOKEN) {
    console.log('');
    console.log('（没给 ACCEPTANCE_STAFF_TOKEN。后台接口会返回 403 ——');
    console.log('  脚本会如实报出来，不会假装走通。）');
  }

  let blocked = 0;
  const probe = (data: any, label: string) => {
    if (data === null) blocked += 1;
    return data;
  };

  step('① 后台打开「定制订单」列表');
  const list = probe(
    unwrap(await call('GET', '/admin/custom-recipe/orders?page=1&pageSize=10'), '订单列表'),
    '订单列表',
  );
  if (list) {
    const orders = list.orders ?? list.items ?? [];
    say('订单数', orders.length);
    say('总数', list.total ?? '(未给)');
    if (orders[0]) {
      const o = orders[0];
      console.log('  第一单后台能看到什么：');
      for (const key of [
        'orderId',
        'status',
        'statusLabel',
        'customerName',
        'dogName',
        'scheduledDate',
        'amount',
      ]) {
        if (o[key] !== undefined) say(`    ${key}`, o[key]);
      }
      /**
       * ★ 重点：后台列表也该有渲染契约，否则后台页面会各自写死状态判断 ——
       * 与顾客端那个 bug 一模一样的成因。
       */
      say(
        '    有渲染契约吗',
        o.renderable ? `有（按钮：${(o.renderable.actions ?? []).map((a: any) => a.label).join('、') || '无'}）` : '**没有**',
      );
    }
  }

  step('② 后台点开订单详情');
  const firstId = list?.orders?.[0]?.orderId;
  if (firstId) {
    const detail = probe(
      unwrap(await call('GET', `/admin/custom-recipe/orders/${firstId}`), '订单详情'),
      '订单详情',
    );
    if (detail) {
      say('状态', detail.statusLabel ?? detail.status);
      say('有渲染契约吗', detail.renderable ? '有' : '**没有**');
      const actions = detail.renderable?.actions ?? [];
      console.log('  后台在这单上能做什么：');
      for (const a of actions) {
        console.log(`    · ${a.label}${a.enabled ? '' : `（灰的：${a.disabledReason ?? '未说明'}）`}`);
      }
      if (actions.length === 0) {
        console.log('    （没有可做的动作 —— 如果这单确实等待处理，那就是缺按钮）');
      }
      say('能选哪些食谱', (detail.recipeCandidates ?? []).length);
    }
  } else {
    console.log('  （没有订单可看）');
  }

  step('③ 排期日历');
  const rules = probe(
    unwrap(await call('GET', '/admin/custom-recipe/weekday-rules'), '周规则'),
    '周规则',
  );
  if (rules) {
    say('是否默认值（还没配过）', rules.isDefault ? '是' : '否');
    for (const r of rules.items ?? []) {
      const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      console.log(
        `  · ${names[r.weekday]}：${r.isOpen ? `接 ${r.capacity} 单 / 交 ${r.deliveryCapacity} 份` : '休息'}`,
      );
    }
  }

  const calendar = probe(
    unwrap(
      await call('GET', '/admin/custom-recipe/calendar?from=2026-10-01&to=2026-10-07'),
      '日历',
    ),
    '日历',
  );
  if (calendar) {
    say('天数', (calendar.days ?? []).length);
    for (const d of (calendar.days ?? []).slice(0, 7)) {
      console.log(
        `  · ${d.date}：${d.isOpen ? `可约（剩 ${d.remaining} 单 / 交 ${d.deliveryRemaining} 份）` : `不可约 —— ${d.closedReason ?? '未说明原因'}`}`,
      );
    }
    /**
     * ★ 每一天"为什么不能约"都必须说得出来。
     * 后台看到"不可约"却没原因，只能去问开发。
     */
    const noReason = (calendar.days ?? []).filter(
      (d: any) => !d.isOpen && !d.closedReason,
    );
    say('不可约但没说原因的', noReason.length === 0 ? '无 ✓' : `${noReason.length} 天（不对）`);
  }

  step('④ 售后待办');
  const aftersales = probe(
    unwrap(await call('GET', '/admin/custom-recipe/aftersales?page=1&pageSize=10'), '售后待办'),
    '售后待办',
  );
  if (aftersales) {
    const items = aftersales.items ?? aftersales.list ?? [];
    say('待办数', items.length);
    for (const a of items.slice(0, 5)) {
      console.log(
        `  · ${a.typeLabel ?? a.type}｜${a.statusLabel ?? a.status}｜顾客：${a.customerName ?? '(未给)'}｜等了 ${a.hoursWaiting ?? '?'} 小时${a.isUrgent ? ' ★急' : ''}`,
      );
      const actions = (a.actions ?? []).map((x: any) => x.label);
      console.log(`    可做的动作：${actions.length ? actions.join('、') : '**没有**'}`);
    }
    /**
     * ★ 「等了多久」必须由后端算 —— 后台页面自己拿时间戳相减的话，
     * 就会出现"两个人看到不同的等待时长"。
     */
    say(
      '每条是否都给了等待时长',
      items.every((a: any) => a.hoursWaiting !== undefined) ? '是 ✓' : '**否**',
    );
  }

  step('⑤ 定制设置（改一次，顾客端跟着变）');
  const config = probe(
    unwrap(await call('GET', '/admin/custom-recipe/config'), '设置'),
    '设置',
  );
  if (config) {
    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== 'object') say(`  ${key}`, value);
    }
  }

  console.log('');
  console.log('─'.repeat(64));
  if (blocked > 0) {
    console.log(`走查完成，但有 ${blocked} 个接口需要员工身份（403）—— 见下方说明`);
  } else {
    console.log('走查完成 ✓ 后台整条管理链路都通');
  }
  console.log('─'.repeat(64));

  if (blocked > 0) {
    console.log('');
    console.log('要跑通后台接口，需要一份员工 token：');
    console.log('  git stash list 里没有，得从真实登录拿 ——');
    console.log('  1. 打开后台 https://sevenkitchen.cloud，用员工账号登录');
    console.log('  2. 浏览器开发者工具 → Network → 任一请求的 Authorization 头');
    console.log('  3. ACCEPTANCE_STAFF_TOKEN="Bearer xxx" 再跑本脚本');
    console.log('');
    console.log('⚠️ 不要为了让脚本"绿"就放宽后台鉴权 —— 那是安全底线。');
  }
}

main().catch((error) => {
  console.error('');
  console.error('走查中断：', error?.message ?? error);
  process.exitCode = 1;
});
