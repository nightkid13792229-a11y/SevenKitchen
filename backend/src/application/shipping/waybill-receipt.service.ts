/**
 * 「从快递电子存根识别发货信息」服务（2026-11-10）。
 *
 * 老板的场景：打包间手上就是一张顺丰电子存根，照着敲单号既慢又容易错一位。
 *
 * 这个服务负责把图变成**可核对的三项**（承运商 / 运单号 / 运费），
 * 并且每次都落一行结论 —— 发货硬锁（`WaybillReceiptGuardService`）
 * 就是靠这行结论来判断"这单到底验没验过"。
 *
 * 四条硬约束（老板定「账目准确优先」）：
 *   1. 读不出来的一律 null 并降级，**绝不用猜测值填坑**；
 *   2. **不抛 500**：模型挂了、配额用完都降级成「手动填写」，不卡住打包间；
 *   3. 「不是存根」「号被用过」「收件人对不上」是**给员工看的结论**，原样返回，不吞；
 *   4. 手动填写必须留原因，且**已有对不上的结论时不给手动**（否则硬锁等于没有）。
 */

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { DeepSeekChatOptions } from '../recipe-designer/deepseek-chat';
import {
  AgentProviderConfigService,
  PURCHASE_REIMBURSEMENT_AGENT_PURPOSE,
} from '../nutrition-governance/agent-provider-config.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { loadOrderAddresses } from './waybill-address';
import {
  buildAddressFingerprint,
  compareRecipient,
  phoneTail4,
  type AddressView,
  type MatchConflict,
} from './waybill-receipt-match';
import {
  parseWaybillReceipt,
  WAYBILL_RECEIPT_SYSTEM_PROMPT,
  type ParsedReceipt,
} from './waybill-receipt.prompt';
import { normalizeTrackingNumber } from './waybill-receipt-guard.service';

/** 视觉模型调用口子（测试里替换掉，避免真打网络） */
export const WAYBILL_RECEIPT_MODEL = Symbol('WAYBILL_RECEIPT_MODEL');

/** 与采购识别**共用同一套模型配置**：老板在后台配过一次，这里不用再配 */
export const WAYBILL_RECEIPT_PURPOSE = PURCHASE_REIMBURSEMENT_AGENT_PURPOSE;

/**
 * 上限。存根识别的频次约等于发货量（一天几十单），
 * 不能沿用采购那 30 次/人/天 —— 那会把建档额度吃光。
 */
export const DAILY_RECEIPT_LIMIT_PER_USER = 100;
export const MONTHLY_RECEIPT_LIMIT_SYSTEM = 10000;

const NO_THINKING = { thinking: { type: 'disabled' } };

export type RecognizeStatus =
  | 'match'
  | 'unknown'
  | 'mismatch'
  | 'duplicate'
  | 'degraded'
  | 'not_waybill';

export interface ExpectedView {
  recipientName: string;
  phoneTail4: string | null;
  regionText: string;
  detail: string;
}

export interface DuplicateOwner {
  kind: 'ORDER' | 'SUPPLEMENT' | 'PACKAGE';
  label: string;
}

export interface RecognizeResult {
  checkId: string;
  receipt: ParsedReceipt | null;
  match: {
    status: RecognizeStatus;
    conflicts: MatchConflict[];
    expected: ExpectedView | null;
    duplicate?: DuplicateOwner | null;
  };
}

/**
 * 取「本地日历上的今天」，用 UTC 零点表示。
 * 坑见 `procurement-sku-draft-quota.service.ts`：DATE 列会把本地零点退回前一天。
 */
const startOfLocalDay = (now: Date): Date =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

const startOfLocalMonth = (now: Date): Date =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

const toExpectedView = (view: AddressView): ExpectedView => ({
  recipientName: view.recipientName,
  phoneTail4: phoneTail4(view.phone),
  regionText: `${view.province}${view.city}${view.district}`,
  detail: view.detail,
});

