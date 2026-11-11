/**
 * 订单收货地址的取数与显示（2026-11-11）。
 *
 * 地址在两个地方长得不一样：
 *   · `/admin/orders/:id` 返回 `address`（region 是个对象，详细地址叫 detailAddress）；
 *   · 老数据 / 订单快照里可能只有 `regionText` + `detail`。
 * 发货弹窗、复制地址都按这一份规则取，别再各写一套。
 */

export interface OrderAddressLike {
  recipientName?: string | null
  phone?: string | null
  recipientPhone?: string | null
  regionText?: string | null
  region?: { province?: string; city?: string; district?: string } | null
  detail?: string | null
  detailAddress?: string | null
}

export function formatOrderRegion(region?: {
  province?: string
  city?: string
  district?: string
}): string {
  if (!region) return '';
  return [region.province, region.city, region.district].filter(Boolean).join(' ');
}

/** 收货人电话：新数据在 phone，老数据叫 recipientPhone */
export function getOrderAddressPhone(address?: OrderAddressLike | null): string {
  if (!address) return '';
  return address.phone || address.recipientPhone || '';
}

/** 省市区：优先 regionText；直辖市重复的「市」去掉一遍 */
export function getOrderAddressRegionText(
  address?: OrderAddressLike | null,
): string {
  if (!address) return '';
  const raw = address.regionText || formatOrderRegion(address.region ?? undefined);
  const parts = String(raw || '')
    .split(/\s+/)
    .filter(Boolean);
  return parts
    .filter((part, index) => index === 0 || part !== parts[index - 1])
    .join(' ');
}

/** 详细地址：新数据叫 detailAddress，老数据叫 detail */
export function getOrderAddressDetail(
  address?: OrderAddressLike | null,
): string {
  if (!address) return '';
  return address.detailAddress || address.detail || '';
}

/**
 * 复制到剪贴板的那一整段：收货人 + 电话 + 省市区 + 详细地址。
 * 顺序和顺丰/京东下单页一致，粘过去就能用。
 */
export function buildOrderAddressCopyText(
  address?: OrderAddressLike | null,
): string {
  if (!address) return '';
  return [
    address.recipientName,
    getOrderAddressPhone(address),
    getOrderAddressRegionText(address),
    getOrderAddressDetail(address),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * 把一份地址拍成一行可比较的字符串（2026-11-11）。
 *
 * 合并发货时用来判断「这一票是不是同一个收货地址」——
 * 订单中心勾选只校验了同一顾客，同一个人可能有两个地址。
 */
export function orderAddressKey(address?: OrderAddressLike | null): string {
  if (!address) return '';
  return [
    address.recipientName,
    getOrderAddressPhone(address),
    getOrderAddressRegionText(address),
    getOrderAddressDetail(address),
  ]
    .filter(Boolean)
    .join('|');
}
