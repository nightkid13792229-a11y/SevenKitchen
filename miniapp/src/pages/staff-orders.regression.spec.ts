import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(__dirname, 'staff-orders/index.vue'),
  'utf8',
);

describe('staff orders quick search', () => {
  it('searches by order number or dog name through the common keyword query', () => {
    expect(source).toContain('placeholder="按订单号/狗狗名称快速搜索，支持模糊匹配"');
    expect(source).toContain('v-model="searchKeyword"');
    expect(source).toContain('params.keyword = keyword');
    expect(source).not.toContain('params.orderId =');
    expect(source).not.toContain('orderIdKeyword');
  });
});
