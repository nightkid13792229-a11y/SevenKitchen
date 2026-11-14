import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { PurchaseOrderImportService } from '../../../src/application/purchasing/purchase-order-import.service';

describe('PurchaseOrderImportService', () => {
  let service: PurchaseOrderImportService;
  let imageBuffer: Buffer;

  const model = { callDeepSeekJson: jest.fn() };
  const cosService = {
    getSignedUrl: jest.fn(),
    isOwnedAssetUrl: jest.fn(),
    deleteImage: jest.fn(),
  };
  const agentConfig = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(),
  };
  // 渠道字典：识别时下发给模型的候选清单
  const platformOptions = {
    listSet: jest.fn().mockResolvedValue([
      {
        code: '盒马鲜生',
        label: '盒马鲜生',
        extra: { aliases: ['盒马'] },
      },
      { code: '沃尔玛', label: '沃尔玛', extra: null },
      {
        code: '山姆会员店',
        label: '山姆会员店',
        extra: { aliases: ['山姆'] },
      },
    ]),
  };
  const prisma: any = {
    purchaseList: { findUnique: jest.fn() },
    ingredient: { findUnique: jest.fn() },
    purchaseItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    procurementSku: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    procurementSkuNameChange: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    purchaseOrderMatchAlias: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    purchaseOrderImport: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    purchaseOrderImportLine: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    purchaseRecord: { create: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeAll(async () => {
    imageBuffer = await sharp({
      create: { width: 80, height: 120, channels: 3, background: '#ffffff' },
    })
      .jpeg()
      .toBuffer();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PurchaseOrderImportService(
      prisma,
      agentConfig as any,
      cosService as any,
      platformOptions as any,
      model as any,
    );
    cosService.isOwnedAssetUrl.mockReturnValue(true);
    cosService.getSignedUrl.mockResolvedValue(
      'https://signed.example.com/x.jpg',
    );
    cosService.deleteImage.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => imageBuffer,
    }) as any;

    prisma.purchaseList.findUnique.mockResolvedValue({
      id: 'list-1',
      status: 'PENDING',
      startedAt: new Date(),
      reimbursementId: null,
      items: [{ purchaseChannel: '盒马鲜生' }],
    });
    prisma.purchaseOrderImport.count.mockResolvedValue(0);
    prisma.purchaseOrderImport.findFirst.mockResolvedValue(null);
    prisma.purchaseItem.findMany.mockResolvedValue([
      { id: 'item-1', ingredientId: 'ing-1', ingredientName: '生菜' },
    ]);
    prisma.procurementSku.findMany.mockResolvedValue([
      {
        id: 'sku-1',
        ingredientId: 'ing-1',
        name: '生菜 500g/袋',
        productModel: '500g/袋',
        purchaseChannel: '盒马鲜生',
        purchaseToBaseRatio: 500,
        purchaseUnit: '袋',
      },
    ]);
    agentConfig.getEnabledDeepSeekRuntimeConfig.mockResolvedValue({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash',
      apiKey: 'sk-test',
      requestTimeoutMs: 60000,
    });
    prisma.purchaseOrderImport.create.mockImplementation(
      async ({ data }: any) => ({
        id: 'import-1',
        ...data,
        lines: (data.lines?.create ?? []).map((line: any, index: number) => ({
          id: `line-${index + 1}`,
          ...line,
          procurementSkuId: line.procurementSkuId ?? null,
          isPersonal: line.isPersonal ?? false,
          editedByUser: false,
        })),
      }),
    );
  });

  it('读图 → 自检 → 按清单匹配 → 落草稿', async () => {
    model.callDeepSeekJson.mockResolvedValue({
      channel: '盒马鲜生',
      orderNo: '123',
      orderTime: '2026-10-31 10:20',
      items: [
        {
          name: '盒马日日鲜 生菜 约500g',
          spec: '约500g/份',
          qty: 1,
          unit: '份',
          unitPrice: 2.99,
          lineTotal: 2.99,
        },
      ],
      subtotal: 2.99,
      shippingFee: 0,
      packagingFee: 1,
      paid: 3.99,
      incomplete: false,
      note: '一致',
    });

    const [result] = await service.importFromScreenshots({
      purchaseListId: 'list-1',
      userId: 'user-1',
      imageUrls: ['https://img.example.com/a.jpg'],
    });

    expect(model.callDeepSeekJson).toHaveBeenCalledTimes(1);
    expect(result.channel).toBe('盒马鲜生');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].ingredientId).toBe('ing-1');
    expect(result.lines[0].state).toBe('MATCHED');
    // 模型原始金额要留着，供「原图金额」对照
    expect(result.lines[0].aiLineTotal).toBe(2.99);
    expect(result.summary.matchedAmount).toBe(2.99);
  });

  it('rejects an order-list screenshot', async () => {
    model.callDeepSeekJson.mockResolvedValue({
      channel: '盒马鲜生',
      pageType: 'order_list',
      items: [
        { name: '生菜', qty: 1, unit: '份', unitPrice: 2.99, lineTotal: 2.99 },
      ],
      subtotal: 2.99,
      paid: 2.99,
    });

    await expect(
      service.importFromScreenshots({
        purchaseListId: 'list-1',
        userId: 'user-1',
        imageUrls: ['https://img.example.com/list.jpg'],
      }),
    ).rejects.toThrow('这是订单列表页');
  });

  it('persists page type and expected delivery', async () => {
    model.callDeepSeekJson.mockResolvedValue({
      channel: '盒马鲜生',
      pageType: 'order_detail',
      expectedDeliveryAt: '2026-11-10',
      deliveredAt: '2026-11-09 11:33',
      items: [
        { name: '生菜', qty: 1, unit: '份', unitPrice: 2.99, lineTotal: 2.99 },
      ],
      subtotal: 2.99,
      paid: 2.99,
    });

    const [result] = await service.importFromScreenshots({
      purchaseListId: 'list-1',
      userId: 'user-1',
      imageUrls: ['https://img.example.com/detail.jpg'],
    });

    expect(result.pageType).toBe('order_detail');
    expect(result.expectedDeliveryAt).toBeInstanceOf(Date);
    expect(result.deliveredAt).toBeInstanceOf(Date);
  });

  it('没匹配到原料的行先标成个人采购，不再堵住生成（员工要报销会自己改回来）', async () => {
    model.callDeepSeekJson.mockResolvedValue({
      channel: '盒马鲜生',
      orderNo: '456',
      orderTime: '2026-11-05 10:29',
      items: [
        {
          name: '可口可乐 汽水 330ml*6',
          qty: 1,
          unit: '组',
          unitPrice: 10.9,
          lineTotal: 10.9,
        },
        {
          name: '盒马日日鲜 生菜 约500g',
          spec: '约500g/份',
          qty: 1,
          unit: '份',
          unitPrice: 2.99,
          lineTotal: 2.99,
        },
      ],
      subtotal: 13.89,
      paid: 13.89,
      incomplete: false,
      note: '',
    });

    const [result] = await service.importFromScreenshots({
      purchaseListId: 'list-1',
      userId: 'user-1',
      imageUrls: ['https://img.example.com/b.jpg'],
    });

    const cola = result.lines.find((line: any) =>
      String(line.rawName).includes('可口可乐'),
    );
    const lettuce = result.lines.find((line: any) =>
      String(line.rawName).includes('生菜'),
    );
    expect(cola.isPersonal).toBe(true);
    expect(cola.state).toBe('PERSONAL');
    // 认得出的原料还是照常匹配，不要被一起标成个人
    expect(lettuce.isPersonal).toBe(false);
    expect(lettuce.state).toBe('MATCHED');
  });

  it('同一张图重复导入 → 拒绝', async () => {
    prisma.purchaseOrderImport.findFirst.mockResolvedValue({ id: 'old' });

    await expect(
      service.importFromScreenshots({
        purchaseListId: 'list-1',
        userId: 'user-1',
        imageUrls: ['https://img.example.com/a.jpg'],
      }),
    ).rejects.toThrow('这张截图已经导入过');
  });

  it('按重量的行没有商品，就是待选商品（不再算已匹配）', () => {
    const view = (service as any).toLineView(
      {
        id: 'line-1',
        lineNo: 1,
        rawName: '新鲜羊心',
        spec: '3斤',
        qty: 3,
        unit: '斤',
        unitPrice: 12.46,
        lineTotal: 37.39,
        ingredientId: 'ing-1',
        procurementSkuId: null,
        isPersonal: false,
        editedByUser: false,
        matchConfidence: 'HIGH',
        matchSource: 'MANUAL',
      },
      {},
    );

    expect(view.state).toBe('NEEDS_SKU');
    expect(view.procurementSkuId).toBeNull();
  });

  it('按重量的行挂了商品，状态是已匹配，商品不会被抹掉', () => {
    const view = (service as any).toLineView(
      {
        id: 'line-1',
        lineNo: 1,
        rawName: '新鲜羊心',
        spec: '600克',
        qty: 600,
        unit: '克',
        unitPrice: 0.05,
        lineTotal: 30,
        ingredientId: 'ing-1',
        procurementSkuId: 'sku-1',
        isPersonal: false,
        editedByUser: false,
        matchConfidence: 'HIGH',
        matchSource: 'MANUAL',
      },
      {},
    );

    expect(view.state).toBe('MATCHED');
    expect(view.procurementSkuId).toBe('sku-1');
  });

  it('补货草稿：跨草稿的重复图会被旧草稿导入替换', async () => {
    prisma.purchaseList.findUnique.mockResolvedValue({
      id: 'draft-1',
      status: 'PENDING',
      startedAt: null,
      isDraft: true,
      reimbursementId: null,
      items: [],
    });
    prisma.purchaseOrderImport.findFirst.mockResolvedValue({
      id: 'old',
      status: 'DRAFT',
      purchaseList: { isDraft: true },
    });

    await service.importFromScreenshots({
      purchaseListId: 'draft-1',
      userId: 'user-1',
      imageUrls: ['https://img.example.com/same.jpg'],
    });

    expect(prisma.purchaseOrderImport.update).toHaveBeenCalledWith({
      where: { id: 'old' },
      data: { status: 'DISCARDED' },
    });
    expect(prisma.purchaseOrderImport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ uploadedById: 'user-1' }),
      }),
    );
  });

  it('超过 5 张 → 拒绝', async () => {
    await expect(
      service.importFromScreenshots({
        purchaseListId: 'list-1',
        userId: 'user-1',
        imageUrls: ['a', 'b', 'c', 'd', 'e', 'f'],
      }),
    ).rejects.toThrow('一次最多识别 5 笔订单');
  });

  it('还有行没匹配原料时，不允许确认生成', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        channel: '盒马鲜生',
        subtotal: 10,
        lines: [
          {
            id: 'line-1',
            rawName: '牛肋条',
            isPersonal: false,
            ingredientId: null,
            procurementSkuId: null,
            lineTotal: 10,
            qty: 1,
          },
        ],
      },
    ]);

    await expect(
      service.confirm(['import-1'], 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.confirm(['import-1'], 'user-1')).rejects.toThrow(
      '没匹配原料',
    );
  });

  it('各行金额与截图合计对不上（员工已核对）时，允许确认生成', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 100,
        channel: '盒马',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-1',
            rawName: '生菜',
            isPersonal: false,
            ingredientId: 'ing-1',
            procurementSkuId: 'sku-1',
            lineTotal: 30,
            qty: 1,
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ing-1',
      name: '生菜 500g/袋',
      purchaseChannel: '盒马鲜生',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 500,
      ingredient: { baseUnit: 'G', name: '生菜', purchaseToBaseRatio: 500 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-1' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    await expect(service.confirm(['import-1'], 'user-1')).resolves.toEqual({
      createdCount: 1,
      renamed: [],
    });
  });

  it('原料已标「无需采购」时，生成采购记录顺手把标记清掉', async () => {
    // 2026-11-07 老板反馈：先标「无需采购」、后确认 AI 识别，记录生成了但被标记盖住，
    // 详情页只剩 2 个「已录入」。生成记录时必须把标记清掉，两者不能并存。
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 4.79,
        channel: '盒马',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-1',
            rawName: '菠菜',
            isPersonal: false,
            ingredientId: 'ing-1',
            procurementSkuId: 'sku-1',
            lineTotal: 4.79,
            qty: 1,
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ing-1',
      name: '菠菜 300g/袋',
      purchaseChannel: '盒马鲜生',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 300,
      ingredient: { baseUnit: 'G', name: '菠菜', purchaseToBaseRatio: 300 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-1' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    await expect(service.confirm(['import-1'], 'user-1')).resolves.toEqual({
      createdCount: 1,
      renamed: [],
    });
    expect(prisma.purchaseItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', noPurchaseNeeded: true },
      data: {
        noPurchaseNeeded: false,
        noPurchaseReason: null,
        noPurchaseMarkedAt: null,
        noPurchaseMarkedById: null,
      },
    });
  });

  it('按重量买但没有挂商品的行，不能生成采购记录', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 37.39,
        channel: '淘宝',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-1',
            rawName: '新鲜羊心 3斤',
            isPersonal: false,
            ingredientId: 'ing-1',
            procurementSkuId: null,
            purchaseItemId: 'item-1',
            unit: '斤',
            lineTotal: 37.39,
            qty: 3,
          },
        ],
      },
    ]);

    await expect(service.confirm(['import-1'], 'user-1')).rejects.toThrow(
      /采购商品/,
    );
    expect(prisma.purchaseRecord.create).not.toHaveBeenCalled();
  });

  it('散称挂「按克卖」的商品：600 克入库，金额记在这条商品上', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 30,
        channel: '菜市场',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-1',
            rawName: '牛肉 600克',
            isPersonal: false,
            ingredientId: 'ing-1',
            procurementSkuId: 'sku-1',
            purchaseItemId: 'item-1',
            unit: '克',
            lineTotal: 30,
            qty: 600,
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ing-1',
      name: '菜市场牛肉（按克）',
      productModel: null,
      purchaseChannel: '菜市场',
      purchaseUnit: '克',
      purchaseToBaseRatio: 1,
      ingredient: { baseUnit: 'G', name: '牛肉', purchaseToBaseRatio: 1 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-1' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    await expect(service.confirm(['import-1'], 'user-1')).resolves.toEqual({
      createdCount: 1,
      renamed: [],
    });

    expect(prisma.purchaseRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        procurementSkuId: 'sku-1',
        actualQuantity: 600,
        actualBaseQuantity: 600,
        actualBaseUnit: 'G',
        actualCost: 30,
      }),
    });
  });

  it('个人物品行不生成记录，也不会去清别的原料的无需采购标记', async () => {
    // 一瓶可乐是员工自己喝的：isPersonal 行在确认时直接跳过，
    // 不能因为「同一张单子里还有别的行」就把它的原料标记也清掉。
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 16.79,
        channel: '盒马',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-1',
            rawName: '可口可乐 330ml*6',
            isPersonal: true,
            ingredientId: null,
            procurementSkuId: null,
            lineTotal: 12,
            qty: 1,
          },
          {
            id: 'line-2',
            rawName: '菠菜',
            isPersonal: false,
            ingredientId: 'ing-1',
            procurementSkuId: 'sku-1',
            lineTotal: 4.79,
            qty: 1,
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ing-1',
      name: '菠菜 300g/袋',
      purchaseChannel: '盒马鲜生',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 300,
      ingredient: { baseUnit: 'G', name: '菠菜', purchaseToBaseRatio: 300 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-1' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    await expect(service.confirm(['import-1'], 'user-1')).resolves.toEqual({
      createdCount: 1,
      renamed: [],
    });
    expect(prisma.purchaseItem.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.purchaseRecord.create).toHaveBeenCalledTimes(1);
  });

  it('模型判了截图不完整（员工已核对）时，允许确认生成', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: true,
        subtotal: 207.06,
        channel: '盒马',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-1',
            rawName: '白虾仁',
            isPersonal: false,
            ingredientId: 'ing-1',
            procurementSkuId: 'sku-1',
            lineTotal: 29.99,
            qty: 1,
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ing-1',
      name: '白虾仁 200g/袋',
      purchaseChannel: '盒马鲜生',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 200,
      ingredient: { baseUnit: 'G', name: '白虾仁', purchaseToBaseRatio: 200 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-1' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    await expect(service.confirm(['import-1'], 'user-1')).resolves.toEqual({
      createdCount: 1,
      renamed: [],
    });
  });

  it('数量缺失或为 0 时，确认被拒', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        channel: '盒马鲜生',
        incomplete: false,
        subtotal: 10,
        lines: [
          {
            id: 'line-1',
            rawName: '生菜',
            isPersonal: false,
            ingredientId: 'ing-1',
            procurementSkuId: 'sku-1',
            lineTotal: 10,
            qty: 0,
          },
        ],
      },
    ]);

    await expect(service.confirm(['import-1'], 'user-1')).rejects.toThrow(
      '没有有效数量',
    );
  });

  it('别处私有目录的 key 不允许拿来签名', async () => {
    await expect(
      service.importFromScreenshots({
        purchaseListId: 'list-1',
        userId: 'user-1',
        imageUrls: ['https://img.example.com/a.jpg'],
        imageKeys: ['custom-recipe-sensitive-attachments/secret.jpg'],
      }),
    ).rejects.toThrow('图片地址无效');
    expect(cosService.getSignedUrl).not.toHaveBeenCalled();
  });

  it('确认生成时按采购商品的净含量换算，并带上来源', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 10,
        channel: '盒马',
        orderTime: null,
        imageKeys: ['purchase-order-screenshots/a.jpg'],
        lines: [
          {
            id: 'line-1',
            rawName: '生菜 500g',
            isPersonal: false,
            ingredientId: 'ing-1',
            procurementSkuId: 'sku-1',
            purchaseItemId: 'item-1',
            lineTotal: 10,
            qty: 1,
            unit: '袋',
            spec: '500g/袋',
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ing-1',
      name: '生菜 500g/袋',
      purchaseChannel: '盒马鲜生',
      purchaseUnit: '袋',
      // 2026-11-07 复核：换算只认商品自己的，不再退回原料比例
      purchaseToBaseRatio: 500,
      ingredient: { baseUnit: 'G', name: '生菜', purchaseToBaseRatio: 500 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-1' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    const result = await service.confirm(['import-1'], 'user-1');

    expect(result).toEqual({ createdCount: 1, renamed: [] });
    expect(prisma.purchaseRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualBaseQuantity: 500,
          actualCost: 10,
          sourceImportId: 'import-1',
          sourceImportLineId: 'line-1',
        }),
      }),
    );
  });

  it('SKU 净含量优先于原料比例：200g/盒 按 200 克换算', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-2',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 4.99,
        channel: '沃尔玛',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-2',
            rawName: '【鲜宰】猪肝 200g',
            isPersonal: false,
            ingredientId: 'ing-liver',
            procurementSkuId: 'sku-liver',
            purchaseItemId: 'item-liver',
            lineTotal: 4.99,
            qty: 1,
            unit: '盒',
            spec: '200g',
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-liver',
      ingredientId: 'ing-liver',
      name: '【鲜宰】猪肝 200g',
      purchaseChannel: '沃尔玛',
      purchaseUnit: '盒',
      purchaseToBaseRatio: 200,
      ingredient: { baseUnit: 'G', name: '猪肝', purchaseToBaseRatio: 1 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-liver' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-2' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    await service.confirm(['import-2'], 'user-1');

    expect(prisma.purchaseRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualPackageSize: 200,
          actualBaseQuantity: 200,
        }),
      }),
    );
  });

  it('行上还是识别留下的「件」时，生成前自动换成商品的「份」并回写', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-3',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 7.99,
        channel: '沃尔玛',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-3',
            rawName: '【霜打菜分外甜】紫甘蓝 700g',
            isPersonal: false,
            ingredientId: 'ing-cabbage',
            procurementSkuId: 'sku-cabbage',
            purchaseItemId: 'item-cabbage',
            lineTotal: 7.99,
            qty: 1,
            // 2026-11-14 真机：截图只写「700g」，识别按老提示词写了「件」
            unit: '件',
            spec: '700g',
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-cabbage',
      ingredientId: 'ing-cabbage',
      name: '紫甘蓝 700g',
      purchaseChannel: '沃尔玛',
      purchaseUnit: '份',
      purchaseToBaseRatio: 700,
      ingredient: { baseUnit: 'G', name: '紫甘蓝', purchaseToBaseRatio: 1 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-cabbage' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-3' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    await service.confirm(['import-3'], 'user-1');

    // 占位单位被换成商品单位，草稿也一起回写
    expect(prisma.purchaseOrderImportLine.update).toHaveBeenCalledWith({
      where: { id: 'line-3' },
      data: { unit: '份' },
    });
    expect(prisma.purchaseRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actualPackageCount: 1,
          actualPackageSize: 700,
          actualBaseQuantity: 700,
        }),
      }),
    );
  });

  it('行上没写单位、商品按「箱」卖 → 生成被拒，先确认单位', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-4',
        purchaseListId: 'list-1',
        status: 'DRAFT',
        incomplete: false,
        subtotal: 99,
        channel: '沃尔玛',
        orderTime: null,
        imageKeys: [],
        lines: [
          {
            id: 'line-4',
            rawName: '整箱牛奶 24瓶',
            isPersonal: false,
            ingredientId: 'ing-milk',
            procurementSkuId: 'sku-milk',
            purchaseItemId: 'item-milk',
            lineTotal: 99,
            qty: 1,
            unit: null,
            spec: '24×330ml',
          },
        ],
      },
    ]);
    prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-milk',
      ingredientId: 'ing-milk',
      name: '整箱牛奶',
      purchaseChannel: '沃尔玛',
      purchaseUnit: '箱',
      purchaseToBaseRatio: 7920,
      ingredient: { baseUnit: 'G', name: '牛奶', purchaseToBaseRatio: 1 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-milk' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    await expect(service.confirm(['import-4'], 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.purchaseRecord.create).not.toHaveBeenCalled();
  });

  describe('生成采购记录时同步商品名（2026-11-05）', () => {
    const primeConfirm = (line: Record<string, unknown>) => {
      prisma.purchaseOrderImport.findMany.mockResolvedValue([
        {
          id: 'import-1',
          purchaseListId: 'list-1',
          status: 'DRAFT',
          incomplete: false,
          subtotal: 99.8,
          channel: '盒马鲜生',
          orderTime: null,
          imageKeys: [],
          lines: [
            {
              id: 'line-1',
              rawName: '冰鲜 原切澳洲牛嫩肉 450g',
              isPersonal: false,
              ingredientId: 'ing-beef',
              procurementSkuId: 'sku-beef',
              purchaseItemId: 'item-1',
              lineTotal: 99.8,
              qty: 2,
              unit: '袋',
              spec: '450g/袋',
              ...line,
            },
          ],
        },
      ]);
      prisma.purchaseOrderImport.updateMany.mockResolvedValue({ count: 1 });
      prisma.procurementSku.findUnique.mockResolvedValue({
        id: 'sku-beef',
        ingredientId: 'ing-beef',
        name: '牛嫩肉',
        productModel: '450g/袋',
        purchaseChannel: '盒马鲜生',
        purchaseUnit: '袋',
        purchaseToBaseRatio: 450,
        ingredient: { baseUnit: 'G', name: '牛肉', purchaseToBaseRatio: 450 },
      });
      prisma.procurementSku.findMany.mockResolvedValue([]);
      prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
      prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-1' });
      prisma.purchaseOrderImportLine.update.mockResolvedValue({});
    };

    it('认得出来的行：把截图叫法写成商品名，去掉跟规格重复的尾巴，记录里也用新名字', async () => {
      primeConfirm({ matchConfidence: 'HIGH' });

      const result = await service.confirm(['import-1'], 'user-1');

      expect(result.renamed).toEqual([
        {
          lineId: 'line-1',
          skuId: 'sku-beef',
          from: '牛嫩肉',
          to: '冰鲜 原切澳洲牛嫩肉',
        },
      ]);
      expect(prisma.procurementSku.update).toHaveBeenCalledWith({
        where: { id: 'sku-beef' },
        data: { name: '冰鲜 原切澳洲牛嫩肉' },
      });
      expect(prisma.procurementSkuNameChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          skuId: 'sku-beef',
          oldName: '牛嫩肉',
          newName: '冰鲜 原切澳洲牛嫩肉',
          source: 'ORDER_IMPORT',
          changedById: 'user-1',
        }),
      });
      expect(prisma.purchaseRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            procurementSkuName: '冰鲜 原切澳洲牛嫩肉',
          }),
        }),
      );
    });

    it('按原料猜出来的行（中可信）不改名，免得把错的名字写进商品表', async () => {
      primeConfirm({ matchConfidence: 'MEDIUM', matchSource: 'AUTO' });

      const result = await service.confirm(['import-1'], 'user-1');

      expect(result.renamed).toEqual([]);
      expect(prisma.procurementSku.update).not.toHaveBeenCalled();
      expect(prisma.procurementSkuNameChange.create).not.toHaveBeenCalled();
      expect(prisma.purchaseRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ procurementSkuName: '牛嫩肉' }),
        }),
      );
    });

    it('员工自己选的商品算认得出来，照样改名', async () => {
      primeConfirm({ matchConfidence: 'MEDIUM', matchSource: 'MANUAL' });

      const result = await service.confirm(['import-1'], 'user-1');

      expect(result.renamed).toHaveLength(1);
      expect(prisma.procurementSku.update).toHaveBeenCalled();
    });

    it('同渠道已经有同名同规格的商品时，不改名（否则以后两件货分不开）', async () => {
      primeConfirm({ matchConfidence: 'HIGH' });
      prisma.procurementSku.findMany.mockResolvedValue([
        { id: 'sku-other', productModel: '450g/袋' },
      ]);

      const result = await service.confirm(['import-1'], 'user-1');

      expect(result.renamed).toEqual([]);
      expect(prisma.procurementSku.update).not.toHaveBeenCalled();
    });

    it('截图叫法只是商品名去掉规格时，不把商品名改短（同名商品反查带出来的行）', async () => {
      primeConfirm({
        matchConfidence: 'HIGH',
        rawName: '冷鲜 鲜切黄牛后腿肉',
        spec: '约200g',
        // 2026-11-11：商品是按「盒」买的，这行也必须写「盒」——
        // 单位不一致会被门禁拦下（这正是本轮修掉的静默 10 倍）
        unit: '盒',
      });
      prisma.procurementSku.findUnique.mockResolvedValue({
        id: 'sku-beef',
        ingredientId: 'ing-beef',
        name: '冷鲜 鲜切黄牛后腿肉 约200g',
        productModel: '200g',
        purchaseChannel: '沃尔玛',
        purchaseUnit: '盒',
        purchaseToBaseRatio: 200,
        ingredient: { baseUnit: 'G', name: '牛霖', purchaseToBaseRatio: 200 },
      });

      const result = await service.confirm(['import-1'], 'user-1');

      // 归一化后是同一个名字，只是规格写法不同 —— 不该写一条改名历史
      expect(result.renamed).toEqual([]);
      expect(prisma.procurementSku.update).not.toHaveBeenCalled();
    });
  });

  it('手动匹配现有商品时同步商品名并写改名记录', async () => {
    prisma.purchaseOrderImportLine.findFirst.mockResolvedValue({
      id: 'line-1',
      importId: 'import-1',
      ingredientId: 'ing-1',
      procurementSkuId: null,
      rawName: '【鲜宰】猪肝 200g',
      import: { purchaseListId: 'list-1', status: 'DRAFT', channel: '沃尔玛' },
    });
    prisma.procurementSku.findFirst.mockResolvedValue({
      id: 'sku-liver',
      name: '猪肝',
      purchaseChannel: '沃尔玛',
    });
    prisma.procurementSku.findUnique.mockResolvedValue({ name: '猪肝' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({
      id: 'line-1',
      lineNo: 1,
      rawName: '【鲜宰】猪肝 200g',
      spec: '200g',
      qty: 1,
      unit: '盒',
      unitPrice: 4.99,
      lineTotal: 4.99,
      ingredientId: 'ing-1',
      procurementSkuId: 'sku-liver',
      isPersonal: false,
      editedByUser: true,
      matchConfidence: 'HIGH',
    });

    await service.updateLine({
      importId: 'import-1',
      lineId: 'line-1',
      userId: 'user-1',
      dto: { procurementSkuId: 'sku-liver', syncSkuName: true },
    });

    expect(prisma.procurementSku.update).toHaveBeenCalledWith({
      where: { id: 'sku-liver' },
      data: { name: '【鲜宰】猪肝 200g' },
    });
    expect(prisma.procurementSkuNameChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        skuId: 'sku-liver',
        oldName: '猪肝',
        newName: '【鲜宰】猪肝 200g',
        source: 'ORDER_IMPORT',
        changedById: 'user-1',
      }),
    });
  });

  it('只换商品、不勾选同步时，绝不动商品名', async () => {
    prisma.purchaseOrderImportLine.findFirst.mockResolvedValue({
      id: 'line-1',
      importId: 'import-1',
      ingredientId: 'ing-1',
      procurementSkuId: null,
      rawName: '【鲜宰】猪肝 200g',
      import: { purchaseListId: 'list-1', status: 'DRAFT', channel: '沃尔玛' },
    });
    prisma.procurementSku.findFirst.mockResolvedValue({
      id: 'sku-liver',
      name: '猪肝',
      purchaseChannel: '沃尔玛',
    });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({
      id: 'line-1',
      lineNo: 1,
      rawName: '【鲜宰】猪肝 200g',
      ingredientId: 'ing-1',
      procurementSkuId: 'sku-liver',
      isPersonal: false,
      editedByUser: true,
    });

    const result = await service.updateLine({
      importId: 'import-1',
      lineId: 'line-1',
      userId: 'user-1',
      dto: { procurementSkuId: 'sku-liver' },
    });

    expect(prisma.procurementSku.update).not.toHaveBeenCalled();
    expect(prisma.procurementSkuNameChange.create).not.toHaveBeenCalled();
    expect(result.renamedTo).toBeUndefined();
  });

  it('字面匹配不上时，让模型在清单内做语义匹配（鲑鱼→三文鱼）', async () => {
    prisma.purchaseItem.findMany.mockResolvedValue([
      { id: 'item-1', ingredientId: 'ing-1', ingredientName: '生菜' },
      { id: 'item-salmon', ingredientId: 'ing-salmon', ingredientName: '三文鱼' },
    ]);
    prisma.procurementSku.findMany.mockResolvedValue([
      {
        id: 'sku-1',
        ingredientId: 'ing-1',
        name: '生菜 500g/袋',
        productModel: '500g/袋',
        purchaseChannel: '盒马鲜生',
        purchaseToBaseRatio: 500,
        purchaseUnit: '袋',
      },
      {
        id: 'sku-salmon',
        ingredientId: 'ing-salmon',
        name: "Member's Mark 智利大西洋鲑鱼块 1kg",
        productModel: '1kg',
        purchaseChannel: '山姆会员店',
        purchaseToBaseRatio: 1000,
        purchaseUnit: '袋',
      },
    ]);
    model.callDeepSeekJson
      .mockResolvedValueOnce({
        channel: '山姆',
        orderNo: 'SK20261105-001',
        orderTime: '2026-11-05 09:00',
        items: [
          {
            // 刻意不写成商品名：商品名完全一致会被「同名商品反查」直接认走，
            // 这里要验的是「字面认不出 → 交给模型做语义归一」这条路。
            name: '智利大西洋鲑鱼排',
            spec: '1kg',
            qty: 1,
            unit: '袋',
            unitPrice: 125.9,
            lineTotal: 125.9,
          },
        ],
        subtotal: 125.9,
        shippingFee: 0,
        packagingFee: 2,
        paid: 127.9,
        incomplete: false,
        note: '一致',
      })
      .mockResolvedValueOnce({
        matches: [{ lineNo: 1, ingredient: '三文鱼', confidence: 'HIGH' }],
      });

    const [result] = await service.importFromScreenshots({
      purchaseListId: 'list-1',
      userId: 'user-1',
      imageUrls: ['https://img.example.com/a.jpg'],
    });

    expect(model.callDeepSeekJson).toHaveBeenCalledTimes(2);
    expect(result.lines[0].ingredientId).toBe('ing-salmon');
    expect(result.lines[0].procurementSkuId).toBe('sku-salmon');
    expect(result.lines[0].state).toBe('MATCHED');
  });

  it('截图商品名与清单商品完全同名时直接匹配，不再花一次模型调用做语义', async () => {
    prisma.purchaseItem.findMany.mockResolvedValue([
      { id: 'item-beef', ingredientId: 'ing-beef', ingredientName: '牛霖' },
    ]);
    prisma.procurementSku.findMany.mockResolvedValue([
      {
        id: 'sku-beef',
        ingredientId: 'ing-beef',
        name: '冷鲜 鲜切黄牛后腿肉 约200g',
        productModel: '200g',
        purchaseChannel: '沃尔玛',
        purchaseToBaseRatio: 200,
        purchaseUnit: '盒',
      },
    ]);
    model.callDeepSeekJson.mockResolvedValue({
      channel: '沃尔玛',
      items: [
        {
          name: '冷鲜 鲜切黄牛后腿肉',
          spec: '约200g',
          qty: 3,
          unit: '盒',
          unitPrice: 23.98,
          lineTotal: 71.94,
        },
      ],
      subtotal: 71.94,
      shippingFee: 0,
      packagingFee: 0,
      paid: 71.94,
      incomplete: false,
      note: '',
    });

    const [result] = await service.importFromScreenshots({
      purchaseListId: 'list-1',
      userId: 'user-1',
      imageUrls: ['https://img.example.com/a.jpg'],
    });

    // 只调了读图那一次：同名反查已经把行认掉了，没有第二次语义调用
    expect(model.callDeepSeekJson).toHaveBeenCalledTimes(1);
    expect(result.lines[0].ingredientId).toBe('ing-beef');
    expect(result.lines[0].procurementSkuId).toBe('sku-beef');
    expect(result.lines[0].confidence).toBe('HIGH');
    expect(result.lines[0].state).toBe('MATCHED');
  });

  it('带 COS key 时用签名链接下载私有截图', async () => {
    model.callDeepSeekJson.mockResolvedValue({
      channel: '盒马',
      items: [{ name: '生菜', qty: 1, unitPrice: 2.99, lineTotal: 2.99 }],
      subtotal: 2.99,
      incomplete: false,
    });

    await service.importFromScreenshots({
      purchaseListId: 'list-1',
      userId: 'user-1',
      imageUrls: ['https://img.example.com/a.jpg'],
      imageKeys: ['purchase-order-screenshots/a.jpg'],
    });

    expect(cosService.getSignedUrl).toHaveBeenCalledWith(
      'purchase-order-screenshots/a.jpg',
      600,
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://signed.example.com/x.jpg',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  describe('updateLine', () => {
    beforeEach(() => {
      prisma.purchaseOrderImportLine.findFirst.mockResolvedValue({
        id: 'line-1',
        importId: 'import-1',
        ingredientId: 'ing-1',
        procurementSkuId: 'sku-1',
        qty: 1,
        unit: null,
        unitPrice: 10,
        lineTotal: 10,
        import: { status: 'DRAFT', purchaseListId: 'list-1' },
      });
      prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
      prisma.purchaseOrderImportLine.update.mockImplementation(
        async ({ data }: any) => ({ id: 'line-1', ...data }),
      );
    });

    it('可以改截图里的商品名（识别错了直接改）', async () => {
      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        userId: 'user-1',
        dto: { rawName: '  盒马日日鲜 小白菜 300g  ' },
      });
      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.rawName).toBe('盒马日日鲜 小白菜 300g');
      expect(data.editedByUser).toBe(true);
    });

    it('名字改成空的 → 拒绝，不落库', async () => {
      await expect(
        service.updateLine({
          importId: 'import-1',
          lineId: 'line-1',
          dto: { rawName: '   ' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.purchaseOrderImportLine.update).not.toHaveBeenCalled();
    });

    it('重存同一个原料时保留已选商品', async () => {
      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        dto: { ingredientId: 'ing-1', qty: 2 },
      });
      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.procurementSkuId).toBeUndefined();
      expect(data.qty).toBe(2);
    });

    it('换了原料会清掉旧商品', async () => {
      prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-2' });
      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        dto: { ingredientId: 'ing-2' },
      });
      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.procurementSkuId).toBeNull();
    });

    it('补货草稿可以从全库选原料，不要求在清单里有明细', async () => {
      prisma.purchaseList.findUnique.mockResolvedValue({ isDraft: true });
      prisma.ingredient.findUnique.mockResolvedValue({ id: 'ing-9' });

      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        dto: { ingredientId: 'ing-9' },
      });

      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.ingredientId).toBe('ing-9');
      expect(data.purchaseItemId).toBeNull();
      expect(data.isPersonal).toBe(false);
    });

    it('挂上按「份」卖的商品时，识别留下的「件」自动换成「份」', async () => {
      prisma.purchaseOrderImportLine.findFirst.mockResolvedValue({
        id: 'line-1',
        importId: 'import-1',
        ingredientId: 'ing-1',
        procurementSkuId: null,
        qty: 1,
        unit: '件',
        unitPrice: 7.99,
        lineTotal: 7.99,
        import: {
          status: 'DRAFT',
          purchaseListId: 'list-1',
          channel: '沃尔玛',
        },
      });
      prisma.procurementSku.findFirst.mockResolvedValue({
        id: 'sku-cabbage',
        name: '紫甘蓝 700g',
        purchaseChannel: '沃尔玛',
        purchaseUnit: '份',
      });

      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        dto: { procurementSkuId: 'sku-cabbage', unit: '件' },
      });

      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.unit).toBe('份');
    });

    it('员工写的是真实单位（斤）时不动，交给门禁提示', async () => {
      prisma.purchaseOrderImportLine.findFirst.mockResolvedValue({
        id: 'line-1',
        importId: 'import-1',
        ingredientId: 'ing-1',
        procurementSkuId: null,
        qty: 3,
        unit: '斤',
        unitPrice: 12,
        lineTotal: 36,
        import: {
          status: 'DRAFT',
          purchaseListId: 'list-1',
          channel: '沃尔玛',
        },
      });
      prisma.procurementSku.findFirst.mockResolvedValue({
        id: 'sku-kg',
        name: '羊心 1kg',
        purchaseChannel: '沃尔玛',
        purchaseUnit: 'kg',
      });

      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        dto: { procurementSkuId: 'sku-kg', unit: '斤' },
      });

      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.unit).toBe('斤');
    });

    it('可以改单位（重量行改成件数）', async () => {
      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        dto: { unit: '袋' },
      });
      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.unit).toBe('袋');
    });

    it('挂别的渠道的商品 → 拒绝，不落库（2026-11-07）', async () => {
      prisma.purchaseOrderImportLine.findFirst.mockResolvedValue({
        id: 'line-1',
        importId: 'import-1',
        ingredientId: 'ing-1',
        procurementSkuId: null,
        qty: 1,
        unit: null,
        unitPrice: 10,
        lineTotal: 10,
        import: {
          status: 'DRAFT',
          purchaseListId: 'list-1',
          channel: '沃尔玛',
        },
      });
      prisma.procurementSku.findFirst.mockResolvedValue({
        id: 'sku-sams',
        name: '冷鲜 鲜切黄牛后腿肉 约200g',
        purchaseChannel: '山姆会员店',
      });

      await expect(
        service.updateLine({
          importId: 'import-1',
          lineId: 'line-1',
          dto: { procurementSkuId: 'sku-sams' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.purchaseOrderImportLine.update).not.toHaveBeenCalled();
    });

    it('挂同渠道的商品（别名写法也算）→ 正常保存', async () => {
      prisma.purchaseOrderImportLine.findFirst.mockResolvedValue({
        id: 'line-1',
        importId: 'import-1',
        ingredientId: 'ing-1',
        procurementSkuId: null,
        qty: 1,
        unit: null,
        unitPrice: 10,
        lineTotal: 10,
        import: {
          status: 'DRAFT',
          purchaseListId: 'list-1',
          channel: '山姆会员店',
        },
      });
      prisma.procurementSku.findFirst.mockResolvedValue({
        id: 'sku-sams',
        name: 'MM澳洲谷饲牛霖',
        // 老数据写的是别名「山姆」，订单渠道是字典码
        purchaseChannel: '山姆',
      });

      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        dto: { procurementSkuId: 'sku-sams' },
      });

      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.procurementSkuId).toBe('sku-sams');
    });

    it('订单还没确认渠道 → 不许挂商品', async () => {
      prisma.purchaseOrderImportLine.findFirst.mockResolvedValue({
        id: 'line-1',
        importId: 'import-1',
        ingredientId: 'ing-1',
        procurementSkuId: null,
        qty: 1,
        unit: null,
        unitPrice: 10,
        lineTotal: 10,
        import: { status: 'DRAFT', purchaseListId: 'list-1', channel: null },
      });
      prisma.procurementSku.findFirst.mockResolvedValue({
        id: 'sku-wm',
        name: '冷鲜 鲜切黄牛后腿肉',
        purchaseChannel: '沃尔玛',
      });

      await expect(
        service.updateLine({
          importId: 'import-1',
          lineId: 'line-1',
          dto: { procurementSkuId: 'sku-wm' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateImport（运费/包装费人工修正）', () => {
    const baseRow = {
      id: 'import-1',
      purchaseListId: 'list-1',
      channel: '山姆',
      orderNo: null,
      orderTime: null,
      subtotal: 125.9,
      shippingFee: 2,
      packagingFee: null,
      paid: 127.9,
      imageUrls: [],
      imageKeys: [],
      status: 'DRAFT',
      incomplete: false,
      incompleteReason: null,
      model: 'test-model',
      promptVersion: 'test-version',
      rawResult: {
        subtotal: 125.9,
        shippingFee: 2,
        packagingFee: null,
        paid: 127.9,
        items: [],
      },
      confirmedAt: null,
      createdAt: new Date(),
      lines: [],
    };

    beforeEach(() => {
      prisma.purchaseOrderImport.findUnique.mockResolvedValue({ ...baseRow });
      prisma.purchaseOrderImport.update.mockImplementation(
        async ({ data }: any) => ({ ...baseRow, ...data }),
      );
    });

    it('运费/包装费随便改，并把模型读到的原值一起返回', async () => {
      const view = await service.updateImport('import-1', {
        shippingFee: 3.5,
        packagingFee: 0,
      });
      const data = prisma.purchaseOrderImport.update.mock.calls[0][0].data;
      expect(data.shippingFee).toBe(3.5);
      expect(data.packagingFee).toBe(0);
      // 原值留在 rawResult 里，页面靠 ai* 字段做「已改动」对照。
      expect(view.shippingFee).toBe(3.5);
      expect(view.aiShippingFee).toBe(2);
      expect(view.aiPackagingFee).toBeNull();
    });

    it('负数或超过上限的金额被拒绝，不落库', async () => {
      await expect(
        service.updateImport('import-1', { shippingFee: -1 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateImport('import-1', { packagingFee: 99999 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.purchaseOrderImport.update).not.toHaveBeenCalled();
    });

    it('传 null 表示清空（按 0 计）', async () => {
      const view = await service.updateImport('import-1', {
        shippingFee: null,
      });
      const data = prisma.purchaseOrderImport.update.mock.calls[0][0].data;
      expect(data.shippingFee).toBeNull();
      expect(view.shippingFee).toBeNull();
      expect(view.aiShippingFee).toBe(2);
    });

    it('渠道不在字典里 → 拒绝，不落库', async () => {
      await expect(
        service.updateImport('import-1', { channel: '大润发' }),
      ).rejects.toThrow('不在渠道清单里');
      expect(prisma.purchaseOrderImport.update).not.toHaveBeenCalled();
    });

    it('改渠道后重新匹配没动过的行（只改名字等于没改）', async () => {
      const pendingRow = {
        ...baseRow,
        channel: null,
        lines: [
          {
            id: 'line-1',
            lineNo: 1,
            rawName: '生蚝肉 200g',
            spec: '200g/包',
            qty: 1,
            unit: '包',
            unitPrice: 10,
            lineTotal: 10,
            ingredientId: 'ing-oyster',
            procurementSkuId: null,
            purchaseItemId: 'item-oyster',
            matchSource: 'AUTO',
            editedByUser: false,
            isPersonal: false,
          },
        ],
      };
      prisma.purchaseOrderImport.findUnique
        .mockResolvedValueOnce(pendingRow)
        .mockResolvedValueOnce({ ...pendingRow, channel: '盒马鲜生' });
      prisma.purchaseOrderImport.update.mockImplementation(
        async ({ data }: any) => ({ ...pendingRow, ...data, lines: [] }),
      );
      prisma.purchaseItem.findMany.mockResolvedValue([
        { id: 'item-oyster', ingredientId: 'ing-oyster', ingredientName: '生蚝' },
      ]);
      prisma.procurementSku.findMany.mockResolvedValue([
        {
          id: 'sku-hm',
          ingredientId: 'ing-oyster',
          name: '生蚝肉 200g/包',
          productModel: '200g/包',
          purchaseChannel: '盒马鲜生',
          purchaseToBaseRatio: 200,
          purchaseUnit: '包',
        },
      ]);
      prisma.purchaseOrderMatchAlias.findMany.mockResolvedValue([]);
      prisma.purchaseOrderImportLine.update.mockResolvedValue({});

      await service.updateImport('import-1', { channel: '盒马' });

      expect(prisma.purchaseOrderImportLine.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ procurementSkuId: 'sku-hm' }),
        }),
      );
    });

    it('已确认的识别记录不允许再改金额', async () => {
      prisma.purchaseOrderImport.findUnique.mockResolvedValue({
        ...baseRow,
        status: 'CONFIRMED',
      });
      await expect(
        service.updateImport('import-1', { shippingFee: 1 }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.purchaseOrderImport.update).not.toHaveBeenCalled();
    });
  });

  /**
   * 放弃识别记录（2026-11-07）。
   *
   * 员工手动挑过商品的映射，是「这个叫法 = 这个商品」的事实；
   * 整笔放弃（重复上传 / 想重来）不该让它白丢。
   */
  describe('discard', () => {
    const draftRow = {
      id: 'import-9',
      purchaseListId: 'list-1',
      channel: '沃尔玛',
      status: 'DRAFT',
      imageKeys: [],
    };

    it('放弃时记住员工手动匹配过的叫法', async () => {
      prisma.purchaseOrderImport.findUnique.mockResolvedValue(draftRow);
      prisma.purchaseOrderImport.update.mockResolvedValue({
        ...draftRow,
        status: 'DISCARDED',
      });
      prisma.purchaseOrderImportLine.findMany.mockResolvedValue([
        {
          rawName: '冷鲜 鲜切黄牛后腿肉',
          ingredientId: 'ing-beef',
          procurementSkuId: 'sku-beef',
        },
      ]);
      prisma.purchaseOrderMatchAlias.upsert.mockResolvedValue({});

      await service.discard('import-9');

      // 只记员工动手匹配过的行，自动匹配/个人采购的不记
      expect(prisma.purchaseOrderImportLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            importId: 'import-9',
            matchSource: { notIn: ['AUTO', 'PERSONAL'] },
            procurementSkuId: { not: null },
          }),
        }),
      );
      expect(prisma.purchaseOrderMatchAlias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            normalizedName_channelFamily: {
              normalizedName: '鲜切黄牛后腿肉',
              channelFamily: '沃尔玛',
            },
          },
          create: expect.objectContaining({
            ingredientId: 'ing-beef',
            procurementSkuId: 'sku-beef',
            channelFamily: '沃尔玛',
          }),
        }),
      );
    });

    it('渠道还没确认时不记：同一个叫法换个渠道就是另一个商品', async () => {
      prisma.purchaseOrderImport.findUnique.mockResolvedValue({
        ...draftRow,
        channel: null,
      });
      prisma.purchaseOrderImport.update.mockResolvedValue({
        ...draftRow,
        status: 'DISCARDED',
      });
      prisma.purchaseOrderImportLine.findMany.mockResolvedValue([
        {
          rawName: '冷鲜 鲜切黄牛后腿肉',
          ingredientId: 'ing-beef',
          procurementSkuId: 'sku-beef',
        },
      ]);

      await service.discard('import-9');

      expect(prisma.purchaseOrderMatchAlias.upsert).not.toHaveBeenCalled();
    });

    it('写别名失败不影响放弃，截图照常删掉（记忆是缓存，不该让主操作失败）', async () => {
      prisma.purchaseOrderImport.findUnique.mockResolvedValue({
        ...draftRow,
        imageKeys: ['purchase-order-screenshots/a.jpg'],
      });
      prisma.purchaseOrderImport.update.mockResolvedValue({
        ...draftRow,
        status: 'DISCARDED',
      });
      prisma.purchaseOrderImportLine.findMany.mockResolvedValue([
        {
          rawName: '冷鲜 鲜切黄牛后腿肉',
          ingredientId: 'ing-beef',
          procurementSkuId: 'sku-beef',
        },
      ]);
      prisma.purchaseOrderMatchAlias.upsert.mockRejectedValue(
        new Error('db is down'),
      );

      await expect(service.discard('import-9')).resolves.toEqual({
        id: 'import-9',
        status: 'DISCARDED',
      });
      expect(cosService.deleteImage).toHaveBeenCalledWith(
        'purchase-order-screenshots/a.jpg',
      );
    });

    it('记别名时带上操作人，而不是上传人', async () => {
      prisma.purchaseOrderImport.findUnique.mockResolvedValue({
        ...draftRow,
        uploadedById: 'uploader-1',
      });
      prisma.purchaseOrderImport.update.mockResolvedValue({
        ...draftRow,
        status: 'DISCARDED',
      });
      prisma.purchaseOrderImportLine.findMany.mockResolvedValue([
        {
          rawName: '冷鲜 鲜切黄牛后腿肉',
          ingredientId: 'ing-beef',
          procurementSkuId: 'sku-beef',
        },
      ]);
      prisma.purchaseOrderMatchAlias.upsert.mockResolvedValue({});

      await service.discard('import-9', 'operator-1');

      expect(prisma.purchaseOrderMatchAlias.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ createdById: 'operator-1' }),
        }),
      );
    });
  });
});
