/**
 * 承运商清单（2026-11-10）。
 *
 * 全小程序**只此一份**：鲜食发货弹窗、补剂发货弹窗、合并/拆包发货页
 * 三个地方都读它。原先三处各写一份还各不相同 —— 鲜食/补剂只有 6 家
 * （没有申通、没有邮政包裹），合并发货页有 8 家，走申通寄的单
 * 员工根本没法正确记录。
 *
 * ⚠️ 顺序有意义：`index 0` 是默认选项（顺丰），老员工的手感就在这上面，
 * 加新快递一律往后面追，不要插到前面。
 */

export interface CarrierOption {
  code: string;
  name: string;
}

export const CARRIERS: CarrierOption[] = [
  { code: 'SF', name: '顺丰速运' },
  { code: 'JD', name: '京东物流' },
  { code: 'YTO', name: '圆通速递' },
  { code: 'ZTO', name: '中通快递' },
  { code: 'STO', name: '申通快递' },
  { code: 'YD', name: '韵达速递' },
  { code: 'EMS', name: 'EMS' },
  { code: 'POSTB', name: '邮政包裹' },
];

/**
 * 承运商代码 → 下拉下标。
 *
 * 认不出来一律回落到 0：小程序 picker 拿到 -1 会直接显示空白，
 * 员工会以为"没选中"，比选错更让人困惑。
 */
export function carrierIndexOf(code: string | null | undefined): number {
  if (!code) return 0;
  const index = CARRIERS.findIndex((item) => item.code === code);
  return index >= 0 ? index : 0;
}
