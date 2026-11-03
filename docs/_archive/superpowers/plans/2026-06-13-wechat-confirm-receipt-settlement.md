# WeChat Confirm Receipt Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make customer "confirm receipt" shorten the WeChat Pay settlement cycle by confirming the WeChat platform order before completing the internal order.

**Execution Status (2026-06-13):** Tasks 1-7 have been implemented and verified in local backend/miniapp tests and builds. The read-side WeChat payment checks are compatible with both current `WECHAT_PAY` and legacy `WECHAT` values. Task 8 remains a real WeChat Pay merchant-side verification checklist because it requires a low-value live order, WeChat Mini Program DevTools/device flow, and merchant settlement visibility.

**Architecture:** The miniapp uses WeChat's `wx.openBusinessView` confirm-receipt component for WeChat Pay orders, then calls the existing internal complete endpoint only after WeChat returns success. The backend adds read-only WeChat shipping-order status queries so staff can verify whether a payment order is still shipped, confirmed received, or completed on WeChat. The internal order state machine remains unchanged; scheduler auto-completion is adjusted to avoid hiding the confirm-receipt entry before WeChat confirms receipt.

**Tech Stack:** UniApp/Vue miniapp, NestJS backend, Jest backend tests, Vitest miniapp source regression tests, WeChat miniapp order-shipping APIs.

---

## File Structure

- Modify `miniapp/src/pages/orders-list/index.vue`: pass the full order into confirm receipt and use the WeChat component for WeChat Pay orders.
- Modify `miniapp/src/pages/order-detail/index.vue`: use the same WeChat-first confirm flow on the detail page.
- Create `miniapp/src/utils/wechat-confirm-receipt.ts`: central helper around `wx.openBusinessView({ businessType: 'weappOrderConfirm' })`.
- Modify `miniapp/src/pages/orders-list.regression.spec.ts`: assert the list page uses the helper and keeps internal completion behind WeChat success.
- Modify `miniapp/src/pages/order-detail.regression.spec.ts`: assert the detail page uses the helper and keeps internal completion behind WeChat success.
- Modify `backend/src/infrastructure/wechat/wechat.service.ts`: add `getShippingOrder`, `isTradeManaged`, `isTradeManagementConfirmationCompleted`, and `notifyConfirmReceive` wrappers.
- Modify `backend/tests/infrastructure/wechat/wechat.service.spec.ts`: cover the new wrappers and mock-mode behavior.
- Modify `backend/src/application/shipping/wechat-shipping-upload.service.ts`: add a query method that maps an internal order to a WeChat shipping-order query.
- Modify `backend/src/application/shipping/shipping-fulfillment.service.ts`: expose the query method to controllers and scheduler.
- Modify `backend/src/interfaces/controllers/staff-shipping.controller.ts`: add a staff diagnostic endpoint for WeChat shipping status.
- Modify `backend/tests/interfaces/controllers/staff-shipping.controller.spec.ts`: cover the diagnostic endpoint.
- Modify `backend/src/application/scheduler/order-scheduler.service.ts`: only auto-complete WeChat Pay orders when WeChat reports received/completed; align non-WeChat fallback to 10 days.
- Modify `backend/src/app.module.ts`: inject `WechatShippingUploadService` or `ShippingFulfillmentService` into the scheduler if constructor wiring requires it.
- Modify `backend/tests/application/scheduler/order-scheduler.service.spec.ts`: cover the new WeChat-aware scheduler rules.

## Task 1: Backend WeChat Order Shipping API Wrappers

**Files:**
- Modify: `backend/src/infrastructure/wechat/wechat.service.ts`
- Test: `backend/tests/infrastructure/wechat/wechat.service.spec.ts`

- [ ] **Step 1: Write failing tests for WeChat order-shipping wrappers**

Append these tests to `backend/tests/infrastructure/wechat/wechat.service.spec.ts`:

