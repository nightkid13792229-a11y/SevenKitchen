import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(__dirname, 'staff-orders/index.vue'),
  'utf8',
);
const detailSource = readFileSync(
  resolve(__dirname, 'staff-orders/detail.vue'),
  'utf8',
);
const ordersApiSource = readFileSync(
  resolve(__dirname, '../api/orders.ts'),
  'utf8',
);

describe('staff orders quick search', () => {
  it('searches by order number, dog name, phone suffix, or status through the common keyword query', () => {
    expect(source).toContain('按订单号/狗狗名/手机号后四位/状态搜索');
    expect(source).toContain('v-model="searchKeyword"');
    expect(source).toContain('params.keyword = keyword');
    expect(source).not.toContain('params.orderId =');
    expect(source).not.toContain('orderIdKeyword');
  });
});

describe('staff order address reuse', () => {
  it('exposes staff order address API helpers', () => {
    expect(ordersApiSource).toContain('listOrderCustomerAddresses');
    expect(ordersApiSource).toContain('createOrderCustomerAddress');
    expect(ordersApiSource).toContain('bindOrderCustomerAddress');
    expect(ordersApiSource).toContain('updateOrderCustomerAddress');
    expect(ordersApiSource).toContain('/admin/orders/${orderId}/addresses');
    expect(ordersApiSource).toContain('/admin/orders/${orderId}/address');
  });

  it('shows editable address actions on staff order detail before shipment', () => {
    expect(detailSource).toContain('canEditAddress');
    expect(detailSource).toContain('选择已有地址');
    expect(detailSource).toContain('录入新地址');
    expect(detailSource).toContain('更换地址');
    expect(detailSource).toContain('编辑地址');
    expect(detailSource).toContain('已发货后不可修改');
    expect(detailSource).toContain("['SHIPPED', 'COMPLETED', 'CANCELLED']");
  });

  it('supports selecting, creating, and editing reusable customer addresses', () => {
    expect(detailSource).toContain('addressSelectVisible');
    expect(detailSource).toContain('addressFormVisible');
    expect(detailSource).toContain('loadCustomerAddresses');
    expect(detailSource).toContain('selectCustomerAddress');
    expect(detailSource).toContain('openCreateAddressForm');
    expect(detailSource).toContain('openEditAddressForm');
    expect(detailSource).toContain('saveAddressForm');
    expect(detailSource).toContain('addressForm.isDefault');
  });
});
