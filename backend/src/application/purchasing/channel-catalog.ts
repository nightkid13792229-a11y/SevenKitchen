/**
 * 采购渠道目录（2026-11-05，渠道唯一来源 · 第一步）
 *
 * ## 为什么要有这一层
 *
 * 渠道以前在四个地方各写一份：AI 提示词写死「山姆/盒马/沃尔玛/其他」、
 * 解析层又写死一次、匹配门禁只对这三家做归一、员工端「在哪买的」
 * 用的还是「历史上谁打过什么字」。结果是同一个门店存成好几种写法，
 * 而 AI 给出的「其他」永远匹配不到任何具体渠道的商品。
 *
 * 现在只有一份：平台选项字典里的 `purchase_channel`。
 * 这一层只做两件事 —— **把任意写法归一到字典里的那一条**，
 * 以及**在归不上的时候干干净净地返回空**（不猜、不造「其他」）。
 *
 * ## 别名从哪来
 *
 * 字典项的 `extra.aliases`。历史数据里已经有「山姆」「盒马」这类简写，
 * 它们不会因为这次统一而消失，所以别名必须跟着字典走，
 * 而不是再在代码里写 `if (text.includes('盒马'))`。
 *
 * 这一层是纯函数，不碰数据库；调用方负责把字典项读出来传进来。
 */

export interface ChannelOption {
  /** 写进业务表的就是它，也是 AI 唯一允许输出的值 */
  code: string;
  label: string;
  /** 历史写法 / 常见简称，例如「山姆」「Sam's Club」 */
  aliases: string[];
}

/** 归一化时去掉的分隔符与标点：渠道名只比“字”，不比排版 */
const PUNCTUATION =
  /[\s·•,，。.、:：;；!！?？'"“”‘’*×xX/\\|（）()【】[\]{}<>《》_\-—–~～]+/g;

/** 渠道名比较键：小写 + 去标点 + 去空白 */
export function normalizeChannelKey(value?: string | null): string {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!text) return '';
  return text.replace(PUNCTUATION, '');
}

function candidatesOf(option: ChannelOption): string[] {
  return [option.code, option.label, ...(option.aliases || [])]
    .map((item) => normalizeChannelKey(item))
    .filter((item) => item.length > 0);
}

/**
 * 在一组渠道里找这条文字属于哪一个。
 *
 * 先比全等（「山姆」= 别名），再比包含（「山姆会员商店订单」→ 山姆会员店），
 * 包含匹配按候选词长度从长到短，避免「京东」抢在「京东超市」前面。
 * 找不到返回 null —— 调用方必须把 null 当成「不知道」，不能当成「其他」。
 */
export function findChannelOption(
  value: string | null | undefined,
  options: ChannelOption[],
): ChannelOption | null {
  const key = normalizeChannelKey(value);
  if (!key || options.length === 0) return null;

  for (const option of options) {
    if (candidatesOf(option).includes(key)) return option;
  }

  const ranked = options
    .flatMap((option) =>
      candidatesOf(option).map((candidate) => ({ option, candidate })),
    )
    .filter((entry) => entry.candidate.length >= 2)
    .sort((a, b) => b.candidate.length - a.candidate.length);

  for (const entry of ranked) {
    if (key.includes(entry.candidate)) return entry.option;
  }
  return null;
}

/** 归一到字典里的 code；归不上返回 null（不猜） */
export function canonicalChannelCode(
  value: string | null | undefined,
  options: ChannelOption[],
): string | null {
  return findChannelOption(value, options)?.code ?? null;
}

/**
 * 匹配时用的比较键：认识的归一到 code，不认识的原样保留（去标点小写）。
 *
 * 为什么保留原样：历史商品表里还可能有字典之外的值（例如「大润发」），
 * 它们至少要能和同一个写法对上，不能因为这次统一就全部变成匹配不上。
 */
export function channelMatchKey(
  value: string | null | undefined,
  options: ChannelOption[],
): string {
  const hit = findChannelOption(value, options);
  return hit ? hit.code : normalizeChannelKey(value);
}

/** 给员工看的名字：认识给字典标签，不认识给原文 */
export function channelDisplayName(
  value: string | null | undefined,
  options: ChannelOption[],
): string {
  const hit = findChannelOption(value, options);
  if (hit) return hit.label;
  return typeof value === 'string' ? value.trim() : '';
}

/** 字典项 → 渠道目录（别名放在 extra.aliases） */
export function toChannelOptions(
  items: Array<{ code: string; label: string; extra?: unknown }>,
): ChannelOption[] {
  return items.map((item) => {
    const extra =
      item.extra && typeof item.extra === 'object'
        ? (item.extra as Record<string, unknown>)
        : null;
    const rawAliases = extra && Array.isArray(extra.aliases) ? extra.aliases : [];
    const aliases = rawAliases
      .filter((alias): alias is string => typeof alias === 'string')
      .map((alias) => alias.trim())
      .filter((alias) => alias.length > 0);
    return { code: item.code, label: item.label, aliases };
  });
}
