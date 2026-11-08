/**
 * 顾客成品鲜食的预约制作日期规则。
 *
 * 老板 2026-11-08 定：
 *   - 顾客仍按「每天早上 6 点」的老规矩：6 点前下单可约当天，6 点起最早次日；
 *   - 管理员 / 客服代客下单不受这条限制，可以把制作日期定在今天。
 */
import { BadRequestException } from '@nestjs/common';
import { resolveDraftProductionDate } from '../../../src/application/order/production-date';

const shanghai = (iso: string) => new Date(iso);
const dateOnly = (iso: string) => shanghai(iso).toISOString();

describe('resolveDraftProductionDate · 顾客制作日期规则', () => {
  it('顾客早上 6 点前下单，可以预约当天制作', () => {
    const now = shanghai('2026-11-09T05:59:00+08:00');

    expect(
      resolveDraftProductionDate(
        shanghai('2026-11-09T00:00:00Z'),
        'customer',
        now,
      )?.toISOString(),
    ).toBe(dateOnly('2026-11-09T00:00:00Z'));
  });

  it('顾客早上 6 点整下单，最早只能预约次日', () => {
    const now = shanghai('2026-11-09T06:00:00+08:00');

    expect(() =>
      resolveDraftProductionDate(
        shanghai('2026-11-09T00:00:00Z'),
        'customer',
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it('顾客早上 6 点后下单，可以预约次日制作', () => {
    const now = shanghai('2026-11-09T06:00:00+08:00');

    expect(
      resolveDraftProductionDate(
        shanghai('2026-11-10T00:00:00Z'),
        'customer',
        now,
      )?.toISOString(),
    ).toBe(dateOnly('2026-11-10T00:00:00Z'));
  });

  it('管理员和客服代客下单，可以把制作日期定在今天', () => {
    const now = shanghai('2026-11-09T08:00:00+08:00');

    for (const role of ['staff', 'admin'] as const) {
      expect(
        resolveDraftProductionDate(
          shanghai('2026-11-09T00:00:00Z'),
          role,
          now,
        )?.toISOString(),
      ).toBe(dateOnly('2026-11-09T00:00:00Z'));
    }
  });

  it('任何角色都不能把制作日期约到今天以前', () => {
    const now = shanghai('2026-11-09T08:00:00+08:00');

    for (const role of ['customer', 'staff', 'admin'] as const) {
      expect(() =>
        resolveDraftProductionDate(shanghai('2026-11-08T00:00:00Z'), role, now),
      ).toThrow(BadRequestException);
    }
  });

  it('超过 90 天的制作日期仍然拒绝', () => {
    const now = shanghai('2026-11-09T08:00:00+08:00');

    expect(() =>
      resolveDraftProductionDate(
        shanghai('2027-02-08T00:00:00Z'),
        'admin',
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it('没有传制作日期时保持为空（代客下单可以选择不指定）', () => {
    expect(resolveDraftProductionDate(null, 'staff')).toBeNull();
    expect(resolveDraftProductionDate(undefined, 'customer')).toBeNull();
  });
});
