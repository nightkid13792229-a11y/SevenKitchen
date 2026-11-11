import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'index.vue'), 'utf8');
const pagesJson = readFileSync(resolve(__dirname, '../../../pages.json'), 'utf8');

describe('补货页', () => {
  it('has in-transit entry and record action', () => {
    expect(source).toContain('待收货');
    expect(source).toContain('记一笔补货');
    expect(source).toContain('createReplenishmentDraft');
    expect(source).toContain('importOrderScreenshots');
    expect(source).toContain('count: 5');
    expect(source).toContain('ids=');
    expect(source).toContain('startManualRecord');
    expect(source).toContain('createManualReplenishmentImport');
    expect(source).not.toContain('开始采购');
  });

  it('shows arrival and claim as two independent badges', () => {
    expect(source).toContain('arrivalText');
    expect(source).toContain('claimText');
    expect(source).toContain('已到货');
    expect(source).toContain('未报销');
  });

  it('registers the route in pages.json', () => {
    expect(pagesJson).toContain('"path": "replenishment/index"');
    expect(pagesJson).toContain('"path": "replenishment/detail"');
    expect(pagesJson).toContain('"path": "replenishment/edit"');
  });
});

describe('补货列表 UX 收口', () => {
  it('has a voided filter, an error retry, and end-of-day overdue copy', () => {
    expect(source).toContain("value: 'VOIDED'");
    expect(source).toContain('voidedOnly');
    expect(source).toContain('加载失败');
    expect(source).toContain('已超期');
    expect(source).toContain('endOfDay');
  });
});
