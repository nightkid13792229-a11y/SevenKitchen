/**
 * 快递存根识别的状态机（2026-11-11）。
 *
 * 以前这段逻辑在**三个地方各写一遍**：鲜食发货抽屉、补剂发货弹窗、
 * 合并/拆包发货页。三份都差不多、又都不完全一样 ——
 * 最典型的是「手动确认后再改单号，这次确认应该作废」——
 * 抽屉做了，合并页漏了。合到一处以后，这类口径只维护一次。
 *
 * 这一层只管状态流转，不碰网络、不碰页面：
 *   · 页面拿到 chooseImage 的图 → 自己上传 → 调 applyRecognizeResult；
 *   · 回填表单的动作由调用方传进来（三个页面的字段名不同）。
 */

import type {
  ReceiptConflict,
  ReceiptMatchStatus,
} from '../api/waybillReceipt';
import {
  buildReceiptView,
  type ReceiptUiState,
  type ReceiptView,
} from './waybill-receipt-view';

export interface ReceiptState {
  state: ReceiptUiState;
  /** 存根上认出来的快递公司名 */
  carrierName: string;
  /** 存根上认出来的运单号（与表单里可编辑的单号分开记，改号要作废旧结论） */
  trackingNumber: string;
  /** 存根上认出来的运费 */
  fee: number | null;
  conflicts: ReceiptConflict[];
  duplicateLabel: string;
  message: string;
  hasImage: boolean;
  manualConfirmed: boolean;
  manualTracking: string;
}

/** 一次识别结果里与本状态机相关的那部分（够用就好，别耦合整个响应类型） */
export interface RecognizeResultLike {
  receipt?: {
    carrierCode?: string | null;
    carrierName?: string | null;
    trackingNumber?: string | null;
    shippingFee?: number | null;
  } | null;
  match: {
    status: ReceiptMatchStatus;
    conflicts?: ReceiptConflict[];
    duplicate?: { label?: string | null } | null;
  };
}

/** 回填表单：三个页面各自把「承运商 / 单号 / 运费」写进自己的字段 */
export type ReceiptFormApply = (summary: {
  carrierCode?: string | null;
  trackingNumber?: string | null;
  shippingFee?: number | null;
}) => void;

export function createReceiptState(): ReceiptState {
  return {
    state: 'idle',
    carrierName: '',
    trackingNumber: '',
    fee: null,
    conflicts: [],
    duplicateLabel: '',
    message: '',
    hasImage: false,
    manualConfirmed: false,
    manualTracking: '',
  };
}

/** 每次打开/换包裹都是新的一张存根：上一张的结论绝不能留到下一张 */
export function resetReceiptState(target: ReceiptState): void {
  const fresh = createReceiptState();
  Object.keys(fresh).forEach((key) => {
    (target as any)[key] = (fresh as any)[key];
  });
}

/** 选了新图：先置为识别中，并作废上一张的「手动确认」 */
export function markReceiptPicked(target: ReceiptState): void {
  target.hasImage = true;
  target.state = 'recognizing';
  target.manualConfirmed = false;
  target.manualTracking = '';
}

export function markReceiptRecognizing(target: ReceiptState): void {
  target.state = 'recognizing';
  target.message = '';
}

export function markReceiptFailed(
  target: ReceiptState,
  message: string,
): ReceiptUiState {
  target.state = 'failed';
  target.message = message || '识别失败，可以手动填写';
  return target.state;
}

/**
 * 识别结果 → 状态机（并让调用方回填表单）。
 *
 * 只有「核对通过」和「没能核对上」这两种才回填 ——
 * 对不上（mismatch）/ 号被占用（duplicate）时一个字段都不填，
 * 否则员工改个号就能把后端硬锁点过去。
 */
export function applyRecognizeResult(
  target: ReceiptState,
  result: RecognizeResultLike,
  applyForm: ReceiptFormApply,
): ReceiptUiState {
  const receipt = result.receipt ?? null;
  target.carrierName = receipt?.carrierName || '';
  target.trackingNumber = receipt?.trackingNumber || '';
  target.fee = receipt?.shippingFee ?? null;
  target.conflicts = result.match.conflicts || [];
  target.duplicateLabel = result.match.duplicate?.label || '';

  const status = result.match.status;

  if (status === 'match' || status === 'unknown') {
    target.state = status;
    applyForm({
      carrierCode: receipt?.carrierCode,
      trackingNumber: receipt?.trackingNumber,
      shippingFee: receipt?.shippingFee,
    });
    return target.state;
  }

  if (status === 'mismatch' || status === 'duplicate') {
    target.state = status;
    return target.state;
  }

  // degraded / not_waybill：认不出来，给手动出口
  target.state = 'failed';
  target.message =
    status === 'not_waybill'
      ? '这张不是快递存根（没有运单号），换一张或者手动填写'
      : '';
  return target.state;
}

/**
 * 员工手动确认过一次（AI 认不出来 / 没能核对时）。
 * 记下**确认的是哪个单号** —— 确认完再改号，这次确认就作废。
 */
export function markReceiptManualConfirmed(
  target: ReceiptState,
  trackingNumber: string,
): ReceiptUiState {
  target.manualConfirmed = true;
  target.manualTracking = trackingNumber;
  target.state = target.hasImage ? 'unknown' : 'failed';
  return target.state;
}

/** 页面画存根块时统一走这里（四种颜色的含义钉死在 buildReceiptView） */
export function receiptViewOf(
  target: ReceiptState,
  currentTrackingNumber?: string | null,
): ReceiptView {
  return buildReceiptView({
    state: target.state,
    carrierName: target.carrierName || null,
    trackingNumber: currentTrackingNumber || null,
    recognizedTrackingNumber: target.trackingNumber || null,
    manualConfirmedTracking: target.manualTracking || null,
    shippingFee: target.fee,
    conflicts: target.conflicts,
    duplicateLabel: target.duplicateLabel || null,
    manualConfirmed: target.manualConfirmed,
    message: target.message || null,
  });
}
