import { computeEstimatedShippingDate } from '../../../src/domain/order/estimated-shipping';

describe('estimated-shipping', () => {
  it('returns the production date plus one day as an ISO string', () => {
    const result = computeEstimatedShippingDate(
      new Date('2026-11-01T00:00:00.000Z'),
    );

    expect(result).toBe('2026-11-02T00:00:00.000Z');
  });

  it('keeps the time of day when shifting by one day', () => {
    const result = computeEstimatedShippingDate(
      new Date('2026-11-01T10:30:00.000Z'),
    );

    expect(result).toBe('2026-11-02T10:30:00.000Z');
  });

  it('returns null for an unparsable date instead of throwing', () => {
    expect(
      computeEstimatedShippingDate(new Date('not-a-date') as unknown as Date),
    ).toBeNull();
  });

  it('returns null when the order has no production date', () => {
    expect(computeEstimatedShippingDate(null)).toBeNull();
    expect(computeEstimatedShippingDate(undefined)).toBeNull();
  });
});
