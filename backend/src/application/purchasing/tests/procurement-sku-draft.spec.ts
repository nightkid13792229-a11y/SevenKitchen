/**
 * 「截图识别采购商品」草稿的收口（2026-11-09）
 *
 * 锁死老板真机上遇到的那次事故：盒马鸡蛋「30枚 1.59kg」被读成
 * 一盒 30 件 × 每件 1590 克 = 47.7 公斤。正确结果是 30 枚 × 53 克，
 * 并且要标成「按整盒总重折算」，让员工知道 53 是算出来的。
 */

import { ProcurementSkuDraftService } from '../procurement-sku-draft.service';
import { ProcurementSkuDraftNoticeException } from '../procurement-sku-draft.errors';

const CHANNELS = [
  { code: 'hema', label: '盒马鲜生', aliases: ['盒马'] },
  { code: 'walmart', label: '沃尔玛', aliases: [] },
];

const build = () =>
  new ProcurementSkuDraftService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

const draftOf = (
  raw: Record<string, unknown>,
  baseUnit: 'G' | 'ML' | 'PCS' = 'G',
): any => (build() as any).toDraft(raw, baseUnit, CHANNELS);

describe('鸡蛋「30枚 1.59kg」的草稿', () => {
  const raw = {
    name: '盒马 安心保洁鲜鸡蛋30枚 1.59kg',
    brand: '盒马',
    purchaseUnit: '盒',
    specText: '30枚 1.59kg',
    specChain: [{ count: 30, unit: '枚' }],
    totalNetContent: { value: 1.59, unit: 'kg' },
    purchaseChannel: '盒马',
    unitPrice: 21.8,
    confidence: { name: 'high', purchaseChannel: 'high', specChain: 'high' },
  };

  it('★ 每件是 53 克，不是整盒的 1590 克', () => {
    const draft = draftOf(raw);

    expect(draft.packCount).toBe(30);
    expect(draft.netContentPerPack).toBe(53);
    expect(draft.totalNetContentInBase).toBe(1590);
  });

  it('链尾补上折算出来的基准单位，页面据此显示 30 枚 × 53 克', () => {
    expect(draftOf(raw).specChain).toEqual([
      { count: 30, unit: '枚' },
      { count: 53, unit: '克' },
    ]);
  });

  it('标成「折算」而不是「包装上印的」，页面要提示核对', () => {
    expect(draftOf(raw).netContentSource).toBe('derived');
  });

  it('规格原文进 productModel：订单截图按 1.59kg(30枚) 也能对上', () => {
    expect(draftOf(raw).productModel).toBe('30枚 1.59kg');
  });

  it('该填的都填上了，不算缺项', () => {
    expect(draftOf(raw).missing).not.toContain('netContentPerPack');
    expect(draftOf(raw).missing).not.toContain('packCount');
  });

  it('渠道按字典归一', () => {
    expect(draftOf(raw).purchaseChannel).toBe('hema');
  });
});

describe('其它常见规格', () => {
  it('24×330ml 牛奶：24 瓶 × 330 毫升，不标折算', () => {
    const draft = draftOf({
      name: '某某纯牛奶',
      purchaseUnit: '箱',
      specText: '24×330ml',
      specChain: [
        { count: 24, unit: '瓶' },
        { count: 330, unit: 'ml' },
      ],
      purchaseChannel: '沃尔玛',
      unitPrice: 59.9,
    }, 'ML');

    expect(draft.packCount).toBe(24);
    expect(draft.netContentPerPack).toBe(330);
    expect(draft.netContentSource).toBe('printed');
  });

  it('只读到件数、没读到重量：净含量进 missing，绝不留旧值', () => {
    const draft = draftOf({
      name: '散装鸡蛋',
      purchaseUnit: '盒',
      specChain: [{ count: 30, unit: '枚' }],
    });

    expect(draft.netContentPerPack).toBeNull();
    expect(draft.missing).toContain('netContentPerPack');
  });

  it('模型仍按老格式作答时，退回件数 + 单件净含量', () => {
    const draft = draftOf({
      name: '沃集鲜 糙米 1kg',
      purchaseUnit: '袋',
      packCount: 1,
      netContent: { value: 1, unit: 'kg' },
    });

    expect(draft.packCount).toBe(1);
    expect(draft.netContentPerPack).toBe(1000);
    expect(draft.specChain).toBeNull();
  });

  it('截图是订单列表时判失败，让员工重截或手填', () => {
    expect(() => draftOf({ productList: [{ name: 'x' }] })).toThrow(
      ProcurementSkuDraftNoticeException,
    );
  });
});

