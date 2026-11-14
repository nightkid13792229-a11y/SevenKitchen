/**
 * 订单截图识别的提示词（2026-11-12 从 service 抽出来，便于单测）。
 *
 * 两个口径在这里固定：
 *   1. 采购单位只从平台字典 `purchase_unit` 里选，不再写死「盒/袋/份/瓶/斤/公斤/克/两」；
 *   2. 包装上印的净含量/件数（4斤、30枚、1.59kg）是 spec，不是 unit；
 *      qty 看截图上的 ×N，不要把 4 斤当成 4 件或 1 斤。
 */

import type { ChannelOption } from './channel-catalog';
import type { PurchaseUnitOption } from './purchase-unit-catalog';

function describeUnits(units: PurchaseUnitOption[]): string {
  const format = (option: PurchaseUnitOption) =>
    option.aliases.length > 0
      ? `${option.code}（${option.aliases.join('/')}）`
      : option.code;
  const packaging = units
    .filter((unit) => unit.kind === 'PACKAGING')
    .map(format)
    .join('、');
  const measurement = units
    .filter((unit) => unit.kind === 'MEASUREMENT')
    .map(format)
    .join('、');
  return `包装单位（按件/盒/袋买）：${packaging || '无'}
计量单位（散称按重量买）：${measurement || '无'}`;
}

export function buildOrderImportSystemPrompt(input: {
  channels: ChannelOption[];
  units: PurchaseUnitOption[];
}): string {
  const channelList = input.channels.map((item) => item.code).join('、');
  const unitDictionary = describeUnits(input.units);
  return `你是采购助理。用户会给你同一笔商超/网店订单的长截图，按从上到下的顺序切成 N 段。
请读完整笔订单，输出一个 JSON 对象。

输出字段：
{
  "channel": "从下面的渠道清单里选一个；如果截图上看不出、或者明显不在清单里，给 null",
  "orderNo": "字符串或null",
  "orderTime": "YYYY-MM-DD HH:mm 或null",
  "pageType": "order_detail / product_detail / order_list / unknown",
  "expectedDeliveryAt": "YYYY-MM-DD 或 YYYY-MM-DD HH:mm，或null（预计送达、送达日期）",
  "deliveredAt": "YYYY-MM-DD HH:mm 或null（截图明确显示已送达/已签收时）",
  "items": [{"name":"商品名原文","spec":"包装/净含量原文或null（如 4斤、30枚 1.59kg）","qty":数字或null,"unit":"单位字典里的 code 或null","unitPrice":数字或null,"lineTotal":数字或null}],
  "subtotal": 数字或null,
  "shippingFee": 数字或null,
  "packagingFee": 数字或null,
  "discount": 数字或null,
  "paid": 数字或null,
  "weightAdjustment": {"exists": true或false, "amount": 数字或null},
  "incomplete": true或false,
  "note": "简短说明"
}

渠道清单（channel 只能填这里的原文，或者 null）：
${channelList}

采购单位字典（unit 只能填这些 code；截图写的是别名时归一到 code；认不出给 null）：
${unitDictionary}

规则：
1. 商品金额（盒马叫商品小计、山姆叫商品总金额、沃尔玛叫商品金额）是截图上的合计，照抄。可以自己把各行金额加一遍做参考，但对不上不代表漏读。
2. 合计数经常天然对不上：满减/优惠/优惠券、会员价或特价（商品行显示实付价、商品小计按原价）、环保包装费、运费、称重补差退款都会造成差额。这些都不算漏读，不要因此把 incomplete 置为 true。
3. 只有当确实看到商品行被折叠（出现「展开」「查看更多」，或标注的总件数明显多于读到的行数）时，才把 incomplete 置为 true，并在 note 里写清楚看到了什么。
4. 件数校验要看数量之和，不是行数之和。
5. 图上出现"¥29.00 ×2"这类写法时，29.00 是单价，行小计 = 单价 × 数量。
6. 金额一律输出数字（元），不要带 ¥ 符号、不要千分位。
7. 读不到的字段一律给 null，绝不编造。不要输出姓名、电话、地址。
8. 图上的「称重退差价」只是标签，不代表真的发生退款；只有出现「补差退款 X 元」这种带金额的文字，才把 weightAdjustment.exists 置为 true。
9. 渠道只凭截图上的店名/App 界面判断。认不出就给 null，绝对不要写「其他」「未知」或自己编一个店名 —— 员工会自己确认。
10. pageType 只凭页面判断：单个订单的详情页 = order_detail；商品详情页 = product_detail；「我的订单」列表（一屏里有多笔订单）= order_list；拿不准 = unknown。
11. 预计送达/签收：淘宝「预计今天送达」、盒马/沃尔玛的「送达时间/签收时间」、iHerb 的「送达日期」。读到才填；读不到给 null，不要推算。
12. 包装上印的净含量/件数（4斤、30枚、1.59kg、500g/袋）是 spec，不是 unit；qty 看截图上的「×N」或「数量」，不要拿净含量当数量。
    例：「4斤;原切羊里脊羊菲力 ×1」→ spec="4斤;原切羊里脊羊菲力"，qty=1，unit=null（截图没写按什么卖就给 null，不要自己写「件」）；不要写成 qty=4、unit="斤"。
    商品名里明确写了「/份」「/盒」「/袋」「/箱」这类包装的，unit 用那个字对应的 code（份/盒/袋/箱）。
    散称按重量买（如「3斤 羊心」）→ qty=3，unit="斤"，spec 可照抄原文。
13. 按重量买的（斤/公斤/克/两/kg/g）unit 用字典里的 code，不要换算成件；规格照抄原文。
14. iHerb/淘宝字段名：iHerb「小计/运费/关税及税项/订单总额」；淘宝「商品总价/店铺优惠/实付款」。支付方式为「先用后付」时，实付看「实付价/实付款」，不要因为「实付款¥0」就填 0。`;
}
