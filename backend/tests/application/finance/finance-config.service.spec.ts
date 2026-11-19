import { FinanceConfigService } from 'src/application/finance/finance-config.service';

describe('FinanceConfigService', () => {
  it('没有可读的费率配置时按 6‰ 兜底', async () => {
    await expect(new FinanceConfigService().getFeeRate()).resolves.toBe(0.006);
  });
});
