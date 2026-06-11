import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ordersApiSource = readFileSync(resolve(__dirname, '../api/orders.ts'), 'utf8');
const orderDetailSource = readFileSync(resolve(__dirname, 'order-detail/index.vue'), 'utf8');
const staffOrdersSource = readFileSync(resolve(__dirname, 'staff-orders/index.vue'), 'utf8');
const staffOrderDetailSource = readFileSync(resolve(__dirname, 'staff-orders/detail.vue'), 'utf8');
const pagesConfigSource = readFileSync(resolve(__dirname, '../pages.json'), 'utf8');

describe('customer shipping notification subscription flow', () => {
  it('exposes miniapp API helpers for preference, subscription choice, and notice page data', () => {
    expect(ordersApiSource).toContain('getShippingNotificationPreference');
    expect(ordersApiSource).toContain('recordShippingNotificationSubscription');
    expect(ordersApiSource).toContain('getCustomerShippingNotice');
    expect(ordersApiSource).toContain('/orders/${orderId}/shipping-notification/preference');
    expect(ordersApiSource).toContain('/orders/${orderId}/shipping-notification/subscription');
    expect(ordersApiSource).toContain('/orders/${orderId}/shipping-notice');
  });

  it('prompts once after payment and provides a persistent order-detail opt-in entry before shipment', () => {
    expect(orderDetailSource).toContain('maybePromptShippingNotificationAfterPayment');
    expect(orderDetailSource).toContain('requestSubscriptionMessage');
    expect(orderDetailSource).toContain('shippingNotificationPreference');
    expect(orderDetailSource).toContain('开启发货提醒');
    expect(orderDetailSource).toContain('订阅发货通知');
    expect(orderDetailSource).toContain('shipping_notice_prompted_${orderId.value}');
  });

  it('registers the customer shipping notice page route', () => {
    expect(pagesConfigSource).toContain('pages/order-shipping-notice/index');
    expect(pagesConfigSource).toContain('物流与食用提醒');
  });

  it('shows a staff fallback share action after shipment', () => {
    expect(staffOrdersSource).toContain('showShippingShareFallback');
    expect(staffOrdersSource).toContain('转发给用户');
    expect(staffOrdersSource).toContain('data-share-type="shipping-notice"');
    expect(staffOrderDetailSource).toContain('showShippingShareFallback');
    expect(staffOrderDetailSource).toContain('转发给用户');
    expect(staffOrderDetailSource).toContain('data-share-type="shipping-notice"');
  });
});
