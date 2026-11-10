/**
 * 承运商字典（2026-11-10）。
 *
 * 存根上印的是名字（顺丰速运 / 京东物流 / SF EXPRESS），订单里存的是代码（SF / JD）。
 * 这一层把名字收成 8 个固定代码，前端下拉、后端写入、AI 读出**共用同一份**，
 * 免得三个页面各写一套、越走越远。
 *
 * 只做「精确匹配 + 前缀兜底」，**不做模糊包含**：
 * 「中通」和「中通快运」不是一回事，contains 会把它俩混成一个。
 */

export const CARRIER_CODES = [
  'SF',
  'JD',
  'YTO',
  'ZTO',
  'STO',
  'YD',
  'EMS',
  'POSTB',
] as const;

export type CarrierCode = (typeof CARRIER_CODES)[number];

export const CARRIER_NAME_BY_CODE: Record<CarrierCode, string> = {
  SF: '顺丰速运',
  JD: '京东物流',
  YTO: '圆通速递',
  ZTO: '中通快递',
  STO: '申通快递',
  YD: '韵达速递',
  EMS: 'EMS',
  POSTB: '邮政包裹',
};

/**
 * 别名表。顺序有意义：**更长的写法必须排在更短的前面**
 * （「邮政特快」要在「邮政」之前，否则专递会被归成邮政包裹）。
 */
const CARRIER_ALIASES: ReadonlyArray<readonly [string, CarrierCode]> = [
  ['顺丰', 'SF'],
  ['SFEXPRESS', 'SF'],
  ['SF', 'SF'],
  ['京东', 'JD'],
  ['JDL', 'JD'],
  ['JD', 'JD'],
  ['圆通', 'YTO'],
  ['YTO', 'YTO'],
  ['中通', 'ZTO'],
  ['ZTO', 'ZTO'],
  ['申通', 'STO'],
  ['STO', 'STO'],
  ['韵达', 'YD'],
  ['YD', 'YD'],
  ['邮政特快', 'EMS'],
  ['EMS', 'EMS'],
  ['邮政包裹', 'POSTB'],
  ['POSTB', 'POSTB'],
  ['邮政', 'POSTB'],
];

/** 全角转半角 + 去空白 + 转大写；中文部分不受影响 */
function normalizeCarrierName(raw: string): string {
  return raw
    .replace(
      /[\uFF01-\uFF5E]/g,
      (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

/**
 * 名字 → 代码。认不出来返回 `null`。
 *
 * 返回 null 时上游**只填单号和运费、不动承运商下拉**，
 * 绝不用默认值糊过去 —— 那会让这单记在别家快递名下。
 */
export function toCarrierCode(
  raw: string | null | undefined,
): CarrierCode | null {
  if (typeof raw !== 'string') return null;
  const text = normalizeCarrierName(raw);
  if (text.length === 0) return null;

  for (const [alias, code] of CARRIER_ALIASES) {
    if (text === alias) return code;
  }
  for (const [alias, code] of CARRIER_ALIASES) {
    if (text.startsWith(alias)) return code;
  }
  return null;
}
