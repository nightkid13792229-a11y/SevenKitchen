import { SupplementDosageService } from '../../../src/application/supplement-shop/supplement-dosage.service';
import { SupplementEquivalenceService } from '../../../src/application/supplement-shop/supplement-equivalence.service';

/**
 * 生产门禁（2026-11-15）：归组、批量归组、审批三个入口都要过同一道检查。
 * 只拦原料编辑那条路不够——先把产品开生产再挪进已有 2 个的组，能绕过。
 */
describe('SupplementEquivalenceService · production pool guard', () => {
  function build(existing: Array<{ id: string; name: string }>) {
    const prisma: any = {
      ingredient: { findMany: jest.fn().mockResolvedValue(existing) },
      supplementEquivalenceGroup: { findUnique: jest.fn(), update: jest.fn() },
      supplementEquivalenceGroupAudit: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new SupplementEquivalenceService(
      prisma,
      new SupplementDosageService(),
    );
    return { service, prisma };
  }

  it('组内已有 2 个生产开时，再归入一个生产开的产品被拒绝', async () => {
    const { service } = build([
      { id: 'a', name: '海藻粉' },
      { id: 'b', name: '海带片' },
    ]);

    await expect(
      (service as any).assertProductionLimit('group-1', [
        { id: 'c', name: '海带粉胶囊', procurementEnabled: true },
      ]),
    ).rejects.toThrow('最多允许 2 个');
  });

  it('归入的产品没开生产时放行', async () => {
    const { service } = build([
      { id: 'a', name: '海藻粉' },
      { id: 'b', name: '海带片' },
    ]);

    await expect(
      (service as any).assertProductionLimit('group-1', [
        { id: 'c', name: '海带粉胶囊', procurementEnabled: false },
      ]),
    ).resolves.toBeUndefined();
  });

  it('已在组内的成员不重复计数', async () => {
    const { service } = build([{ id: 'a', name: '海藻粉' }]);

    await expect(
      (service as any).assertProductionLimit('group-1', [
        { id: 'a', name: '海藻粉', procurementEnabled: true },
      ]),
    ).resolves.toBeUndefined();
  });

  it('审批通过时同样校验：3 个生产开不能批准', async () => {
    const members = [
      { id: 'a', name: '海藻粉', procurementEnabled: true, type: 'SUPPLEMENT' },
      { id: 'b', name: '海带片', procurementEnabled: true, type: 'SUPPLEMENT' },
      { id: 'c', name: '海带粉胶囊', procurementEnabled: true, type: 'SUPPLEMENT' },
    ];
    const prisma: any = {
      ingredient: { findMany: jest.fn().mockResolvedValue(members) },
      supplementEquivalenceGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'group-1',
          code: 'IODINE_NATURAL',
          name: '碘 · 天然',
          nutrientKey: 'minerals.iodine',
          nutrientLabel: '碘',
          nutrientUnit: 'μg',
          status: 'PENDING_REVIEW',
          evidenceUrls: ['https://example.com'],
          ingredients: members,
        }),
      },
    };
    const service = new SupplementEquivalenceService(
      prisma,
      new SupplementDosageService(),
    );

    await expect(
      service.changeStatus('group-1', 'APPROVED', {
        id: 'op-1',
        name: '运营',
      } as any),
    ).rejects.toThrow('最多允许 2 个');
  });
});
