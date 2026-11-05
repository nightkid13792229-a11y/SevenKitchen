import { describe, expect, it } from 'vitest';
import {
  channelKey,
  isSameChannel,
  keepSkuForChannel,
  prefillChannel,
} from './purchase-channel';

/**
 * 选商品抽屉按渠道过滤（2026-11-06）。
 *
 * 老板在识别结果页看到的怪事：这笔是盒马鲜生，选商品抽屉里却列着农贸市场、
 * 山姆、沃尔玛的商品。原因是抽屉只按原料分组，从不读订单渠道。
 * 现在的口径：抽屉只列这笔订单那个渠道的商品 —— 渠道是商品的身份之一，
 * 在别家买的正确做法是去那个渠道下新建商品，而不是把别的渠道商品挂到这笔上。
 *
 * 渠道在后台是一份字典（purchase_channel），码是原文、别名存在 extra 里。
 * 员工端只能拿到标签，所以这里按「去标点空格 + 互相包含」判断是不是同一家：
 * 「山姆」「山姆会员店」「盒马」「盒马鲜生」都要认成一条。
 */
describe('渠道归一', () => {
  it('去空格、去标点、忽略大小写', () => {
    expect(channelKey(' 山姆 会员店 ')).toBe('山姆会员店');
    expect(channelKey('Sam’s Club')).toBe('samsclub');
  });

  it('空值返回空串，不炸', () => {
    expect(channelKey(null)).toBe('');
    expect(channelKey(undefined)).toBe('');
    expect(channelKey('   ')).toBe('');
  });
});

describe('是不是同一家渠道', () => {
  it('原文一样的算同一条', () => {
    expect(isSameChannel('盒马鲜生', '盒马鲜生')).toBe(true);
  });

  it('简称和全称算同一条（山姆 / 山姆会员店，盒马 / 盒马鲜生）', () => {
    expect(isSameChannel('山姆', '山姆会员店')).toBe(true);
    expect(isSameChannel('盒马', '盒马鲜生')).toBe(true);
  });

  it('不同渠道不能混：沃尔玛不是盒马', () => {
    expect(isSameChannel('沃尔玛', '盒马鲜生')).toBe(false);
    expect(isSameChannel('农贸市场', '山姆会员店')).toBe(false);
  });

  it('一边没写渠道就不算同一家', () => {
    expect(isSameChannel('', '盒马鲜生')).toBe(false);
    expect(isSameChannel(null, '盒马鲜生')).toBe(false);
  });

  it('一个字的名字不做包含匹配，免得「马」把「盒马」吃掉', () => {
    expect(isSameChannel('马', '盒马鲜生')).toBe(false);
  });
});

describe('按渠道筛采购商品', () => {
  const skus = [
    { id: 'a', name: '牛霖 散称', purchaseChannel: '农贸市场' },
    { id: 'b', name: 'MM澳洲谷饲牛霖 1.2kg/盒', purchaseChannel: '山姆会员店' },
    { id: 'c', name: '有机谷饲嫩牛肉 260g/盒', purchaseChannel: '盒马鲜生' },
    { id: 'd', name: '冷鲜 鲜切黄牛后腿肉 约200g', purchaseChannel: '沃尔玛' },
    { id: 'e', name: '没填渠道的老商品', purchaseChannel: null },
  ];

  it('订单是盒马鲜生：只留盒马那条', () => {
    const kept = keepSkuForChannel(skus, '盒马鲜生');
    expect(kept.map((sku) => sku.id)).toEqual(['c']);
  });

  it('原来的顺序不变（渠道是筛条件，不是排序条件）', () => {
    const kept = keepSkuForChannel(
      [
        { id: '1', purchaseChannel: '盒马鲜生' },
        { id: '2', purchaseChannel: '山姆会员店' },
        { id: '3', purchaseChannel: '盒马' },
      ],
      '盒马鲜生',
    );
    expect(kept.map((sku) => sku.id)).toEqual(['1', '3']);
  });

  it('商品写的是简称、订单写的是全称，也要能对上', () => {
    const kept = keepSkuForChannel(
      [{ id: 'x', purchaseChannel: '山姆' }],
      '山姆会员店',
    );
    expect(kept.map((sku) => sku.id)).toEqual(['x']);
  });

  it('没填渠道的商品不算这个渠道，不显示', () => {
    const kept = keepSkuForChannel(skus, '盒马鲜生');
    expect(kept.map((sku) => sku.id)).not.toContain('e');
  });

  it('这笔还没确认渠道时不筛，保持原来的全列（页面另有渠道门禁）', () => {
    expect(keepSkuForChannel(skus, '')).toHaveLength(skus.length);
    expect(keepSkuForChannel(skus, null)).toHaveLength(skus.length);
  });

  it('这个渠道一个都没有时返回空数组，交给页面提示新建', () => {
    expect(keepSkuForChannel(skus, '永辉')).toEqual([]);
  });
});

describe('新建采购商品时带上订单渠道', () => {
  const channels = ['农贸市场', '山姆会员店', '盒马鲜生', '沃尔玛', '永辉'];

  it('订单渠道在字典里：预选它', () => {
    expect(prefillChannel('盒马鲜生', channels)).toBe('盒马鲜生');
  });

  it('订单写的是简称：预选字典里那一条的全称', () => {
    expect(prefillChannel('盒马', channels)).toBe('盒马鲜生');
    expect(prefillChannel('山姆', channels)).toBe('山姆会员店');
  });

  it('订单没渠道 / 字典没加载出来：不预选，让员工自己选', () => {
    expect(prefillChannel('', channels)).toBe('');
    expect(prefillChannel(null, channels)).toBe('');
    expect(prefillChannel('盒马鲜生', [])).toBe('');
  });

  it('订单渠道已经不在字典里（被停用）：不预选，别让人存一个停用的渠道', () => {
    expect(prefillChannel('家乐福', channels)).toBe('');
  });
});
