import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 交付服务 · 「状态变更必须先过状态机」守卫（2026-10-16，批次 2.1）
 *
 * ## 为什么单独加这一条
 *
 * `custom-recipe-redlines.spec.ts` 的 GD-01 判定方式是**数**
 * `customRecipeOrder.update` 出现了几次 —— 它能发现"多了一处写状态的地方"，
 * 但**分不出这一处有没有先过状态机**。
 *
 * 交付服务里那 2 处写状态**确实都调用了 `assertTransition`**，
 * 却照样把 GD-01 的计数从 15 顶到 17。当时有两个选择：
 *
 *   · 放宽 GD-01 的正则 → **不行**：会误伤一片（连不写状态的 update 都算进来）
 *   · 把基线悄悄调到 17 → **不行**：那就等于把红线擦掉了
 *
 * 选的是第三条：**基线照实调，同时补一条更准的守卫**。
 * 这条守卫直接盯"这个文件里每次写状态之前，有没有 assertTransition"。
 *
 * ## 它怎么判
 *
 * 采取的是"数量配对"这种笨但可靠的办法：
 * `assertTransition` 的调用次数必须 **≥** 写状态的次数。
 * 少一次就说明有一处没校验 —— 会红。
 */

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * 路径基准是**仓库根**（与隔壁 `custom-recipe-redlines.spec.ts` 一致）：
 * 本文件在 `backend/tests/contracts/`，所以上三级才是根。
 * （我第一次写成两级，结果拼出 `backend/backend/src/...`，测试直接跑不起来。）
 */
function readProjectFile(relativePath: string): string {
  return readFileSync(join(__dirname, '../../..', relativePath), 'utf8');
}

const DELIVERY_SERVICE =
  'backend/src/application/custom-recipe/custom-recipe-delivery.service.ts';

describe('交付服务 · 状态变更必须先过状态机', () => {
  const source = stripComments(readProjectFile(DELIVERY_SERVICE));

  it('★ 校验次数不少于写状态次数（每次改状态前都校验过）', () => {
    const guards = (
      source.match(/assertTransition\(/g) ?? []
    ).length;
    const statusWrites = (
      source.match(/customRecipeOrder\.(update|updateMany)\(/g) ?? []
    ).length;

    // 至少要有写状态的地方，否则这条测试是在空跑
    expect(statusWrites).toBeGreaterThan(0);

    expect({
      guards,
      statusWrites,
      ok: guards >= statusWrites,
    }).toEqual({ guards, statusWrites, ok: true });
  });

  it('★ 状态不是写死的字符串，而是走枚举常量', () => {
    // 写死的 'DELIVERED' 这类字符串一旦打错，类型系统不会报错
    expect(source).toMatch(/CustomRecipeStatus\.DELIVERED/);
    expect(source).toMatch(/CustomRecipeStatus\.COMPLETED/);
    // 不许出现 status: '大写的裸字符串'
    expect(source).not.toMatch(/status:\s*'[A-Z_]+'/);
  });

  it('★ 时间戳由状态机统一决定，不在这里手写', () => {
    // 历史教训：inProgressAt 曾有一段时间从来没被写过（2026-09-28 才补上）
    expect(source).toMatch(/timestampFieldFor\(/);
  });

  it('交付与确认收到在**同一个事务**里改状态（不能一半成功）', () => {
    // 交付记录建了、订单没改，或者反过来，都会让顾客看到自相矛盾的状态
    expect(source).toMatch(/\$transaction\(/);
  });
});
