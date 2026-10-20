/**
 * 定制食谱 · API 层（2026-10-16，批次 2.8）
 *
 * ## 为什么要有这个文件
 *
 * 定制相关的请求此前**散在各个页面里**（`order-detail.vue`、`orders.vue`、
 * `success.vue` 各写各的 `request({ url: '/custom-recipe/...' })`）。
 * 三个后果：
 *   · 同一个接口的返回结构在三个页面各解析一遍，字段名改一处漏两处；
 *   · 接口地址写死在模板逻辑里，改路径要全局搜字符串；
 *   · 页面单测必须 mock 网络，测不了"拿到数据之后怎么渲染"。
 *
 * 抽到这一层之后，页面只调函数、只认类型。
 *
 * ## 与后端「渲染契约」的关系
 *
 * 后端从 2026-10-16 起在订单详情里下发 `renderable`（状态中文、能不能点、
 * 为什么不能点、进度时间轴）。**这里原样透传，不做任何加工** ——
 * 页面拿到就是能直接渲染的东西。
 *
 * ⚠️ `renderable` 是**追加字段**：老版本后端不返回它，所以类型上标成可选，
 * 页面必须有降级路径。等全量上线后再把它改成必填（见批次 5）。
 */

import { request, getToken } from '../utils/api';
import { getBaseUrl } from '../utils/config';

/** 后端下发的状态（能直接渲染） */
export interface RenderableStatus {
  code: string;
  label: string;
  tone: 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger';
  customerHint?: string | null;
}

/** 后端下发的动作（能不能点是后端算好的） */
export interface RenderableAction {
  code: string;
  label: string;
  enabled: boolean;
  disabledReason?: string | null;
  confirmText?: string | null;
  danger?: boolean;
  style?: 'primary' | 'ghost' | 'line';
}

export interface RenderableProgressStep {
  code: string;
  label: string;
  done: boolean;
  active?: boolean;
  at?: string | null;
  note?: string | null;
}

export interface RenderableProgress {
  current: string;
  timeline: RenderableProgressStep[];
}

/** 渲染契约三件套 */
export interface RenderableOrderView {
  status: RenderableStatus;
  actions: RenderableAction[];
  progress?: RenderableProgress;
}

/** 定制订单详情（只列页面用得到的字段） */
export interface CustomRecipeOrderDetail {
  orderId: string;
  dogId?: string;
  dogName?: string;
  status: string;
  /** 后端下发的可渲染形态；老后端不返回 */
  renderable?: RenderableOrderView | null;
  targetGoal?: string | null;
  scheduledDate?: string | null;
  amount?: number | null;
  recipeId?: string | null;
  recipeName?: string | null;
  recipeCoverImageUrl?: string | null;
  paymentDeadlineAt?: string | null;
  refundStatus?: string | null;
  refundAmount?: number | null;
  cancellationReason?: string | null;
  createdAt?: string | null;
  paymentConfirmedAt?: string | null;
  deliveredAt?: string | null;
  /** 交付摘要（批次 2.4）；未交付时为 null */
  delivery?: DeliverySummary | null;
  [key: string]: unknown;
}