describe('规格链折算失败时（评审 C1 / I2）', () => {
  it('★ 按个记账只读到「净含量 5kg」：不把 5kg 当 5 件，链留空、标未折算', () => {
    const draft = draftOf(
      {
        name: '整箱西瓜',
        purchaseUnit: '箱',
        specText: '净含量 5kg',
        specChain: [{ count: 5, unit: 'kg' }],
      },
      'PCS',
    );

    expect(draft.specChain).toBeNull();
    expect(draft.specChainResolved).toBe(false);
    expect(draft.packCount).toBeNull();
    expect(draft.netContentPerPack).toBeNull();
  });

  it('★ 按克记账读到「24瓶 × 330ml」：只留 24 瓶，330ml 不进件数', () => {
    const draft = draftOf({
      name: '某某牛奶',
      purchaseUnit: '箱',
      specText: '24×330ml',
      specChain: [
        { count: 24, unit: '瓶' },
        { count: 330, unit: 'ml' },
      ],
    });

    expect(draft.specChainResolved).toBe(false);
    expect(draft.specChain).toEqual([{ count: 24, unit: '瓶' }]);
    expect(draft.netContentPerPack).toBeNull();
  });

  it('箱/桶/提/件 只有一层（没读到一箱几件）时，必须报件数缺失', () => {
    for (const purchaseUnit of ['箱', '桶', '提', '件']) {
      const draft = draftOf({
        name: '某商品',
        purchaseUnit,
        specChain: [{ count: 5000, unit: 'g' }],
      });

      expect(draft.missing).toContain('packCount');
      expect(draft.packCount).toBe(1);
    }
  });

  it('袋/包 单件商品只有一层时，不算件数缺失', () => {
    const draft = draftOf({
      name: '沃集鲜 糙米 5kg',
      purchaseUnit: '袋',
      specChain: [{ count: 5, unit: 'kg' }],
    });

    expect(draft.missing).not.toContain('packCount');
    expect(draft.specChainResolved).toBe(true);
  });

  it('折算成功时 specChainResolved 为 true', () => {
    const draft = draftOf({
      name: '盒马 鲜鸡蛋',
      purchaseUnit: '盒',
      specText: '30枚 1.59kg',
      specChain: [{ count: 30, unit: '枚' }],
      totalNetContent: { value: 1.59, unit: 'kg' },
    });

    expect(draft.specChainResolved).toBe(true);
  });
});

describe('规格原文口径（评审 M2 / M4）', () => {
  it('老口径回退时，最后一层的单位必须是基准单位，不能写 kg', () => {
    const draft = draftOf({
      name: '沃集鲜 糙米 1kg',
      purchaseUnit: '袋',
      packCount: 1,
      netContent: { value: 1, unit: 'kg' },
    });

    expect(draft.netContentPerPack).toBe(1000);
    expect(draft.amountUnitText).toBe('克');
  });

  it('超长规格原文截到 100 字，避免入库时吃 400', () => {
    const draft = draftOf({
      name: '某商品',
      purchaseUnit: '袋',
      specText: '长'.repeat(180),
      specChain: [{ count: 5, unit: 'kg' }],
    });

    expect(draft.specText).toHaveLength(100);
    expect(draft.productModel).toHaveLength(100);
  });
});
