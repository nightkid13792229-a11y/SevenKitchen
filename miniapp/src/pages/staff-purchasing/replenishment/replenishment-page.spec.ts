import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'index.vue'), 'utf8');
const pagesJson = readFileSync(resolve(__dirname, '../../../pages.json'), 'utf8');

describe('补货页', () => {
  it('has in-transit entry and record action', () => {
    expect(source).toContain('待收货');
    expect(source).toContain('AI识别采购订单');
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
    expect(source).toContain('超期');
    expect(source).toContain('endOfDay');
  });
});

describe('补货首页信息层级（2026-11-11）', () => {
  it('不再重复导航栏的「补货」标题，也不留说明段', () => {
    expect(source).not.toContain('class="page-title"');
    expect(source).not.toContain('class="page-subtitle"');
  });

  it('传图不再弹首次确认窗', () => {
    expect(source).not.toContain('shotHintShown');
    expect(source).not.toContain("title: '1 张图 = 1 笔订单'");
  });

  it('手动填写和状态筛选同一行，并在最右边', () => {
    expect(source).toContain('class="filter-row"');
    expect(source).toContain('class="manual-btn"');
    expect(source).toContain('手动填写');
    expect(source.indexOf('class="filters"')).toBeLessThan(
      source.indexOf('class="manual-btn"'),
    );
  });

  it('缺货清单的「去库存看全部」可以直接点', () => {
    expect(source).toContain('goInventory');
    expect(source).toContain("url: '/pages/staff-inventory/index'");
  });

  it('列表直接给实付和超期天数，不再把「本次报销」当主金额', () => {
    expect(source).toContain('overdueDays');
    expect(source).toContain('预计');
    expect(source).toContain('实付');
    expect(source).not.toContain('本次报销 ¥');
  });

  it('支持下拉刷新', () => {
    expect(source).toContain('onPullDownRefresh');
    expect(pagesJson).toContain('"enablePullDownRefresh": true');
  });
});
