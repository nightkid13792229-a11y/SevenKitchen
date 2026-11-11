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
    expect(source).toContain('记录人');
    expect(source).toContain('canOperate');
    expect(source).toContain('个人商品（不报销）');
    expect(source).toContain('未报销');
  });
});

describe('补货详情 · 信息合并（2026-11-11）', () => {
  it('商品明细和采购记录合成一张表，不再列两遍', () => {
    expect(source).toContain('displayItems');
    expect(source).toContain('入库 ');
    expect(source).not.toContain('section-title">采购记录');
  });

  it('作废从底部主操作栏移到页面内，避免误触', () => {
    expect(source).toContain('作废这笔记录');
    expect(source).not.toContain('class="action-btn danger"');
  });

  it('作废记录不显示金额', () => {
    expect(source).toContain('amount-value muted');
  });
});
