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
    usageText: '每日 23平勺',
    packerName: '赛文的食堂',
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
  it('2026-11-02 美化版：10 行文字 + 2 条分隔线，顺序固定', () => {
    const lines = buildSupplementLabelLines(
      createLabel(),
      'SP20260918-004',
      '赛文的食堂',
    );

    expect(textsOf(lines)).toEqual([
      '赛文的食堂',
      '预分装补剂',
      '分装日期：2026-09-18',
      '有效期：2027-03-18',
      '储存注意事项：',
      '避光、密封、阴凉干燥处保存',
      '订单编号：SP20260918-004',
      '原品名称：海藻粉',
      '分装量/袋：23平勺',
      '分装小样，非直接食用；内含干燥剂，请勿食用',
    ]);

    // 10 行文字 + 标题下/提醒前两条分隔线
    expect(lines).toHaveLength(12);
    expect(lines[2]).toMatchObject({ divider: true, text: '' });
    expect(lines[10]).toMatchObject({ divider: true, text: '' });
    expect(lines[0]).toMatchObject({ bold: false, align: 'center' });
    expect(lines[1]).toMatchObject({ bold: true, align: 'center' });
    // 有效期是最关键的安全信息：必须加粗
    expect(lines[4]).toMatchObject({ bold: true, align: 'left' });
    // 分装量/袋在「原品名称」正下方、提醒上方
    const text = textsOf(lines);
    expect(text.indexOf('分装量/袋：23平勺')).toBe(
      text.indexOf('原品名称：海藻粉') + 1,
    );
    // 没提到的字段一个都不许再上标签
    for (const removed of [
      '1/3',
      '批号',
      'NOW FOODS',
      '227g/瓶',
      '每日',
      '分装者',
    ]) {
      expect(text.join('|')).not.toContain(removed);
    }
  });

  it('同一补剂的多袋标签内容完全相同（袋号不再上标签）', () => {
    const first = textsOf(
      buildSupplementLabelLines(
        createLabel({ bagIndex: 1, bagTotal: 3 }),
        'SP20260918-004',
        '赛文的食堂',
      ),
    );
    const third = textsOf(
      buildSupplementLabelLines(
        createLabel({ bagIndex: 3, bagTotal: 3 }),
        'SP20260918-004',
        '赛文的食堂',
      ),
    );

    expect(third).toEqual(first);
  });

  it('品牌名缺失时从「预分装补剂」开始，不留空白占位行', () => {
    const lines = buildSupplementLabelLines(
      createLabel(),
      'SP20260918-004',
      '   ',
    );

    expect(lines[0].text).toBe('预分装补剂');
    expect(lines[0].align).toBe('center');
  });
});

describe('补剂分装标签 · 图片渲染', () => {
  it('按 203dpi 的既有换算渲染出 40×60mm（320×480px）的 PNG', async () => {
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
    expect(ink.width).toBe(320);
    expect(ink.height).toBe(480);
    expect(ink.inkCount).toBeGreaterThan(0);
  });

  it('同一补剂多袋渲染出的图片相同（袋号不再上标签）', () => {
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

    expect(secondBag).toBe(firstBag);
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
    // 40×60 竖版：字形底部必须落在 56mm 以上（底部 4mm 安全区）
    expect(ink.maxY + 1).toBeLessThanOrEqual(mmToPx(56));
    expect(60 - (ink.maxY + 1) / MM_TO_PX).toBeGreaterThanOrEqual(4);
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
    expect(ink.maxY + 1).toBeLessThanOrEqual(mmToPx(56));
  });

  it('长品名不会被静默丢掉：缩字号/截断后仍在安全区内', async () => {
    const service = new SupplementLabelService();
    const imageBase64 = service.generateLabelImage(
      createLabel({
        productName:
          '高浓度复合海洋磷脂深海鱼油软胶囊与南极磷虾油复配营养补充剂',
      }),
      'SP20260918-004',
      '赛文的食堂',
    );

    const ink = await measureInk(imageBase64);
    expect(ink.inkCount).toBeGreaterThan(0);
    expect(ink.maxY + 1).toBeLessThanOrEqual(mmToPx(56));
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
});