@Injectable()
export class WaybillReceiptService {
  private readonly logger = new Logger(WaybillReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentConfig: AgentProviderConfigService,
    @Inject(WAYBILL_RECEIPT_MODEL)
    private readonly model: {
      callDeepSeekJson(options: DeepSeekChatOptions): Promise<Record<string, unknown>>;
    },
  ) {}

  async recognize(input: {
    imageUrl: string;
    orderIds: string[];
    userId: string;
  }): Promise<RecognizeResult> {
    const orderIds = Array.from(new Set((input.orderIds ?? []).filter(Boolean)));
    if (orderIds.length === 0) {
      throw new BadRequestException('缺少订单');
    }
    if (!input.imageUrl) {
      throw new BadRequestException('缺少存根图片');
    }

    const snapshots = await loadOrderAddresses(this.prisma, orderIds);
    if (snapshots.length !== orderIds.length) {
      throw new BadRequestException('订单不存在，刷新一下再试');
    }

    // 1) 配额 —— 超了直接降级，一次模型都不调（省钱的闸门，不是发货的闸门）
    if (await this.isOverQuota(input.userId)) {
      return this.degrade(orderIds, input.userId, 'quota');
    }

    // 2) 调视觉模型
    let parsed: ParsedReceipt;
    try {
      const runtime = await this.agentConfig.getEnabledDeepSeekRuntimeConfig({
        purpose: WAYBILL_RECEIPT_PURPOSE,
      });

      const raw = await this.model.callDeepSeekJson({
        baseUrl: runtime.baseUrl,
        model: runtime.model,
        apiKey: runtime.apiKey,
        requestTimeoutMs: runtime.requestTimeoutMs,
        systemPrompt: WAYBILL_RECEIPT_SYSTEM_PROMPT,
        userContent: [
          { type: 'text', text: '这是快递电子存根截图，请按约定输出 JSON。' },
          { type: 'image_url', image_url: { url: input.imageUrl } },
        ],
        temperature: 0,
        extraBody: NO_THINKING,
      });

      parsed = parseWaybillReceipt(raw);
    } catch (error: any) {
      // 模型超时 / 网络 / 密钥没配：降级，绝不拦人
      this.logger.warn(
        `[WaybillReceipt] 识别失败：${error?.message ?? 'unknown'}`,
      );
      return this.degrade(orderIds, input.userId, 'model_timeout');
    }

    // 3) 不是存根 → 当场说清楚，不许硬抠号码
    if (parsed.documentType === 'other') {
      const record = await this.saveRecord({
        orderIds,
        userId: input.userId,
        status: 'NOT_WAYBILL',
        receipt: parsed as unknown as Record<string, unknown>,
      });
      return {
        checkId: record.id,
        receipt: parsed,
        match: { status: 'not_waybill', conflicts: [], expected: null },
      };
    }

    // 4) 读到了但没运单号 → 同样降级（可以走手动填写）
    if (!parsed.trackingNumber) {
      return this.degrade(orderIds, input.userId, 'no_tracking_number', parsed);
    }

    // 5) 查重（三张表：鲜食单 / 补剂单 / 发货包裹）
    const duplicate = await this.findTrackingOwner(
      parsed.trackingNumber,
      orderIds,
    );
    if (duplicate) {
      const record = await this.saveRecord({
        orderIds,
        userId: input.userId,
        status: 'DUPLICATE',
        trackingNumber: parsed.trackingNumber,
        carrierCode: parsed.carrierCode,
        receipt: parsed as unknown as Record<string, unknown>,
      });
      return {
        checkId: record.id,
        receipt: parsed,
        match: {
          status: 'duplicate',
          conflicts: [],
          expected: toExpectedView(snapshots[0].view),
          duplicate,
        },
      };
    }

    // 6) 比对收件人（一票里的订单必然同地址，逐张都过一遍）
    let status: 'match' | 'unknown' | 'mismatch' = 'match';
    let conflicts: MatchConflict[] = [];
    let expectedView: AddressView = snapshots[0].view;

    for (const snapshot of snapshots) {
      const compared = compareRecipient(
        {
          name: parsed.recipientName,
          phoneMasked: parsed.recipientPhoneMasked,
          address: parsed.recipientAddress,
        },
        snapshot.view,
      );
      if (compared.status === 'mismatch') {
        status = 'mismatch';
        conflicts = compared.conflicts;
        expectedView = snapshot.view;
        break;
      }
      if (compared.status === 'unknown') {
        status = 'unknown';
        expectedView = snapshot.view;
      }
    }

    const record = await this.saveRecord({
      orderIds,
      userId: input.userId,
      status: status === 'match' ? 'MATCH' : status === 'mismatch' ? 'MISMATCH' : 'UNKNOWN',
      trackingNumber: parsed.trackingNumber,
      carrierCode: parsed.carrierCode,
      receipt: parsed as unknown as Record<string, unknown>,
      conflicts,
      addressFingerprints: this.buildFingerprints(snapshots),
    });

    return {
      checkId: record.id,
      receipt: parsed,
      match: {
        status,
        conflicts,
        expected: toExpectedView(expectedView),
      },
    };
  }

