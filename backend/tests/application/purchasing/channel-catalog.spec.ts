import {
  canonicalChannelCode,
  channelDisplayName,
  channelMatchKey,
  findChannelOption,
  normalizeChannelKey,
  resolveChannelCode,
  toChannelOptions,
} from '../../../src/application/purchasing/channel-catalog';

/**
 * 采购渠道目录（2026-11-05）。
 *
 * 这些用例锁的是「渠道唯一来源」最关键的一条：
 * 同一个门店的历史写法必须归一到字典里的那一条，
 * 而归不上的必须返回 null —— 不许再变出一个「其他」。
 */
const CHANNELS = toChannelOptions([
  {
    code: '山姆会员店',
    label: '山姆会员店',
    extra: { aliases: ['山姆', "Sam's Club"] },
  },
  { code: '盒马鲜生', label: '盒马鲜生', extra: { aliases: ['盒马'] } },
  {
    code: '淘宝/天猫',
    label: '淘宝/天猫',
    extra: { aliases: ['淘宝', '天猫', '天猫超市'] },
  },
  { code: '京东', label: '京东', extra: { aliases: ['京东商城'] } },
  { code: '农贸市场', label: '农贸市场', extra: { aliases: ['菜市场'] } },
  { code: 'iHerb', label: 'iHerb', extra: { aliases: ['iherb'] } },
]);

describe('channel-catalog', () => {
  it('别名、简称、英文名都归一到字典项', () => {
    expect(canonicalChannelCode('山姆', CHANNELS)).toBe('山姆会员店');
    expect(canonicalChannelCode('山姆会员店', CHANNELS)).toBe('山姆会员店');
    expect(canonicalChannelCode("Sam's Club", CHANNELS)).toBe('山姆会员店');
    expect(canonicalChannelCode('盒马', CHANNELS)).toBe('盒马鲜生');
    expect(canonicalChannelCode('天猫', CHANNELS)).toBe('淘宝/天猫');
    expect(canonicalChannelCode('菜市场', CHANNELS)).toBe('农贸市场');
    expect(canonicalChannelCode('IHERB', CHANNELS)).toBe('iHerb');
  });

  it('大小写、空格、标点不影响归一', () => {
    expect(normalizeChannelKey(' 淘宝 / 天猫 ')).toBe('淘宝天猫');
    expect(canonicalChannelCode(' 淘宝 / 天猫 ', CHANNELS)).toBe('淘宝/天猫');
  });

  it('包含写法也能认出来（截图上的店名前后带字）', () => {
    expect(findChannelOption('山姆会员商店订单', CHANNELS)?.code).toBe(
      '山姆会员店',
    );
    expect(canonicalChannelCode('盒马鲜生 App', CHANNELS)).toBe('盒马鲜生');
  });

  it('认不出来返回 null，绝不伪造「其他」', () => {
    expect(canonicalChannelCode('其他', CHANNELS)).toBeNull();
    expect(canonicalChannelCode('楼下小卖部', CHANNELS)).toBeNull();
    expect(canonicalChannelCode(null, CHANNELS)).toBeNull();
    expect(canonicalChannelCode('', CHANNELS)).toBeNull();
  });

  it('匹配比较键：认识用 code，不认识保留原文（历史值还能自己对上）', () => {
    expect(channelMatchKey('山姆', CHANNELS)).toBe('山姆会员店');
    expect(channelMatchKey('大润发', CHANNELS)).toBe('大润发');
    expect(channelMatchKey(' 大 润 发 ', CHANNELS)).toBe('大润发');
    expect(channelMatchKey(null, CHANNELS)).toBe('');
  });

  it('写入口：能归一就归一，停用码原样接受，认不出给 null', () => {
    const known = new Set([
      ...CHANNELS.map((item) => item.code),
      '美菜网',
    ]);
    expect(resolveChannelCode('山姆', CHANNELS, known)).toBe('山姆会员店');
    expect(resolveChannelCode('美菜网', CHANNELS, known)).toBe('美菜网');
    expect(resolveChannelCode('大润发', CHANNELS, known)).toBeNull();
    expect(resolveChannelCode('  ', CHANNELS, known)).toBeNull();
    expect(resolveChannelCode(null, CHANNELS, known)).toBeNull();
  });

  it('展示名：认识给字典标签，不认识给原文', () => {
    expect(channelDisplayName('盒马', CHANNELS)).toBe('盒马鲜生');
    expect(channelDisplayName('大润发', CHANNELS)).toBe('大润发');
  });
});
