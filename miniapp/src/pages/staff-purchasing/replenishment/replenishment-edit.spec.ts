import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'edit.vue'), 'utf8');

describe('补货记录修改页', () => {
  it('saves item quantity and price through the replenishment endpoint', () => {
    expect(source).toContain('updateReplenishmentRecord');
    expect(source).toContain('保存修改');
    expect(source).toContain('quantity');
    expect(source).toContain('unitPrice');
  });

  it('locks editing after arrival or reimbursement', () => {
    expect(source).toContain('lockedReason');
    expect(source).toContain('撤销到货');
    expect(source).toContain('已提交报销');
    expect(source).toContain('deleteReplenishmentItem');
    expect(source).toContain('删掉这一项');
  });
});
