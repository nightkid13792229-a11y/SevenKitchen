import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 订单详情两个出口都必须带「烹饪建议」。
 *
 * 2026-11-03 的事故：顾客端 `/orders/:id`（orders.controller）和
 * 员工端 `/admin/orders/:id`（admin.controller）是两个 mapper，
 * 只给顾客端加了 cookingAdvice —— 老板在后台视角打开鲜食订单详情，
 * 看到的是「暂未获取到每袋重量」，判定标准也是空的。
 *
 * 这两个 mapper 依赖一串 Nest 注入，测试里 import 会牵出 uuid 的 ESM 问题；
 * 仓库里 admin.controller 的既有用例也是按源码断言，这里沿用同一套做法，
 * 卡住「漏掉其中一个出口」这件事。
 */
describe('订单详情接口 · 烹饪建议两个出口都要带', () => {
  const read = (relativePath: string) =>
    readFileSync(resolve(process.cwd(), relativePath), 'utf8');

  const targets = [
    [
      '顾客端 GET /orders/:id',
      'src/interfaces/controllers/orders.controller.ts',
    ],
    [
      '员工端 GET /admin/orders/:id',
      'src/interfaces/controllers/admin.controller.ts',
    ],
  ] as const;

  it.each(targets)('%s 的响应里有 cookingAdvice', (_label, path) => {
    const source = read(path);
    expect(source).toContain('cookingAdvice: buildCookingAdviceForOrder(');
  });

  it.each(targets)('%s 用的是同一份口径（不自己算时间）', (_label, path) => {
    const source = read(path);
    expect(source).toContain("from '../../application/cooking/cooking-time'");
    expect(source).not.toContain('约 10 分钟');
    expect(source).not.toContain('约 25 分钟');
  });
});
