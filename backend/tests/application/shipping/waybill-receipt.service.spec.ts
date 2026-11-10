import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AgentProviderConfigService } from 'src/application/nutrition-governance/agent-provider-config.service';
import {
  DAILY_RECEIPT_LIMIT_PER_USER,
  WAYBILL_RECEIPT_MODEL,
  WaybillReceiptService,
} from 'src/application/shipping/waybill-receipt.service';
import { buildAddressFingerprint } from 'src/application/shipping/waybill-receipt-match';
import { PrismaService } from 'src/infrastructure/prisma.service';

/**
 * 存根识别服务（2026-11-10）。
 *
 * 它要同时干四件事，每件都有硬要求：
 *   · 调视觉模型读图 → 读不出来必须**降级**，绝不让员工卡住
 *   · 运单号查重 → 三张表都查，但"本票自己"和"本单历史号"不算重复
 *   · 比对收件人 → 明确不同才拦，读不全只说"没核对上"
 *   · 每一次都落一行结论 → 发货硬锁要靠它
 */
describe('WaybillReceiptService', () => {
  let service: WaybillReceiptService;

  const model = { callDeepSeekJson: jest.fn() };
  const agentConfig = { getEnabledDeepSeekRuntimeConfig: jest.fn() };
  const prisma = {
    order: { findMany: jest.fn() },
    supplementOrder: { findMany: jest.fn() },
    orderShipmentPackage: { findMany: jest.fn() },
    orderShipmentOrder: { findMany: jest.fn() },
    waybillReceiptRecord: {
      create: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;

  /** 查重命中时"这个号是谁的"，按需在用例里塞 */
  const trackingOwners: { orders: any[]; supplements: any[] } = {
    orders: [],
    supplements: [],
  };

  const addressRow = (id: string) => ({
    id,
    shippingAddressSnapshot: {
      recipientName: '张赛珺',
      phone: '18612342107',
      region: { province: '上海市', city: '上海市', district: '普陀区' },
      detail: '礼泉路700弄55号703',
    },
    address: null,
  });

  const goodReceipt = {
    documentType: 'waybill_receipt',
    carrierName: '顺丰速运',
    trackingNumber: 'SF0204691009893',
    shippingFee: 56,
    recipient: {
      name: '张赛珺',
      phoneMasked: '186****2107',
      address: '上海市上海市普陀区礼泉路700弄55号703',
    },
  };

  const recognize = (overrides: Record<string, unknown> = {}) =>
    service.recognize({
      imageUrl: 'https://img.example.com/receipt.jpg',
      orderIds: ['o1'],
      userId: 'staff-1',
      ...overrides,
    });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaybillReceiptService,
        { provide: PrismaService, useValue: prisma },
        { provide: AgentProviderConfigService, useValue: agentConfig },
        { provide: WAYBILL_RECEIPT_MODEL, useValue: model },
      ],
    }).compile();

    service = module.get(WaybillReceiptService);
    jest.clearAllMocks();

    agentConfig.getEnabledDeepSeekRuntimeConfig.mockResolvedValue({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-vision',
      apiKey: 'sk-test',
      requestTimeoutMs: 60000,
    });
    model.callDeepSeekJson.mockResolvedValue(goodReceipt);

    // 同一张表被两处用到：读地址（按 id 查）和查重（按运单号查）。
    // 按 where 的形状分流，测试里就不用数"第几次调用"了。
    trackingOwners.orders = [];
    trackingOwners.supplements = [];
    prisma.order.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.trackingNumber) return trackingOwners.orders;
      const ids: string[] = args?.where?.id?.in ?? [];
      return ids.map((id) => addressRow(id));
    });
    prisma.supplementOrder.findMany.mockImplementation(async (args: any) => {
      if (args?.where?.trackingNumber) return trackingOwners.supplements;
      return [];
    });
    prisma.orderShipmentPackage.findMany.mockResolvedValue([]);
    prisma.orderShipmentOrder.findMany.mockResolvedValue([]);
    prisma.waybillReceiptRecord.count.mockResolvedValue(0);
    prisma.waybillReceiptRecord.aggregate.mockResolvedValue({
      _sum: { count: 0 },
    });
    prisma.waybillReceiptRecord.findMany.mockResolvedValue([]);
    prisma.waybillReceiptRecord.create.mockResolvedValue({ id: 'check-1' });
  });

  it('★ 核对通过 → 落一行 MATCH，并记下当时的地址指纹', async () => {
    const result = await recognize();

    expect(result.match.status).toBe('match');
    expect(result.receipt?.trackingNumber).toBe('SF0204691009893');
    expect(result.receipt?.shippingFee).toBe(56);

    expect(prisma.waybillReceiptRecord.create).toHaveBeenCalledTimes(1);
    const created = prisma.waybillReceiptRecord.create.mock.calls[0][0].data;
    expect(created.status).toBe('MATCH');
    expect(created.trackingNumber).toBe('SF0204691009893');
    expect(created.carrierCode).toBe('SF');
    expect(created.orderIds).toEqual(['o1']);
    expect(created.addressFingerprints.o1).toBe(
      buildAddressFingerprint({
        recipientName: '张赛珺',
        phone: '18612342107',
        province: '上海市',
        city: '上海市',
        district: '普陀区',
        detail: '礼泉路700弄55号703',
      }),
    );
  });

  it('★ 收件人对不上 → MISMATCH，并说清是手机还是区县', async () => {
    model.callDeepSeekJson.mockResolvedValue({
      ...goodReceipt,
      recipient: {
        name: '李四',
        phoneMasked: '139****0011',
        address: '北京市北京市朝阳区建国路88号',
      },
    });

    const result = await recognize();

    expect(result.match.status).toBe('mismatch');
    expect(result.match.conflicts.map((c) => c.field)).toEqual([
      'phone',
      'district',
    ]);
    expect(prisma.waybillReceiptRecord.create.mock.calls[0][0].data.status).toBe(
      'MISMATCH',
    );
  });

  it('★ 这张图不是快递存根 → NOT_WAYBILL，三项一律 null', async () => {
    model.callDeepSeekJson.mockResolvedValue({
      documentType: 'other',
      trackingNumber: 'SF0204691009893',
    });

    const result = await recognize();

    expect(result.match.status).toBe('not_waybill');
    expect(result.receipt?.trackingNumber).toBeNull();
    expect(prisma.waybillReceiptRecord.create.mock.calls[0][0].data.status).toBe(
      'NOT_WAYBILL',
    );
  });

  it('★ 运单号已经在别的鲜食单上 → DUPLICATE，并点名是哪张单', async () => {
    trackingOwners.orders = [{ id: 'o9', orderNo: 'SK2026110199' }];

    const result = await recognize();

    expect(result.match.status).toBe('duplicate');
    expect(result.match.duplicate?.label).toBe('SK2026110199');
    expect(prisma.waybillReceiptRecord.create.mock.calls[0][0].data.status).toBe(
      'DUPLICATE',
    );
  });

  it('★ 运单号已经挂在别的补剂单上 → 也算重复', async () => {
    trackingOwners.supplements = [{ id: 's9', orderNo: 'SP2026110199' }];

    const result = await recognize();

    expect(result.match.status).toBe('duplicate');
    expect(result.match.duplicate?.label).toBe('SP2026110199');
  });

  it('★ 同号在本票的其他单上 → 不算重复（合并发货本来就会共用）', async () => {
    prisma.orderShipmentPackage.findMany.mockResolvedValue([
      { id: 'pkg-1', shipmentId: 'ship-1' },
    ]);
    // 这个包裹所在的票里就包含本票订单 → 是自己的包裹，不算重复
    prisma.orderShipmentOrder.findMany.mockResolvedValue([
      { shipmentId: 'ship-1' },
    ]);

    const result = await recognize({ orderIds: ['o1', 'o2'] });

    expect(result.match.status).toBe('match');
  });

  it('同号在别人的包裹上 → 重复', async () => {
    prisma.orderShipmentPackage.findMany.mockResolvedValue([
      { id: 'pkg-9', shipmentId: 'ship-9' },
    ]);
    prisma.orderShipmentOrder.findMany.mockResolvedValue([]);

    const result = await recognize();

    expect(result.match.status).toBe('duplicate');
  });

  it('★ 模型超时 → DEGRADED，不抛错（不能把打包间卡死）', async () => {
    model.callDeepSeekJson.mockRejectedValue(new Error('timeout'));

    const result = await recognize();

    expect(result.match.status).toBe('degraded');
    const created = prisma.waybillReceiptRecord.create.mock.calls[0][0].data;
    expect(created.status).toBe('DEGRADED');
    expect(created.degradedReason).toBe('model_timeout');
  });

  it('★ 认出来了但没有运单号 → DEGRADED(no_tracking_number)', async () => {
    model.callDeepSeekJson.mockResolvedValue({
      documentType: 'waybill_receipt',
      trackingNumber: null,
      shippingFee: 56,
    });

    const result = await recognize();

    expect(result.match.status).toBe('degraded');
    expect(
      prisma.waybillReceiptRecord.create.mock.calls[0][0].data.degradedReason,
    ).toBe('no_tracking_number');
  });

  it('★ 当天配额用完 → DEGRADED(quota)，一次模型都不调', async () => {
    prisma.waybillReceiptRecord.count.mockResolvedValue(
      DAILY_RECEIPT_LIMIT_PER_USER + 1,
    );

    const result = await recognize();

    expect(result.match.status).toBe('degraded');
    expect(model.callDeepSeekJson).not.toHaveBeenCalled();
    expect(
      prisma.waybillReceiptRecord.create.mock.calls[0][0].data.degradedReason,
    ).toBe('quota');
  });

  it('订单不存在 → 400，什么都不落库', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await expect(recognize()).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.waybillReceiptRecord.create).not.toHaveBeenCalled();
  });

  describe('手动填写（AI 认不出来时的出口）', () => {
    it('★ 已有 MISMATCH 记录在手 → 拒绝手填（否则硬锁等于没有）', async () => {
      prisma.waybillReceiptRecord.findMany.mockResolvedValue([
        { id: 'bad-1', status: 'MISMATCH' },
      ]);

      await expect(
        service.createManualRecord({
          orderIds: ['o1'],
          trackingNumber: 'SF0204691009893',
          reason: '图太糊',
          userId: 'staff-1',
        }),
      ).rejects.toThrow(/对不上/);

      expect(prisma.waybillReceiptRecord.create).not.toHaveBeenCalled();
    });

    it('★ 正常手填 → 落一行 MANUAL，带原因和地址指纹', async () => {
      const result = await service.createManualRecord({
        orderIds: ['o1'],
        trackingNumber: ' sf0204691009893 ',
        reason: '存根太糊，快递员口头确认的',
        userId: 'staff-1',
      });

      expect(result.id).toBe('check-1');
      const created = prisma.waybillReceiptRecord.create.mock.calls[0][0].data;
      expect(created.status).toBe('MANUAL');
      expect(created.trackingNumber).toBe('SF0204691009893');
      expect(created.manualReason).toContain('快递员');
      expect(created.addressFingerprints.o1).toBeTruthy();
    });

    it('没填原因 → 400（留痕是这道口子的代价）', async () => {
      await expect(
        service.createManualRecord({
          orderIds: ['o1'],
          trackingNumber: 'SF0204691009893',
          reason: '   ',
          userId: 'staff-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