```ts
describe('WechatService order shipping APIs', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      WECHAT_APP_ID: 'wx-real-app-id',
      WECHAT_APP_SECRET: 'real-looking-secret',
      WECHAT_FORCE_MOCK: 'false',
    };
  });

  it('queries a WeChat shipping order by transaction id', async () => {
    const service = new WechatService();
    jest.spyOn(service as any, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        errcode: 0,
        errmsg: 'ok',
        order: {
          transaction_id: '4200000000000000001',
          merchant_id: '1900000001',
          merchant_trade_no: 'order-1',
          order_state: 3,
          in_complaint: false,
        },
      },
    });

    const result = await service.getShippingOrder(
      {
        transactionId: '4200000000000000001',
        merchantId: '1900000001',
      },
      'wx-real-app-id',
    );

    expect(postSpy).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/wxa/sec/order/get_order?access_token=ACCESS_TOKEN',
      {
        transaction_id: '4200000000000000001',
        merchant_id: '1900000001',
      },
    );
    expect(result.order?.order_state).toBe(3);
  });

  it('checks whether the miniapp has trade management enabled', async () => {
    const service = new WechatService();
    jest.spyOn(service as any, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { errcode: 0, errmsg: 'ok', is_trade_managed: true },
    });

    const result = await service.isTradeManaged('wx-real-app-id');

    expect(postSpy).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/wxa/sec/order/is_trade_managed?access_token=ACCESS_TOKEN',
      { appid: 'wx-real-app-id' },
    );
    expect(result.is_trade_managed).toBe(true);
  });

  it('checks whether trade settlement confirmation is completed', async () => {
    const service = new WechatService();
    jest.spyOn(service as any, 'getAccessToken').mockResolvedValue('ACCESS_TOKEN');
    const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { errcode: 0, errmsg: 'ok', completed: true },
    });

    const result =
      await service.isTradeManagementConfirmationCompleted('wx-real-app-id');

    expect(postSpy).toHaveBeenCalledWith(
      'https://api.weixin.qq.com/wxa/sec/order/is_trade_management_confirmation_completed?access_token=ACCESS_TOKEN',
      { appid: 'wx-real-app-id' },
    );
    expect(result.completed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing backend wrapper tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/infrastructure/wechat/wechat.service.spec.ts --runInBand
```

Expected: FAIL because `getShippingOrder`, `isTradeManaged`, and `isTradeManagementConfirmationCompleted` are not implemented.

- [ ] **Step 3: Add WeChat order-shipping types and methods**

Add these exports near the existing shipping payload types in `backend/src/infrastructure/wechat/wechat.service.ts`:

```ts
export interface WechatShippingOrderQuery {
  transactionId?: string;
  merchantId?: string;
  subMerchantId?: string;
  merchantTradeNo?: string;
}

export interface WechatShippingOrder {
  transaction_id?: string;
  merchant_id?: string;
  sub_merchant_id?: string;
  merchant_trade_no?: string;
  description?: string;
  paid_amount?: number;
  openid?: string;
  trade_create_time?: number;
  pay_time?: number;
  in_complaint?: boolean;
  order_state?: 1 | 2 | 3 | 4 | 5;
  shipping?: unknown;
}

export interface WechatShippingOrderResponse {
  errcode: number;
  errmsg: string;
  order?: WechatShippingOrder;
}

export interface WechatTradeManagedResponse {
  errcode: number;
  errmsg: string;
  is_trade_managed?: boolean;
}

export interface WechatTradeManagementConfirmationResponse {
  errcode: number;
  errmsg: string;
  completed?: boolean;
  is_trade_management_confirmation_completed?: boolean;
}
```

Add these methods after `uploadShippingInfo`:

