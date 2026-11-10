import {
  parseOrderDraft,
  toNumberOrNull,
} from '../../../src/application/purchasing/purchase-order-parse';
import {
  matchOrderLines,
  normalizeText,
} from '../../../src/application/purchasing/purchase-order-match';
import type { ListItemCandidate } from '../../../src/application/purchasing/purchase-order-import.types';
import type { ChannelOption } from '../../../src/application/purchasing/channel-catalog';

/**
 * 渠道字典（与后台 purchase_channel 同构）：
 * 标准名是 code，历史写法放别名 —— 2026-11-05 起匹配、解析都认它。
 */
const CHANNELS: ChannelOption[] = [
  { code: '山姆会员店', label: '山姆会员店', aliases: ['山姆'] },
  { code: '盒马鲜生', label: '盒马鲜生', aliases: ['盒马'] },
  { code: '沃尔玛', label: '沃尔玛', aliases: ['Walmart'] },
  { code: '农贸市场', label: '农贸市场', aliases: ['菜市场', '批发市场'] },
  { code: '成都海吉星', label: '成都海吉星', aliases: ['海吉星'] },
];

const parseDraft = (raw: Record<string, unknown>) =>
  parseOrderDraft(raw, CHANNELS);

const matchWithChannels = (
  lines: any[],
  candidates: ListItemCandidate[],
  channel: string | null,
  aliases?: any[],
  hints?: Array<{ lineIndex: number; ingredientId: string }>,
) => matchOrderLines(lines, candidates, channel, CHANNELS, aliases, hints);

describe('parseOrderDraft', () => {
  const raw = {
    channel: '盒马鲜生',
    orderNo: '512738841924500221',
    orderTime: '2026-10-31 10:20',
    items: [
      { name: '四季豆 约250g', spec: '约250g/份', qty: 1, unit: '份', unitPrice: 4.99, lineTotal: 4.99 },
      { name: '白蘑菇（去根）230g', spec: '230g/盒', qty: 1, unit: '盒', unitPrice: 5.99, lineTotal: 5.99 },
      { name: '烧烤酱 110g', spec: '110g/瓶', qty: 1, unit: '瓶', unitPrice: 8.9, lineTotal: 8.9 },
    ],
    subtotal: 19.88,
    shippingFee: 0,
    packagingFee: 1,
    paid: 20.88,
    weightAdjustment: { exists: true, amount: 0.35 },
    incomplete: false,
    note: '金额自洽',
  };

  it('解析渠道与金额，行小计之和与商品金额一致', () => {
    const draft = parseDraft(raw);
    expect(draft.channel).toBe('盒马鲜生');
    expect(draft.items).toHaveLength(3);
    expect(draft.lineSum).toBe(19.88);
    expect(draft.amountsConsistent).toBe(true);
    expect(draft.incomplete).toBe(false);
    expect(draft.paid).toBe(20.88);
    expect(draft.weightAdjustment).toEqual({ exists: true, amount: 0.35 });
  });

  it('行小计缺失时用 单价 × 数量 补', () => {
    const draft = parseDraft({
      ...raw,
      items: [{ name: '生菜', qty: 2, unitPrice: 2.99 }],
      subtotal: 5.98,
    });
    expect(draft.items[0].lineTotal).toBe(5.98);
    expect(draft.amountsConsistent).toBe(true);
  });

  it('各行合计与商品金额差 1 元（优惠/特价/包装费）→ 不判不完整，只记金额对不上', () => {
    const draft = parseDraft({
      ...raw,
      items: [{ name: '可口可乐 330ml*6', qty: 1, unitPrice: 147.33, lineTotal: 147.33 }],
      subtotal: 148.33,
    });
    expect(draft.amountsConsistent).toBe(false);
    expect(draft.incomplete).toBe(false);
    expect(draft.incompleteReason).toBeNull();
  });

  it('模型明确说截图不完整 → 仍判不完整，理由用模型给的', () => {
    const draft = parseDraft({
      ...raw,
      incomplete: true,
      incompleteReason: '商品列表被折叠，只看到 3 行',
    });
    expect(draft.incomplete).toBe(true);
    expect(draft.incompleteReason).toBe('商品列表被折叠，只看到 3 行');
  });

  it('商品金额没读到 → 不判不完整，只是金额校验不通过', () => {
    const draft = parseDraft({ ...raw, subtotal: null });
    expect(draft.amountsConsistent).toBe(false);
    expect(draft.incomplete).toBe(false);
  });

  it('金额字符串带 ¥ 和逗号也能读', () => {
    expect(toNumberOrNull('¥1,234.50')).toBe(1234.5);
    expect(toNumberOrNull('abc')).toBeNull();
  });

  it('渠道归一到字典项：别名认得出，认不出就是 null（不再落到「其他」）', () => {
    expect(parseDraft({ ...raw, channel: '山姆会员店' }).channel).toBe('山姆会员店');
    expect(parseDraft({ ...raw, channel: '山姆' }).channel).toBe('山姆会员店');
    expect(parseDraft({ ...raw, channel: 'Walmart' }).channel).toBe('沃尔玛');
    expect(parseDraft({ ...raw, channel: '菜市场' }).channel).toBe('农贸市场');
    expect(parseDraft({ ...raw, channel: '其他' }).channel).toBeNull();
    expect(parseDraft({ ...raw, channel: '楼下小卖部' }).channel).toBeNull();
    expect(parseDraft({ ...raw, channel: null }).channel).toBeNull();
  });

  it('parses page type and delivery dates', () => {
    const draft = parseDraft({
      ...raw,
      pageType: 'order_detail',
      expectedDeliveryAt: '2026-11-10',
      deliveredAt: '2026-11-09 11:33',
    });

    expect(draft.pageType).toBe('order_detail');
    expect(draft.expectedDeliveryAt).toBe('2026-11-10');
    expect(draft.deliveredAt).toBe('2026-11-09 11:33');
  });

  it('keeps weight units as-is', () => {
    const draft = parseDraft({
      ...raw,
      items: [
        {
          name: '新鲜羊心 3斤',
          spec: '3斤',
          qty: 3,
          unit: '斤',
          unitPrice: 12.46,
          lineTotal: 37.39,
        },
      ],
      subtotal: 37.39,
      paid: 37.39,
    });

    expect(draft.items[0].unit).toBe('斤');
    expect(draft.items[0].qty).toBe(3);
    expect(draft.items[0].lineTotal).toBe(37.39);
  });
});

