import {
  buildAddressFingerprint,
  compareRecipient,
  normalizeName,
  phoneTail4,
} from 'src/application/shipping/waybill-receipt-match';

/**
 * 快递存根收件人比对（2026-11-10）。
 *
 * 老板的硬要求：存根上的收件人跟这单的收货人对不上，就不许发货。
 * 但硬拦不能误伤 —— 代收人、直辖市叠写、打码姓名都真实存在。
 * 这些用例就是这条线的护栏：
 *   · 手机尾号 / 区县 明确不同 → mismatch（拦）
 *   · 只有姓名不同 → unknown（不拦，代收人很常见）
 *   · 读不全 → unknown（不假装验过）
 */
describe('存根比对 · phoneTail4', () => {
  it('打码手机取末尾 4 位', () => {
    expect(phoneTail4('186****2107')).toBe('2107');
  });

  it('完整手机号取末尾 4 位', () => {
    expect(phoneTail4('18612342107')).toBe('2107');
  });

  it('★ 星号后面不足 4 位数字 → null（不许硬凑）', () => {
    expect(phoneTail4('186****07')).toBeNull();
  });

  it('没有数字 → null', () => {
    expect(phoneTail4('')).toBeNull();
    expect(phoneTail4('无')).toBeNull();
    expect(phoneTail4(null)).toBeNull();
  });
});

describe('存根比对 · normalizeName', () => {
  it('去空格', () => {
    expect(normalizeName(' 张 赛 珺 ')).toBe('张赛珺');
  });

  it('全角字母数字转半角', () => {
    expect(normalizeName('ＡＢ１２')).toBe('AB12');
  });

  it('空值给空串', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('存根比对 · compareRecipient', () => {
  const expected = {
    recipientName: '张赛珺',
    phone: '18612342107',
    province: '上海市',
    city: '上海市',
    district: '普陀区',
    detail: '礼泉路700弄55号703',
  };

  it('★ 手机尾号 + 区县都对上 → match', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: '186****2107',
        address: '上海市上海市普陀区礼泉路700弄55号703',
      },
      expected,
    );

    expect(result).toEqual({ status: 'match', conflicts: [] });
  });

  it('★ 手机尾号不同 → mismatch，并说清是手机对不上', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: '186****0011',
        address: '上海市上海市普陀区礼泉路700弄55号703',
      },
      expected,
    );

    expect(result.status).toBe('mismatch');
    expect(result.conflicts).toEqual([
      { field: 'phone', expected: '2107', actual: '0011' },
    ]);
  });

  it('★ 区县不同 → mismatch', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: null,
        address: '北京市北京市朝阳区建国路88号',
      },
      expected,
    );

    expect(result.status).toBe('mismatch');
    expect(result.conflicts.map((item) => item.field)).toEqual(['district']);
    expect(result.conflicts[0].expected).toBe('普陀区');
    expect(result.conflicts[0].actual).toBe('朝阳区');
  });

  it('★ 只有姓名不同 → unknown，不拦（代收人很常见）', () => {
    const result = compareRecipient(
      {
        name: '张三',
        phoneMasked: '186****2107',
        address: '上海市上海市普陀区礼泉路700弄55号703',
      },
      expected,
    );

    expect(result.status).toBe('unknown');
    expect(result.conflicts).toEqual([]);
  });

  it('★ 存根没印地址、手机也读不出 → unknown，不假装验过', () => {
    const result = compareRecipient(
      { name: null, phoneMasked: null, address: null },
      expected,
    );

    expect(result.status).toBe('unknown');
    expect(result.conflicts).toEqual([]);
  });

  it('打码姓名只比第一个字', () => {
    const result = compareRecipient(
      {
        name: '张*',
        phoneMasked: '186****2107',
        address: '上海市普陀区礼泉路700弄55号703',
      },
      expected,
    );

    expect(result.status).toBe('match');
  });

  it('存根地址里只写了区县、没有省 → 照样能对上', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: '186****2107',
        address: '普陀区礼泉路700弄55号703',
      },
      expected,
    );

    expect(result.status).toBe('match');
  });

  it('内蒙古自治区这类写法不能把"治区"当成区县', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: '186****2107',
        address: '内蒙古自治区包头市昆都仑区钢铁大街1号',
      },
      expected,
    );

    expect(result.status).toBe('mismatch');
    expect(result.conflicts[0].actual).toBe('昆都仑区');
  });

  it('★ "开发区"不能被当成区县（否则正确的存根被判对不上）', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: '186****2107',
        address: '河南省郑州市经济技术开发区第五大街1号',
      },
      expected,
    );

    expect(result.status).toBe('unknown');
    expect(result.conflicts).toEqual([]);
  });

  it('★ "XX小区"不能被当成区县', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: '186****2107',
        address: '阳光小区5栋301',
      },
      expected,
    );

    expect(result.status).toBe('unknown');
    expect(result.conflicts).toEqual([]);
  });

  it('"市辖区"也不能把"辖区"当成区县', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: '186****2107',
        address: '某某市市辖区幸福路1号',
      },
      expected,
    );

    expect(result.status).toBe('unknown');
  });

  it('★ 地址里没写"区"字，但详细地址对得上 → 算一致', () => {
    const result = compareRecipient(
      {
        name: '张赛珺',
        phoneMasked: '186****2107',
        address: '礼泉路700弄55号703 普陀',
      },
      expected,
    );

    expect(result.status).toBe('match');
  });

  it('订单侧地址是空的 → unknown（不能反过来拦死）', () => {
    const result = compareRecipient(
      { name: '张赛珺', phoneMasked: '186****2107', address: '上海市普陀区礼泉路700弄55号703' },
      { ...expected, district: '', detail: '' },
    );

    expect(result.status).toBe('unknown');
  });
});

describe('存根比对 · buildAddressFingerprint', () => {
  const address = {
    recipientName: '张赛珺',
    phone: '18612342107',
    province: '上海市',
    city: '上海市',
    district: '普陀区',
    detail: '礼泉路700弄55号703',
  };

  it('★ 空格差异不影响指纹', () => {
    expect(
      buildAddressFingerprint({ ...address, detail: ' 礼泉路700弄55号703 ' }),
    ).toBe(buildAddressFingerprint(address));
  });

  it('★ 改了详细地址 → 指纹必须变（旧核对记录要失效）', () => {
    expect(
      buildAddressFingerprint({ ...address, detail: '礼泉路700弄55号704' }),
    ).not.toBe(buildAddressFingerprint(address));
  });

  it('换了收件人 → 指纹必须变', () => {
    expect(
      buildAddressFingerprint({ ...address, recipientName: '李四' }),
    ).not.toBe(buildAddressFingerprint(address));
  });
});
