import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'detail.vue'), 'utf8');

describe('补货记录详情', () => {
  it('keeps arrival available after reimbursement', () => {
    expect(source).toContain('canArrive');
    expect(source).toContain('!record.value.arrivedAt');
    expect(source).toContain('已到货');
    expect(source).toContain('去报销');
  });

  it('offers edit only before arrival and before reimbursement', () => {
    expect(source).toContain('canEdit');
    expect(source).toContain('修改');
    expect(source).toContain('撤销到货');
    expect(source).toContain('revokeReplenishmentArrival');
  });

  it('shows arrival and claim as two independent facts', () => {
    expect(source).toContain('arrivalText');
    expect(source).toContain('claimText');
    expect(source).toContain('报销中');
    expect(source).toContain('未报销');
  });
});
