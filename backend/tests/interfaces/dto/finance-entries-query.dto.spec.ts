import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { FinanceEntriesQueryDto } from '../../../src/interfaces/dto/finance/finance-entries.query.dto';

/**
 * 收支明细查询参数的回归测试（2026-11-19 账户化改造）。
 *
 * 控制器用 `ValidationPipe({ whitelist: true })`：DTO 上没声明的字段会被
 * **静默丢掉**。筛选参数从 `payerType` 换成 `account` 时，如果只改前端不改
 * DTO，请求会「成功」但筛选条件完全没生效 —— 现有 service 单测直调服务、
 * 绕过管道，抓不到这种问题，所以单独测 DTO。
 */
describe('FinanceEntriesQueryDto', () => {
  /** 复刻控制器的 whitelist 行为：没装饰器的属性会被剥离 */
  function transform(payload: Record<string, unknown>) {
    const dto = plainToInstance(FinanceEntriesQueryDto, payload);
    const errors = validateSync(dto as object, { whitelist: true });
    return { dto: dto as unknown as Record<string, unknown>, errors };
  }

  it('account 接受五个账户 code', () => {
    for (const account of [
      'MERCHANT',
      'PERSONAL_WECHAT',
      'PERSONAL_ALIPAY',
      'PERSONAL_BANK',
      'CASH',
    ]) {
      const { dto, errors } = transform({ month: '2026-11', account });
      expect(errors).toHaveLength(0);
      expect(dto.account).toBe(account);
    }
  });

  it('非法账户在入参层就拒绝，不静默变成默认账户', () => {
    for (const account of ['BANK', 'PERSONAL', 'personal_wechat', '']) {
      expect(
        transform({ month: '2026-11', account }).errors.length,
      ).toBeGreaterThan(0);
    }
  });

  it('旧的 payerType 已被移除：不会再被当成筛选条件', () => {
    const { dto, errors } = transform({
      month: '2026-11',
      payerType: 'PERSONAL',
    });

    expect(errors).toHaveLength(0);
    // whitelist 把未声明字段剥掉，避免「传了但没生效」的假成功
    expect(dto.payerType).toBeUndefined();
    expect(dto.account).toBeUndefined();
  });

  it('category 仍是字符串（支出类别字典 id）', () => {
    const { dto, errors } = transform({
      month: '2026-11',
      category: 'cat-EQUIPMENT',
    });

    expect(errors).toHaveLength(0);
    expect(dto.category).toBe('cat-EQUIPMENT');
  });
});
