import { describe, expect, it, vi } from 'vitest';
import {
  applyRecognizeResult,
  createReceiptState,
  markReceiptFailed,
  markReceiptManualConfirmed,
  markReceiptPicked,
  receiptViewOf,
  resetReceiptState,
  type ReceiptState,
} from './waybill-receipt-machine';

function recognized(overrides: any = {}) {
  return {
    receipt: {
      carrierCode: 'SF',
      carrierName: '顺丰速运',
      trackingNumber: 'SF0123456789',
      shippingFee: 23.5,
      ...overrides.receipt,
    },
    match: {
      status: 'match',
      conflicts: [],
      duplicate: null,
      ...overrides.match,
    },
  };
}

describe('快递存根状态机', () => {
  it('核对通过：回填表单，并且可以发货', () => {
    const state = createReceiptState();
    const apply = vi.fn();
    const status = applyRecognizeResult(state, recognized() as any, apply);

    expect(status).toBe('match');
    expect(apply).toHaveBeenCalledWith({
      carrierCode: 'SF',
      trackingNumber: 'SF0123456789',
      shippingFee: 23.5,
    });
    expect(receiptViewOf(state, 'SF0123456789').canShip).toBe(true);
  });

  it('没核对上（unknown）：也回填，但必须手动确认一次', () => {
    const state = createReceiptState();
    const apply = vi.fn();
    applyRecognizeResult(state, recognized({ match: { status: 'unknown' } }) as any, apply);

    expect(apply).toHaveBeenCalled();
    const view = receiptViewOf(state, 'SF0123456789');
    expect(view.canShip).toBe(false);
    expect(view.canManual).toBe(true);
  });

  it('★ 对不上（mismatch）：一个字段都不回填，也不给手动出口', () => {
    const state = createReceiptState();
    const apply = vi.fn();
    applyRecognizeResult(
      state,
      recognized({
        match: {
          status: 'mismatch',
          conflicts: [{ field: 'name', expected: '张三', actual: '李四' }],
        },
      }) as any,
      apply,
    );

    expect(apply).not.toHaveBeenCalled();
    const view = receiptViewOf(state, '');
    expect(view.canShip).toBe(false);
    expect(view.canManual).toBe(false);
  });

  it('号被占用（duplicate）：同样不回填、不给手动', () => {
    const state = createReceiptState();
    const apply = vi.fn();
    applyRecognizeResult(
      state,
      recognized({ match: { status: 'duplicate', duplicate: { label: 'SK20261108-003' } } }) as any,
      apply,
    );

    expect(apply).not.toHaveBeenCalled();
    expect(state.duplicateLabel).toBe('SK20261108-003');
    expect(receiptViewOf(state, '').canManual).toBe(false);
  });

  it('不是存根：给一句人话，并且允许手动填写', () => {
    const state = createReceiptState();
    applyRecognizeResult(state, recognized({ match: { status: 'not_waybill' } }) as any, vi.fn());

    expect(state.state).toBe('failed');
    expect(state.message).toContain('不是快递存根');
    expect(receiptViewOf(state, '').canManual).toBe(true);
  });

  it('★ 手动确认只对当时那个单号有效：确认完改号就作废', () => {
    const state = createReceiptState();
    markReceiptPicked(state);
    applyRecognizeResult(state, recognized({ match: { status: 'unknown' } }) as any, vi.fn());
    markReceiptManualConfirmed(state, 'SF0123456789');

    // 同一个号：确认有效
    expect(receiptViewOf(state, 'SF0123456789').canShip).toBe(true);

    // 改过号：这次确认作废，要求重新核对
    const changed = receiptViewOf(state, 'SF9999999999');
    expect(changed.canShip).toBe(false);
  });

  it('换一张存根会清掉上一张的手动确认', () => {
    const state = createReceiptState();
    markReceiptPicked(state);
    markReceiptManualConfirmed(state, 'SF0123456789');
    expect(state.manualConfirmed).toBe(true);

    markReceiptPicked(state);
    expect(state.manualConfirmed).toBe(false);
    expect(state.manualTracking).toBe('');
    expect(state.state).toBe('recognizing');
  });

  it('识别失败时保留一句可读的原因', () => {
    const state = createReceiptState();
    markReceiptFailed(state, '');
    expect(state.message).toBe('识别失败，可以手动填写');
  });

  it('reset 把整台机器清回初始态', () => {
    const state: ReceiptState = createReceiptState();
    applyRecognizeResult(state, recognized() as any, vi.fn());
    state.hasImage = true;
    resetReceiptState(state);

    expect(state).toEqual(createReceiptState());
  });
});