  /**
   * 手动填写单号 —— AI 认不出来时唯一的出口（老板 22:4x 保留）。
   *
   * 但它**不是后门**：已经判过「收件人对不上」或「号被别人用过」时一律拒绝，
   * 否则硬锁只要点一下"手动填写"就绕过去了。
   */
  async createManualRecord(input: {
    orderIds: string[];
    trackingNumber: string;
    carrierCode?: string | null;
    reason: string;
    userId: string;
  }): Promise<{ id: string }> {
    const orderIds = Array.from(new Set((input.orderIds ?? []).filter(Boolean)));
    if (orderIds.length === 0) {
      throw new BadRequestException('缺少订单');
    }

    const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
    if (trackingNumber.length < 5) {
      throw new BadRequestException('运单号太短，请检查');
    }

    const reason = String(input.reason ?? '').trim();
    if (reason.length === 0) {
      throw new BadRequestException('手动填写必须说明原因');
    }

    const snapshots = await loadOrderAddresses(this.prisma, orderIds);
    if (snapshots.length !== orderIds.length) {
      throw new BadRequestException('订单不存在，刷新一下再试');
    }

    const blocking = await this.prisma.waybillReceiptRecord.findMany({
      where: {
        trackingNumber,
        orderIds: { hasSome: orderIds },
        status: { in: ['MISMATCH', 'DUPLICATE'] },
      },
      select: { id: true, status: true },
      take: 1,
    });
    if (blocking.length > 0) {
      throw new BadRequestException(
        '这张存根跟这单的收货人对不上，不能改成手动填写。请先改收货地址，或者换一张存根。',
      );
    }

    return this.saveRecord({
      orderIds,
      userId: input.userId,
      status: 'MANUAL',
      trackingNumber,
      carrierCode: input.carrierCode ?? null,
      manualReason: reason.slice(0, 200),
      addressFingerprints: this.buildFingerprints(snapshots),
    });
  }

  /** 降级：落一行 DEGRADED，前端据此给「手动填写」出口 */
  private async degrade(
    orderIds: string[],
    userId: string,
    degradedReason: string,
    receipt?: ParsedReceipt,
  ): Promise<RecognizeResult> {
    const record = await this.saveRecord({
      orderIds,
      userId,
      status: 'DEGRADED',
      degradedReason,
      trackingNumber: receipt?.trackingNumber ?? null,
      carrierCode: receipt?.carrierCode ?? null,
      receipt: receipt ? (receipt as unknown as Record<string, unknown>) : undefined,
    });

    return {
      checkId: record.id,
      receipt: receipt ?? null,
      match: { status: 'degraded', conflicts: [], expected: null },
    };
  }

