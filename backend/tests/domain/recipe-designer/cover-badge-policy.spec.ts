import {
  COVER_BADGE_ALLOWED_NAMES,
  isCoverBadgeEligibleName,
  pickCoverBadgeNames,
} from '../../../src/domain/recipe-designer/cover-badge-policy';

describe('封面角标可选词白名单', () => {
  it('只允许老板确认的六个词', () => {
    expect([...COVER_BADGE_ALLOWED_NAMES]).toEqual([
      '低脂',
      '易消化',
      '挑食友好',
      '适口性优先',
      '符合 FEDIAF 2025',
      '单一动物蛋白',
    ]);
    for (const name of COVER_BADGE_ALLOWED_NAMES) {
      expect(isCoverBadgeEligibleName(name)).toBe(true);
    }
  });

  it('拒绝含…原料事实、工艺特性和 FEDIAF 2021', () => {
    for (const name of [
      '含三文鱼',
      '含鸭胸',
      '含马肉',
      '鲜肉现制',
      '低温蒸煮',
      '冷链配送',
      '无防腐剂',
      '符合 FEDIAF 2021',
      '',
      '   ',
      null,
      undefined,
      123,
    ]) {
      expect(isCoverBadgeEligibleName(name)).toBe(false);
    }
  });

  it('trim 后匹配，pick 会去空、去重并保持顺序', () => {
    expect(isCoverBadgeEligibleName('  低脂  ')).toBe(true);
    expect(
      pickCoverBadgeNames([
        ' 低脂 ',
        '含鸭胸',
        '低脂',
        '',
        '单一动物蛋白',
        null,
        '符合 FEDIAF 2021',
      ]),
    ).toEqual(['低脂', '单一动物蛋白']);
    expect(pickCoverBadgeNames(null)).toEqual([]);
    expect(pickCoverBadgeNames([])).toEqual([]);
  });
});