/** 交付内容快照（后端算好、结构固定，前端照着渲染） */
export interface DeliveryContent {
  schemaVersion: number;
  recipe: {
    recipeId: string;
    name: string;
    coverImageUrl?: string | null;
    /** 一句话卖点（2026-10-18）—— 交付页默认只显示两行，可展开 */
    sellingPoint?: string | null;
    /** 封面要叠的狗信息（2026-10-18）—— 顾客改档案后仍能看到"交付时那只狗" */
    dog?: {
      name: string | null;
      breedName: string | null;
      /** 年龄（月）—— 几岁几分是渲染层换算 */
      ageMonths: number | null;
      weightKg: number | null;
    } | null;
    items: Array<{
      name: string;
      preparation?: string | null;
      ratioPercent?: number | null;
      weightG?: number | null;
      isSupplement?: boolean;
      /** 原料类型：FOOD / SUPPLEMENT / PACKAGING（三态，不能压成布尔） */
      ingredientType?: string | null;
    }>;
  };
  feeding: {
    dailyIntakeG: number | null;
    mealsPerDay: number | null;
    perMealG: number | null;
    cycleDays: number | null;
  };
  nutrition: {
    standard: string | null;
    energyDensityKcalPerKg: number | null;
    /** 核心营养 8 项（2026-10-18）—— 交付第 1 页的 4×2 网格 */
    macros?: {
      proteinPercent: number | null;
      fatPercent: number | null;
      ashPercent: number | null;
      moisturePercent: number | null;
      crudeFiberPercent: number | null;
      carbohydratePercent: number | null;
      energyDensityKcalPerKg: number | null;
      calciumPhosphorusRatio: number | null;
    } | null;
  };
  shopping: {
    /**
     * 只有净用量（2026-10-18 · 需求 2.4.3）。
     *
     * `purchaseG` / `totalPurchaseG` / `lossRate` 已**从快照与类型里删除** ——
     * 老板定的口径：只给净用量，买多少让顾客自己判断。
     *
     * ⚠️ 老快照里这几个字段还在（冻结契约），但**没有任何界面读它们**，
     * 多出来的键会被忽略。
     */
    lines: Array<{ name: string; netG: number }>;
    totalNetG: number;
  };
  supplements: Array<{
    name: string;
    totalG: number | null;
    perKgG?: number | null;
    brand?: string | null;
    timing?: string | null;
    /**
     * 营养素目标（2026-10-18）—— 如「钙 每kg加 5g」。
     *
     * ⚠️ 交付第 1 页列的是**营养素名**（钙），不是产品名（钙粉）——
     * 前者是配方需求，后者是"买哪瓶"。
     */
    targets?: Array<{
      label: string;
      targetValuePerKg: number | null;
      unit: string | null;
    }> | null;
  }>;
  steps: string[];
  storage?: string | null;
  generatedAt: string;
}

/** 一次交付 */
export interface OrderDelivery {
  id: string;
  version: number;
  deliveredAt: string;
  confirmedAt?: string | null;
  itemCodes: string[];
  content: DeliveryContent;
  autoCompleteAt?: string | null;
}

/** 订单详情里的交付摘要（不含快照本体） */
export interface DeliverySummary {
  id: string;
  version: number;
  deliveredAt: string;
  confirmedAt?: string | null;
  itemCodes: string[];
  autoCompleteAt?: string | null;
}

/** 定制设置里顾客需要知道的几个（公开子集） */
export interface PublicCustomRecipeConfig {
  feeAmount: number;
  deliveryWorkDays: number;
  paymentTimeoutMinutes: number;
  orderNotifyTemplateId?: string | null;
  attachmentMaxCount?: number;
  autoCompleteDays?: number;
  requireCustomerConfirm?: boolean;
  aftersaleWindowDays?: number;
  freeRevisionCount?: number;
  freeRevisionWindowDays?: number;
}

/**
 * 取订单详情。
 *
 * `orderId` 是**业务编号**（CR 开头），不是数据库主键 ——
 * 小程序这一路一直在用业务编号，别改成主键。
 */
export async function fetchOrderDetail(
  orderId: string,
): Promise<CustomRecipeOrderDetail | null> {
  const res: any = await request({
    url: `/custom-recipe/orders/${encodeURIComponent(orderId)}`,
    method: 'GET',
  });
  if (res?.code === 0 && res.data) return res.data as CustomRecipeOrderDetail;
  return null;
}

/**
 * 取定制设置（顾客侧公开的那几个字段）。
 *
 * ⚠️ **失败时抛错，不要静默返回 null。**
 *
 * 第一版我写的是"失败就返回 null，页面用默认值显示，不白屏"，
 * 被自己的测试拦下了 —— 因为这里的默认值就是**定制费**：
 * 后台把定制费改成 500，而接口一挂，顾客看到的是默认的 300 并照着下单。
 * **显示一个错误的价格，比显示"加载失败"糟糕得多。**
 *
 * 所以这里如实抛错，由页面提示"加载失败，请重试"。
 */
export async function fetchPublicConfig(): Promise<PublicCustomRecipeConfig> {
  const res: any = await request({
    url: '/custom-recipe-config',
    method: 'GET',
  });
  if (res?.code === 0 && res.data) {
    return res.data as PublicCustomRecipeConfig;
  }
  throw new Error(res?.message || '读取定制设置失败');
}

