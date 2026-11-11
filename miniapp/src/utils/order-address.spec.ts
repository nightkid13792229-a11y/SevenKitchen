import { describe, expect, it } from 'vitest';
import {
  buildOrderAddressCopyText,
  getOrderAddressDetail,
  getOrderAddressPhone,
  getOrderAddressRegionText,
  orderAddressKey,
} from './order-address';

describe('订单收货地址取数', () => {
  it('新数据（region 对象 + detailAddress）能读出来', () => {
    const address = {
      recipientName: '张三',
      phone: '13800001111',
      region: { province: '上海市', city: '上海市', district: '普陀区' },
      detailAddress: '中山北路 1 号',
    };
    expect(getOrderAddressPhone(address)).toBe('13800001111');
    // 直辖市重复的「市」只留一遍
    expect(getOrderAddressRegionText(address)).toBe('上海市 普陀区');
    expect(getOrderAddressDetail(address)).toBe('中山北路 1 号');
  });

  it('老数据（regionText + detail）也能读', () => {
    const address = {
      recipientName: '李四',
      recipientPhone: '13900002222',
      regionText: '广东省 深圳市 南山区',
      detail: '科技园 3 栋',
    };
    expect(getOrderAddressPhone(address)).toBe('13900002222');
    expect(getOrderAddressRegionText(address)).toBe('广东省 深圳市 南山区');
    expect(getOrderAddressDetail(address)).toBe('科技园 3 栋');
  });

  it('复制文本：收货人 + 电话 + 省市区 + 详细地址，按顺丰页面顺序', () => {
    expect(
      buildOrderAddressCopyText({
        recipientName: '张三',
        phone: '13800001111',
        regionText: '上海市 普陀区',
        detail: '中山北路 1 号',
      }),
    ).toBe('张三 13800001111 上海市 普陀区 中山北路 1 号');
  });

  it('★ 地址指纹：同地址不同写法（老/新字段）比对结果一致', () => {
    const modern = orderAddressKey({
      recipientName: '张三',
      phone: '13800001111',
      region: { province: '上海市', city: '上海市', district: '普陀区' },
      detailAddress: '中山北路 1 号',
    });
    const legacy = orderAddressKey({
      recipientName: '张三',
      recipientPhone: '13800001111',
      regionText: '上海市 普陀区',
      detail: '中山北路 1 号',
    });
    expect(modern).toBe(legacy);
  });

  it('地址指纹：换了详细地址 / 电话就是不同的键', () => {
    const base = {
      recipientName: '张三',
      phone: '13800001111',
      regionText: '上海市 普陀区',
      detail: '中山北路 1 号',
    };
    expect(orderAddressKey({ ...base, detail: '中山北路 2 号' })).not.toBe(
      orderAddressKey(base),
    );
    expect(orderAddressKey({ ...base, phone: '13800009999' })).not.toBe(
      orderAddressKey(base),
    );
    expect(orderAddressKey(null)).toBe('');
  });
});