```ts
  async getShippingOrder(
    query: WechatShippingOrderQuery,
    appId?: string,
  ): Promise<WechatShippingOrderResponse> {
    if (this.isMockMode()) {
      this.logger.log('===== MOCK MODE - Querying WeChat Shipping Order =====');
      this.logger.log(JSON.stringify(query, null, 2));
      return {
        errcode: 0,
        errmsg: 'ok',
        order: {
          transaction_id: query.transactionId,
          merchant_id: query.merchantId,
          merchant_trade_no: query.merchantTradeNo,
          order_state: 3,
          in_complaint: false,
        },
      };
    }

    const accessToken = await this.getAccessToken(appId);
    const url = `https://api.weixin.qq.com/wxa/sec/order/get_order?access_token=${accessToken}`;
    const payload: Record<string, string> = {};
    if (query.transactionId) payload.transaction_id = query.transactionId;
    if (query.merchantId) payload.merchant_id = query.merchantId;
    if (query.subMerchantId) payload.sub_merchant_id = query.subMerchantId;
    if (query.merchantTradeNo) payload.merchant_trade_no = query.merchantTradeNo;

    const response = await axios.post<WechatShippingOrderResponse>(url, payload);
    const data = response.data;
    if (data.errcode !== 0) {
      throw new Error(
        `WeChat shipping order query failed: ${data.errcode} - ${data.errmsg}`,
      );
    }
    return data;
  }

  async isTradeManaged(appId?: string): Promise<WechatTradeManagedResponse> {
    if (this.isMockMode()) {
      return { errcode: 0, errmsg: 'ok', is_trade_managed: true };
    }

    const accessToken = await this.getAccessToken(appId);
    const url = `https://api.weixin.qq.com/wxa/sec/order/is_trade_managed?access_token=${accessToken}`;
    const response = await axios.post<WechatTradeManagedResponse>(url, {
      appid: appId,
    });
    const data = response.data;
    if (data.errcode !== 0) {
      throw new Error(
        `WeChat trade managed query failed: ${data.errcode} - ${data.errmsg}`,
      );
    }
    return data;
  }

  async isTradeManagementConfirmationCompleted(
    appId?: string,
  ): Promise<WechatTradeManagementConfirmationResponse> {
    if (this.isMockMode()) {
      return { errcode: 0, errmsg: 'ok', completed: true };
    }

    const accessToken = await this.getAccessToken(appId);
    const url = `https://api.weixin.qq.com/wxa/sec/order/is_trade_management_confirmation_completed?access_token=${accessToken}`;
    const response =
      await axios.post<WechatTradeManagementConfirmationResponse>(url, {
        appid: appId,
      });
    const data = response.data;
    if (data.errcode !== 0) {
      throw new Error(
        `WeChat trade settlement confirmation query failed: ${data.errcode} - ${data.errmsg}`,
      );
    }
    return data;
  }
```

- [ ] **Step 4: Run wrapper tests to verify pass**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/infrastructure/wechat/wechat.service.spec.ts --runInBand
```

Expected: PASS.

## Task 2: Backend Internal Order to WeChat Status Query

**Files:**
- Modify: `backend/src/application/shipping/wechat-shipping-upload.service.ts`
- Modify: `backend/src/application/shipping/shipping-fulfillment.service.ts`
- Test: `backend/tests/application/shipping/shipping-fulfillment.service.spec.ts`

- [ ] **Step 1: Write failing service tests for query behavior**

Add tests to `backend/tests/application/shipping/shipping-fulfillment.service.spec.ts` around the existing fulfillment service setup:

```ts
it('queries WeChat shipping status for a WeChat Pay order', async () => {
  const wechatShippingUploadService = {
    queryShippingOrderStatus: jest.fn().mockResolvedValue({
      success: true,
      skipped: false,
      message: '微信订单状态：确认收货',
      orderState: 3,
      orderStateLabel: '确认收货',
      inComplaint: false,
      response: { order: { order_state: 3 } },
    }),
  };
  const service = new ShippingFulfillmentService(
    orderRepository as any,
    statusHistoryRepository as any,
    wechatShippingUploadService as any,
  );

  const result = await service.queryWechatShippingOrderStatus('order-1');

  expect(wechatShippingUploadService.queryShippingOrderStatus).toHaveBeenCalledWith(
    'order-1',
  );
  expect(result.orderState).toBe(3);
  expect(result.orderStateLabel).toBe('确认收货');
});
```

- [ ] **Step 2: Run the failing fulfillment test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/shipping/shipping-fulfillment.service.spec.ts --runInBand
```

Expected: FAIL because `queryWechatShippingOrderStatus` is not implemented.

- [ ] **Step 3: Add result type and query method to upload service**

In `backend/src/application/shipping/wechat-shipping-upload.service.ts`, add:

```ts
export interface WechatShippingOrderStatusResult {
  success: boolean;
  skipped?: boolean;
  message: string;
  orderState?: 1 | 2 | 3 | 4 | 5;
  orderStateLabel?: string;
  inComplaint?: boolean;
  response?: unknown;
}

