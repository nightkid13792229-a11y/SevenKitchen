import { WaybillReceiptGuardService } from 'src/application/shipping/waybill-receipt-guard.service';
import { OrderService } from 'src/application/order/order.service';
import { OrderShipmentService } from 'src/application/shipping/order-shipment.service';
import { SupplementOrderService } from 'src/application/supplement-shop/supplement-order.service';

/**
 * 存根校验服务必须真的被 Nest 注入进来（2026-11-10）。
 *
 * 这条用例是被审核救回来的：三个发货 service 一度用 `import type` 声明
 * `@Optional()` 的构造参数，`import type` 会被编译擦除，Nest 记录到的参数类型
 * 变成 `Object`，容器解析不出来 —— 结果注入的是 `undefined`。
 *
 * 而 `enforceWaybillLock` 是 **fail closed** 的，于是小程序每次发货都抛
 * 「存根校验未启用」。所有单测都手工 `service.waybillReceiptGuard = guard`，
 * 6757 条用例全绿也发现不了 —— 所以这里直接盯 Nest 真正用来解析的那个元数据。
 */
describe('存根校验服务的依赖注入', () => {
  it.each([
    ['OrderService', OrderService],
    ['OrderShipmentService', OrderShipmentService],
    ['SupplementOrderService', SupplementOrderService],
  ])('%s 的构造参数里带上了 WaybillReceiptGuardService', (_name, target) => {
    const paramtypes: unknown[] =
      Reflect.getMetadata('design:paramtypes', target) ?? [];

    expect(paramtypes).toContain(WaybillReceiptGuardService);
  });
});