/**
 * 顾客自助取消。
 *
 * ⚠️ **必须把 `refundStatus` 带回来。**
 * 退款是钱的事：后端在取消响应里已经回了退款进展（PROCESSING / FAILED…），
 * 页面要当场告诉顾客。只回一个 `ok` 的话，退款失败时顾客会以为钱在路上，
 * 直到他自己去翻订单才发现 —— 那可能是几天后了。
 * （我第一版就漏了它，是从页面里搬代码时丢的。）
 */
export async function cancelOrder(orderId: string): Promise<{
  ok: boolean;
  message?: string;
  refundStatus?: string | null;
  refundAmount?: number | null;
  data?: Record<string, unknown>;
}> {
  const res: any = await request({
    url: `/custom-recipe/orders/${encodeURIComponent(orderId)}/cancel`,
    method: 'POST',
  });
  if (res?.code === 0) {
    return {
      ok: true,
      refundStatus: res.data?.refundStatus ?? null,
      refundAmount: res.data?.refundAmount ?? null,
      data: res.data,
    };
  }
  return { ok: false, message: res?.message };
}

/**
 * 取我的定制订单列表。
 *
 * `options` 原样透传给后端（status / page / pageSize）——
 * 这一层不做过滤，过滤是后端的事。
 */
/**
 * 预估交付日期（2026-10-18 · 需求 2.3.5）
 *
 * 下单页要在提交**之前**告诉顾客几号能收到 ——
 * 日期由**后端排单算法**给出，前端不做推算（需求写死）。
 */
export async function fetchNextDeliveryDate(): Promise<{
  scheduledDate: string | null;
  estimatedDeliveryDate: string | null;
  deliveryWorkDays: number;
}> {
  const res = await request({
    url: '/custom-recipe/next-delivery-date',
    method: 'GET',
  });
  return (
    res?.data || {
      scheduledDate: null,
      estimatedDeliveryDate: null,
      deliveryWorkDays: 0,
    }
  );
}

export async function fetchMyOrders(options?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  orders: CustomRecipeOrderDetail[];
  total?: number;
  [key: string]: unknown;
} | null> {
  const res: any = await request({
    url: '/custom-recipe/my-orders',
    method: 'GET',
    ...(options ? { data: options } : {}),
    quiet: true,
    suppressErrorToast: true,
  });
  if (res?.code === 0 && res.data) return res.data;
  return null;
}

/** 取某只狗的定制健康摘要（带回每日热量与克数） */
export async function fetchDogHealthSummary(
  dogId: string,
): Promise<Record<string, unknown> | null> {
  const res: any = await request({
    url: `/custom-recipe/dogs/${encodeURIComponent(dogId)}/health-summary`,
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  });
  if (res?.code === 0 && res.data) return res.data;
  return null;
}

/**
 * 提交定制单。
 *
 * ⚠️ 刻意**不吞错误**：非 0 会让 `request` reject 并带上服务端 message。
 * 此前按 HTTP 风格的 2xx 判断成功，而后端约定的成功码是 0，
 * 于是出现过"下单成功却提示网络错误"。
 */
export async function submitOrder(
  payload: Record<string, unknown>,
): Promise<{ orderId: string; [key: string]: unknown }> {
  const res: any = await request({
    url: '/custom-recipe/orders',
    method: 'POST',
    data: payload,
  });
  const orderId = res?.data?.orderId;
  if (res?.code !== 0 || !orderId) {
    throw new Error(res?.message || '下单失败，请重试');
  }
  return res.data;
}

/**
 * 取当前交付内容。
 *
 * 还没交付时后端回 404，这里返回 null ——
 * 页面据此显示"还没交付"，而不是报错（"还没交"是正常状态，不是故障）。
 *
 * `version` 用于回看历史版本（重新交付之后）。
 */
export async function fetchDelivery(
  orderId: string,
  version?: number,
): Promise<OrderDelivery | null> {
  try {
    const res: any = await request({
      url: `/custom-recipe/orders/${encodeURIComponent(orderId)}/delivery${
        version ? `?version=${version}` : ''
      }`,
      method: 'GET',
    });
    if (res?.code === 0 && res.data) return res.data as OrderDelivery;
    return null;
  } catch (error) {
    /**
     * 404（还没交付）与网络错误在这里都返回 null，由页面区分：
     * 页面已经知道订单状态，未交付时本来就不该去请求。
     * 真要区分得靠更细的错误码，而目前没必要 —— 两种情况页面表现一致。
     */
    console.warn('[CustomRecipe] 读取交付内容失败:', error);
    return null;
  }
}

