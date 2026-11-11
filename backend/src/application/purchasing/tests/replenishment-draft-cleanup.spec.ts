/**
 * 补货草稿的清理节奏（2026-11-11）
 *
 * 事故背景：工作台「采购管理」挂着 2 个待采购角标，实际是两条点开「手填记一笔」
 * 又退出留下的空草稿。草稿对用户不可见，所以这种残留只能靠后台清。
 *
 * 原来只在每天 3 点清一次、且要挂满 48 小时，等于空草稿要在库里躺两天。
 * 现在改成每小时跑：空草稿（没有明细、没有任何识别行）超过 2 小时就清，
 * 有内容的草稿仍按 48 小时兜底。
 */

import { buildStaleDraftWhere } from '../replenishment-draft-cleanup';

describe('补货草稿清理口径', () => {
  it('空草稿 2 小时就清，不再等 48 小时', () => {
    const where = buildStaleDraftWhere(Date.now());

    expect(where.isDraft).toBe(true);
    expect(where.status).toBe('PENDING');
    expect(Array.isArray(where.OR)).toBe(true);

    const emptyBranch = where.OR.find(
      (branch: any) => branch.itemCount === 0,
    ) as any;
    expect(emptyBranch).toBeTruthy();
    expect(emptyBranch.items).toEqual({ none: {} });
    expect(emptyBranch.orderImports).toEqual({
      none: { lines: { some: {} } },
    });

    const emptyAgeHours =
      (Date.now() - emptyBranch.createdAt.lt.getTime()) / 3_600_000;
    expect(emptyAgeHours).toBeGreaterThan(1.9);
    expect(emptyAgeHours).toBeLessThan(2.1);

    const staleBranch = where.OR.find(
      (branch: any) => branch.itemCount === undefined,
    ) as any;
    expect(staleBranch).toBeTruthy();
    const staleAgeHours =
      (Date.now() - staleBranch.createdAt.lt.getTime()) / 3_600_000;
    expect(staleAgeHours).toBeGreaterThan(47.9);
    expect(staleAgeHours).toBeLessThan(48.1);
  });

  it('两档都不碰已保存（非草稿）的采购单', () => {
    const where = buildStaleDraftWhere(Date.now());
    expect(where.isDraft).toBe(true);
    for (const branch of where.OR) {
      expect((branch as any).status).toBeUndefined();
      expect((branch as any).isDraft).toBeUndefined();
    }
  });
});