const WECHAT_ORDER_STATE_LABELS: Record<number, string> = {
  1: '待发货',
  2: '已发货',
  3: '确认收货',
  4: '交易完成',
  5: '已退款',
};
```

Add this method inside `WechatShippingUploadService`:

```ts
  async queryShippingOrderStatus(
    orderId: string,
  ): Promise<WechatShippingOrderStatusResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paymentMethod: true,
        paymentStatus: true,
        transactionId: true,
      },
    });

    if (!order) {
      return {
        success: false,
        skipped: true,
        message: `订单不存在：${orderId}`,
      };
    }

    if (order.paymentMethod !== 'WECHAT_PAY') {
      return {
        success: true,
        skipped: true,
        message: '非微信支付订单，无需查询微信发货状态',
      };
    }

    if (order.paymentStatus !== 'SUCCESS') {
      return {
        success: true,
        skipped: true,
        message: '订单未完成微信支付，无需查询微信发货状态',
      };
    }

    const paymentConfig = await this.prisma.paymentConfig.upsert({
      where: { id: 'singleton' },
      create: {},
      update: {},
      select: {
        appId: true,
        mchId: true,
      },
    });

    if (!paymentConfig.mchId) {
      return {
        success: false,
        skipped: true,
        message: '后台支付配置缺少微信支付商户号，无法查询微信发货状态',
      };
    }

    if (!order.transactionId) {
      return {
        success: false,
        skipped: true,
        message: '订单缺少微信支付交易单号，无法查询微信发货状态',
      };
    }

    const response = await this.wechatService.getShippingOrder(
      {
        transactionId: order.transactionId,
        merchantId: paymentConfig.mchId,
      },
      paymentConfig.appId || undefined,
    );
    const orderState = response.order?.order_state;
    const orderStateLabel =
      orderState !== undefined
        ? WECHAT_ORDER_STATE_LABELS[orderState] ?? `未知状态 ${orderState}`
        : '未知状态';

    return {
      success: true,
      skipped: false,
      message: `微信订单状态：${orderStateLabel}`,
      orderState,
      orderStateLabel,
      inComplaint: response.order?.in_complaint,
      response,
    };
  }
```

- [ ] **Step 4: Add fulfillment proxy method**

In `backend/src/application/shipping/shipping-fulfillment.service.ts`, add:

```ts
  async queryWechatShippingOrderStatus(orderId: string) {
    return this.wechatShippingUploadService.queryShippingOrderStatus(orderId);
  }
```

- [ ] **Step 5: Run fulfillment tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/shipping/shipping-fulfillment.service.spec.ts --runInBand
```

Expected: PASS.

## Task 3: Staff Diagnostic Endpoint

**Files:**
- Modify: `backend/src/interfaces/controllers/staff-shipping.controller.ts`
- Test: `backend/tests/interfaces/controllers/staff-shipping.controller.spec.ts`

- [ ] **Step 1: Write failing controller test**

Add this test to `backend/tests/interfaces/controllers/staff-shipping.controller.spec.ts`:

```ts
describe('GET /staff/shipping/orders/:orderId/wechat-shipping-status', () => {
  it('returns WeChat shipping status for staff diagnostics', async () => {
    shippingFulfillmentService.queryWechatShippingOrderStatus = jest
      .fn()
      .mockResolvedValue({
        success: true,
        skipped: false,
        message: '微信订单状态：确认收货',
        orderState: 3,
        orderStateLabel: '确认收货',
        inComplaint: false,
      });

    const result = await controller.getWechatShippingOrderStatus('order-1');

    expect(result.code).toBe(0);
    expect(result.data).toEqual({
      success: true,
      skipped: false,
      message: '微信订单状态：确认收货',
      orderState: 3,
      orderStateLabel: '确认收货',
      inComplaint: false,
    });
    expect(
      shippingFulfillmentService.queryWechatShippingOrderStatus,
    ).toHaveBeenCalledWith('order-1');
  });
});
```

