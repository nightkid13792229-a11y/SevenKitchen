import { ref } from 'vue';
import { request } from './api';

/**
 * 选项字典 · 小程序侧（2026-10-16，批次 5.1）
 *
 * ## 它取代的是什么
 *
 * 小程序原来有一份本地表（`utils/custom-recipe-order.ts` 的
 * `CUSTOM_RECIPE_STATUS_TEXT` / `_CLASS` / `CUSTOM_RECIPE_GOAL_TEXT`）。
 *
 * 它的问题在 2026-10-16 又犯了一次：后端加 `COMPLETED`（已完成）时
 * **这份表没跟上** —— 顾客自己点完「确认收到」，回头再看订单列表，
 * 状态显示的是英文 `COMPLETED`。
 *
 * 与 2026-10-04 加「已取消」时漏了两处半是同一个毛病：
 * **只要中文还有第二份拷贝，就一定会再漏一次。**
 *
 * 现在中文只存在于后端的「选项字典」里。
 *
 * ## 为什么放 `utils/` 而不是新建 `composables/`
 *
 * 小程序没有 `composables/` 目录（全站约定是 `utils/`），
 * 为两个文件新建一个目录不值得。
 *
 * ## 缓存
 *
 * 按集缓存在**模块级**：一个会话只请求一次。页面切来切去不会反复打接口。
 * 这对小程序尤其要紧 —— 每次请求都要走一遍网络与鉴权。
 */

export interface OptionItem {
  code: string;
  label: string;
  description?: string | null;
  tone?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isDefault?: boolean;
}

/** 模块级缓存：集码 → 条目 */
const cache = new Map<string, OptionItem[]>();
const inflight = new Map<string, Promise<OptionItem[]>>();

/**
 * 取一个选项集（带缓存）。
 *
 * ⚠️ 取不到时返回**空表，不编兜底中文** ——
 * 编了就等于又回到"中文有两份拷贝"的老路，而且那份兜底会慢慢
 * 与后端分叉却没人发现。调用方拿不到就显示原始码，至少是**如实**的。
 */
export async function loadOptionSet(setCode: string): Promise<OptionItem[]> {
  if (cache.has(setCode)) return cache.get(setCode)!;

  const pending = inflight.get(setCode);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res: any = await request({
        url: `/options?sets=${encodeURIComponent(setCode)}`,
        method: 'GET',
        quiet: true,
        suppressErrorToast: true,
      });
      const items = res?.data?.sets?.[setCode];
      const normalized: OptionItem[] = Array.isArray(items) ? items : [];
      cache.set(setCode, normalized);
      return normalized;
    } catch (error) {
      console.warn(`[OptionSet] 读取选项集 ${setCode} 失败:`, error);
      return [];
    } finally {
      inflight.delete(setCode);
    }
  })();

  inflight.set(setCode, task);
  return task;
}

/**
 * 页面里用的那一层：一个集 + 取中文/色调。
 *
 * **返回值要解构用** —— 模板里只有顶层 ref 会自动解包，而项目守卫
 * 明令模板里不许写 `.value`（2026-10-14 老板报过"按钮点不动"，
 * 根因就是模板里写了 `.value`）。
 */
export function useOptionSet(setCode: string) {
  const items = ref<OptionItem[]>(cache.get(setCode) ?? []);
  const loading = ref(!cache.has(setCode));

  const ensure = async () => {
    if (cache.has(setCode)) {
      items.value = cache.get(setCode)!;
      loading.value = false;
      return;
    }
    loading.value = true;
    items.value = await loadOptionSet(setCode);
    loading.value = false;
  };

  /**
   * 码 → 中文。
   *
   * ⚠️ **查不到时返回空串，而不是原始码。**
   *
   * 这里刻意不替调用方做决定 —— 因为"查不到"有两种场景，
   * 该给用户看什么是不一样的：
   *   · **顾客可见的界面**（订单状态）：绝不能把英文枚举漏给顾客，
   *     要兜成中文（页面那边写 `|| '状态待确认'`）；
   *   · **后台/日志**：显示原始码反而有助于发现"后端加了新枚举"。
   *
   * 如果这里直接回原始码，第一种场景就没救了 ——
   * 而这正是 2026-10-04 老板看到顾客界面出现英文 `CANCELLED` 的原因。
   */
  const labelOf = (code?: unknown): string => {
    const key = String(code ?? '');
    if (!key) return '';
    return items.value.find((item) => item.code === key)?.label || '';
  };

  /** 码 → 色调档位（前端再映射成样式类，那是纯呈现） */
  const toneOf = (code?: unknown): string => {
    const key = String(code ?? '');
    if (!key) return '';
    return items.value.find((item) => item.code === key)?.tone || '';
  };

  return { items, loading, ensure, labelOf, toneOf };
}

/** 定制订单状态（与后端枚举同名） */
export const CUSTOM_RECIPE_STATUS_SET = 'custom_recipe_status';

/** 定制目标 */
export const CUSTOM_RECIPE_GOAL_SET = 'custom_recipe_goal';

/**
 * 色调档位 → 小程序的状态样式类。
 *
 * 这是**唯一允许的"前端自己判断"**：色调是语义档位（后端不该知道
 * 小程序用什么类名），映射表本身也不含业务含义。
 * 与订单详情页的 `toneToClass` 同一套。
 */
export function toneToStatusClass(tone: string | undefined): string {
  switch (tone) {
    case 'warning':
      return 'pending';
    case 'info':
      return 'paid';
    case 'progress':
      return 'progress';
    case 'success':
      return 'delivered';
    case 'danger':
      return 'cancelled';
    default:
      return 'neutral';
  }
}

/** 只有一个用途：让测试能清掉缓存 */
export function __clearOptionSetCache() {
  cache.clear();
  inflight.clear();
}