describe('matchOrderLines', () => {
  const candidates: ListItemCandidate[] = [
    {
      purchaseItemId: 'item-greenbean',
      ingredientId: 'ing-greenbean',
      ingredientName: '绿豆',
      skus: [
        { id: 'sku-greenbean', name: '绿豆 980g/袋', productModel: '980g/袋', purchaseChannel: '盒马鲜生', purchaseToBaseRatio: 980, purchaseUnit: '袋' },
      ],
    },
    {
      purchaseItemId: 'item-sprout',
      ingredientId: 'ing-sprout',
      ingredientName: '绿豆芽',
      skus: [
        { id: 'sku-sprout', name: '绿豆芽 300g/份', productModel: '300g/份', purchaseChannel: '盒马鲜生', purchaseToBaseRatio: 300, purchaseUnit: '份' },
      ],
    },
    {
      purchaseItemId: 'item-oyster',
      ingredientId: 'ing-oyster',
      ingredientName: '生蚝',
      skus: [
        { id: 'sku-oyster', name: '生蚝肉 200g/包', productModel: '200g/包', purchaseChannel: '批发市场', purchaseToBaseRatio: 200, purchaseUnit: '包' },
      ],
    },
    {
      purchaseItemId: 'item-mushroom',
      ingredientId: 'ing-mushroom',
      ingredientName: '白蘑菇',
      skus: [],
    },
  ];

  const line = (rawName: string, spec: string | null = null) => ({
    rawName,
    spec,
    qty: 1,
    unit: '份',
    unitPrice: 10,
    lineTotal: 10,
  });

  it('命中采购商品，置信度 HIGH', () => {
    const [matched] = matchWithChannels(
      [line('绿豆芽 300g', '300g/份')],
      candidates,
      '盒马',
    );
    expect(matched.ingredientId).toBe('ing-sprout');
    expect(matched.procurementSkuId).toBe('sku-sprout');
    expect(matched.confidence).toBe('HIGH');
    expect(matched.needsNewSku).toBe(false);
  });

  it('最长原料名优先：绿豆芽不会被绿豆抢走', () => {
    const [matched] = matchWithChannels(
      [line('盒马 绿豆芽 300g', '300g/份')],
      candidates,
      '盒马',
    );
    expect(matched.ingredientName).toBe('绿豆芽');
  });

  it('原料对上了但规格不一致 → 需要新建商品，且不自动挂 SKU', () => {
    const [matched] = matchWithChannels(
      [line('白蘑菇 230g', '230g/盒')],
      candidates,
      '盒马',
    );
    expect(matched.ingredientId).toBe('ing-mushroom');
    expect(matched.needsNewSku).toBe(true);
    expect(matched.procurementSkuId).toBeNull();
    expect(matched.reason).toContain('还没有采购商品');
  });

  it('清单里没有的原料 → 未匹配', () => {
    const [matched] = matchWithChannels(
      [line('炙香雪花牛肋条 180g', '180g/盒')],
      candidates,
      '盒马',
    );
    expect(matched.ingredientId).toBeNull();
    expect(matched.confidence).toBe('LOW');
  });

  it('规格写法不同但数值一致时不判冲突', () => {
    const [matched] = matchWithChannels(
      [line('盒马 绿豆芽 300g', '约300g')],
      candidates,
      '盒马',
    );
    expect(matched.needsNewSku).toBe(false);
    expect(matched.confidence).toBe('HIGH');
  });

  it('渠道还没确认（null）→ 只对原料，先不挂商品，等员工确认渠道', () => {
    const [matched] = matchWithChannels(
      [line('生蚝肉 200g', '200g/包')],
      candidates,
      null,
    );
    expect(matched.ingredientId).toBe('ing-oyster');
    expect(matched.procurementSkuId).toBeNull();
    expect(matched.needsNewSku).toBe(true);
    expect(matched.reason).toContain('还没确认渠道');
  });

  it('订单渠道对不上商品渠道 → 不自动匹配，提示手动选择/新建', () => {
    const [matched] = matchWithChannels(
      [line('生蚝肉 200g', '200g/包')],
      candidates,
      '沃尔玛',
    );
    expect(matched.ingredientId).toBe('ing-oyster');
    expect(matched.procurementSkuId).toBeNull();
    expect(matched.needsNewSku).toBe(true);
    expect(matched.reason).toContain('沃尔玛');
  });

  it('同渠道优先：盒马订单不会自动挂到沃尔玛的商品', () => {
    const withTwoChannels: ListItemCandidate[] = [
      {
        purchaseItemId: 'item-greens',
        ingredientId: 'ing-greens',
        ingredientName: '小白菜',
        skus: [
          { id: 'sku-hm', name: '小白菜 300g/份', productModel: '300g/份', purchaseChannel: '盒马鲜生', purchaseToBaseRatio: 300, purchaseUnit: '份' },
          { id: 'sku-wm', name: '小白菜 300g/份', productModel: '300g/份', purchaseChannel: '沃尔玛', purchaseToBaseRatio: 300, purchaseUnit: '份' },
        ],
      },
    ];
    const [matched] = matchWithChannels(
      [line('凉山小白菜 约300g', '约300g/份')],
      withTwoChannels,
      '沃尔玛',
    );
    expect(matched.procurementSkuId).toBe('sku-wm');
  });

  it('改过名的商品：旧名字也认（截图还是按旧叫法写的也一样匹配）', () => {
    const renamed: ListItemCandidate[] = [
      {
        purchaseItemId: 'item-greens',
        ingredientId: 'ing-greens',
        ingredientName: '小白菜',
        skus: [
          {
            id: 'sku-greens',
            // 上个月这张单把它改名成了「盒马日日鲜 小白菜」
            name: '盒马日日鲜 小白菜',
            productModel: '300g/份',
            purchaseChannel: '盒马鲜生',
            purchaseToBaseRatio: 300,
            purchaseUnit: '份',
            previousNames: ['小白菜'],
          },
        ],
      },
    ];
    const [matched] = matchWithChannels(
      [line('小白菜 约300g', '约300g/份')],
      renamed,
      '盒马鲜生',
    );
    expect(matched.procurementSkuId).toBe('sku-greens');
    expect(matched.confidence).toBe('HIGH');
  });

  it('手动匹配成功过的叫法，下次自动沿用', () => {
    const aliases = [
      {
        normalizedName: normalizeText('凉山小白菜 约300g'),
        channelFamily: '沃尔玛',
        ingredientId: 'ing-sprout',
        procurementSkuId: 'sku-sprout',
      },
    ];
    const [matched] = matchWithChannels(
      [line('凉山小白菜 约300g', '约300g/份')],
      candidates,
      '沃尔玛',
      aliases,
    );
    expect(matched.ingredientId).toBe('ing-sprout');
    expect(matched.procurementSkuId).toBe('sku-sprout');
    expect(matched.reason).toBe('沿用上次匹配');
    expect(matched.confidence).toBe('HIGH');
  });

  it('沿用上次匹配时商品规格对不上 → 不挂商品，保留原料等员工重选', () => {
    const withGreens: ListItemCandidate[] = [
      {
        purchaseItemId: 'item-greens',
        ingredientId: 'ing-greens',
        ingredientName: '小白菜',
        skus: [
          { id: 'sku-greens-300', name: '盒马日日鲜小白菜 300g/份', productModel: '300g/份', purchaseChannel: '盒马鲜生', purchaseToBaseRatio: 300, purchaseUnit: '份' },
        ],
      },
    ];
    const aliases = [
      {
        normalizedName: normalizeText('盒马日日鲜 小白菜 约300g'),
        channelFamily: '盒马',
        ingredientId: 'ing-greens',
        procurementSkuId: 'sku-greens-300',
      },
    ];

    const [matched] = matchWithChannels(
      [line('盒马日日鲜 小白菜 约500g', '500g/份')],
      withGreens,
      '盒马',
      aliases,
    );

    expect(matched.ingredientId).toBe('ing-greens');
    expect(matched.procurementSkuId).toBeNull();
    expect(matched.needsNewSku).toBe(true);
    expect(matched.reason).toContain('规格');
  });

  it('同名不同规格的商品都在档案里时，自动选规格一致的那个', () => {
    const withTwoSpecs: ListItemCandidate[] = [
      {
        purchaseItemId: 'item-greens',
        ingredientId: 'ing-greens',
        ingredientName: '小白菜',
        skus: [
          { id: 'sku-greens-300', name: '盒马日日鲜小白菜 300g/份', productModel: '300g/份', purchaseChannel: '盒马鲜生', purchaseToBaseRatio: 300, purchaseUnit: '份' },
          { id: 'sku-greens-500', name: '盒马日日鲜小白菜 500g/份', productModel: '500g/份', purchaseChannel: '盒马鲜生', purchaseToBaseRatio: 500, purchaseUnit: '份' },
        ],
      },
    ];

    const [matched] = matchWithChannels(
      [line('盒马日日鲜 小白菜 约500g', '500g/份')],
      withTwoSpecs,
      '盒马',
    );

    expect(matched.procurementSkuId).toBe('sku-greens-500');
    expect(matched.needsNewSku).toBe(false);
    expect(matched.confidence).toBe('HIGH');
  });

  it('只写件数的规格（6 枚 vs 30 枚）对不上 → 也需要新建商品', () => {
    const withEggs: ListItemCandidate[] = [
      {
        purchaseItemId: 'item-egg',
        ingredientId: 'ing-egg',
        ingredientName: '鸡蛋',
        skus: [
          { id: 'sku-egg-6', name: '鲜鸡蛋 6枚/盒', productModel: '6枚/盒', purchaseChannel: '盒马鲜生', purchaseToBaseRatio: 6, purchaseUnit: '盒' },
        ],
      },
    ];

    const [matched] = matchWithChannels(
      [line('盒马 鲜鸡蛋 30枚', '30枚/盒')],
      withEggs,
      '盒马',
    );

    expect(matched.ingredientId).toBe('ing-egg');
    expect(matched.procurementSkuId).toBeNull();
    expect(matched.needsNewSku).toBe(true);
  });

  it('截图只写包装件数（1 袋 / 2 袋）而商品按克标规格 → 不误判冲突', () => {
    const withGreens: ListItemCandidate[] = [
      {
        purchaseItemId: 'item-greens',
        ingredientId: 'ing-greens',
        ingredientName: '小白菜',
        skus: [
          { id: 'sku-greens-300', name: '盒马日日鲜小白菜 300g/份', productModel: '300g/份', purchaseChannel: '盒马鲜生', purchaseToBaseRatio: 300, purchaseUnit: '份' },
        ],
      },
    ];

    const [matched] = matchWithChannels(
      [line('盒马日日鲜 小白菜', '2袋')],
      withGreens,
      '盒马',
    );

    expect(matched.procurementSkuId).toBe('sku-greens-300');
    expect(matched.needsNewSku).toBe(false);
  });

  it('模型给出语义映射时，「鲑鱼」能落到清单里的「三文鱼」', () => {
    const withSalmon: ListItemCandidate[] = [
      ...candidates,
      {
        purchaseItemId: 'item-salmon',
        ingredientId: 'ing-salmon',
        ingredientName: '三文鱼',
        skus: [
          {
            id: 'sku-salmon',
            name: "Member's Mark 智利大西洋鲑鱼块 1kg",
            productModel: '1kg',
            purchaseChannel: '山姆会员店',
            purchaseToBaseRatio: 1000,
            purchaseUnit: '袋',
          },
        ],
      },
    ];

    const [matched] = matchWithChannels(
      [line("Member's Mark 智利大西洋鲑鱼块 1kg", '1kg')],
      withSalmon,
      '山姆',
      [],
      [{ lineIndex: 0, ingredientId: 'ing-salmon' }],
    );

    expect(matched.ingredientId).toBe('ing-salmon');
    expect(matched.procurementSkuId).toBe('sku-salmon');
    expect(matched.confidence).toBe('HIGH');
    expect(matched.needsNewSku).toBe(false);
    expect(matched.reason).toBe('AI 语义匹配');
  });

  it('模型给了清单外的原料 id 时忽略，不会凭空匹配', () => {
    const [matched] = matchWithChannels(
      [line('炙香雪花牛肋条 180g', '180g/盒')],
      candidates,
      '盒马',
      [],
      [{ lineIndex: 0, ingredientId: 'ing-not-in-list' }],
    );
    expect(matched.ingredientId).toBeNull();
  });

  it('按重量买的行没有商品也允许匹配', () => {
    const weightCandidates: ListItemCandidate[] = [
      {
        purchaseItemId: null,
        ingredientId: 'ing-heart',
        ingredientName: '羊心',
        skus: [],
      },
    ];

    const [matched] = matchWithChannels(
      [
        {
          rawName: '新鲜羊心',
          spec: '3斤',
          qty: 3,
          unit: '斤',
          unitPrice: 12.46,
          lineTotal: 37.39,
        },
      ],
      weightCandidates,
      '盒马',
    );

    expect(matched.ingredientId).toBe('ing-heart');
    expect(matched.needsNewSku).toBe(false);
    expect(matched.procurementSkuId).toBeNull();
  });

  it('按重量买且原料有商品时，仍然走重量行，不挂商品', () => {
    const weightCandidates: ListItemCandidate[] = [
      {
        purchaseItemId: null,
        ingredientId: 'ing-heart',
        ingredientName: '羊心',
        skus: [
          {
            id: 'sku-heart',
            name: '羊心 500g/袋',
            productModel: '500g/袋',
            purchaseChannel: '盒马鲜生',
            purchaseToBaseRatio: 500,
            purchaseUnit: '袋',
          },
        ],
      },
    ];

    const [matched] = matchWithChannels(
      [
        {
          rawName: '新鲜羊心',
          spec: '3斤',
          qty: 3,
          unit: '斤',
          unitPrice: 12.46,
          lineTotal: 37.39,
        },
      ],
      weightCandidates,
      '盒马鲜生',
    );

    expect(matched.ingredientId).toBe('ing-heart');
    expect(matched.needsNewSku).toBe(false);
    expect(matched.procurementSkuId).toBeNull();
    expect(matched.reason).toContain('重量');
  });
});