- [ ] **Step 2: Run the failing controller test**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/interfaces/controllers/staff-shipping.controller.spec.ts --runInBand
```

Expected: FAIL because the controller method does not exist.

- [ ] **Step 3: Add controller endpoint**

Add this method to `backend/src/interfaces/controllers/staff-shipping.controller.ts` after the retry upload endpoint:

```ts
  @Get('orders/:orderId/wechat-shipping-status')
  @ApiOperation({ summary: 'Query WeChat shipping order status for diagnostics' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  async getWechatShippingOrderStatus(
    @Param('orderId') orderId: string,
  ): Promise<
    ApiResponseDto<{
      success: boolean;
      skipped?: boolean;
      message: string;
      orderState?: 1 | 2 | 3 | 4 | 5;
      orderStateLabel?: string;
      inComplaint?: boolean;
      response?: unknown;
    }>
  > {
    const result =
      await this.shippingFulfillmentService.queryWechatShippingOrderStatus(
        orderId,
      );
    return ApiResponseDto.success(result);
  }
```

- [ ] **Step 4: Run controller tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/interfaces/controllers/staff-shipping.controller.spec.ts --runInBand
```

Expected: PASS.

## Task 4: WeChat-Aware Auto Completion

**Files:**
- Modify: `backend/src/application/scheduler/order-scheduler.service.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/tests/application/scheduler/order-scheduler.service.spec.ts`

- [ ] **Step 1: Write failing scheduler tests**

Replace the existing auto-complete spec in `backend/tests/application/scheduler/order-scheduler.service.spec.ts` with tests that cover WeChat-aware completion:

```ts
it('auto-completes WeChat orders only after WeChat reports received', async () => {
  const orderRepository = {
    findByStatus: jest.fn().mockResolvedValue([
      { id: 'order-1', paymentMethod: 'WECHAT_PAY' },
    ]),
  };
  const statusHistoryRepository = {
    findByOrderId: jest.fn().mockResolvedValue([
      {
        toStatus: OrderStatus.SHIPPED,
        timestamp: new Date('2026-05-26T12:00:00.000Z'),
      },
    ]),
  };
  const orderService = {
    completeOrder: jest.fn().mockResolvedValue(undefined),
  };
  const platformConfigService = {
    getPaymentConfig: jest.fn(),
  };
  const shippingFulfillmentService = {
    queryWechatShippingOrderStatus: jest.fn().mockResolvedValue({
      success: true,
      skipped: false,
      orderState: 3,
      orderStateLabel: '确认收货',
    }),
  };

  const service = new OrderSchedulerService(
    orderRepository as any,
    statusHistoryRepository as any,
    orderService as any,
    platformConfigService as any,
    shippingFulfillmentService as any,
  );

  await service.handleAutoCompleteOrders();

  expect(orderService.completeOrder).toHaveBeenCalledWith(
    'order-1',
    'system',
    null,
    {
      autoCompleted: true,
      daysSinceShipped: 10,
      wechatOrderState: 3,
      wechatOrderStateLabel: '确认收货',
    },
  );
});

it('keeps WeChat orders shipped while WeChat still reports shipped', async () => {
  const orderRepository = {
    findByStatus: jest.fn().mockResolvedValue([
      { id: 'order-1', paymentMethod: 'WECHAT_PAY' },
    ]),
  };
  const statusHistoryRepository = {
    findByOrderId: jest.fn().mockResolvedValue([
      {
        toStatus: OrderStatus.SHIPPED,
        timestamp: new Date('2026-05-26T12:00:00.000Z'),
      },
    ]),
  };
  const orderService = { completeOrder: jest.fn() };
  const platformConfigService = { getPaymentConfig: jest.fn() };
  const shippingFulfillmentService = {
    queryWechatShippingOrderStatus: jest.fn().mockResolvedValue({
      success: true,
      skipped: false,
      orderState: 2,
      orderStateLabel: '已发货',
    }),
  };

  const service = new OrderSchedulerService(
    orderRepository as any,
    statusHistoryRepository as any,
    orderService as any,
    platformConfigService as any,
    shippingFulfillmentService as any,
  );

  await service.handleAutoCompleteOrders();

  expect(orderService.completeOrder).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run failing scheduler tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/scheduler/order-scheduler.service.spec.ts --runInBand
```

Expected: FAIL because the scheduler constructor and behavior are not updated.

- [ ] **Step 3: Update scheduler constructor and logic**

In `backend/src/application/scheduler/order-scheduler.service.ts`, import `ShippingFulfillmentService`:

```ts
import { ShippingFulfillmentService } from '../shipping/shipping-fulfillment.service';
```

Add constructor dependency:

```ts
    private readonly orderService: OrderService,
    private readonly platformConfigService: PlatformConfigService,
    private readonly shippingFulfillmentService: ShippingFulfillmentService,
```

Replace the hard-coded `daysSinceShipped >= 7` block with:

```ts
        const AUTO_COMPLETE_DAYS = 10;
        if (daysSinceShipped < AUTO_COMPLETE_DAYS) {
          continue;
        }

        if (order.paymentMethod === 'WECHAT_PAY') {
          const wechatStatus =
            await this.shippingFulfillmentService.queryWechatShippingOrderStatus(
              order.id,
            );
          if (![3, 4].includes(wechatStatus.orderState ?? 0)) {
            this.logger.log(
              `[OrderScheduler] Skipping WeChat order ${order.id}; WeChat state is ${wechatStatus.orderStateLabel ?? wechatStatus.message}`,
            );
            continue;
          }

          await this.orderService.completeOrder(order.id, 'system', null, {
            autoCompleted: true,
            daysSinceShipped,
            wechatOrderState: wechatStatus.orderState,
            wechatOrderStateLabel: wechatStatus.orderStateLabel,
          });
          completedCount++;
          continue;
        }

        this.logger.log(
          `[OrderScheduler] Auto-completing non-WeChat order ${order.id} (shipped ${daysSinceShipped} days ago)`,
        );

        await this.orderService.completeOrder(order.id, 'system', null, {
          autoCompleted: true,
          daysSinceShipped,
        });

        completedCount++;
```

Keep `AUTO_COMPLETE_DAYS` as a class constant if local lint prefers it:

```ts
private static readonly AUTO_COMPLETE_DAYS = 10;
```

- [ ] **Step 4: Ensure app module injection still compiles**

If Nest cannot resolve the new constructor argument, confirm `ShippingFulfillmentService` is already listed in `backend/src/app.module.ts` providers. If it is not listed, add it to the providers array next to the existing shipping services:

```ts
    ShippingFulfillmentService,
```

- [ ] **Step 5: Run scheduler tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/application/scheduler/order-scheduler.service.spec.ts --runInBand
```

Expected: PASS.

## Task 5: Miniapp WeChat Confirm Receipt Helper

**Files:**
- Create: `miniapp/src/utils/wechat-confirm-receipt.ts`
- Modify: `miniapp/src/pages/orders-list.regression.spec.ts`
- Modify: `miniapp/src/pages/order-detail.regression.spec.ts`

- [ ] **Step 1: Write failing regression assertions**

Add to `miniapp/src/pages/orders-list.regression.spec.ts`:

```ts
it('routes WeChat Pay receipt confirmation through the WeChat platform component', () => {
  expect(source).toContain('confirmWechatReceiptBeforeInternalComplete');
  expect(source).toContain('confirmReceivedFromList(order)');
  expect(source).toContain('await confirmWechatReceiptBeforeInternalComplete(order)');
});
```

Add to `miniapp/src/pages/order-detail.regression.spec.ts`:

```ts
it('routes WeChat Pay receipt confirmation through the WeChat platform component', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/pages/order-detail/index.vue'),
    'utf-8',
  );

  expect(source).toContain('confirmWechatReceiptBeforeInternalComplete');
  expect(source).toContain('await confirmWechatReceiptBeforeInternalComplete(order.value)');
  expect(source).toContain("businessType: 'weappOrderConfirm'");
});
```

- [ ] **Step 2: Run failing miniapp regression tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
npm test -- src/pages/orders-list.regression.spec.ts src/pages/order-detail.regression.spec.ts
```