/**
 * 顾客确认收到。
 *
 * 幂等由后端保证：重复点不会报错，也**不会刷新确认时间**。
 * 返回 `alreadyConfirmed` 让页面能说"你已经确认过了"。
 */
export async function confirmReceipt(orderId: string): Promise<{
  ok: boolean;
  alreadyConfirmed: boolean;
  message?: string;
}> {
  const res: any = await request({
    url: `/custom-recipe/orders/${encodeURIComponent(orderId)}/confirm-receipt`,
    method: 'POST',
  });
  if (res?.code === 0) {
    return {
      ok: true,
      alreadyConfirmed: Boolean(res.data?.alreadyConfirmed),
    };
  }
  return {
    ok: false,
    alreadyConfirmed: false,
    message: res?.message,
  };
}

/** 售后单（后端算好的可渲染形态） */
export interface AftersaleItem {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  description: string;
  photos: string[];
  createdAt: string;
  resolvedAt?: string | null;
  handleNote?: string | null;
  rejectReason?: string | null;
  /** 能不能撤回 —— 后端算好，前端不判断 */
  canCancel: boolean;
  progress: {
    current: string;
    timeline: Array<{
      code: string;
      label: string;
      done: boolean;
      active?: boolean;
      at?: string | null;
      note?: string | null;
    }>;
  };
}

/** 售后类型选项（来自选项字典） */
export interface AftersaleTypeOption {
  code: string;
  label: string;
  description?: string | null;
  icon?: string | null;
}

/** 取这张单的售后记录 */
/** 售后配额（2026-10-18 · 需求 2.5.7「必须先显示两个数字」） */
export interface AftersaleQuota {
  windowDays: number;
  /** 窗口还剩几天；null = 还没交付 */
  windowDaysLeft: number | null;
  freeRevisionCount: number;
  freeRevisionsLeft: number;
  usedCount: number;
  /** 有没有还没处理完的 */
  hasOpen: boolean;
  /** 能不能提 —— **后端算的**，前端不判断 */
  canSubmit: boolean;
  /** 不能提的原因（顾客不用猜） */
  reason: string | null;
}

export async function fetchAftersales(
  orderId: string,
): Promise<{ items: AftersaleItem[]; quota: AftersaleQuota | null }> {
  const res: any = await request({
    url: `/custom-recipe/orders/${encodeURIComponent(orderId)}/aftersale`,
    method: 'GET',
  });
  if (res?.code === 0 && res.data) {
    return {
      items: Array.isArray(res.data.items) ? res.data.items : [],
      quota: res.data.quota ?? null,
    };
  }
  return { items: [], quota: null };
}

/**
 * 取售后类型选项。
 *
 * 类型**不写死在前端** —— 老板想加一类"要发票"或改个说法，
 * 后台改一次就行（这是选项字典的用处）。
 */
export async function fetchAftersaleTypes(): Promise<AftersaleTypeOption[]> {
  const res: any = await request({
    url: '/options?sets=custom_recipe_aftersale_type',
    method: 'GET',
    quiet: true,
    suppressErrorToast: true,
  });
  const items = res?.data?.sets?.custom_recipe_aftersale_type;
  return Array.isArray(items) ? items : [];
}

/**
 * 提交售后。
 *
 * ⚠️ **不吞错误**：超窗口、重复提、说明为空都要把后端的原因如实带回来 ——
 * 这些原因本身就是给顾客看的（"已超过售后受理期（交付后 30 天内）"）。
 */
export async function submitAftersale(input: {
  orderId: string;
  type: string;
  description: string;
  photos?: string[];
}): Promise<{ ok: boolean; message?: string; typeLabel?: string }> {
  const res: any = await request({
    url: `/custom-recipe/orders/${encodeURIComponent(input.orderId)}/aftersale`,
    method: 'POST',
    data: {
      type: input.type,
      description: input.description,
      photos: input.photos ?? [],
    },
  });
  if (res?.code === 0) {
    return { ok: true, typeLabel: res.data?.typeLabel };
  }
  return { ok: false, message: res?.message };
}

/** 撤回售后（只在还没人受理时允许） */
export async function cancelAftersale(
  aftersaleId: string,
): Promise<{ ok: boolean; message?: string }> {
  const res: any = await request({
    url: `/custom-recipe/aftersale/${encodeURIComponent(aftersaleId)}/cancel`,
    method: 'POST',
  });
  if (res?.code === 0) return { ok: true };
  return { ok: false, message: res?.message };
}

