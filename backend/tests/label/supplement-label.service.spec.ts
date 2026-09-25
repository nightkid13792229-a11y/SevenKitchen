import { createCanvas, loadImage } from 'canvas';
import {
  SupplementLabelService,
  buildSupplementLabelLines,
  type SupplementLabelLine,
} from '../../src/label/supplement-label.service';
import type { SupplementLabel } from '../../src/application/supplement-shop/supplement-order.service';

const DPI = 203;
const MM_TO_PX = DPI / 25.4;
const mmToPx = (mm: number): number => Math.round(mm * MM_TO_PX);

/** 真实打样确认过的那句警示语（比打样图多一段「请按食谱用量添加」，所以会折行） */
const REAL_DISCLAIMER =
  '分装小样，非直接食用，请按食谱用量添加；内含干燥剂，请勿食用';

function createLabel(
  overrides: Partial<SupplementLabel> = {},
): SupplementLabel {
  return {
    labelId: 'item-kelp#1',
    itemId: 'item-kelp',
    productName: '海藻粉',
    amountText: '23平勺',
    bagIndex: 1,
    bagTotal: 1,
    packedDate: '2026-09-18',
    expiryDate: '2027-03-18',
    batchNo: 'B2609-01',
    storageCondition: '避光、密封、阴凉干燥处保存',
    sourceProduct: 'NOW FOODS · 227g/瓶',
    sourceExpiryDate: '2027-06-18',
    disclaimer: '分装小样，非直接食用；内含干燥剂，请勿食用',
    ...overrides,
  };
}

function textsOf(lines: SupplementLabelLine[]): string[] {
  return lines.filter((line) => !line.divider).map((line) => line.text);
}