Expected: FAIL because the helper and calls are not implemented.

- [ ] **Step 3: Create WeChat confirm receipt helper**

Create `miniapp/src/utils/wechat-confirm-receipt.ts`:

```ts
export interface WechatConfirmReceiptOrder {
  id: string;
  paymentMethod?: string | null;
  transactionId?: string | null;
}

export interface WechatConfirmReceiptResult {
  skipped: boolean;
  status: 'success';
}

declare const wx: any;

function isWechatPayOrder(order: WechatConfirmReceiptOrder): boolean {
  return order.paymentMethod === 'WECHAT_PAY';
}

export async function confirmWechatReceiptBeforeInternalComplete(
  order: WechatConfirmReceiptOrder | null | undefined,
): Promise<WechatConfirmReceiptResult> {
  if (!order || !isWechatPayOrder(order)) {
    return { skipped: true, status: 'success' };
  }

  if (!order.transactionId) {
    throw new Error('订单缺少微信支付单号，无法确认微信收货');
  }

  // #ifdef MP-WEIXIN
  const wechatApi = typeof wx !== 'undefined' ? wx : null;
  if (!wechatApi?.openBusinessView) {
    throw new Error('当前微信版本不支持确认收货，请升级微信后重试');
  }

  return new Promise((resolve, reject) => {
    wechatApi.openBusinessView({
      businessType: 'weappOrderConfirm',
      extraData: {
        transaction_id: order.transactionId,
      },
      success: (response: any) => {
        const status = response?.extraData?.status;
        if (status === 'success') {
          resolve({ skipped: false, status: 'success' });
          return;
        }
        if (status === 'cancel') {
          reject(new Error('已取消确认收货'));
          return;
        }
        reject(new Error('微信确认收货失败'));
      },
      fail: (error: any) => {
        reject(
          new Error(error?.errMsg || error?.message || '微信确认收货失败'),
        );
      },
    });
  });
  // #endif

  // #ifndef MP-WEIXIN
  return { skipped: true, status: 'success' };
  // #endif
}
```

