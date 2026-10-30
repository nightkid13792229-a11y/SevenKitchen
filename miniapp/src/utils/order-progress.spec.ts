import {
  formatEtaText,
  resolveOrderProgress,
} from './order-progress';

describe('resolveOrderProgress', () => {
  it('puts paid food orders on the "making" step', () => {
    for (const status of ['PAID', 'PURCHASING', 'IN_PRODUCTION', 'FREEZING']) {
      const progress = resolveOrderProgress({ kind: 'food', status });

      expect(progress.showProgress).toBe(true);
      expect(progress.currentIndex).toBe(1);
      expect(progress.doneCount).toBe(1);
      expect(progress.steps.map((step) => step.label)).toEqual([
        '已付款',
        '制作中',
        '已发货',
        '已签收',
      ]);
    }
  });

  it('keeps unpaid orders on the first step without marking it done', () => {
    const progress = resolveOrderProgress({
      kind: 'food',
      status: 'PENDING_PAYMENT',
    });

    expect(progress.currentIndex).toBe(0);
    expect(progress.doneCount).toBe(0);
  });

  it('advances shipped and completed food orders', () => {
    expect(
      resolveOrderProgress({ kind: 'food', status: 'SHIPPED' }),
    ).toMatchObject({ currentIndex: 2, doneCount: 2 });

    expect(
      resolveOrderProgress({ kind: 'food', status: 'COMPLETED' }),
    ).toMatchObject({ currentIndex: 3, doneCount: 4 });
  });

  it('hides the progress line for cancelled and aftersale orders', () => {
    expect(
      resolveOrderProgress({ kind: 'food', status: 'CANCELLED' }).showProgress,
    ).toBe(false);
    expect(
      resolveOrderProgress({ kind: 'food', status: 'AFTERSALE' }).showProgress,
    ).toBe(false);
  });

  it('maps supplement statuses onto the same four steps', () => {
    for (const status of ['PAID', 'PACKING', 'PACKED']) {
      expect(
        resolveOrderProgress({ kind: 'supplement', status }),
      ).toMatchObject({ currentIndex: 1, doneCount: 1 });
    }
    expect(
      resolveOrderProgress({ kind: 'supplement', status: 'PACKED' }).steps[1]
        .label,
    ).toBe('分装中');
    expect(
      resolveOrderProgress({ kind: 'supplement', status: 'SHIPPED' }),
    ).toMatchObject({ currentIndex: 2, doneCount: 2 });
  });

  it('maps custom recipe statuses onto the same four steps', () => {
    expect(
      resolveOrderProgress({ kind: 'custom', status: 'IN_PROGRESS' }),
    ).toMatchObject({ currentIndex: 1, doneCount: 1 });
    expect(
      resolveOrderProgress({ kind: 'custom', status: 'IN_PROGRESS' }).steps[1]
        .label,
    ).toBe('定制中');
    expect(
      resolveOrderProgress({ kind: 'custom', status: 'DELIVERED' }),
    ).toMatchObject({ currentIndex: 2, doneCount: 2 });
    expect(
      resolveOrderProgress({ kind: 'custom', status: 'DELIVERED' }).steps[2]
        .label,
    ).toBe('已交付');
  });

  it('never throws on an unknown or empty status', () => {
    for (const status of ['', 'SOMETHING_NEW']) {
      const progress = resolveOrderProgress({ kind: 'food', status });
      expect(progress.showProgress).toBe(false);
      expect(progress.steps).toHaveLength(4);
    }
  });
});

describe('formatEtaText', () => {
  it('shows the estimated shipping date in Shanghai time', () => {
    expect(
      formatEtaText({
        kind: 'food',
        status: 'IN_PRODUCTION',
        estimatedShippingDate: '2026-11-01T16:00:00.000Z',
      }),
    ).toBe('预计 11月2日 发出');
  });

  it('asks the customer to pay before production starts', () => {
    expect(formatEtaText({ kind: 'food', status: 'PENDING_PAYMENT' })).toBe(
      '付款后开始制作',
    );
  });

  it('says waiting for scheduling instead of showing an empty date', () => {
    expect(
      formatEtaText({
        kind: 'food',
        status: 'PAID',
        estimatedShippingDate: null,
      }),
    ).toBe('等待排期');
  });

  it('falls back when the date cannot be parsed', () => {
    expect(
      formatEtaText({
        kind: 'food',
        status: 'PAID',
        estimatedShippingDate: 'not-a-date',
      }),
    ).toBe('等待排期');
  });

  it('uses the supplement wording for supplement orders', () => {
    expect(
      formatEtaText({ kind: 'supplement', status: 'PACKED' }),
    ).toBe('等待安排发货');
  });

  it('uses the delivery wording for custom orders', () => {
    expect(
      formatEtaText({
        kind: 'custom',
        status: 'IN_PROGRESS',
        scheduledDate: '2026-11-05T00:00:00.000Z',
      }),
    ).toBe('预计 11月5日 交付');
  });

  it('returns nothing for finished orders so the line does not reserve space', () => {
    expect(formatEtaText({ kind: 'food', status: 'COMPLETED' })).toBe('');
  });
});