/** 扫描非白像素的包围盒，用来断言「没有画出边界」 */
async function measureInk(imageBase64: string) {
  const image = await loadImage(Buffer.from(imageBase64, 'base64'));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  let inkCount = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const luminance =
        (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      if (luminance >= 160) {
        continue;
      }
      inkCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return { width: image.width, height: image.height, minX, minY, maxX, maxY, inkCount };
}

describe('补剂分装标签 · 文案拼装', () => {
  it('按打样版式给出九行：前三行居中加粗，其余左对齐', () => {
    const lines = buildSupplementLabelLines(
      createLabel(),
      'SP20260918-004',
      '赛文的食堂',
    );

    expect(textsOf(lines)).toEqual([
      '赛文的食堂',
      '海藻粉',
      '23平勺',
      '分装日期 2026-09-18',
      '有效期至 2027-03-18',
      '批号 B2609-01   订单 SP20260918-004',
      '原品 NOW FOODS · 227g/瓶',
      '分装小样，非直接食用；内含干燥剂，请勿食用',
    ]);

    // 第 4 行是分隔线，不承载文字
    expect(lines[3]).toMatchObject({ divider: true, text: '' });

    expect(lines[0]).toMatchObject({ fontSizeMm: 2.5, bold: false, align: 'center' });
    expect(lines[1]).toMatchObject({ fontSizeMm: 4.2, bold: true, align: 'center' });
    expect(lines[2]).toMatchObject({ fontSizeMm: 3.4, bold: true, align: 'center' });
    expect(lines[4]).toMatchObject({ fontSizeMm: 2.4, bold: false, align: 'left' });
    // 有效期是最关键的安全信息：必须比同段的其它行更大更粗
    expect(lines[5]).toMatchObject({ fontSizeMm: 3.0, bold: true, align: 'left' });
    expect(lines[6]).toMatchObject({ fontSizeMm: 2.2, bold: false, align: 'left' });
    expect(lines[7]).toMatchObject({ fontSizeMm: 2.3, bold: false, align: 'left' });
    expect(lines[8]).toMatchObject({ fontSizeMm: 2.1, bold: false, align: 'left' });
  });

  it('只有一袋时不写「1/1」，加量后才带「第几袋 / 共几袋」', () => {
    const single = textsOf(
      buildSupplementLabelLines(createLabel(), 'SP20260918-004', '赛文的食堂'),
    );

    expect(single[2]).toBe('23平勺');
    expect(single.join('|')).not.toContain('1/1');

    const thirdBag = textsOf(
      buildSupplementLabelLines(
        createLabel({ bagIndex: 2, bagTotal: 3 }),
        'SP20260918-004',
        '赛文的食堂',
      ),
    );

    expect(thirdBag[2]).toBe('23平勺  2/3');
    // 用量本身不随袋号变化：加量乘的是成本，不是每袋的量
    expect(thirdBag[2]).toContain('23平勺');
  });

  it('批号为空时只显示订单号，不出现空的「批号」标签', () => {
    const withoutBatch = textsOf(
      buildSupplementLabelLines(
        createLabel({ batchNo: null }),
        'SP20260918-004',
        '赛文的食堂',
      ),
    );

    expect(withoutBatch).toContain('订单 SP20260918-004');
    expect(withoutBatch.join('|')).not.toContain('批号');

    const withBlankBatch = textsOf(
      buildSupplementLabelLines(
        createLabel({ batchNo: '   ' }),
        'SP20260918-004',
        '赛文的食堂',
      ),
    );

    expect(withBlankBatch).toContain('订单 SP20260918-004');
    expect(withBlankBatch.join('|')).not.toContain('批号');
  });

  it('没有原品信息时整行省略，把高度让给安全提示', () => {
    const lines = buildSupplementLabelLines(
      createLabel({ sourceProduct: '' }),
      'SP20260918-004',
      '赛文的食堂',
    );

    expect(textsOf(lines).join('|')).not.toContain('原品');
    expect(lines).toHaveLength(8);
  });

  it('品牌名缺失时不留一条空白占位行', () => {
    const lines = buildSupplementLabelLines(
      createLabel(),
      'SP20260918-004',
      '   ',
    );

    expect(lines[0].text).toBe('海藻粉');
    expect(lines[0].align).toBe('center');
  });
});

describe('补剂分装标签 · 图片渲染', () => {
  it('按 203dpi 的既有换算渲染出 60×40mm（480×320px）的 PNG', async () => {
    const service = new SupplementLabelService();
    const imageBase64 = service.generateLabelImage(
      createLabel(),
      'SP20260918-004',
      '赛文的食堂',
    );

    // 与鲜食标签同一套换算：203dpi → 1mm ≈ 7.9921px，取整后 8px/mm
    expect(mmToPx(1)).toBe(8);
    expect(mmToPx(60)).toBe(480);
    expect(mmToPx(40)).toBe(320);

    // PNG 数据头（base64 前 8 字节）必须合法，否则小程序端 image 组件解不出来
    expect(imageBase64.startsWith('iVBORw0KGgo')).toBe(true);
    expect(
      Buffer.from(imageBase64, 'base64').subarray(0, 8).toString('hex'),
    ).toBe('89504e470d0a1a0a');

    const ink = await measureInk(imageBase64);
    expect(ink.width).toBe(480);
    expect(ink.height).toBe(320);
    expect(ink.inkCount).toBeGreaterThan(0);
  });

  it('每袋渲染出的图片各不相同（袋号进了画面）', () => {
    const service = new SupplementLabelService();
    const firstBag = service.generateLabelImage(
      createLabel({ labelId: 'item-kelp#1', bagIndex: 1, bagTotal: 3 }),
      'SP20260918-004',
      '赛文的食堂',
    );
    const secondBag = service.generateLabelImage(
      createLabel({ labelId: 'item-kelp#2', bagIndex: 2, bagTotal: 3 }),
      'SP20260918-004',
      '赛文的食堂',
    );

    expect(secondBag).not.toBe(firstBag);
    expect(secondBag.length).toBeGreaterThan(0);
  });

  it('长警示语自动换行后仍不越过底部 4mm 安全区', async () => {
    const service = new SupplementLabelService();
    const imageBase64 = service.generateLabelImage(
      createLabel({ disclaimer: REAL_DISCLAIMER }),
      'SP20260918-004',
      '赛文的食堂',
    );

    const ink = await measureInk(imageBase64);
    // 热敏打印机底部边缘打不出来：字形底部必须落在 36mm 以上
    expect(ink.maxY + 1).toBeLessThanOrEqual(mmToPx(36));
    // 留白至少要够 4mm，不能只留「基线的 4mm」
    expect(40 - (ink.maxY + 1) / MM_TO_PX).toBeGreaterThanOrEqual(4);
  });

  it('警示语长到装不下时，宁可少画也不压进安全区', async () => {
    const service = new SupplementLabelService();
    const imageBase64 = service.generateLabelImage(
      createLabel({
        disclaimer:
          '分装小样，非直接食用，请按食谱用量添加；内含干燥剂，请勿食用；请放在儿童与宠物接触不到的地方，避免阳光直射',
      }),
      'SP20260918-004',
      '赛文的食堂',
    );

    const ink = await measureInk(imageBase64);
    expect(ink.maxY + 1).toBeLessThanOrEqual(mmToPx(36));
  });

  it('文字不会画出左右 2mm 边距之外', async () => {
    const service = new SupplementLabelService();
    const imageBase64 = service.generateLabelImage(
      createLabel({ disclaimer: REAL_DISCLAIMER }),
      'SP20260918-004',
      '赛文的食堂',
    );

    const ink = await measureInk(imageBase64);
    expect(ink.minX).toBeGreaterThanOrEqual(mmToPx(2) - 1);
    expect(ink.maxX).toBeLessThanOrEqual(mmToPx(58));
  });

  it('分隔线贯穿左右边距', async () => {
    const service = new SupplementLabelService();
    const imageBase64 = service.generateLabelImage(
      createLabel(),
      'SP20260918-004',
      '赛文的食堂',
    );

    const ink = await measureInk(imageBase64);
    // 分隔线只占 1px 高，找到它的那一行即可确认横跨范围
    const image = await loadImage(Buffer.from(imageBase64, 'base64'));
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const dividerY = mmToPx(4.25 + 5.15 + 4.35 + 1.65);
    const row = ctx.getImageData(0, dividerY, image.width, 1).data;
    let rowMinX = Number.POSITIVE_INFINITY;
    let rowMaxX = -1;
    for (let x = 0; x < image.width; x += 1) {
      const offset = x * 4;
      if ((row[offset] + row[offset + 1] + row[offset + 2]) / 3 < 160) {
        rowMinX = Math.min(rowMinX, x);
        rowMaxX = Math.max(rowMaxX, x);
      }
    }

    expect(rowMinX).toBe(mmToPx(2));
    expect(rowMaxX).toBe(mmToPx(58) - 1);
    expect(ink.inkCount).toBeGreaterThan(0);
  });
});