/**
 * 从动作清单里取某一个动作。
 *
 * 页面**不该自己判断**"现在能不能取消" —— 那是后端算好的。
 * 但页面需要知道"这个按钮要不要显示"，所以给一个简单的查找函数。
 */
export function findAction(
  view: RenderableOrderView | null | undefined,
  code: string,
): RenderableAction | undefined {
  return view?.actions?.find((action) => action.code === code);
}

/**
 * 把后端的 tone 映射成小程序的样式类名。
 *
 * 这是**唯一**允许的"前端自己判断"：色调 → class 属于纯呈现，
 * 后端不该知道小程序用的是什么类名。映射表本身也不含业务含义。
 */
export function toneToClass(tone: string | undefined): string {
  switch (tone) {
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    case 'progress':
      return 'progress';
    case 'success':
      return 'success';
    case 'danger':
      return 'danger';
    /**
     * 2026-10-18 修：默认返回 `'neutral'`，但组件的 CSS 类名是 `--muted` ——
     * 匹配不到任何背景色，**标签会变成没有底色的裸文字**。
     * （已取消这一档正好踩中。）
     */
    default:
      return 'muted';
  }
}

/**
 * 刷新本地草稿附件的预览 URL（2026-10-19）。
 *
 * 媒体代理 token 只存在后端进程内，重启后旧 URL 会 404；
 * 草稿里有 COS key，打开页面时用这个接口换新 token。
 */
export async function refreshCustomRecipeDraftAttachmentUrls(
  keys: string[],
): Promise<Array<{ key: string; url: string }>> {
  if (!Array.isArray(keys) || keys.length === 0) return [];
  const res = await request({
    url: '/custom-recipe/draft-attachments/sign',
    method: 'POST',
    data: { keys },
    quiet: true,
    suppressErrorToast: true,
  });
  return Array.isArray(res?.data) ? res.data : [];
}

/**
 * 上传备注区附件草稿（2026-10-19）。
 *
 * 订单还没创建，所以不传 orderId；后端只做登录/大小/类型校验，
 * 存到定制订单附件目录，返回 url 和 COS key。
 */
export async function uploadCustomRecipeDraftAttachment(
  filePath: string,
): Promise<{ url: string; key: string }> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    uni.uploadFile({
      url: `${getBaseUrl()}/custom-recipe/draft-attachments`,
      filePath,
      name: 'file',
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (res) => {
        try {
          const parsed =
            typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (parsed?.code !== 0) {
            reject(new Error(parsed?.message || '上传失败'));
            return;
          }
          const url = String(parsed?.data?.url || '').trim();
          if (!url) {
            reject(new Error('上传失败，请重试'));
            return;
          }
          resolve({ url, key: String(parsed?.data?.key || '') });
        } catch {
          reject(new Error('上传失败，请重试'));
        }
      },
      fail: () => reject(new Error('上传失败，请检查网络')),
    });
  });
}

/**
 * 上传售后附件（2026-10-18）。
 *
 * 走的是定制单**专用**的上传接口 `/custom-recipe/upload-attachment` ——
 * 它自带两件正确的事：
 *   ① **归属校验**：只能往自己的订单上挂文件（2026-10-04 修过越权）
 *   ② **大小上限来自后台配置**（`getAttachmentLimits`），不在前端写死
 *
 * 前端调这个接口要带 `orderId`（后端用它做归属校验）。
 */
export async function uploadAftersaleAttachment(
  orderId: string,
  filePath: string,
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const token = getToken();
    uni.uploadFile({
      url: `${getBaseUrl()}/custom-recipe/upload-attachment`,
      filePath,
      name: 'file',
      formData: { orderId },
      header: { Authorization: token ? `Bearer ${token}` : '' },
      success: (res) => {
        try {
          const parsed =
            typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (parsed?.code !== 0) {
            reject(new Error(parsed?.message || '上传失败'));
            return;
          }
          const url = String(parsed?.data?.url || '').trim();
          if (!url) {
            reject(new Error('上传失败，请重试'));
            return;
          }
          resolve({ url });
        } catch {
          reject(new Error('上传失败，请重试'));
        }
      },
      fail: () => reject(new Error('上传失败，请检查网络')),
    });
  });
}