- [ ] **Step 4: Run helper-adjacent regression tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
npm test -- src/pages/orders-list.regression.spec.ts src/pages/order-detail.regression.spec.ts
```

Expected: Still FAIL until the pages call the helper.

## Task 6: Miniapp Page Integration

**Files:**
- Modify: `miniapp/src/pages/orders-list/index.vue`
- Modify: `miniapp/src/pages/order-detail/index.vue`
- Test: `miniapp/src/pages/orders-list.regression.spec.ts`
- Test: `miniapp/src/pages/order-detail.regression.spec.ts`

- [ ] **Step 1: Update orders list to pass the full order**

In `miniapp/src/pages/orders-list/index.vue`, add import in the script:

```ts
import { confirmWechatReceiptBeforeInternalComplete } from '@/utils/wechat-confirm-receipt';
```

Extend `Order` with payment fields:

```ts
  paymentMethod?: string | null;
  transactionId?: string | null;
```

Change the button handler:

```vue
@tap="confirmReceivedFromList(order)"
```

Replace `confirmReceivedFromList(orderId: string)` with:

```ts
async function confirmReceivedFromList(order: Order) {
  if (receivingOrderId.value) return;

  uni.showModal({
    title: '确认收货',
    content: '确认已经收到商品了吗？',
    success: async (res) => {
      if (!res.confirm) return;

      try {
        receivingOrderId.value = order.id;
        uni.showLoading({ title: '确认中...' });

        await confirmWechatReceiptBeforeInternalComplete(order);

        const result = await request({
          url: `/orders/${order.id}/complete`,
          method: 'POST',
        });
        if (result.code !== 0) {
          throw new Error(result.message || '确认失败');
        }
        uni.showToast({
          title: '已确认收货',
          icon: 'success',
        });
        loadOrders();
      } catch (error: any) {
        uni.showToast({
          title: error?.message || '确认失败',
          icon: 'none',
        });
      } finally {
        receivingOrderId.value = '';
        uni.hideLoading();
      }
    },
  });
}
```

- [ ] **Step 2: Update order detail confirm flow**

In `miniapp/src/pages/order-detail/index.vue`, add import in the script:

```ts
import { confirmWechatReceiptBeforeInternalComplete } from '@/utils/wechat-confirm-receipt';
```

Replace the inner confirm block with:

```ts
        try {
          uni.showLoading({ title: '确认中...' });

          await confirmWechatReceiptBeforeInternalComplete(order.value);

          const result = await request({
            url: `/orders/${orderId.value}/complete`,
            method: 'POST',
          });
          if (result.code === 0) {
            uni.showToast({
              title: '已确认收货',
              icon: 'success',
            });
            loadOrderDetail();
          } else {
            throw new Error(result.message || '确认失败');
          }
        } catch (error: any) {
          uni.showToast({
            title: error?.message || '确认失败',
            icon: 'none',
          });
        } finally {
          uni.hideLoading();
        }
