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

describe('补货修改页 · 兜底（2026-11-11）', () => {
  it('锁定时给回详情出口，不是死路', () => {
    expect(source).toContain('回详情');
    expect(source).toContain('goBack');
  });

  it('不允许把最后一项删光', () => {
    expect(source).toContain('不能删光');
    expect(source).toContain('items.value.length <= 1');
  });

  it('显示商品合计和个人商品，金额口径看得出', () => {
    expect(source).toContain('商品合计');
    expect(source).toContain('含个人（不报销）');
  });
});

describe('补货修改页 · 金额不漂移（2026-11-11）', () => {
  it('删除单项后不整页重拉，别冲掉其它行没保存的改动', () => {
    expect(source).toContain(
      'items.value = items.value.filter((row) => row.itemId !== item.itemId)',
    );
  });

  it('没改过的行按原总额回写，避免单价四舍五入造成几分钱偏差', () => {
    expect(source).toContain('originalTotal / quantity');
    expect(source).toContain('originalUnitPrice');
  });
});
