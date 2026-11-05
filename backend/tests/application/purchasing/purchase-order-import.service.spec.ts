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
  const prisma: any = {
    purchaseList: { findUnique: jest.fn() },
    purchaseItem: { findMany: jest.fn(), findFirst: jest.fn() },
    procurementSku: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    procurementSkuNameChange: { create: jest.fn() },
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
    purchaseOrderImportLine: { findFirst: jest.fn(), update: jest.fn() },
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
          isPersonal: false,
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
    expect(result.channel).toBe('盒马');
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].ingredientId).toBe('ing-1');
    expect(result.lines[0].state).toBe('MATCHED');
    // 模型原始金额要留着，供「原图金额」对照
    expect(result.lines[0].aiLineTotal).toBe(2.99);
    expect(result.summary.matchedAmount).toBe(2.99);
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
    });
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
    });
  });

  it('数量缺失或为 0 时，确认被拒', async () => {
    prisma.purchaseOrderImport.findMany.mockResolvedValue([
      {
        id: 'import-1',
        purchaseListId: 'list-1',
        status: 'DRAFT',
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

  it('确认生成时按原料比例换算，并带上来源', async () => {
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
      ingredient: { baseUnit: 'G', name: '生菜', purchaseToBaseRatio: 500 },
    });
    prisma.purchaseItem.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.purchaseRecord.create.mockResolvedValue({ id: 'record-1' });
    prisma.purchaseOrderImportLine.update.mockResolvedValue({});

    const result = await service.confirm(['import-1'], 'user-1');

    expect(result).toEqual({ createdCount: 1 });
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

    it('可以改单位（重量行改成件数）', async () => {
      await service.updateLine({
        importId: 'import-1',
        lineId: 'line-1',
        dto: { unit: '袋' },
      });
      const data = prisma.purchaseOrderImportLine.update.mock.calls[0][0].data;
      expect(data.unit).toBe('袋');
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
});
