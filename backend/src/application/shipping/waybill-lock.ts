/**
 * 发货硬锁的开关（2026-11-10）。
 *
 * 老板选的是「没验过存根、或者验完对不上，就不许发货」，但 admin-web 的发货
 * 那条路上**没有上传存根的入口** —— 锁死了后台就发不出货。所以锁是
 * 「客户端声明要锁」才生效：小程序三个发货入口一律带 `enforceWaybillCheck: true`，
 * 后台网页不传。
 *
 * 为什么不是"按角色判断"：老板本人也是 ADMIN，用小程序打包发货时一样该被锁。
 *
 * ⚠️ 校验服务没注入时**直接报错，不是放行** —— 宁可拦住也不能静默失去保护。
 */

import { InternalServerErrorException } from '@nestjs/common';
import type { WaybillReceiptGuardService } from './waybill-receipt-guard.service';

/**
 * 这次请求要不要强制核对存根。
 *
 * **默认要**。只有管理员在后台网页显式 `skipWaybillCheck: true` 才跳过 ——
 * 后台那条路上没有上传存根的入口，锁死了管理员就发不出货。
 *
 * 为什么不做成"客户端声明才校验"（2026-11-10 第一版就是这么写的，复审推翻了）：
 * 旧版小程序、或者有人换个接口直接调，都会静默地不受保护。
 */
export function shouldEnforceWaybill(
  body: { skipWaybillCheck?: unknown } | null | undefined,
  role: string | null | undefined,
): boolean {
  return !(body?.skipWaybillCheck === true && role === 'ADMIN');
}

export interface WaybillLockInput {
  /** 客户端声明要锁（小程序来的发货请求一律 true） */
  enabled: boolean;
  orderIds: string[];
  trackingNumber: string;
}

export async function enforceWaybillLock(
  guard: WaybillReceiptGuardService | undefined,
  input: WaybillLockInput,
): Promise<void> {
  if (!input.enabled) return;

  if (!guard) {
    // fail closed：声明要锁却没人校验，说明模块装配漏了，不能当成"验过了"
    throw new InternalServerErrorException(
      '存根校验未启用，请联系管理员（WaybillReceiptGuardService 未注入）',
    );
  }

  await guard.assertVerified({
    orderIds: input.orderIds,
    trackingNumber: input.trackingNumber,
  });
}
