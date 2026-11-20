/**
 * 判断某个商品标题是不是"这一种形态"。
 *
 * 为什么要它：比价是按营养素搜的（中文站搜"硫酸铜"搜不到东西），
 * 结果里会混着各种形态。要让人一眼看出"这瓶是不是我选的那一档"，
 * 就得逐条看标题里有没有那个形态的名字（或它的别称）。
 */
import { normalizeTermKey } from './supplement-form-candidates';

/** 标题里出现任一别称，就算同一形态。 */
export function matchesForm(title: string, aliases: string[]): boolean {
  const text = normalizeTermKey(title);
  if (!text) {
    return false;
  }
  return aliases
    .map((alias) => normalizeTermKey(alias))
    .filter((alias) => alias.length >= 2)
    .some((alias) => text.includes(alias));
}

/** 把正名与别称合成一组，去掉空值。 */
export function formAliasesOf(label: string | null | undefined, alsoKnownAs: string[] = []): string[] {
  return [...new Set([label ?? '', ...alsoKnownAs].map((item) => String(item).trim()).filter(Boolean))];
}
