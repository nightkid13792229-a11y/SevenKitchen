import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/api', () => ({ request: vi.fn() }));
vi.mock('./staff-supplement-orders', () => ({
  staffSupplementOrderApi: { ship: vi.fn() },
}));

import { request } from '../utils/api';
import { staffSupplementOrderApi } from './staff-supplement-orders';
import { submitStaffShipment } from './ship-submit';

const requestMock = vi.mocked(request);
const supplementShipMock = vi.mocked(staffSupplementOrderApi.ship);

const BASE = {
  shippingType: 'NORMAL' as const,
  carrierCode: 'SF',
  trackingNumber: 'SF1234567890',
  actualShippingFee: 12.5,
};

describe('单笔发货提交', () => {
  beforeEach(() => {
    requestMock.mockReset();
    supplementShipMock.mockReset();
  });

  it('补剂：正常发货只调一次发货接口，微信结果直接用响应里的（不重复上报）', async () => {
    supplementShipMock.mockResolvedValue({
      code: 0,
      data: { wechatShippingUpload: { success: true, message: '已上传' } },
    } as any);

    const result = await submitStaffShipment('supplement', 'sup-1', BASE);

    expect(result.wechat).toBe('ok');
    expect(supplementShipMock).toHaveBeenCalledTimes(1);
    // 关键：不再调 /staff/shipping/orders/:id/wechat-shipping-upload
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('补剂：后台说同步失败 → 把原因带回去', async () => {
    supplementShipMock.mockResolvedValue({
      code: 0,
      data: {
        wechatShippingUpload: { success: false, message: '顺丰单缺少收件电话' },
      },
    } as any);

    const result = await submitStaffShipment('supplement', 'sup-1', BASE);

    expect(result.wechat).toBe('failed');
    expect(result.wechatMessage).toContain('顺丰单缺少收件电话');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('补剂：后台合法跳过（非微信支付）→ skipped', async () => {
    supplementShipMock.mockResolvedValue({
      code: 0,
      data: { wechatShippingUpload: { success: true, skipped: true } },
    } as any);

    const result = await submitStaffShipment('supplement', 'sup-1', BASE);

    expect(result.wechat).toBe('skipped');
  });

  it('★ 补剂：后台没返回同步结果 → 报失败，绝不偷偷补调上报接口', async () => {
    supplementShipMock.mockResolvedValue({ code: 0, data: {} } as any);

    const result = await submitStaffShipment('supplement', 'sup-1', BASE);

    expect(result.wechat).toBe('failed');
    expect(result.wechatMessage).toContain('后台没有返回微信同步结果');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('补剂：发货接口报错 → 抛错，不吞', async () => {
    supplementShipMock.mockResolvedValue({ code: 500, message: '该订单有未完结退款' } as any);

    await expect(submitStaffShipment('supplement', 'sup-1', BASE)).rejects.toThrow(
      '该订单有未完结退款',
    );
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('补剂：无需发货 → 不填单号运费、不碰微信', async () => {
    supplementShipMock.mockResolvedValue({ code: 0, data: {} } as any);

    const result = await submitStaffShipment('supplement', 'sup-1', {
      shippingType: 'NOT_REQUIRED',
    });

    expect(result.wechat).toBe('skipped');
    expect(supplementShipMock).toHaveBeenCalledWith('sup-1', {
      shippingType: 'NOT_REQUIRED',
    });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('鲜食：发货后再单独调一次微信上报（后台发货接口不做这件事）', async () => {
    requestMock.mockResolvedValue({ code: 0 } as any);

    const result = await submitStaffShipment('food', 'ord-1', BASE);

    expect(result.wechat).toBe('ok');
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock.mock.calls[0][0].url).toBe('/admin/orders/ord-1/ship');
    expect(requestMock.mock.calls[1][0].url).toBe(
      '/staff/shipping/orders/ord-1/wechat-shipping-upload',
    );
    // 硬锁声明只在正常发货时带
    expect((requestMock.mock.calls[0][0] as any).data.enforceWaybillCheck).toBe(true);
  });

  it('鲜食：微信上报失败不影响发货成功，返回可读原因', async () => {
    requestMock
      .mockResolvedValueOnce({ code: 0 } as any)
      .mockRejectedValueOnce(new Error('微信超时') as any);

    const result = await submitStaffShipment('food', 'ord-1', BASE);

    expect(result.wechat).toBe('failed');
    expect(result.wechatMessage).toContain('微信超时');
  });

  it('鲜食：无需发货只调发货接口，不上报', async () => {
    requestMock.mockResolvedValue({ code: 0 } as any);

    const result = await submitStaffShipment('food', 'ord-1', {
      shippingType: 'NOT_REQUIRED',
    });

    expect(result.wechat).toBe('skipped');
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock.mock.calls[0][0].url).toBe('/admin/orders/ord-1/ship');
  });
});
