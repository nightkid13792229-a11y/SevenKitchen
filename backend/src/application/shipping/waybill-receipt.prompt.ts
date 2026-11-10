/**
 * 「从快递电子存根识别发货信息」的提示词与输出收口（2026-11-10）。
 *
 * 老板的场景：打包间手上就是一张顺丰电子存根，照着敲单号既慢又容易错一位。
 *
 * 两条铁律：
 *   1. **只认图上真的印着的**。运单号不许按「SF + 13 位」的常识补位 ——
 *      补一位就是一个根本不存在的号，客服和自己都查不到这单。
 *   2. **读不到就给 null**。运费尤其如此：月结账号的存根常常不印运费，
 *      猜一个数会让成本统计直接错，而且没人会发现。
 *
 * 这图不是快递存根（商品截图 / 聊天截图 / 身份证）时，返回 `other`，
 * 由上层直接告诉员工「这张不是快递存根」，绝不硬读出一个号码。
 */

import { toCarrierCode } from './carrier-catalog';

export interface ParsedReceipt {
  documentType: 'waybill_receipt' | 'other';
  carrierCode: string | null;
  /** 归一后的快递公司名（页面绿条要显示）；认不出是哪家时与 carrierCode 一起为 null */
  carrierName: string | null;
  trackingNumber: string | null;
  shippingFee: number | null;
  recipientName: string | null;
  recipientPhoneMasked: string | null;
  recipientAddress: string | null;
}

export const WAYBILL_RECEIPT_SYSTEM_PROMPT = `你是发货助理。用户会给你一张**快递的电子存根 / 快递面单**截图，
你要读出这单的运单号和收件人，输出 JSON。

先判断这张图是不是快递存根或快递面单：
- 是（上面有运单号 / 条形码 / 收件人 / 快递公司）→ "documentType": "waybill_receipt"
- 不是（商品截图、聊天截图、订单列表、身份证、发票等）→ "documentType": "other"，
  其余字段一律 null，**不许硬猜一个号码出来**。

输出字段：
{
  "documentType": "waybill_receipt",
  "carrierName": "快递公司名，照抄图上的写法，如 顺丰速运",
  "trackingNumber": "运单号，照抄",
  "shippingFee": 运费数字（元），图上没有就是 null,
  "recipient": {
    "name": "收件人姓名，照抄",
    "phoneMasked": "收件人手机，图上是打码的就照抄打码的样子（如 186****2107）",
    "address": "收件人地址，照抄整句"
  },
  "sender": { "name": "寄件人姓名", "address": "寄件人地址" },
  "productName": "托寄物，如 肉食品",
  "weightKg": 计费重量或实际重量（千克）,
  "shippedAt": "寄件时间，照抄"
}

规则（务必遵守）：
- 运单号**只认图上真的印着的那串字符**，一个字都不许补、不许改、不许按常见格式推断。
  看到多少位就写多少位。看不清就给 null。
- 顺丰的单号可能带 SF 前缀，也可能只有数字 —— **照抄**，不要自己加前缀或去掉前缀。
- 运费只取「运费 / 寄付现结 / 到付」那一笔。图上有保价费、包装费、合计等多个金额时，
  取**这单实际支付的运费**；不要把商品价格当成运费。
- 图上**没有印运费**（月结账号常见）就给 null，**不许算、不许估**。
- 快递公司**看不出是哪家就给 null**，不要按单号前缀猜。
- 收件人手机在存根上通常是打码的，**照抄打码后的样子**，不要试图还原成完整号码。
- 读不到的字段一律 null。**一个都不许编。**

只输出 JSON，不要任何解释文字。`;

/** 全角转半角，便于识别单号里的全角字母数字 */
const toHalfWidth = (input: string): string =>
  input
    .replace(
      /[\uFF01-\uFF5E]/g,
      (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, ' ');

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = toHalfWidth(value).trim();
  return text.length > 0 ? text : null;
};

/**
 * 运单号收口。
 *
 * 少于 5 位不是运单号（顺丰 13 位、其它快递也都在 10 位以上）；
 * 混了中文说明模型把「运单号」三个字也抄进来了，这种宁可不要。
 */
const toTrackingNumber = (value: unknown): string | null => {
  const text = trimOrNull(value);
  if (!text) return null;
  if (text.length < 5) return null;
  if (/[\u4e00-\u9fa5]/.test(text)) return null;
  if (!/^[A-Za-z0-9-]+$/.test(text)) return null;
  return text.toUpperCase();
};

const toFee = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0
      ? Number(value.toFixed(2))
      : null;
  }
  if (typeof value === 'string') {
    const text = toHalfWidth(value).replace(/\s+/g, '').replace(/[¥￥元]/g, '');
    if (text.length === 0) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed >= 0
      ? Number(parsed.toFixed(2))
      : null;
  }
  return null;
};

const EMPTY_RECEIPT: ParsedReceipt = {
  documentType: 'other',
  carrierCode: null,
  carrierName: null,
  trackingNumber: null,
  shippingFee: null,
  recipientName: null,
  recipientPhoneMasked: null,
  recipientAddress: null,
};

/**
 * 把模型输出收口成内部结构。
 *
 * ⚠️ 任何「不是存根」的信号都会把**所有字段清空**：宁可让员工重传，
 * 也不许从一张商品截图里抠出一个号码来填发货单。
 */
export function parseWaybillReceipt(raw: unknown): ParsedReceipt {
  const source =
    raw && typeof raw === 'object'
      ? (raw as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const documentType = String(source.documentType ?? '')
    .trim()
    .toLowerCase();

  // 认「存根 / 面单」；显式 other、以及任何没见过的取值都当"不是存根"。
  // 只有**字段缺失**（空串）时宽容按存根处理 —— 模型偶尔漏字段不该让整张作废，
  // 号码读不出来自然会落到 DEGRADED。
  const isReceipt =
    documentType === 'waybill_receipt' ||
    documentType === 'shipping_label' ||
    documentType === '';

  if (!isReceipt) {
    return { ...EMPTY_RECEIPT, documentType: 'other' };
  }

  const recipient =
    source.recipient && typeof source.recipient === 'object'
      ? (source.recipient as Record<string, unknown>)
      : {};

  const rawCarrierName =
    typeof source.carrierName === 'string' ? source.carrierName.trim() : null;
  const carrierCode = toCarrierCode(rawCarrierName);

  return {
    documentType: 'waybill_receipt',
    carrierCode,
    // 名字只在**认得出是哪家**时才往外给：认不出来还照抄，
    // 页面会显示一个下拉里根本不存在的快递公司。
    carrierName: carrierCode ? rawCarrierName : null,
    trackingNumber: toTrackingNumber(source.trackingNumber),
    shippingFee: toFee(source.shippingFee),
    recipientName: trimOrNull(recipient.name),
    recipientPhoneMasked: trimOrNull(recipient.phoneMasked),
    recipientAddress: trimOrNull(recipient.address),
  };
}
