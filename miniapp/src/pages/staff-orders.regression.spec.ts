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

  it('groups address selector options by addresses previously used by the current dog', () => {
    expect(detailSource).toContain('该狗狗常用地址');
    expect(detailSource).toContain('客户其他地址');
    expect(detailSource).toContain('dogMatchedAddresses');
    expect(detailSource).toContain('otherCustomerAddresses');
    expect(detailSource).toContain('usedByCurrentDog');
    expect(detailSource).toContain('dogAddressUsageCount');
  });
});

describe('staff order mobile operations', () => {
  it('lets staff copy the full order number from the staff order detail page', () => {
    expect(detailSource).toContain('copyOrderId');
    expect(detailSource).toContain('订单号已复制');
    expect(detailSource).toContain('@tap="copyOrderId"');
  });

  it('keeps shipment contact information usable on staff order detail', () => {
    expect(detailSource).toContain('formatPhoneForStaffOrder');
    expect(detailSource).toContain('copyFullAddress');
    expect(detailSource).toContain('复制地址');
    expect(detailSource).not.toContain("return phone.replace(/(\\d{3})\\d{4}(\\d{4})/, '$1****$2')");
  });

  it('supports shipping directly from staff order detail', () => {
    expect(detailSource).toContain('showShippingModal');
    expect(detailSource).toContain('confirmShipping');
    expect(detailSource).toContain('/admin/orders/${orderId}/ship');
    expect(detailSource).not.toContain('请在电脑端操作发货');
  });

  it('syncs WeChat shipping info after mobile staff shipment', () => {
    expect(source).toContain('/staff/shipping/orders/${orderId}/wechat-shipping-upload');
    expect(detailSource).toContain('/staff/shipping/orders/${orderId}/wechat-shipping-upload');
    expect(source).toContain('微信发货同步失败');
    expect(detailSource).toContain('微信发货同步失败');
  });

  it('shows production usage, package plan, and ingredient totals on staff order detail', () => {
    expect(detailSource).toContain('制作用量');
    expect(detailSource).toContain('原料汇总');
    expect(detailSource).toContain('ingredientUsageRows');
    expect(detailSource).toContain('formatPackagePlan');
    expect(detailSource).toContain('openPackagePanel');
    expect(detailSource).toContain('savePackagePlan');
    expect(detailSource).toContain('修改订单规格');
    expect(detailSource).toContain('suggestedRefundAmount');
    expect(detailSource).toContain('absorbedIncreaseAmount');
    expect(detailSource).toContain('amountUpdated');
    expect(detailSource).toContain('规格和价格已更新');
    expect(detailSource).toContain("['INIT', 'PENDING_PAYMENT', 'PAID'].includes(order.value.status)");
    expect(detailSource).not.toContain('分装合计需等于订单净重');
    expect(detailSource).toContain('pricingBreakdownSnapshot');
    expect(detailSource).toContain('FOOD');
    expect(detailSource).toContain('SUPPLEMENT');
    expect(ordersApiSource).toContain('updateOrderItemPackagePlan');
  });

  it('shows and shares preparation photos from staff order detail', () => {
    expect(detailSource).toContain('备餐图');
    expect(detailSource).toContain('productionPhotos');
    expect(detailSource).toContain('previewProductionPhoto');
    expect(detailSource).toContain('ensureProductionPhotoShareToken');
    expect(detailSource).toContain('data-share-type="photos"');
    expect(detailSource).toContain('/orders/${order.value.id}/share-photos');
    expect(detailSource).toContain('/pages/shared-photos/index?token=${shareToken.value}');
  });

  it('lets staff edit admin remarks that flow into production print tasks', () => {
    expect(detailSource).toContain('管理员备注');
    expect(detailSource).toContain('remarkDraft');
    expect(detailSource).toContain('saveAdminRemark');
    expect(detailSource).toContain('clearAdminRemark');
    expect(detailSource).toContain('会同步到生产制作单和打印版');
    expect(ordersApiSource).toContain('updateAdminOrderRemark');
    expect(detailSource).toContain('updateAdminOrderRemark');
  });

  it('exposes mobile staff actions for price, refund, and dog profile handling', () => {
    expect(detailSource).toContain('openAmountPanel');
    expect(detailSource).toContain('saveAmountAdjustment');
    expect(detailSource).toContain('isOfflinePaidOrder');
    expect(detailSource).toContain('修改价格');
    expect(detailSource).toContain('openRefundPanel');
    expect(detailSource).toContain('refundAmountDraft');
    expect(detailSource).toContain('saveRefundAdjustment');
    expect(detailSource).toContain('openDogSwitcher');
    expect(detailSource).toContain('switchOrderDog');
    expect(detailSource).toContain('adminRefundOrder');
    expect(ordersApiSource).toContain('updateStaffCustomerServiceAmount');
    expect(ordersApiSource).toContain('listOrderCustomerDogs');
    expect(ordersApiSource).toContain('switchOrderDog');
  });
});

/**
 * 2026-10-30：页面改名 + 订单号对齐新格式。
 *
 * 老板看到的两个问题：
 *   ① 三类订单的详情页标题都叫「订单详情」，分不清是哪一类；
 *   ② 页面里的"订单号"是 uuid（顶部又截了后 8 位），和新的 SK20261030-003 对不上。
 */
describe('staff order detail · 鲜食订单详情', () => {
  const pagesJson = readFileSync(resolve(__dirname, '../pages.json'), 'utf8');

  it('标题改成「鲜食订单详情」，和定制/补剂两个详情页区分开', () => {
    expect(pagesJson).toContain('"navigationBarTitleText": "鲜食订单详情"');
    expect(pagesJson).toContain('"navigationBarTitleText": "补剂订单详情"');
    expect(pagesJson).toContain('"navigationBarTitleText": "定制订单详情"');
  });

  it('订单号显示 orderNo（新格式），老数据才退回 id', () => {
    expect(detailSource).toContain("order.value?.orderNo || order.value?.id");
    expect(detailSource).toContain('{{ displayOrderNo }}');
    // 顶部和「订单信息」必须是同一个号，不能再一个 uuid 一个截断
    // 顶部那行以前写的是「订单 #xxxx」（uuid 后 8 位），现在不能再用这种写法
    expect(detailSource).not.toContain('订单 #{{ orderId.slice(-8) }}');
    expect(detailSource).not.toContain('{{ order.id }}');
  });

  it('复制按钮复制的是页面上显示的那个号', () => {
    expect(detailSource).toContain('const value = displayOrderNo.value');
  });
});
