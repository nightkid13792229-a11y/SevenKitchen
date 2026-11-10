/**
 * 发货表单上方「上传存根」那一块该怎么显示（2026-11-10）。
 *
 * 页面上员工唯一的判断依据就在这一块，所以四种颜色的含义钉死在这里：
 *   绿 `ok`      —— 核对通过，能发货
 *   黄 `warn`    —— 没核对上（地址没印、手机读不出），必须手动确认一次
 *   红 `error`   —— 明确对不上 / 号被占了，**不许发，也不给手动后门**
 *   灰 `neutral` —— 还没传 / 正在识别
 *
 * 最要紧的一条：`mismatch` 与 `duplicate` 的 `canManual` 必须是 false ——
 * 只要这里给了手动，后端那把硬锁点一下就绕过去了。
 *
 * 文案与后端结论一一对应，页面只负责画，不自己拼句子。
 */

export type ReceiptUiState =
  | 'idle'
  | 'recognizing'
  | 'match'
  | 'unknown'
  | 'mismatch'
  | 'duplicate'
  | 'failed';

export interface ReceiptConflictView {
  field: 'phone' | 'name' | 'district' | string;
  expected: string;
  actual: string;
}

export interface ReceiptViewInput {
  state: ReceiptUiState;
  carrierName?: string | null;
  trackingNumber?: string | null;
  shippingFee?: number | null;
  conflicts?: ReceiptConflictView[];
  /** duplicate 时点名"这个号已经在哪张单上" */
  duplicateLabel?: string | null;
  /** 员工已经手动确认过（AI 认不出来 / 没能核对时） */
  manualConfirmed?: boolean;
  /** 后端给的补充说明（模型超时等） */
  message?: string | null;
}

export interface ReceiptView {
  tone: 'neutral' | 'ok' | 'warn' | 'error';
  title: string;
  desc: string;
  canShip: boolean;
  canManual: boolean;
}

const CONFLICT_TEXT: Record<string, (expected: string, actual: string) => string> = {
  phone: (expected, actual) =>
    `存根上手机尾号 ${actual || '—'}，这单是 ${expected || '—'}`,
  district: (expected, actual) =>
    `存根上是 ${actual || '—'}，这单是 ${expected || '—'}`,
  name: (expected, actual) =>
    `存根上收件人是 ${actual || '—'}，这单是 ${expected || '—'}`,
};

const money = (value: number): string => Number(value).toFixed(2);

const buildTitle = (input: ReceiptViewInput): string => {
  const parts: string[] = [];
  if (input.carrierName) parts.push(input.carrierName);
  if (input.trackingNumber) parts.push(input.trackingNumber);
  if (typeof input.shippingFee === 'number') parts.push(`¥${money(input.shippingFee)}`);
  return parts.join(' · ');
};

const buildHints = (input: ReceiptViewInput): string[] => {
  const hints: string[] = [];
  if (!input.carrierName) {
    hints.push('没认出快递公司，自己选一下');
  }
  if (input.state === 'match' && typeof input.shippingFee !== 'number') {
    hints.push('运费没读到，自己填一下');
  }
  return hints;
};

export function buildReceiptView(input: ReceiptViewInput): ReceiptView {
  const { state } = input;

  if (state === 'idle') {
    return {
      tone: 'neutral',
      title: '传一张快递存根，自动填单号和运费',
      desc: '',
      canShip: false,
      canManual: false,
    };
  }

  if (state === 'recognizing') {
    return {
      tone: 'neutral',
      title: '识别中…',
      desc: '正在读运单号和收件人',
      canShip: false,
      canManual: false,
    };
  }

  if (state === 'match') {
    const hints = buildHints(input);
    return {
      tone: 'ok',
      title: `✓ 已核对 · ${buildTitle(input)}`,
      desc: hints.join('；'),
      canShip: true,
      canManual: false,
    };
  }

  if (state === 'mismatch') {
    const lines = (input.conflicts ?? [])
      .map((item) => {
        const format = CONFLICT_TEXT[item.field];
        return format ? format(String(item.expected ?? ''), String(item.actual ?? '')) : '';
      })
      .filter(Boolean);

    return {
      tone: 'error',
      title: '⚠ 这张存根不是这单的',
      desc: lines.length > 0 ? lines.join('；') : input.message || '收件人与这单不一致',
      canShip: false,
      canManual: false,
    };
  }

  if (state === 'duplicate') {
    return {
      tone: 'error',
      title: '⚠ 这个运单号已经被别的单用过了',
      desc: input.duplicateLabel
        ? `这个号已经在 ${input.duplicateLabel} 上，是不是拿错了存根？`
        : '这个号已经在别的订单上，是不是拿错了存根？',
      canShip: false,
      canManual: false,
    };
  }

  if (state === 'unknown') {
    if (input.manualConfirmed) {
      return {
        tone: 'warn',
        title: `手动确认过 · ${buildTitle(input)}`,
        desc: '系统没法核对收件人，已按你手动确认的单号发货',
        canShip: true,
        canManual: false,
      };
    }

    return {
      tone: 'warn',
      title: `已识别 · ${buildTitle(input)}`,
      desc:
        input.message ||
        '收件人没能核对上（存根上信息不全），请自己看一眼再确认',
      canShip: false,
      canManual: true,
    };
  }

  // failed：AI 完全认不出来（糊、模型超时、配额用完、不是存根）
  if (input.manualConfirmed) {
    return {
      tone: 'warn',
      title: '已手动填写',
      desc: '系统没法核对收件人，已按你填的单号发货',
      canShip: true,
      canManual: false,
    };
  }

  return {
    tone: 'error',
    title: '没认出来',
    desc: input.message || '可以重试上传，或者手动填写单号并确认',
    canShip: false,
    canManual: true,
  };
}
