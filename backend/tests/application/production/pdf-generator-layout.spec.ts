import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as zlib from 'zlib';
import { PdfGeneratorService } from '../../../src/infrastructure/services/pdf-generator.service';
import type { PrintTaskDto } from '../../../src/interfaces/dto/production/print-task.dto';

const serviceSource = readFileSync(
  resolve(
    __dirname,
    '../../../src/infrastructure/services/pdf-generator.service.ts',
  ),
  'utf8',
);

function countPages(pdf: Buffer): number {
  const raw = pdf.toString('latin1');
  const matches = raw.match(/\/Count\s+(\d+)/g) || [];
  return matches.reduce((max, item) => {
    const value = Number(item.split(/\s+/)[1]);
    return Math.max(max, Number.isFinite(value) ? value : 0);
  }, 0);
}

/** 解压所有内容流，用于检查颜色算子和文字内容 */
function contentStreams(pdf: Buffer): string[] {
  const raw = pdf.toString('latin1');
  const streams: string[] = [];
  let cursor = 0;

  while (true) {
    const start = raw.indexOf('stream', cursor);
    if (start === -1) break;

    let dataStart = start + 'stream'.length;
    if (raw[dataStart] === '\r') dataStart += 1;
    if (raw[dataStart] === '\n') dataStart += 1;

    const end = raw.indexOf('endstream', dataStart);
    if (end === -1) break;

    const chunk = Buffer.from(raw.slice(dataStart, end), 'latin1');
    try {
      streams.push(zlib.inflateSync(chunk).toString('latin1'));
    } catch {
      // 非 Flate 流跳过
    }
    cursor = end + 'endstream'.length;
  }

  return streams;
}

function buildData(overrides: Partial<PrintTaskDto> = {}): PrintTaskDto {
  const foods = [
    ['猪里脊', '农贸市场', '', '10kg/份', '884.29', '生 / 去皮'],
    ['青花鱼', '农贸市场', '', '5kg/份', '42.11', '去骨、生重、打碎、充分搅拌'],
    ['鸡肝', '农贸市场', '', '散称', '56.15', '去油、生重、打碎、充分搅拌'],
    ['生蚝 去壳生蚝肉', '贝司令', '淘宝/天猫', '200g/包', '140.36', '去壳、生重、打碎、充分搅拌'],
    ['无抗保洁鸡蛋', '沃集鲜（沃尔玛自营）', '沃尔玛', '1.59kg(30 枚)/盒', '210.54', '生 / 去壳'],
    ['MM 有机三色藜麦米', '山姆自营', '山姆会员店', '2.2kg/桶', '280.73', '生重、打粉、充分搅拌'],
    ['MM 有机小米', '山姆自营', '山姆会员店', '2.3kg/桶', '772.00', '煮熟后称重、充分搅拌'],
    ['广胡萝卜', '盒马自营', '盒马鲜生', '600g/份', '140.36', '生重、打碎、充分搅拌'],
  ];

  const parsedIngredients = foods.map(
    ([name, brand, channel, model, amount, method]) => ({
      name,
      standardIngredientName: name,
      procurementSkuName: name,
      procurementSkuBrand: brand,
      procurementSkuPurchaseChannel: channel,
      procurementSkuProductModel: model,
      amount,
      unit: 'g',
      typeLabel: '食材',
      typeClass: 'food',
      method,
      isTotalWeight: false,
    }),
  );

  parsedIngredients.push({
    name: '食材类原料总重',
    standardIngredientName: '',
    procurementSkuName: '',
    procurementSkuBrand: '',
    procurementSkuPurchaseChannel: '',
    procurementSkuProductModel: '',
    amount: '2526.54',
    unit: 'g',
    typeLabel: '',
    typeClass: '',
    method: '',
    isTotalWeight: true,
  });

  return {
    recipeName: '猪里脊青花鱼藜麦小米',
    recipeVersion: '10',
    currentPotNumber: 1,
    totalPots: 1,
    status: 'PENDING',
    totalProductionG: 2576,
    createdAt: '2026-11-06T13:07:00+08:00',
    orderItems: [
      {
        orderNo: 'SK20261106-001',
        packageSpecG: 184,
        packageCount: 14,
        packagePlan: [{ packageSpecG: 184, packageCount: 14 }],
        dogName: 'Seven',
        recipientName: '赵晨',
        recipientCity: '成都市',
        adminRemark:
          'Seven 最近软便，鸡肝减半；分装按 184g 一袋，袋口写名字。',
        customerNote: '肠胃敏感，鸡肝减半；对鸡肉轻微过敏，请务必彻底煮熟。',
      },
    ],
    parsedIngredients,
    ...overrides,
  };
}

