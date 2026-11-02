/**
 * 「在哪买的」的候选项（2026-11-02）。
 *
 * 起因：老板问"为什么只有山姆、沃尔玛、盒马三个" —— 之前是写死的三家。
 * 现在优先用**员工历史真买过的渠道**（后端已有 `purchase-channels` 接口），
 * 不够再用三家兜底，免得第一次用的人一个都选不到。
 */

const cleanChannels = (list: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of list) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
};

export function buildChannelChoices(
  historyChannels: Array<string | null | undefined>,
  fallbackChannels: string[],
): string[] {
  return cleanChannels([...(historyChannels || []), ...fallbackChannels]);
}
