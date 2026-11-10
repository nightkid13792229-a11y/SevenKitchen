import { buildReceiptView } from './waybill-receipt-view';

/**
 * 存根上传块"该长什么样"（2026-11-10）。
 *
 * 页面上这一块是员工唯一的判断依据，所以四种颜色的含义必须钉死：
 *   绿 = 核对通过，能发
 *   黄 = 没核对上（地址没印 / 手机读不出），要走「手动填写」确认
 *   红 = 明确对不上 / 号被占了 → **不许发，也不给手动后门**
 *  灰 = 还没传 / 正在识别
 *
 * 最要紧的一条：`mismatch` 和 `duplicate` 的 `canManual` 必须是 false。
 * 给了手动，硬锁点一下就绕过去了。
 */
describe('存根上传块 · buildReceiptView', () => {
  it('空闲时不能发货', () => {
    const view = buildReceiptView({ state: 'idle' });
    expect(view.tone).toBe('neutral');
    expect(view.canShip).toBe(false);
    expect(view.canManual).toBe(false);
  });

  it('识别中不能发货', () => {
    const view = buildReceiptView({ state: 'recognizing' });
    expect(view.canShip).toBe(false);
    expect(view.title).toContain('识别中');
  });

  it('★ 核对通过 → 绿，能发，不需要手动', () => {
    const view = buildReceiptView({
      state: 'match',
      carrierName: '顺丰速运',
      trackingNumber: 'SF0204691009893',
      shippingFee: 56,
    });

    expect(view.tone).toBe('ok');
    expect(view.canShip).toBe(true);
    expect(view.canManual).toBe(false);
    expect(view.title).toContain('SF0204691009893');
    expect(view.title).toContain('顺丰速运');
    expect(view.title).toContain('56.00');
  });

  it('★ 收件人对不上 → 红，不能发，且不给手动后门', () => {
    const view = buildReceiptView({
      state: 'mismatch',
      conflicts: [{ field: 'phone', expected: '2107', actual: '0011' }],
    });

    expect(view.tone).toBe('error');
    expect(view.canShip).toBe(false);
    expect(view.canManual).toBe(false);
    expect(view.desc).toContain('0011');
    expect(view.desc).toContain('2107');
  });

  it('区县对不上时说清是哪两个区', () => {
    const view = buildReceiptView({
      state: 'mismatch',
      conflicts: [{ field: 'district', expected: '普陀区', actual: '朝阳区' }],
    });

    expect(view.desc).toContain('朝阳区');
    expect(view.desc).toContain('普陀区');
  });

  it('★ 运单号已被占用 → 红，不能发，不给手动', () => {
    const view = buildReceiptView({
      state: 'duplicate',
      duplicateLabel: 'SK2026110199',
    });

    expect(view.tone).toBe('error');
    expect(view.canShip).toBe(false);
    expect(view.canManual).toBe(false);
    expect(view.desc).toContain('SK2026110199');
  });

  it('★ 认不出来 → 不能发，但给手动出口（不能把打包间卡死）', () => {
    const view = buildReceiptView({ state: 'failed' });

    expect(view.tone).toBe('error');
    expect(view.canShip).toBe(false);
    expect(view.canManual).toBe(true);
  });

  it('★ 没能核对上 → 黄，不能直接发，可以手动确认', () => {
    const view = buildReceiptView({ state: 'unknown' });

    expect(view.tone).toBe('warn');
    expect(view.canShip).toBe(false);
    expect(view.canManual).toBe(true);
  });

  it('手动确认之后可以发', () => {
    const view = buildReceiptView({ state: 'unknown', manualConfirmed: true });

    expect(view.canShip).toBe(true);
    expect(view.desc).toContain('手动');
  });

  it('没读到运费时标题不写金额', () => {
    const view = buildReceiptView({
      state: 'match',
      carrierName: '顺丰速运',
      trackingNumber: 'SF0204691009893',
      shippingFee: null,
    });

    expect(view.title).not.toContain('¥');
    expect(view.desc).toContain('运费');
  });

  it('没认出承运商时只报单号', () => {
    const view = buildReceiptView({
      state: 'match',
      carrierName: null,
      trackingNumber: 'SF0204691009893',
      shippingFee: 56,
    });

    expect(view.title).toContain('SF0204691009893');
    expect(view.desc).toContain('快递公司');
  });
});
