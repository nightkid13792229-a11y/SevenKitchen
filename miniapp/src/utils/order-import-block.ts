/**
 * 「按钮上该报哪一单」的选择（纯函数，2026-11-05）。
 *
 * 一页上可能同时有几笔识别结果，按钮只能写一句话。原来按列表顺序取第一条有问题的，
 * 于是停在盒马这页、按钮却写「山姆：1 行待处理」，看着像点错了单。
 * 规则改成：先在当前这一单里找，找不到再按原顺序找别的单。
 *
 * 注：参数类型写成别名而不是内联 `(item: T) => boolean`，
 * 是因为提交前守卫（no-undefined-identifiers）按括号切参数列表，
 * 内联函数类型会把 `active` / `all` 误判成「用了没定义」。
 */

type IssueCheck<T> = (item: T) => boolean;

export function firstBlockedImport<T extends { id: string }>(
  active: T | null,
  all: readonly T[],
  hasIssue: IssueCheck<T>,
): T | null {
  const ordered = active
    ? [active, ...all.filter((item) => item.id !== active.id)]
    : all;
  return ordered.find(hasIssue) ?? null;
}
