import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canContinueReview,
  historyAmount,
  historyLineStats,
  historyStatus,
  sortHistoryImports,
} from './history';

/**
 * 识别记录（只读历史）：老板 2026-11-06 要「确认后还能回去看当时 AI 认了什么」。
 * 已确认的记录后端一直留着，只是前端之前只加载草稿、不给入口。
 */
function row(overrides: Record<string, any> = {}) {
  return {
    id: 'import-1',
    status: 'CONFIRMED',
    channel: '盒马鲜生',
    createdAt: '2026-11-06T09:00:00.000Z',
    orderTime: '2026-11-06T08:30:00.000Z',
    confirmedAt: '2026-11-06T09:10:00.000Z',
    paid: 97.28,
    subtotal: 90,
    lines: [],
    ...overrides,
  };
}

function line(overrides: Record<string, any> = {}) {
  return {
    rawName: '猪里脊',
    qty: 1,
    unitPrice: 13.16,
    lineTotal: 13.16,
    ingredientId: 'ing-1',
    procurementSkuId: 'sku-1',
    isPersonal: false,
    ...overrides,
  };
}

describe('识别记录 · 排序', () => {
  it('最新的排最前，且不改动原数组', () => {
    const rows = [
      row({ id: 'a', createdAt: '2026-11-04T09:00:00.000Z' }),
      row({ id: 'b', createdAt: '2026-11-06T09:00:00.000Z' }),
      row({ id: 'c', createdAt: '2026-11-05T09:00:00.000Z' }),
    ];

   expect(sortHistoryImports(rows).map((item: any) => item.id)).toEqual(['b', 'c', 'a']);
    expect(rows.map((item: any) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('没有创建时间就退回下单时间；两个都没有的排最后', () => {
    const rows = [
      row({ id: 'none', createdAt: null, orderTime: null }),
      row({ id: 'order-time', createdAt: null, orderTime: '2026-11-05T08:00:00.000Z' }),
      row({ id: 'created', createdAt: '2026-11-06T08:00:00.000Z' }),
    ];

    expect(sortHistoryImports(rows).map((item: any) => item.id)).toEqual([
      'created',
      'order-time',
      'none',
    ]);
  });
});

describe('识别记录 · 状态', () => {
  it('已确认：已生成采购记录', () => {
    expect(historyStatus(row({ status: 'CONFIRMED' })).text).toBe('已生成采购记录');
  });

  it('草稿：待核对（还能回去改）', () => {
    expect(historyStatus(row({ status: 'DRAFT' })).text).toBe('待核对');
  });
});

describe('识别记录 · 行统计', () => {
  it('区分已匹配、待处理和个人采购', () => {
    const stats = historyLineStats(
      row({
        lines: [
          line(),
          line({ ingredientId: null, procurementSkuId: null }),
          line({ procurementSkuId: null }),
          line({ isPersonal: true, ingredientId: null, procurementSkuId: null }),
        ],
      }),
    );

    expect(stats).toEqual({ total: 4, matched: 1, pending: 2, personal: 1 });
  });

  it('没有行时全是 0', () => {
    expect(historyLineStats(row({ lines: [] }))).toEqual({
      total: 0,
      matched: 0,
      pending: 0,
      personal: 0,
    });
  });
});

describe('识别记录 · 金额', () => {
  it('优先用实付', () => {    expect(historyAmount(row({ paid: 97.28, subtotal: 90, lines: [line()] }))).toBe(97.28);
  });

  it('没有实付就用商品小计', () => {
    expect(historyAmount(row({ paid: null, subtotal: 90, lines: [line()] }))).toBe(90);
  });

  it('两个都没读到就按行累加（忽略缺金额的行）', () => {
    expect(
      historyAmount(
        row({
          paid: null,
          subtotal: null,
          lines: [line({ lineTotal: 12.5 }), line({ lineTotal: null }), line({ lineTotal: 3 })],
        }),
      ),
    ).toBe(15.5);
  });

  it('一分钱都没读到就不编 0，返回 null', () => {
    expect(historyAmount(row({ paid: null, subtotal: null, lines: [] }))).toBeNull();
  });
});

describe('识别记录 · 还能不能回核对', () => {
  it('只有进行中的清单能回核对页改草稿', () => {
    expect(canContinueReview('PENDING')).toBe(true);
    expect(canContinueReview('COMPLETED')).toBe(false);
    expect(canContinueReview('')).toBe(false);
    expect(canContinueReview(null)).toBe(false);
    expect(canContinueReview(undefined)).toBe(false);
  });
});

describe('识别记录 · 接线（回归：确认后还能回看）', () => {
  const read = (path: string): string =>
    readFileSync(resolve(process.cwd(), path), 'utf-8');

  it('日采清单详情有「查看识别记录」入口，且已确认的也计数', () => {
    const source = read('src/pages/staff-purchasing/detail.vue');
    expect(source).toContain('查看识别记录');
    expect(source).toContain('goImportHistory');
    expect(source).toContain('orderImportTotal');
  });

  it('只读页注册进采购分包，并且加载全部非放弃的识别记录', () => {
    const pages = read('src/pages.json');
    expect(pages).toContain('order-import/history');

    const source = read('src/pages/staff-purchasing/order-import/history.vue');
    expect(source).toContain('getOrderImports');
    expect(source).not.toContain('confirmOrderImports');
  });
});