```

- [ ] **Step 3: Run miniapp regression tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
npm test -- src/pages/orders-list.regression.spec.ts src/pages/order-detail.regression.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Build miniapp**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/miniapp
npm run build:mp-weixin
```

Expected: PASS and output miniapp build artifacts for WeChat DevTools.

## Task 7: Backend Build and Focused Regression

**Files:**
- Modify files from Tasks 1-4 only

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm test -- tests/infrastructure/wechat/wechat.service.spec.ts tests/application/shipping/shipping-fulfillment.service.spec.ts tests/interfaces/controllers/staff-shipping.controller.spec.ts tests/application/scheduler/order-scheduler.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen/backend
npm run build
```

Expected: PASS.

- [ ] **Step 3: Check changed files**

Run:

```bash
cd /Users/zhaochen/Documents/SevenKitchen
git status --short
```

Expected: Only the planned files are modified, plus any pre-existing unrelated untracked files remain untouched.

## Task 8: Real WeChat Settlement Verification

**Files:**
- No code files
- Optional record: `docs/e2e/wechat-confirm-receipt-settlement-YYYY-MM-DD.md`

- [ ] **Step 1: Confirm WeChat platform prerequisites**

In WeChat public platform and merchant platform, confirm:

```text
1. The miniapp has order shipping management enabled.
2. The associated merchant id has completed trade settlement management confirmation.
3. The production miniapp build contains the new confirm-receipt flow.
4. The backend has real WECHAT_APP_ID, WECHAT_APP_SECRET, payment app id, and mch id configured.
```

Expected: All four are true before running the payment test.

- [ ] **Step 2: Create a low-value real WeChat Pay order**

Record:

```text
Internal order id:
WeChat transaction id:
Merchant id:
Paid at:
Payment amount:
```

Expected: The internal order has `paymentMethod = WECHAT_PAY`, `paymentStatus = SUCCESS`, and a non-empty `transactionId`.

- [ ] **Step 3: Ship the order and verify upload**

Use the existing staff shipping flow. Then call:

```bash
curl -H "Authorization: Bearer <staff-token>" \
  https://<api-host>/api/v1/staff/shipping/orders/<order-id>/wechat-shipping-status
```

Expected: Response `data.orderState` is `2` and `data.orderStateLabel` is `已发货`, or WeChat has already advanced beyond that state.

- [ ] **Step 4: Confirm receipt from the miniapp**

Open the order in the WeChat miniapp and tap `确认收货`.

Expected:

```text
1. The WeChat confirm receipt component opens.
2. The user confirms receipt in the WeChat component.
3. The internal order changes from SHIPPED to COMPLETED.
```

- [ ] **Step 5: Verify WeChat state after confirmation**

Call the diagnostic endpoint again:

```bash
curl -H "Authorization: Bearer <staff-token>" \
  https://<api-host>/api/v1/staff/shipping/orders/<order-id>/wechat-shipping-status
```

Expected: Response `data.orderState` is `3` or `4`, with label `确认收货` or `交易完成`.

- [ ] **Step 6: Verify merchant funds**

In WeChat merchant platform, inspect the same payment order.

Expected:

```text
1. The order is no longer waiting for the T+10 auto-confirm event.
2. Frozen funds are released or scheduled according to the platform's confirmed-receipt settlement rule.
3. If funds are still frozen, record whether the order is in complaint or risk review.
```

## Rollback Plan

- Frontend rollback: revert the helper import and restore direct `/orders/:id/complete` calls in `miniapp/src/pages/orders-list/index.vue` and `miniapp/src/pages/order-detail/index.vue`.
- Backend diagnostic rollback: remove the new staff endpoint and query methods; existing shipping upload remains unchanged.
- Scheduler rollback: restore the previous time-based completion logic, but keep the threshold at 10 days if the business rule remains T+10.
- Operational rollback: if the WeChat component fails in production for valid WeChat Pay orders, hide the confirm-receipt button behind a remote release flag until WeChat platform authorization is corrected.

## Self-Review

- Spec coverage: Covers WeChat-first customer confirmation, backend status verification, scheduler compatibility, tests, and real payment validation.
- Gap scan: Every implementation task names exact files, commands, and expected results.
- Type consistency: `transactionId`, `paymentMethod`, `orderState`, and `orderStateLabel` are used consistently across miniapp, service, controller, and scheduler tasks.