/**
 * 同名商品反查（2026-11-07）。
 *
 * 真实案例：沃尔玛「冷鲜 鲜切黄牛后腿肉」挂在原料「牛霖」下，
 * 截图里的商品名没有「牛霖」两个字 —— 字面原料匹配永远认不到，
 * 而商品名和截图一模一样。既然清单里的原料名认不出来，
 * 就反过来在同一渠道的采购商品里找同名的那一个，落到它所属的原料。
 */
describe('同名商品反查', () => {
  const line = (
    rawName: string,
    spec: string | null = null,
  ): any => ({
    rawName,
    spec,
    qty: 3,
    unit: '盒',
    unitPrice: 23.98,
    lineTotal: 71.94,
  });

  const beefRump: ListItemCandidate = {
    purchaseItemId: 'item-beef-rump',
    ingredientId: 'ing-beef-rump',
    ingredientName: '牛霖',
    skus: [
      {
        id: 'sku-beef-walmart',
        name: '冷鲜 鲜切黄牛后腿肉 约200g',
        productModel: '200g',
        purchaseChannel: '沃尔玛',
        purchaseToBaseRatio: 200,
        purchaseUnit: '盒',
      },
      {
        id: 'sku-beef-sams',
        name: 'MM澳洲谷饲牛霖',
        productModel: '1.2kg/盒',
        purchaseChannel: '山姆会员店',
        purchaseToBaseRatio: 1200,
        purchaseUnit: '盒',
      },
    ],
  };

  it('原料名没命中，但同渠道有同名商品 → 落到它所属的原料', () => {
    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', '约200g')],
      [beefRump],
      '沃尔玛',
    );

    expect(matched.ingredientId).toBe('ing-beef-rump');
    expect(matched.procurementSkuId).toBe('sku-beef-walmart');
    expect(matched.confidence).toBe('HIGH');
    expect(matched.needsNewSku).toBe(false);
  });

  it('同名商品在别的渠道 → 不反查，仍留未匹配', () => {
    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', '约200g')],
      [beefRump],
      '盒马鲜生',
    );

    expect(matched.ingredientId).toBeNull();
    expect(matched.procurementSkuId).toBeNull();
  });

  it('同名商品同时挂在两个原料下 → 不猜，留未匹配', () => {
    const duplicate: ListItemCandidate = {
      purchaseItemId: 'item-other',
      ingredientId: 'ing-other',
      ingredientName: '牛腱',
      skus: [
        {
          id: 'sku-other',
          name: '冷鲜 鲜切黄牛后腿肉',
          productModel: '200g',
          purchaseChannel: '沃尔玛',
          purchaseToBaseRatio: 200,
          purchaseUnit: '盒',
        },
      ],
    };

    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', '约200g')],
      [beefRump, duplicate],
      '沃尔玛',
    );

    expect(matched.ingredientId).toBeNull();
  });

  it('同名商品规格对不上 → 原料认出来，但要重新选商品', () => {
    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉 500g', '500g')],
      [beefRump],
      '沃尔玛',
    );

    expect(matched.ingredientId).toBe('ing-beef-rump');
    expect(matched.procurementSkuId).toBeNull();
    expect(matched.needsNewSku).toBe(true);
  });

  it('渠道还没确认 → 不反查，等员工选渠道', () => {
    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', '约200g')],
      [beefRump],
      null,
    );

    expect(matched.ingredientId).toBeNull();
  });

  // 评审补充（2026-11-07）：同一原料下有多个同名商品时，必须按规格选对；
  // 选不出来就只挂原料，绝不按排序蒙一个（挂错会按错的净含量折算成本）。
  const beefRumpTwoSizes: ListItemCandidate = {
    purchaseItemId: 'item-beef-rump',
    ingredientId: 'ing-beef-rump',
    ingredientName: '牛霖',
    skus: [
      {
        id: 'sku-beef-500',
        name: '冷鲜 鲜切黄牛后腿肉 500g',
        productModel: '500g',
        purchaseChannel: '沃尔玛',
        purchaseToBaseRatio: 500,
        purchaseUnit: '盒',
      },
      {
        id: 'sku-beef-200',
        name: '冷鲜 鲜切黄牛后腿肉 约200g',
        productModel: '200g',
        purchaseChannel: '沃尔玛',
        purchaseToBaseRatio: 200,
        purchaseUnit: '盒',
      },
    ],
  };

  it('同一原料下有多个同名商品 → 按截图规格选对的那一个', () => {
    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', '约200g')],
      [beefRumpTwoSizes],
      '沃尔玛',
    );

    expect(matched.ingredientId).toBe('ing-beef-rump');
    expect(matched.procurementSkuId).toBe('sku-beef-200');
    expect(matched.confidence).toBe('HIGH');
    expect(matched.needsNewSku).toBe(false);
  });

  it('克重只写在截图名字里（spec 为空）→ 仍按名字里的克重选', () => {
    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉 200g', null)],
      [beefRumpTwoSizes],
      '沃尔玛',
    );

    expect(matched.procurementSkuId).toBe('sku-beef-200');
    expect(matched.needsNewSku).toBe(false);
  });

  it('截图没写规格、同名商品又有多个 → 只挂原料，请员工选商品', () => {
    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', null)],
      [beefRumpTwoSizes],
      '沃尔玛',
    );

    expect(matched.ingredientId).toBe('ing-beef-rump');
    expect(matched.procurementSkuId).toBeNull();
    expect(matched.needsNewSku).toBe(true);
    expect(matched.confidence).not.toBe('HIGH');
  });

  it('只有一个同名商品、截图没写规格 → 直接挂上（没有第二个可能）', () => {
    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', null)],
      [beefRump],
      '沃尔玛',
    );

    expect(matched.procurementSkuId).toBe('sku-beef-walmart');
    expect(matched.needsNewSku).toBe(false);
  });

  it('商品改过名：曾用名和截图完全一致时也能反查到', () => {
    const renamed: ListItemCandidate = {
      purchaseItemId: 'item-beef-rump',
      ingredientId: 'ing-beef-rump',
      ingredientName: '牛霖',
      skus: [
        {
          id: 'sku-beef-renamed',
          name: '沃尔玛黄牛后腿肉 200g',
          productModel: '200g',
          purchaseChannel: '沃尔玛',
          purchaseToBaseRatio: 200,
          purchaseUnit: '盒',
          previousNames: ['冷鲜 鲜切黄牛后腿肉 约200g'],
        },
      ],
    };

    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', '约200g')],
      [renamed],
      '沃尔玛',
    );

    expect(matched.procurementSkuId).toBe('sku-beef-renamed');
    expect(matched.confidence).toBe('HIGH');
  });

  it('员工教过的别名优先于同名反查，不会被盖掉', () => {
    const another: ListItemCandidate = {
      purchaseItemId: 'item-other',
      ingredientId: 'ing-other',
      ingredientName: '牛腱',
      skus: [
        {
          id: 'sku-other',
          name: '牛腱',
          productModel: null,
          purchaseChannel: '沃尔玛',
          purchaseToBaseRatio: null,
          purchaseUnit: '盒',
        },
      ],
    };

    const [matched] = matchWithChannels(
      [line('冷鲜 鲜切黄牛后腿肉', '约200g')],
      [beefRump, another],
      '沃尔玛',
      [
        {
          normalizedName: '鲜切黄牛后腿肉',
          channelFamily: '沃尔玛',
          ingredientId: 'ing-other',
          procurementSkuId: null,
        },
      ],
    );

    expect(matched.ingredientId).toBe('ing-other');
  });
});
