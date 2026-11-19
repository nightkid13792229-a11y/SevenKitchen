import { FinanceFeeRateService } from 'src/application/finance/finance-fee-rate.service';

describe('FinanceFeeRateService', () => {
  it('v1 固定返回 6‰', async () => {
    await expect(new FinanceFeeRateService().getFeeRate()).resolves.toBe(0.006);
  });
});
