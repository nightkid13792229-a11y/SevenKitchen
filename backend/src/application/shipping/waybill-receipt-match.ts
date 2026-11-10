/**
 * 快递存根的收件人比对（2026-11-10）。
 *
 * 老板的硬要求：存根上的收件人跟这单的收货人对不上，就不许发货。
 * 所以这里的每一次「不一样」都会**真的挡住一单货**，规则必须能解释、能测。
 *
 * 三条判定（顺序即优先级）：
 *   1. 手机尾号 —— 存根上永远是打码的（186****2107），只能比后 4 位；这是最硬的证据。
 *   2. 区县      —— 地址一整句里抽出「XX区 / XX县」跟订单的 district 比。
 *   3. 姓名      —— **只记录冲突，不拦**：代收人（张赛珺下单、张三收）太常见，
 *                   拿它拦会把正确的单拦死。
 *
 * 拿不准就 `unknown` —— 宁可让员工自己看一眼，也不假装验过。
 */

import { createHash } from 'crypto';

/** 订单侧的收货信息（鲜食读 order.shippingAddressSnapshot，补剂读 supplement_order 的同名快照） */
export interface AddressView {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
}

/** 存根侧 AI 读出来的收件人 */
export interface ReceiptRecipientView {
  name: string | null;
  phoneMasked: string | null;
  address: string | null;
}

export type MatchStatus = 'match' | 'unknown' | 'mismatch';

export type ConflictField = 'phone' | 'name' | 'district';

export interface MatchConflict {
  field: ConflictField;
  expected: string;
  actual: string;
}

export interface MatchResult {
  status: MatchStatus;
  conflicts: MatchConflict[];
}

/**
 * 区县的左侧边界：遇到这些字就停，说明已经走到上一级行政区或分隔符。
 * 不加这个边界，「北京市北京市朝阳区」会被正则吃成「市朝阳区」。
 */
const DISTRICT_LEFT_BOUNDARY = /[省市区县旗盟州\s\d]/;

/**
 * 不是区县、但长得像的写法。
 *
 * 这份名单是**误拦的护栏**：漏一个，正确存根就会被判"区县不同"、红条拦死、
 * 还不给手动出口 —— 员工只能去改地址，实际什么都没错。
 * 「阳光小区」「经济技术开发区」「市辖区」都是实测踩到的写法。
 */
const DISTRICT_BLACKLIST =
  /自治|特区|林区|矿区|境外|开发区|小区|辖区|园区|景区|街区|社区|校区|厂区|片区|管区/;

/** 区县名最多几个字（含最后一个「区/县」），再长就不是地名了 */
const DISTRICT_MAX_LENGTH = 4;

/** 全角转半角（手机号、字母数字在存根上常是全角） */
function toHalfWidth(input: string): string {
  return input
    .replace(
      /[\uFF01-\uFF5E]/g,
      (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, ' ');
}

/** 去空白（含全角空格）后用于比对 */
function compact(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return toHalfWidth(value).replace(/\s+/g, '');
}

/** 姓名归一：去所有空白 + 全角转半角。读不出来给空串。 */
export function normalizeName(raw: string | null | undefined): string {
  return compact(raw);
}

/**
 * 手机尾号 4 位。
 *
 * 只认**末尾连续的数字**：`186****2107` → `2107`；`186****07` → `null`
 * （星号后面只剩两位，凑不出 4 位，宁可当没读到也不许硬猜）。
 */
export function phoneTail4(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trailing = toHalfWidth(raw).match(/(\d+)\s*$/);
  if (!trailing) return null;
  const run = trailing[1];
  return run.length >= 4 ? run.slice(-4) : null;
}

/**
 * 从一整句地址里抽出区县；抽不到给 null（抽不到不等于"不同"，见 compareRecipient）。
 *
 * 取**最左边**那个「XX区 / XX县」，而不是最右边：地址尾巴上常有「XX小区」
 * 「XX园区」，取最右边的会把小区名当成区县，把正确的单判成对不上。
 */
export function extractDistrict(
  address: string | null | undefined,
): string | null {
  const text = toHalfWidth(String(address ?? ''));
  if (text.length === 0) return null;

  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch !== '区' && ch !== '县') continue;

    let start = index;
    while (
      start - 1 >= 0 &&
      index - (start - 1) + 1 <= DISTRICT_MAX_LENGTH &&
      !DISTRICT_LEFT_BOUNDARY.test(text[start - 1])
    ) {
      start -= 1;
    }

    const candidate = text.slice(start, index + 1);
    // 只有一个「区」字（或区字前面直接是边界）说明这个词不完整，跳过
    if (candidate.length < 2) continue;
    if (DISTRICT_BLACKLIST.test(candidate)) continue;
    return candidate;
  }
  return null;
}

