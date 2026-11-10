import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WaybillReceiptGuardService } from 'src/application/shipping/waybill-receipt-guard.service';
import { buildAddressFingerprint } from 'src/application/shipping/waybill-receipt-match';
import { PrismaService } from 'src/infrastructure/prisma.service';

/**
 * 发货前的存根核对（2026-11-10）。
 *
 * 这是整个功能的**锁**：发货接口不信前端说的"我验过了"，
 * 自己来查有没有一条「这张单 + 这个运单号」的核对记录，
 * 而且记录里当时的收货地址还得跟现在一致。
 *
 * 为什么地址也要比：员工发现存根对不上 → 先去改收货地址 → 再回来传存根。
 * 如果改了地址旧记录还认，那条唯一出路就等于白走。
 */
describe('WaybillReceiptGuardService', () => {
  let guard: WaybillReceiptGuardService;

  const prisma = {
    order: { findMany: jest.fn() },
    supplementOrder: { findMany: jest.fn() },
    waybillReceiptRecord: { findFirst: jest.fn() },
  } as any;

  const addressRow = (id: string, detail = '礼泉路700弄55号703') => ({
    id,
    shippingAddressSnapshot: {
      recipientName: '张赛珺',
      phone: '18612342107',
      region: { province: '上海市', city: '上海市', district: '普陀区' },
      detail,
    },
    address: null,
  });

  const viewOf = (detail = '礼泉路700弄55号703') => ({
    recipientName: '张赛珺',
    phone: '18612342107',
    province: '上海市',
    city: '上海市',
    district: '普陀区',
    detail,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaybillReceiptGuardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get(WaybillReceiptGuardService);
    jest.clearAllMocks();
    prisma.supplementOrder.findMany.mockResolvedValue([]);
  });

  it('★ 没有任何核对记录 → 拦住，并说清该怎么做', async () => {
    prisma.order.findMany.mockResolvedValue([addressRow('o1')]);
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue(null);

    await expect(
      guard.assertVerified({ orderIds: ['o1'], trackingNumber: 'SF0204691009893' }),
    ).rejects.toThrow(/还没核对过/);
  });

  it('★ 有 MATCH 记录且地址没变 → 通过', async () => {
    prisma.order.findMany.mockResolvedValue([addressRow('o1')]);
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue({
      status: 'MATCH',
      addressFingerprints: { o1: buildAddressFingerprint(viewOf()) },
    });

    await expect(
      guard.assertVerified({ orderIds: ['o1'], trackingNumber: 'SF0204691009893' }),
    ).resolves.toBeUndefined();
  });

  it('★ 记录在，但地址改过了 → 拦住，要求重传存根', async () => {
    prisma.order.findMany.mockResolvedValue([addressRow('o1', '礼泉路700弄55号704')]);
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue({
      status: 'MATCH',
      addressFingerprints: { o1: buildAddressFingerprint(viewOf()) },
    });

    await expect(
      guard.assertVerified({ orderIds: ['o1'], trackingNumber: 'SF0204691009893' }),
    ).rejects.toThrow(/重新上传存根/);
  });

  it('★ 记录是 MANUAL（人工声明确认过）→ 通过', async () => {
    prisma.order.findMany.mockResolvedValue([addressRow('o1')]);
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue({
      status: 'MANUAL',
      addressFingerprints: { o1: buildAddressFingerprint(viewOf()) },
    });

    await expect(
      guard.assertVerified({ orderIds: ['o1'], trackingNumber: 'SF0204691009893' }),
    ).resolves.toBeUndefined();
  });

  it('只认 MATCH / MANUAL —— 查询里就把 MISMATCH 排除掉', async () => {
    prisma.order.findMany.mockResolvedValue([addressRow('o1')]);
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue(null);

    await expect(
      guard.assertVerified({ orderIds: ['o1'], trackingNumber: 'SF0204691009893' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.waybillReceiptRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['MATCH', 'MANUAL'] },
        }),
      }),
    );
  });

  it('★ 合并发货：一条记录覆盖两张单 → 两张都能过', async () => {
    prisma.order.findMany.mockResolvedValue([addressRow('o1'), addressRow('o2')]);
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue({
      status: 'MATCH',
      addressFingerprints: {
        o1: buildAddressFingerprint(viewOf()),
        o2: buildAddressFingerprint(viewOf()),
      },
    });

    await expect(
      guard.assertVerified({ orderIds: ['o1', 'o2'], trackingNumber: 'SF0204691009893' }),
    ).resolves.toBeUndefined();
  });

  it('★ 合并发货：记录只覆盖了其中一张单 → 另一张过不去', async () => {
    prisma.order.findMany.mockResolvedValue([addressRow('o1'), addressRow('o2')]);
    // hasEvery 由数据库执行，这里模拟"没有满足条件的记录"
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue(null);

    await expect(
      guard.assertVerified({ orderIds: ['o1', 'o2'], trackingNumber: 'SF0204691009893' }),
    ).rejects.toThrow(/还没核对过/);
  });

  it('补剂单也能读地址（快照挂在 supplement_order 上）', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.supplementOrder.findMany.mockResolvedValue([addressRow('s1')]);
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue({
      status: 'MATCH',
      addressFingerprints: { s1: buildAddressFingerprint(viewOf()) },
    });

    await expect(
      guard.assertVerified({ orderIds: ['s1'], trackingNumber: 'SF0204691009893' }),
    ).resolves.toBeUndefined();
  });

  it('订单查不到 → 直接拦住，不许当成"没有地址所以放行"', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await expect(
      guard.assertVerified({ orderIds: ['missing'], trackingNumber: 'SF0204691009893' }),
    ).rejects.toThrow(/订单不存在/);
  });

  it('运单号大小写与空格不影响匹配', async () => {
    prisma.order.findMany.mockResolvedValue([addressRow('o1')]);
    prisma.waybillReceiptRecord.findFirst.mockResolvedValue({
      status: 'MATCH',
      addressFingerprints: { o1: buildAddressFingerprint(viewOf()) },
    });

    await guard.assertVerified({ orderIds: ['o1'], trackingNumber: '  sf0204691009893  ' });

    expect(prisma.waybillReceiptRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ trackingNumber: 'SF0204691009893' }),
      }),
    );
  });
});
