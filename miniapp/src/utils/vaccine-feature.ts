/**
 * 疫苗板块的远程开关（2026-10-16 上线前风险控制 B4）
 *
 * ══ 为什么要有它 ══════════════════════════════════════════════════════════
 *
 * 疫苗板块此前**没有任何灰度/开关**：万一上线后发现接种建议算错了，
 * 唯一的办法是改代码 → 重新发版 → 等审核（几小时到一天 ✗）。
 * 老板的要求是"出事能先关掉" —— 所以小程序在渲染「疫苗」书签**之前**
 * 先问一句后端：这个板块现在开着吗？
 *
 * 接口：`GET /api/v1/health/vaccine-feature`（公开只读，未登录也能问）
 *   → `{ code: 0, data: { enabled: boolean, notice?: string } }`
 *
 *   开 → 一切照旧 ✓
 *   关 → **「疫苗」书签不出现**（其余书签照常用），且**一个疫苗接口都不请求**；
 *        如果此刻正停在疫苗书签上 → 优雅退回第一个书签（不白屏、不报错）
 *   请求失败（断网/超时/500）→ **书签保留**，但**板块内容不挂载、一个疫苗接口都不请求**；
 *        页面里给“重试”。这样不会因为一次网络抖动让书签凭空消失，也不会在没确认开关时给建议。
 *
 * ══ 拉不到开关时，默认开还是默认关？→ **默认关**（这个方向是刻意选的）══
 *
 * 判据是老板那句话："宁可少一个功能，也不要给错建议"。
 * 两种默认值的代价**不对称**：
 *   · 拉不到就默认"开"：断网 / 后端挂了 / 接口 500 的时候，家长照样看到疫苗板块，
 *     看到的是**可能存在错误的接种建议** ✗ —— 这正是最坏的结果（狗会漏打或错打）；
 *   · 拉不到就默认"关"：数据不挂载、不给建议 ✓，但书签可以保留、页面给重试。
 * 少一个功能是可恢复的，给错建议不是 —— 所以**拉不到时绝不挂载板块**（fail-safe）；
 * 只是 2026-10-30（F10）起，书签不再跟着消失，避免家长以为入口没了。
 *
 * ⚠️ 注意别把这条和**后端**的默认值搞混：后端读不到那一行时默认 **开**
 *    （swagger 之外的理由在 GlobalConfigService.getVaccineFeatureFlag 里写着：
 *     开关是"应急关停"用的，谁都没关过的时候它就该是开着的，
 *     否则部署那一刻就等于自己把功能关了）。两个默认值方向相反，
 *     但都是在各自那一侧"更安全"的那一边 ✓
 */

import { request } from './api'

export interface VaccineFeatureFlag {
  /** true = 疫苗书签正常出现；false = 整个板块不出现（或暂时打不开） */
  enabled: boolean
  /** 关掉时后端给的一句人话（空串 = 不解释） */
  notice: string
  /**
   * 2026-10-30（F10/V12）：请求失败（断网/超时/500）。
   * 此时**保留疫苗书签**，但**不挂载 VaccineTab、不请求任何疫苗数据**；
   * 页面里给"重试"。这样既不会书签凭空消失，也不会在没确认开关时给出建议。
   */
  failed?: boolean
}

/** 拉不到开关、也还没确认失败时的初始值：**关**（理由见文件头） */
export const VACCINE_FEATURE_FAILSAFE: VaccineFeatureFlag = {
  enabled: false,
  notice: '',
}

/** 疫苗书签的 key（页面里 HEALTH_TABS 用的那个） */
export const VACCINE_TAB_KEY = 'vaccine'

/**
 * 把接口回来的东西解析成开关状态（纯函数，好测）。
 *
 * 三条规则：
 *   · 必须是 `code === 0`（不然整份看不懂 → 用 fail-safe）；
 *   · 必须**明确**是 `enabled === true` 才算开 ——
 *     字符串 'true'、1、缺字段…一律算关（"看不明白 = 关"，理由同上）；
 *   · notice 只认字符串、两端空白去掉。**关掉时它必须留下来**：
 *     那句"为什么没了"正是给"顾客正停在疫苗书签上、板块被关掉"那一幕用的
 *     （见页面的 watch）—— 连同 fail-safe 一起丢掉的话，顾客只会看到书签凭空消失 ✗
 */
export function readVaccineFeatureFlag(payload: unknown): VaccineFeatureFlag {
  const response = payload as { code?: unknown; data?: unknown } | null;
  if (!response || response.code !== 0) {
    return { ...VACCINE_FEATURE_FAILSAFE };
  }

  const body = response.data as
    | { enabled?: unknown; notice?: unknown }
    | null
    | undefined;
  if (!body || typeof body !== 'object') {
    return { ...VACCINE_FEATURE_FAILSAFE };
  }

  return {
    enabled: body.enabled === true,
    notice: typeof body.notice === 'string' ? body.notice.trim() : '',
  };
}

/**
 * 问一次后端：疫苗板块现在开着吗？
 *
 * **不抛错**：任何失败（断网、超时、500）都返回 `failed` 状态（书签保留、板块不挂载）。
 * 调用方不需要 try/catch，也不会因为这一句问不到而白屏 ✓
 */
/** 请求失败时的状态：书签保留，但板块内容不挂载（只给重试） */
export function vaccineFeatureFailed(notice = ''): VaccineFeatureFlag {
  return { ...VACCINE_FEATURE_FAILSAFE, notice, failed: true }
}

export async function fetchVaccineFeatureFlag(): Promise<VaccineFeatureFlag> {
  try {
    const response = await request<{ enabled?: unknown; notice?: unknown }>({
      url: '/health/vaccine-feature',
      method: 'GET',
      // 这只是一句"开没开"：3 秒问不到就按关处理，不让它拖住页面的首屏
      timeout: 3000,
      quiet: true,
      suppressErrorToast: true,
    });
    return readVaccineFeatureFlag(response);
  } catch (error) {
    console.warn('[VaccineFeature] 开关拉不到，保留书签并提示重试：', error);
    return vaccineFeatureFailed('暂时没连上开关服务，请重试');
  }
}

/**
 * 按开关过滤书签（纯函数）。
 *
 * 关掉时**只**去掉疫苗那一个；请求失败时**保留**（页面给重试）。
 * 其余书签一个不少、顺序也不变 ✓
 */
export function resolveVisibleHealthTabs<T extends { key: string }>(
  tabs: readonly T[],
  flag: VaccineFeatureFlag,
): T[] {
  if (flag.enabled || flag.failed) {
    return [...tabs];
  }
  return tabs.filter((tab) => tab.key !== VACCINE_TAB_KEY);
}

/**
 * 要不要挂载疫苗板块（纯函数）。
 *
 * ⚠️ 这是"**开关关掉时不请求任何疫苗接口**"的那道闸：
 *    疫苗的计划 / 接种记录 / 抗体检测三个请求都在 `VaccineTab` 的
 *    挂载钩子里发（onMounted）—— 不挂载，就一个请求都不会出去 ✓
 *    所以书签不显示（resolveVisibleHealthTabs）只是第一道，
 *    这里必须再挡一次：万一哪天有人从别处把 currentTab 设成 'vaccine'
 *    （深链、上一版缓存的状态、别的入口…），也不能让请求漏出去 ✗
 */
export function shouldMountVaccineSection(
  activeTab: string,
  flag: VaccineFeatureFlag,
): boolean {
  return flag.enabled && !flag.failed && activeTab === VACCINE_TAB_KEY;
}