/**
 * 收货信息指纹。
 *
 * 员工改过收货地址之后，**之前那条核对记录必须自动失效** —— 否则
 * 「先去改地址、再回来重新传存根」这条唯一的出路就形同虚设。
 * 所以指纹覆盖收件人、手机、省市区和详细地址，且对空格/全角不敏感
 * （改一个空格不该让人重传存根）。
 */
export function buildAddressFingerprint(view: AddressView): string {
  const parts = [
    view.recipientName,
    view.phone,
    view.province,
    view.city,
    view.district,
    view.detail,
  ].map((part) => compact(part));

  return createHash('sha1').update(parts.join('|'), 'utf8').digest('hex');
}

/**
 * 比对存根收件人与订单收货人。
 *
 * 返回 `mismatch` 时调用方**必须拦住**（不给手动出口）；
 * 返回 `unknown` 时调用方可以放行，但要员工自己确认。
 */
export function compareRecipient(
  receipt: ReceiptRecipientView,
  expected: AddressView,
): MatchResult {
  const conflicts: MatchConflict[] = [];
  let agree = 0;
  let nameConflict = 0;

  // 1) 手机尾号
  const expectedTail = phoneTail4(expected.phone);
  const actualTail = phoneTail4(receipt.phoneMasked);
  if (expectedTail && actualTail) {
    if (expectedTail !== actualTail) {
      conflicts.push({
        field: 'phone',
        expected: expectedTail,
        actual: actualTail,
      });
    } else {
      agree += 1;
    }
  }

  // 2) 地址
  //
  // 顺序很关键（2026-11-10 审核后改）：
  //   ① 先在整句里找**订单的区县原文** —— 存根上印的就是这个，最稳也不会误判；
  //   ② 找不到才去"抽区县"，抽出来跟订单不同才算冲突（黑名单挡掉小区/开发区）；
  //   ③ 连区县都抽不出来，就看详细地址能不能对上（≥8 字才认，短了容易撞）。
  // 只做①②容易把"XX小区"当区县，把正确的单拦死。
  const expectedDistrict = compact(expected.district);
  const expectedDetail = compact(expected.detail);
  const addressText = String(receipt.address ?? '').trim();

  if (addressText.length > 0) {
    const normalizedAddress = compact(addressText);

    if (expectedDistrict && normalizedAddress.includes(expectedDistrict)) {
      agree += 1;
    } else {
      const actualDistrict = expectedDistrict
        ? extractDistrict(addressText)
        : null;

      if (actualDistrict) {
        conflicts.push({
          field: 'district',
          expected: expectedDistrict,
          actual: actualDistrict,
        });
      } else if (
        expectedDetail.length >= 8 &&
        normalizedAddress.includes(expectedDetail)
      ) {
        agree += 1;
      }
    }
  }

  // 3) 姓名 —— 只记冲突，不 push 到 conflicts（不拦）
  const expectedName = normalizeName(expected.recipientName);
  const actualName = normalizeName(receipt.name);
  if (expectedName && actualName) {
    const masked = actualName.includes('*') || expectedName.includes('*');
    const same = masked
      ? actualName.charAt(0) === expectedName.charAt(0)
      : actualName === expectedName;
    if (!same) nameConflict += 1;
  }

  if (conflicts.length > 0) {
    return { status: 'mismatch', conflicts };
  }
  if (agree >= 2 && nameConflict === 0) {
    return { status: 'match', conflicts: [] };
  }
  return { status: 'unknown', conflicts: [] };
}