  private buildFingerprints(
    snapshots: Array<{ orderId: string; view: AddressView }>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const snapshot of snapshots) {
      result[snapshot.orderId] = buildAddressFingerprint(snapshot.view);
    }
    return result;
  }

  /**
   * 这个运单号是不是已经挂在别的单/别的包裹上了。
   *
   * 三张表都要查 —— 运单号在系统里有三个写入点：
   *   ① 单笔发货只写 `order.tracking_number`（不建包裹）
   *   ② 合并发货写 `order_shipment_package` 再回写 `order`
   *   ③ 补剂单写 `supplement_order.tracking_number`
   * 只查一处会漏掉一大批。
   */
  private async findTrackingOwner(
    trackingNumber: string,
    orderIds: string[],
  ): Promise<DuplicateOwner | null> {
    const orders = await this.prisma.order.findMany({
      where: {
        trackingNumber,
        status: { not: 'CANCELLED' },
        id: { notIn: orderIds },
      },
      select: { id: true, orderNo: true },
      take: 1,
    });
    if (orders.length > 0) {
      return {
        kind: 'ORDER',
        label: String(orders[0].orderNo ?? orders[0].id),
      };
    }

    const supplements = await this.prisma.supplementOrder.findMany({
      where: {
        trackingNumber,
        status: { not: 'CANCELLED' },
        id: { notIn: orderIds },
      },
      select: { id: true, orderNo: true },
      take: 1,
    });
    if (supplements.length > 0) {
      return {
        kind: 'SUPPLEMENT',
        label: String(supplements[0].orderNo ?? supplements[0].id),
      };
    }

    const packages = await this.prisma.orderShipmentPackage.findMany({
      where: { trackingNumber },
      select: { id: true, shipmentId: true },
      take: 20,
    });
    if (packages.length === 0) return null;

    // 合并发货本来就会几张单共用同一个号：属于本票的包裹不算重复
    const ownShipments = await this.prisma.orderShipmentOrder.findMany({
      where: {
        shipmentId: { in: packages.map((item: any) => item.shipmentId) },
        orderId: { in: orderIds },
      },
      select: { shipmentId: true },
    });
    const ownShipmentIds = new Set(
      (ownShipments as any[]).map((row) => row.shipmentId),
    );

    const foreign = packages.find(
      (item: any) => !ownShipmentIds.has(item.shipmentId),
    );
    if (!foreign) return null;

    return { kind: 'PACKAGE', label: String(foreign.id) };
  }

  private async isOverQuota(userId: string): Promise<boolean> {
    const now = new Date();
    const [monthTotal, dailyCount] = await Promise.all([
      this.prisma.waybillReceiptRecord.aggregate({
        where: { createdAt: { gte: startOfLocalMonth(now) } },
        _sum: { count: true },
      }),
      this.prisma.waybillReceiptRecord.count({
        where: { createdBy: userId, createdAt: { gte: startOfLocalDay(now) } },
      }),
    ]);

    if (
      (monthTotal as any)?._sum?.count !== null &&
      (monthTotal as any)?._sum?.count !== undefined &&
      Number((monthTotal as any)._sum.count) >= MONTHLY_RECEIPT_LIMIT_SYSTEM
    ) {
      return true;
    }

    return Number(dailyCount ?? 0) >= DAILY_RECEIPT_LIMIT_PER_USER;
  }

  private async saveRecord(data: {
    orderIds: string[];
    userId: string;
    status: string;
    trackingNumber?: string | null;
    carrierCode?: string | null;
    receipt?: Record<string, unknown>;
    conflicts?: MatchConflict[];
    addressFingerprints?: Record<string, string>;
    degradedReason?: string;
    manualReason?: string;
  }): Promise<{ id: string }> {
    const created = await this.prisma.waybillReceiptRecord.create({
      data: {
        orderIds: data.orderIds,
        createdBy: data.userId,
        status: data.status,
        trackingNumber: data.trackingNumber ?? null,
        carrierCode: data.carrierCode ?? null,
        receipt: (data.receipt ?? undefined) as any,
        conflicts: (data.conflicts ?? undefined) as any,
        addressFingerprints: (data.addressFingerprints ?? undefined) as any,
        degradedReason: data.degradedReason ?? null,
        manualReason: data.manualReason ?? null,
      },
      select: { id: true },
    });

    return created as { id: string };
  }
}