describe('制作单 PDF：黑白 + 双备注 + 页码', () => {
  it('生成的 PDF 只有黑白灰，没有任何彩色', async () => {
    const pdf = await new PdfGeneratorService().generateProductionTaskPDF(
      buildData(),
    );

    const colorOperators =
      contentStreams(pdf)
        .join('\n')
        .match(/[\d.]+ [\d.]+ [\d.]+ (?:rg|RG|scn|SCN)/g) || [];

    expect(colorOperators.length).toBeGreaterThan(0);
    for (const operator of colorOperators) {
      const [red, green, blue] = operator.split(' ').map(Number);
      expect(red).toBe(green);
      expect(green).toBe(blue);
    }
  });

  it('一单 8 项原料压在一页内', async () => {
    const pdf = await new PdfGeneratorService().generateProductionTaskPDF(
      buildData(),
    );

    expect(countPages(pdf)).toBe(1);
  });

  it('原料多时自动分页', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      name: `原料${index}`,
      standardIngredientName: `原料${index}`,
      procurementSkuName: `高品质长名称采购SKU${index}`,
      procurementSkuBrand: '山姆自营',
      procurementSkuPurchaseChannel: '山姆会员店',
      procurementSkuProductModel: '1.2kg/盒',
      amount: '123.45',
      unit: 'g',
      typeLabel: '食材',
      typeClass: 'food',
      method: '去皮、去骨、生重、打碎、充分搅拌',
      isTotalWeight: false,
    }));

    const pdf = await new PdfGeneratorService().generateProductionTaskPDF(
      buildData({ parsedIngredients: many }),
    );

    expect(countPages(pdf)).toBeGreaterThan(1);
  });

  it('超长菜名折行，不会把接口打挂', async () => {
    const pdf = await new PdfGeneratorService().generateProductionTaskPDF(
      buildData({ recipeName: '低温烘焙三文鱼鸡胸肉南瓜胡萝卜西兰花鸡蛋壳粉营养粉' }),
    );

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(countPages(pdf)).toBe(1);
  });

  it('原料名单独一段，采购信息一段；不再带「食材 / 补剂」前缀', () => {
    const service = new PdfGeneratorService() as any;
    const oyster = {
      name: '生蚝',
      standardIngredientName: '生蚝',
      procurementSkuName: '去壳生蚝肉',
      procurementSkuBrand: '贝司令',
      procurementSkuPurchaseChannel: '淘宝/天猫',
      procurementSkuProductModel: '200g/包',
      typeLabel: '补剂',
      amount: '140.36',
      unit: 'g',
      typeClass: 'supplement',
    };

    expect(service.getIngredientNamePart(oyster)).toBe('生蚝');
    expect(service.getIngredientDetailPart(oyster)).toBe(
      '贝司令 去壳生蚝肉 / 淘宝/天猫 / 200g/包',
    );

    // 原料名与商品名一样时只留一份
    expect(
      service.getIngredientDetailPart({
        name: '猪里脊',
        standardIngredientName: '猪里脊',
        procurementSkuName: '猪里脊',
        procurementSkuPurchaseChannel: '农贸市场',
        procurementSkuProductModel: '10kg/份',
        typeLabel: '食材',
        amount: '884.29',
        unit: 'g',
        typeClass: 'food',
      }),
    ).toBe('农贸市场 / 10kg/份');

    // 占位符品牌不能印成「无 去壳生蚝肉」
    expect(
      service.getIngredientDetailPart({
        name: '生蚝',
        standardIngredientName: '生蚝',
        procurementSkuName: '去壳生蚝肉',
        procurementSkuBrand: '无',
        procurementSkuPurchaseChannel: '暂无',
        procurementSkuProductModel: '-',
        typeLabel: '食材',
        amount: '1',
        unit: 'g',
        typeClass: 'food',
      }),
    ).toBe('去壳生蚝肉');

    // 合计行不带采购信息
    expect(
      service.getIngredientNamePart({
        name: '食材类原料总重',
        amount: '2704.80',
        unit: 'g',
        typeLabel: '',
        typeClass: '',
        isTotalWeight: true,
      }),
    ).toBe('食材类原料总重（含生产损耗）');
    expect(
      service.getIngredientDetailPart({
        name: '食材类原料总重',
        amount: '2704.80',
        unit: 'g',
        typeLabel: '',
        typeClass: '',
        isTotalWeight: true,
      }),
    ).toBe('');
  });

  it('页脚按真实总页数逐页写「第 x / y 页」', () => {
    const service = new PdfGeneratorService() as any;
    const calls: string[] = [];
    const fakeDoc: any = {
      bufferedPageRange: () => ({ start: 0, count: 3 }),
      switchToPage: () => undefined,
      font: () => fakeDoc,
      fontSize: () => fakeDoc,
      fillColor: () => fakeDoc,
      text: (value: string) => {
        calls.push(value);
        return fakeDoc;
      },
    };

    service.drawFooters(fakeDoc, buildData());

    expect(calls.filter((value) => value.startsWith('第 '))).toEqual([
      '第 1 页 / 共 3 页',
      '第 2 页 / 共 3 页',
      '第 3 页 / 共 3 页',
    ]);
    expect(calls.filter((value) => value.startsWith('打印于 '))).toHaveLength(3);
  });

  it('续页页眉带订单号，单子多时退化成「本锅共 N 单」', () => {
    const service = new PdfGeneratorService() as any;

    expect(
      service.buildHeaderMeta(
        buildData({
          orderItems: [{ packageSpecG: 100, packageCount: 2, dogName: 'A', orderNo: 'SK1' }],
        }),
        true,
      ),
    ).toBe('（续页） 订单 SK1');

    expect(
      service.buildHeaderMeta(
        buildData({
          orderItems: [
            { packageSpecG: 100, packageCount: 2, dogName: 'A', orderNo: 'SK1' },
            { packageSpecG: 100, packageCount: 2, dogName: 'B', orderNo: 'SK2' },
          ],
        }),
        true,
      ),
    ).toBe('（续页） 本锅共 2 单');
  });

  it('源码层面守住：不上审计日志、不留彩色、页脚按总页数生成', () => {
    expect(serviceSource).toContain('splitOrderRemarks');
    expect(serviceSource).not.toContain('adminRemark, 56');
    expect(serviceSource).not.toContain('truncateText(order.adminRemark');

    expect(serviceSource).not.toContain('#58a891');
    expect(serviceSource).not.toContain('#2f8f76');
    expect(serviceSource).not.toContain('#eef8f2');
    expect(serviceSource).not.toContain('#dddddd');

    expect(serviceSource).toContain('drawFooters');
    expect(serviceSource).toContain('bufferedPageRange');
    expect(serviceSource).toContain('共 ${range.count} 页');
  });
});
